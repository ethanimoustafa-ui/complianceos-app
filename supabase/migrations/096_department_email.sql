-- 096_department_email
--
-- Departments gain an optional contact email so "inform the department"
-- actions (risk → send-to-department, and the analogous policy/rules
-- business-owner notifications) can open the user's mail client pre-addressed
-- to the right inbox. Nullable: existing rows have no email until an admin
-- sets one in Settings → Departments.

alter table public.departments add column if not exists email text;

notify pgrst, 'reload schema';
