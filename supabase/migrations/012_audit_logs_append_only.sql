-- 012_audit_logs_append_only
-- Global tamper-proof audit_logs + audit_admin role + audit_admin_actions log.
-- Per-table append-only enforcement: trigger blocks UPDATE on every timeline /
-- activity-log table; UPDATE/DELETE/TRUNCATE revoked from app roles; audit_admin
-- gets DELETE for cron retention purges only.

create table public.audit_logs (
  id              bigserial primary key,
  timestamp       timestamptz not null default now(),
  user_id         uuid references public.profiles(id) on delete set null,
  user_name       text not null,
  action          text not null,
  details_key     text,
  details_params  jsonb not null default '{}'::jsonb,
  ip_address      inet,
  device          text,
  location        text,
  status          text not null default 'completed' check (status in ('completed','pending','info','failed')),
  target_type     text,
  target_id       text,
  metadata        jsonb not null default '{}'::jsonb
);
create index idx_audit_logs_user_ts on public.audit_logs(user_id, timestamp desc);
create index idx_audit_logs_action_ts on public.audit_logs(action, timestamp desc);
create index idx_audit_logs_target on public.audit_logs(target_type, target_id);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'audit_admin') then
    create role audit_admin nologin;
  end if;
end $$;

create table public.audit_admin_actions (
  id           bigserial primary key,
  action       text not null,
  rows_deleted bigint not null,
  cutoff       timestamptz not null,
  performed_at timestamptz not null default now(),
  performed_by text not null
);

create or replace function public.block_append_only_update()
returns trigger language plpgsql as $$
begin
  raise exception 'Table %.% is append-only; UPDATE not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
    'audit_logs','user_activity_logs','observation_timeline','policy_activity_log',
    'risk_history','circular_timeline','sama_letter_timeline','audit_activity_logs',
    'article_timeline'
  ])
  loop
    execute format('drop trigger if exists trg_%I_block_update on public.%I', t, t);
    execute format('create trigger trg_%I_block_update before update on public.%I for each row execute function public.block_append_only_update()', t, t);
  end loop;
end $$;

revoke update, delete, truncate on public.audit_logs            from authenticated, anon, service_role;
revoke update, delete, truncate on public.user_activity_logs    from authenticated, anon, service_role;
revoke update, delete, truncate on public.observation_timeline  from authenticated, anon, service_role;
revoke update, delete, truncate on public.policy_activity_log   from authenticated, anon, service_role;
revoke update, delete, truncate on public.risk_history          from authenticated, anon, service_role;
revoke update, delete, truncate on public.circular_timeline     from authenticated, anon, service_role;
revoke update, delete, truncate on public.sama_letter_timeline  from authenticated, anon, service_role;
revoke update, delete, truncate on public.audit_activity_logs   from authenticated, anon, service_role;
revoke update, delete, truncate on public.article_timeline      from authenticated, anon, service_role;

grant insert, select on public.audit_logs            to authenticated;
grant usage on sequence public.audit_logs_id_seq     to authenticated;
grant insert, select on public.user_activity_logs    to authenticated;
grant insert, select on public.observation_timeline  to authenticated;
grant insert, select on public.policy_activity_log   to authenticated;
grant insert, select on public.risk_history          to authenticated;
grant insert, select on public.circular_timeline     to authenticated;
grant insert, select on public.sama_letter_timeline  to authenticated;
grant insert, select on public.audit_activity_logs   to authenticated;
grant insert, select on public.article_timeline      to authenticated;

grant delete on public.audit_logs            to audit_admin;
grant delete on public.user_activity_logs    to audit_admin;
grant delete on public.observation_timeline  to audit_admin;
grant delete on public.policy_activity_log   to audit_admin;
grant delete on public.risk_history          to audit_admin;
grant delete on public.circular_timeline     to audit_admin;
grant delete on public.sama_letter_timeline  to audit_admin;
grant delete on public.audit_activity_logs   to audit_admin;
grant delete on public.article_timeline      to audit_admin;
