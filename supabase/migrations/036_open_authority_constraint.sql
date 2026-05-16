-- 036_open_authority_constraint
--
-- Drop the closed-enum CHECK on circulars.authority. Users can add custom
-- frameworks via Settings; the UI's authority picker is driven by enabled
-- frameworks, so the column must accept any non-empty slug (e.g. sharia-board,
-- nca-ecc, citc, pdpl). Replaced with a soft length-only guard.

alter table public.circulars drop constraint if exists circulars_authority_check;
alter table public.circulars add constraint circulars_authority_check check (char_length(authority) between 1 and 100);

notify pgrst, 'reload schema';
