-- 017_indexes
-- Additional perf indexes: pg_trgm GIN on title/name/subject for free-text search,
-- created_at desc partial indexes on listings.

create index if not exists idx_audits_title_trgm        on public.audits        using gin (title gin_trgm_ops);
create index if not exists idx_observations_title_trgm  on public.observations  using gin (title gin_trgm_ops);
create index if not exists idx_policies_name_trgm       on public.policies      using gin (name gin_trgm_ops);
create index if not exists idx_circulars_title_trgm     on public.circulars     using gin (title gin_trgm_ops);
create index if not exists idx_sama_letters_subject_trgm on public.sama_letters using gin (subject gin_trgm_ops);
create index if not exists idx_correspondence_subject_trgm on public.correspondence using gin (subject gin_trgm_ops);
create index if not exists idx_risks_title_trgm         on public.risks         using gin (title gin_trgm_ops);
create index if not exists idx_advisory_requests_subject_trgm on public.advisory_requests using gin (subject gin_trgm_ops);
create index if not exists idx_training_courses_name_trgm on public.training_courses using gin (name gin_trgm_ops);
create index if not exists idx_help_articles_title_trgm on public.help_articles using gin (title gin_trgm_ops);

create index if not exists idx_audits_created_desc        on public.audits(created_at desc)        where deleted_at is null;
create index if not exists idx_observations_created_desc  on public.observations(created_at desc)  where deleted_at is null;
create index if not exists idx_policies_created_desc      on public.policies(created_at desc)      where deleted_at is null;
create index if not exists idx_circulars_created_desc     on public.circulars(created_at desc)     where deleted_at is null;
create index if not exists idx_sama_letters_created_desc  on public.sama_letters(created_at desc)  where deleted_at is null;
create index if not exists idx_correspondence_created_desc on public.correspondence(created_at desc) where deleted_at is null;
create index if not exists idx_risks_created_desc         on public.risks(created_at desc)         where deleted_at is null;
create index if not exists idx_advisory_requests_created_desc on public.advisory_requests(created_at desc) where deleted_at is null;
