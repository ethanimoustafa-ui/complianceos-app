-- 112_fix_message_participants_rls_recursion
--
-- BUG: every messaging write/read fails with
--   ERROR: 42P17 infinite recursion detected in policy for relation
--          "message_thread_participants"
-- so threads, participants and messages NEVER persist (all three tables are
-- empty). The user-facing symptom is "messages don't stick": an optimistic row
-- appears, the POST 500s, and message-store.ts rolls the row back.
--
-- ROOT CAUSE (migration 016): the SELECT + ALL policies on
-- message_thread_participants reference message_thread_participants inside
-- their own USING subquery:
--
--   create policy message_thread_participants_select ... using (
--     user_id = auth.uid() or exists (
--       select 1 from public.message_thread_participants self   -- <-- self-ref
--       where self.thread_id = message_thread_participants.thread_id
--         and self.user_id = auth.uid()))
--
-- Postgres re-applies the same RLS policy to that inner SELECT -> infinite
-- recursion. Because message_threads_select / messages_select / messages_insert
-- all sub-select message_thread_participants, the recursion poisons the entire
-- messaging feature (list threads, open thread, send message, create thread).
--
-- FIX: move the membership check into SECURITY DEFINER helper functions. A
-- policy predicate function runs with the CALLER's privileges UNLESS it is
-- SECURITY DEFINER (see migration 029/031 notes for the has_permission case),
-- so a SECURITY DEFINER helper reads message_thread_participants WITHOUT
-- re-triggering its RLS -> no recursion. We then rewrite the participant
-- policies to call the helper instead of self-selecting, and switch the
-- threads/messages policies to the same helpers for uniformity (they did not
-- recurse, but inlining the same EXISTS twice is error-prone).
--
-- SCOPE: touches ONLY the user-to-user thread messaging tables
-- (message_threads, message_thread_participants, messages). Does NOT touch
-- notifications, escalation, timeline or email.
--
-- Idempotent: helpers use CREATE OR REPLACE; policies are dropped-if-exists
-- then recreated.

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER membership helpers (bypass RLS on the participant table)
-- ---------------------------------------------------------------------------
create or replace function public.is_thread_participant(p_thread_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.message_thread_participants
    where thread_id = p_thread_id and user_id = p_user_id
  );
$$;

create or replace function public.is_thread_admin(p_thread_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.message_thread_participants
    where thread_id = p_thread_id and user_id = p_user_id and is_admin
  );
$$;

-- Lock down execution: only authenticated callers (mirrors has_permission).
-- authenticated MUST keep EXECUTE — policy predicates are evaluated as the
-- calling role, so revoking it would break every messaging policy below.
revoke all on function public.is_thread_participant(uuid, uuid) from public, anon;
revoke all on function public.is_thread_admin(uuid, uuid)       from public, anon;
grant execute on function public.is_thread_participant(uuid, uuid) to authenticated;
grant execute on function public.is_thread_admin(uuid, uuid)       to authenticated;

-- ---------------------------------------------------------------------------
-- 2. message_thread_participants — replace the self-referential policies
-- ---------------------------------------------------------------------------
drop policy if exists message_thread_participants_select on public.message_thread_participants;
create policy message_thread_participants_select on public.message_thread_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_thread_participant(thread_id, auth.uid())
  );

drop policy if exists message_thread_participants_modify on public.message_thread_participants;
create policy message_thread_participants_modify on public.message_thread_participants
  for all to authenticated
  using (
    user_id = auth.uid()
    or public.is_thread_admin(thread_id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    or public.is_thread_admin(thread_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. message_threads — use the helper (was inlining the same EXISTS)
-- ---------------------------------------------------------------------------
drop policy if exists message_threads_select on public.message_threads;
create policy message_threads_select on public.message_threads
  for select to authenticated
  using (public.is_thread_participant(id, auth.uid()));

drop policy if exists message_threads_update on public.message_threads;
create policy message_threads_update on public.message_threads
  for update to authenticated
  using (public.is_thread_admin(id, auth.uid()))
  with check (true);

-- message_threads_insert (created_by = auth.uid()) and message_threads_delete
-- (created_by = auth.uid()) do not reference the participant table and are
-- left unchanged.

-- ---------------------------------------------------------------------------
-- 4. messages — use the helper
-- ---------------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_thread_participant(thread_id, auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(thread_id, auth.uid())
  );

-- messages_update / messages_delete are gated on sender_id (+ has_permission)
-- and do not reference the participant table — left unchanged.

notify pgrst, 'reload schema';
