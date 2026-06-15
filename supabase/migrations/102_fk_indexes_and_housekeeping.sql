-- 102_fk_indexes_and_housekeeping
-- Scalability audit Part 1 (.planning/db-scalability-audit.md findings A1, D4).
--
-- (1) Cover the 42 advisor-flagged unindexed foreign keys with btree indexes.
--     Every one of these FK columns is ON DELETE CASCADE / SET NULL; without a
--     covering index, deleting a parent (user / department) seq-scans each child
--     table once per FK in a single locked transaction, and "by this user/dept"
--     filters can't use an index. Negligible at current scale; essential at
--     100k-1M child rows.
--     NOTE: plain CREATE INDEX is fine at current (tiny) scale. In production,
--     against already-large tables, prefer CREATE INDEX CONCURRENTLY (cannot run
--     inside a migration transaction) to avoid holding a write lock.
--
-- (2) Housekeeping: trim pg_cron run history so cron.job_run_details does not
--     grow unbounded (audit finding D4).
--
-- NOT included (deliberately): retention purge for audit_logs / user_activity_logs.
-- That interacts with the append-only protection triggers (012) and the org
-- audit_retention_years policy, is a no-op at current age, and warrants its own
-- migration. Tracked as a follow-up.

-- (1) FK covering indexes -----------------------------------------------------
create index if not exists idx_article_attachments_uploaded_by on public.article_attachments (uploaded_by);
create index if not exists idx_audit_activity_logs_user_id on public.audit_activity_logs (user_id);
create index if not exists idx_audit_comments_author_id on public.audit_comments (author_id);
create index if not exists idx_audit_documents_uploaded_by on public.audit_documents (uploaded_by);
create index if not exists idx_audit_team_members_user_id on public.audit_team_members (user_id);
create index if not exists idx_audit_versions_changed_by on public.audit_versions (changed_by);
create index if not exists idx_circular_articles_assigned_to on public.circular_articles (assigned_to);
create index if not exists idx_circular_cap_attachments_uploaded_by on public.circular_cap_attachments (uploaded_by);
create index if not exists idx_circular_remediation_attachments_uploaded_by on public.circular_remediation_attachments (uploaded_by);
create index if not exists idx_circulars_business_owner_department_id on public.circulars (business_owner_department_id);
create index if not exists idx_closure_requests_requested_by on public.closure_requests (requested_by);
create index if not exists idx_closure_reviews_reviewed_by on public.closure_reviews (reviewed_by);
create index if not exists idx_compliance_evaluations_evaluated_by on public.compliance_evaluations (evaluated_by);
create index if not exists idx_compliance_scores_cache_department_id on public.compliance_scores_cache (department_id);
create index if not exists idx_correspondence_attachments_uploaded_by on public.correspondence_attachments (uploaded_by);
create index if not exists idx_entity_templates_created_by on public.entity_templates (created_by);
create index if not exists idx_framework_config_department_id on public.framework_config (department_id);
create index if not exists idx_letter_approval_steps_assigned_to on public.letter_approval_steps (assigned_to);
create index if not exists idx_letter_attachments_uploaded_by on public.letter_attachments (uploaded_by);
create index if not exists idx_letter_observations_observation_id on public.letter_observations (observation_id);
create index if not exists idx_letter_timeline_actor_id on public.letter_timeline (actor_id);
create index if not exists idx_message_threads_created_by on public.message_threads (created_by);
create index if not exists idx_observation_assignees_user_id on public.observation_assignees (user_id);
create index if not exists idx_observation_documents_uploaded_by on public.observation_documents (uploaded_by);
create index if not exists idx_observation_team_user_id on public.observation_team (user_id);
create index if not exists idx_observation_timeline_user_id on public.observation_timeline (user_id);
create index if not exists idx_observation_updates_author_id on public.observation_updates (author_id);
create index if not exists idx_policies_owner_id on public.policies (owner_id);
create index if not exists idx_policy_attachments_uploaded_by on public.policy_attachments (uploaded_by);
create index if not exists idx_policy_evidence_uploaded_by on public.policy_evidence (uploaded_by);
create index if not exists idx_profiles_invited_by on public.profiles (invited_by);
create index if not exists idx_remediation_plans_reviewed_by on public.remediation_plans (reviewed_by);
create index if not exists idx_remediation_plans_submitted_by on public.remediation_plans (submitted_by);
create index if not exists idx_reports_created_by on public.reports (created_by);
create index if not exists idx_risk_department_proposed_plan_submitted_by on public.risk_department_proposed_plan (submitted_by);
create index if not exists idx_risk_history_user_id on public.risk_history (user_id);
create index if not exists idx_risk_plan_documents_uploaded_by on public.risk_plan_documents (uploaded_by);
create index if not exists idx_training_employees_user_id on public.training_employees (user_id);
create index if not exists idx_user_help_views_article_id on public.user_help_views (article_id);
create index if not exists idx_user_permissions_granted_by on public.user_permissions (granted_by);
create index if not exists idx_user_permissions_permission_key on public.user_permissions (permission_key);
create index if not exists idx_user_roles_granted_by on public.user_roles (granted_by);

-- (2) pg_cron run-history housekeeping ---------------------------------------
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'housekeeping_cron_run_details_purge') then
    perform cron.schedule(
      'housekeeping_cron_run_details_purge',
      '0 3 * * *',
      $cmd$delete from cron.job_run_details where end_time < now() - interval '30 days'$cmd$
    );
  end if;
end $$;
