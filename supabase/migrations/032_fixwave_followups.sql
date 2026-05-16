-- 032_fixwave_followups
--
-- Follow-ups from the Fix-1/2/3 wave:
--
-- 1. RLS gap on observations soft-delete UPDATE — admin couldn't set
--    `deleted_at`, which broke the soft-delete path the Route Handlers rely
--    on. Add an UPDATE policy gated on the existing `observation:delete`
--    permission so soft-delete flows through normal RBAC.
--
-- 2. Add `actor_id` + `event_type` columns to `sama_letter_timeline` so the
--    timeline reader can join the actor via PostgREST embed instead of
--    relying on the free-text `user_name` column. The existing `user_name`
--    / `date` columns stay for backwards compatibility.
--    (NOTE: this migration ran BEFORE the 033 rename — the table was still
--    named `sama_letter_timeline` at apply time.)
--
-- Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='observations' and policyname='observations_soft_delete'
  ) then
    create policy observations_soft_delete on public.observations
      for update to authenticated
      using ( public.has_permission('observation:delete') )
      with check ( public.has_permission('observation:delete') );
  end if;
end$$;

-- The table was renamed in 033 to `letter_timeline`. Apply the column adds
-- conditionally to whichever name is present.
do $$
begin
  if to_regclass('public.sama_letter_timeline') is not null then
    execute 'alter table public.sama_letter_timeline add column if not exists actor_id uuid references public.profiles(id), add column if not exists event_type text';
  elsif to_regclass('public.letter_timeline') is not null then
    execute 'alter table public.letter_timeline add column if not exists actor_id uuid references public.profiles(id), add column if not exists event_type text';
  end if;
end$$;

notify pgrst, 'reload schema';
