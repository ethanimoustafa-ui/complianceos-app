-- 121: Ownership-restricted workflow advancement.
--
-- Remove the blanket 'workflow:advance' grant from the OFFICER role so officers
-- can no longer advance/approve every item by default. After this they can drive
-- a workflow only when they OWN the item (its leader / assignee / owner_id) OR
-- are explicitly granted "Can Advance Workflow" via the Access Matrix.
--
-- Managers and admins keep 'workflow:advance' by role (unchanged), so they can
-- still drive any workflow. The advance/approve API routes were updated in tandem
-- (policies/circulars workflow advance, audits start/complete) to gate on
-- (workflow:advance OR ownership), dropping the generic 'edit' bypass that
-- previously let any officer advance any item. Editing remains separate
-- (officers keep 'edit' / granular '<entity>:edit').
--
-- NOTE: server permission checks read from the JWT's app_metadata.permissions
-- (custom access-token hook) with a DB fallback, so an officer signed in BEFORE
-- this migration keeps the old grant until their token refreshes / they re-login.

delete from public.role_permissions
where role_key = 'officer'
  and permission_key = 'workflow:advance';
