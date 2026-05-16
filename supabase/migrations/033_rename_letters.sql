-- 033_rename_letters
-- Drop the `sama_` prefix from the letters table family. SAMA is one authority
-- among several (CMA, IA, CITC, ZATCA); `letters.authority` already discriminates.
-- Idempotent: every rename guarded with IF EXISTS (or pg_class lookups).
-- See .planning/21-rename-plan.md.

-- =========================================================================
-- 1. Rename tables
-- =========================================================================
do $$
begin
  if to_regclass('public.sama_letters') is not null
     and to_regclass('public.letters') is null then
    execute 'alter table public.sama_letters rename to letters';
  end if;
  if to_regclass('public.sama_letter_attachments') is not null
     and to_regclass('public.letter_attachments') is null then
    execute 'alter table public.sama_letter_attachments rename to letter_attachments';
  end if;
  if to_regclass('public.sama_letter_observations') is not null
     and to_regclass('public.letter_observations') is null then
    execute 'alter table public.sama_letter_observations rename to letter_observations';
  end if;
  if to_regclass('public.sama_letter_approval_steps') is not null
     and to_regclass('public.letter_approval_steps') is null then
    execute 'alter table public.sama_letter_approval_steps rename to letter_approval_steps';
  end if;
  if to_regclass('public.sama_letter_timeline') is not null
     and to_regclass('public.letter_timeline') is null then
    execute 'alter table public.sama_letter_timeline rename to letter_timeline';
  end if;
  if to_regclass('public.sama_letter_templates') is not null
     and to_regclass('public.letter_templates') is null then
    execute 'alter table public.sama_letter_templates rename to letter_templates';
  end if;
end $$;

-- =========================================================================
-- 2. Rename indexes (best-effort)
-- =========================================================================
do $$
declare
  pair record;
begin
  for pair in
    select old_name, new_name from (values
      ('idx_sama_letters_authority_status',  'idx_letters_authority_status'),
      ('idx_sama_letters_type',              'idx_letters_type'),
      ('idx_sama_letters_deadline',          'idx_letters_deadline'),
      ('idx_sama_letters_created_by',        'idx_letters_created_by'),
      ('idx_sama_letters_assigned_to',       'idx_letters_assigned_to'),
      ('idx_sama_letters_subject_trgm',      'idx_letters_subject_trgm'),
      ('idx_sama_letters_created_desc',      'idx_letters_created_desc'),
      ('idx_sama_letter_templates_type',     'idx_letter_templates_type'),
      ('idx_sama_letter_templates_status',   'idx_letter_templates_status'),
      ('idx_sama_letter_steps_letter',       'idx_letter_steps_letter'),
      ('idx_sama_letter_timeline_letter',    'idx_letter_timeline_letter'),
      ('idx_sama_letter_attachments_letter', 'idx_letter_attachments_letter')
    ) as t(old_name, new_name)
  loop
    if exists (select 1 from pg_class where relname = pair.old_name and relkind = 'i')
       and not exists (select 1 from pg_class where relname = pair.new_name and relkind = 'i') then
      execute format('alter index public.%I rename to %I', pair.old_name, pair.new_name);
    end if;
  end loop;
end $$;

-- =========================================================================
-- 3. Rename triggers
-- =========================================================================
do $$
declare
  pair record;
begin
  for pair in
    select tbl, old_name, new_name from (values
      ('letters',           'trg_sama_letters_ua',                        'trg_letters_ua'),
      ('letter_templates',  'trg_sama_letter_templates_ua',               'trg_letter_templates_ua'),
      ('letters',           'trg_sama_letters_invalidate_compliance',     'trg_letters_invalidate_compliance'),
      ('letter_timeline',   'trg_sama_letter_timeline_block_update',      'trg_letter_timeline_block_update')
    ) as t(tbl, old_name, new_name)
  loop
    if exists (
      select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      where c.relname = pair.tbl and tg.tgname = pair.old_name
    ) and not exists (
      select 1 from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      where c.relname = pair.tbl and tg.tgname = pair.new_name
    ) then
      execute format('alter trigger %I on public.%I rename to %I',
        pair.old_name, pair.tbl, pair.new_name);
    end if;
  end loop;
end $$;

-- =========================================================================
-- 4. Rename policies
-- =========================================================================
do $$
declare
  pair record;
begin
  for pair in
    select tbl, old_name, new_name from (values
      ('letters',                'sama_letters_select',                 'letters_select'),
      ('letters',                'sama_letters_insert',                 'letters_insert'),
      ('letters',                'sama_letters_update',                 'letters_update'),
      ('letters',                'sama_letters_delete',                 'letters_delete'),
      ('letter_templates',       'sama_letter_templates_select',        'letter_templates_select'),
      ('letter_templates',       'sama_letter_templates_modify',        'letter_templates_modify'),
      ('letter_approval_steps',  'sama_letter_approval_steps_select',   'letter_approval_steps_select'),
      ('letter_approval_steps',  'sama_letter_approval_steps_modify',   'letter_approval_steps_modify'),
      ('letter_timeline',        'sama_letter_timeline_select',         'letter_timeline_select'),
      ('letter_timeline',        'sama_letter_timeline_insert',         'letter_timeline_insert'),
      ('letter_timeline',        'sama_letter_timeline_no_update',      'letter_timeline_no_update'),
      ('letter_timeline',        'sama_letter_timeline_no_delete',      'letter_timeline_no_delete'),
      ('letter_attachments',     'sama_letter_attachments_select',      'letter_attachments_select'),
      ('letter_attachments',     'sama_letter_attachments_modify',      'letter_attachments_modify'),
      ('letter_observations',    'sama_letter_observations_select',     'letter_observations_select'),
      ('letter_observations',    'sama_letter_observations_modify',     'letter_observations_modify')
    ) as t(tbl, old_name, new_name)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = pair.tbl and policyname = pair.old_name
    ) and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = pair.tbl and policyname = pair.new_name
    ) then
      execute format('alter policy %I on public.%I rename to %I',
        pair.old_name, pair.tbl, pair.new_name);
    end if;
  end loop;
end $$;

-- =========================================================================
-- 5. Rename FK constraint on letter_observations (created in 008)
-- =========================================================================
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.letter_observations'::regclass
      and conname = 'sama_letter_observations_observation_fkey'
  ) and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.letter_observations'::regclass
      and conname = 'letter_observations_observation_fkey'
  ) then
    execute 'alter table public.letter_observations rename constraint sama_letter_observations_observation_fkey to letter_observations_observation_fkey';
  end if;
exception when undefined_table then
  null;  -- table may not exist yet on fresh-DB replays
end $$;

-- =========================================================================
-- 6. REVOKE/GRANT re-apply on letter_timeline under the new name. The original
--    REVOKE in 012 was tied to the old table name; once renamed, the existing
--    grants follow the rename automatically. We re-issue defensively so a fresh
--    replay (where 012 runs against the renamed table) also lands correctly.
-- =========================================================================
do $$
begin
  if to_regclass('public.letter_timeline') is not null then
    revoke update, delete, truncate on public.letter_timeline from authenticated, anon, service_role;
    grant insert, select on public.letter_timeline to authenticated;
    grant delete on public.letter_timeline to audit_admin;
  end if;
end $$;

-- =========================================================================
-- 7. Tell PostgREST to refresh its schema cache so /rest/v1/letters works
--    immediately without a project restart.
-- =========================================================================
notify pgrst, 'reload schema';
