-- 015_triggers
-- Compliance-cache invalidation trigger on every source table.
-- handle_new_user trigger: on auth.users INSERT -> create profiles row.

create or replace function public.invalidate_compliance_cache()
returns trigger language plpgsql as $$
begin
  update public.compliance_scores_cache set expires_at = now() where expires_at > now();
  return null;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'audits','audit_tasks','observations','remediation_plans','closure_requests','closure_reviews',
    'risks','risk_mitigation_checklist','policies','policy_versions','policy_workflow_steps',
    'circulars','circular_articles','sama_letters','training_courses','employee_course_progress',
    'compliance_settings','frameworks','framework_config'
  ])
  loop
    execute format('drop trigger if exists trg_%I_invalidate_compliance on public.%I', t, t);
    execute format(
      'create trigger trg_%I_invalidate_compliance after insert or update or delete on public.%I for each statement execute function public.invalidate_compliance_cache()',
      t, t
    );
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  derived_name text;
  derived_role text;
begin
  derived_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  derived_role := coalesce(new.raw_app_meta_data->>'role', 'viewer');
  if derived_role not in ('viewer','auditor','compliance_officer','org_admin') then
    derived_role := 'viewer';
  end if;
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, derived_name, derived_role)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
