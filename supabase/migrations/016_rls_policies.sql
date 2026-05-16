-- 016_rls_policies
-- Enable RLS on every public table; add SELECT/INSERT/UPDATE/DELETE policies
-- gated by public.has_permission() (or self-ownership for personal data).
-- Append-only timelines: INSERT allowed for any authenticated; UPDATE/DELETE
-- locked with "using (false)" policies as defense-in-depth (also blocked by
-- the trigger and revoked grants in 012).

-- Enable RLS on every public table
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ====================== PROFILES =========================================
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (public.has_permission('team:invite'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_permission('team:edit'))
  with check (id = auth.uid() or public.has_permission('team:edit'));
create policy profiles_delete on public.profiles for delete to authenticated using (public.has_permission('team:remove'));

create policy user_preferences_select_self on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy user_preferences_insert_self on public.user_preferences for insert to authenticated with check (user_id = auth.uid());
create policy user_preferences_update_self on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_preferences_delete_self on public.user_preferences for delete to authenticated using (user_id = auth.uid());

create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_modify on public.roles for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy permissions_modify on public.permissions for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy role_permissions_modify on public.role_permissions for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy user_roles_select on public.user_roles for select to authenticated using (true);
create policy user_roles_modify on public.user_roles for all to authenticated using (public.has_permission('team:edit')) with check (public.has_permission('team:edit'));
create policy user_permissions_select on public.user_permissions for select to authenticated using (true);
create policy user_permissions_modify on public.user_permissions for all to authenticated using (public.has_permission('team:edit')) with check (public.has_permission('team:edit'));

create policy team_member_assignments_select on public.team_member_assignments for select to authenticated using (true);
create policy team_member_assignments_modify on public.team_member_assignments for all to authenticated using (public.has_permission('team:edit')) with check (public.has_permission('team:edit'));
create policy team_member_access_controls_select on public.team_member_access_controls for select to authenticated using (true);
create policy team_member_access_controls_modify on public.team_member_access_controls for all to authenticated using (public.has_permission('team:edit')) with check (public.has_permission('team:edit'));

-- ====================== SYSTEM LOOKUPS ===================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'departments','business_units','onboarding_regions','onboarding_industries',
    'onboarding_headcount_buckets','authority_departments','policy_categories',
    'audit_categories','risk_categories','training_categories','calendar_event_types',
    'correspondence_types','letter_types','framework_sub_categories','scale_label_overrides'
  ])
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_sel', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(''settings:edit'')) with check (public.has_permission(''settings:edit''))', t || '_mod', t);
  end loop;
end $$;

-- ====================== FRAMEWORKS / CONFIG / SETTINGS ==================
create policy frameworks_select on public.frameworks for select to authenticated using (true);
create policy frameworks_modify on public.frameworks for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy framework_pins_select on public.framework_pins for select to authenticated using (true);
create policy framework_pins_modify on public.framework_pins for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy framework_config_select on public.framework_config for select to authenticated using (true);
create policy framework_config_modify on public.framework_config for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy compliance_settings_select on public.compliance_settings for select to authenticated using (true);
create policy compliance_settings_modify on public.compliance_settings for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));

-- ====================== SAMA LETTERS family =============================
create policy sama_letters_select on public.sama_letters for select to authenticated using (deleted_at is null);
create policy sama_letters_insert on public.sama_letters for insert to authenticated with check (public.has_permission('create'));
create policy sama_letters_update on public.sama_letters for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy sama_letters_delete on public.sama_letters for delete to authenticated using (public.has_permission('delete'));
create policy sama_letter_templates_select on public.sama_letter_templates for select to authenticated using (true);
create policy sama_letter_templates_modify on public.sama_letter_templates for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy sama_letter_approval_steps_select on public.sama_letter_approval_steps for select to authenticated using (true);
create policy sama_letter_approval_steps_modify on public.sama_letter_approval_steps for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy sama_letter_timeline_select on public.sama_letter_timeline for select to authenticated using (true);
create policy sama_letter_timeline_insert on public.sama_letter_timeline for insert to authenticated with check (true);
create policy sama_letter_timeline_no_update on public.sama_letter_timeline for update to authenticated using (false);
create policy sama_letter_timeline_no_delete on public.sama_letter_timeline for delete to authenticated using (false);
create policy sama_letter_attachments_select on public.sama_letter_attachments for select to authenticated using (true);
create policy sama_letter_attachments_modify on public.sama_letter_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy sama_letter_observations_select on public.sama_letter_observations for select to authenticated using (true);
create policy sama_letter_observations_modify on public.sama_letter_observations for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));

-- ====================== CORRESPONDENCE / ADVISORY =======================
create policy correspondence_select on public.correspondence for select to authenticated using (deleted_at is null);
create policy correspondence_insert on public.correspondence for insert to authenticated with check (public.has_permission('create'));
create policy correspondence_update on public.correspondence for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy correspondence_delete on public.correspondence for delete to authenticated using (public.has_permission('delete'));
create policy correspondence_attachments_select on public.correspondence_attachments for select to authenticated using (true);
create policy correspondence_attachments_modify on public.correspondence_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy advisory_requests_select on public.advisory_requests for select to authenticated using (deleted_at is null);
create policy advisory_requests_insert on public.advisory_requests for insert to authenticated with check (public.has_permission('create'));
create policy advisory_requests_update on public.advisory_requests for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy advisory_requests_delete on public.advisory_requests for delete to authenticated using (public.has_permission('delete'));
create policy advisory_notes_select on public.advisory_notes for select to authenticated using (true);
create policy advisory_notes_insert on public.advisory_notes for insert to authenticated with check (public.has_permission('comment'));
create policy advisory_notes_update on public.advisory_notes for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy advisory_notes_delete on public.advisory_notes for delete to authenticated using (public.has_permission('delete'));

-- ====================== POLICIES family =================================
create policy policies_select on public.policies for select to authenticated using (deleted_at is null);
create policy policies_insert on public.policies for insert to authenticated with check (public.has_permission('create'));
create policy policies_update on public.policies for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policies_delete on public.policies for delete to authenticated using (public.has_permission('delete'));
create policy policy_versions_select on public.policy_versions for select to authenticated using (true);
create policy policy_versions_modify on public.policy_versions for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policy_workflow_steps_select on public.policy_workflow_steps for select to authenticated using (true);
create policy policy_workflow_steps_modify on public.policy_workflow_steps for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policy_activity_log_select on public.policy_activity_log for select to authenticated using (true);
create policy policy_activity_log_insert on public.policy_activity_log for insert to authenticated with check (true);
create policy policy_activity_log_no_update on public.policy_activity_log for update to authenticated using (false);
create policy policy_activity_log_no_delete on public.policy_activity_log for delete to authenticated using (false);
create policy policy_attachments_select on public.policy_attachments for select to authenticated using (true);
create policy policy_attachments_modify on public.policy_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policy_evidence_select on public.policy_evidence for select to authenticated using (true);
create policy policy_evidence_modify on public.policy_evidence for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policy_review_cycles_select on public.policy_review_cycles for select to authenticated using (true);
create policy policy_review_cycles_modify on public.policy_review_cycles for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy policy_templates_select on public.policy_templates for select to authenticated using (true);
create policy policy_templates_modify on public.policy_templates for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));

-- ====================== CIRCULARS family ================================
create policy circulars_select on public.circulars for select to authenticated using (deleted_at is null);
create policy circulars_insert on public.circulars for insert to authenticated with check (public.has_permission('create'));
create policy circulars_update on public.circulars for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy circulars_delete on public.circulars for delete to authenticated using (public.has_permission('delete'));
create policy circular_articles_select on public.circular_articles for select to authenticated using (true);
create policy circular_articles_modify on public.circular_articles for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy article_checklist_items_select on public.article_checklist_items for select to authenticated using (true);
create policy article_checklist_items_modify on public.article_checklist_items for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy article_attachments_select on public.article_attachments for select to authenticated using (true);
create policy article_attachments_modify on public.article_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy article_versions_select on public.article_versions for select to authenticated using (true);
create policy article_versions_modify on public.article_versions for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy article_timeline_select on public.article_timeline for select to authenticated using (true);
create policy article_timeline_insert on public.article_timeline for insert to authenticated with check (true);
create policy article_timeline_no_update on public.article_timeline for update to authenticated using (false);
create policy article_timeline_no_delete on public.article_timeline for delete to authenticated using (false);
create policy circular_workflow_steps_select on public.circular_workflow_steps for select to authenticated using (true);
create policy circular_workflow_steps_modify on public.circular_workflow_steps for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy circular_timeline_select on public.circular_timeline for select to authenticated using (true);
create policy circular_timeline_insert on public.circular_timeline for insert to authenticated with check (true);
create policy circular_timeline_no_update on public.circular_timeline for update to authenticated using (false);
create policy circular_timeline_no_delete on public.circular_timeline for delete to authenticated using (false);
create policy circular_versions_select on public.circular_versions for select to authenticated using (true);
create policy circular_versions_modify on public.circular_versions for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy circular_pending_edits_select on public.circular_pending_edits for select to authenticated using (true);
create policy circular_pending_edits_modify on public.circular_pending_edits for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy circular_cap_attachments_select on public.circular_cap_attachments for select to authenticated using (true);
create policy circular_cap_attachments_modify on public.circular_cap_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy circular_remediation_attachments_select on public.circular_remediation_attachments for select to authenticated using (true);
create policy circular_remediation_attachments_modify on public.circular_remediation_attachments for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));

-- ====================== AUDITS family ===================================
create policy audits_select on public.audits for select to authenticated using (deleted_at is null and public.has_permission('audit:view'));
create policy audits_insert on public.audits for insert to authenticated with check (public.has_permission('audit:create'));
create policy audits_update on public.audits for update to authenticated using (public.has_permission('audit:edit')) with check (public.has_permission('audit:edit'));
create policy audits_delete on public.audits for delete to authenticated using (public.has_permission('audit:delete'));
create policy audit_documents_select on public.audit_documents for select to authenticated using (public.has_permission('audit:view'));
create policy audit_documents_modify on public.audit_documents for all to authenticated using (public.has_permission('audit:edit')) with check (public.has_permission('audit:edit'));
create policy audit_team_members_select on public.audit_team_members for select to authenticated using (public.has_permission('audit:view'));
create policy audit_team_members_modify on public.audit_team_members for all to authenticated using (public.has_permission('audit:edit')) with check (public.has_permission('audit:edit'));
create policy audit_comments_select on public.audit_comments for select to authenticated using (public.has_permission('audit:view'));
create policy audit_comments_insert on public.audit_comments for insert to authenticated with check (public.has_permission('audit:comment'));
create policy audit_comments_update on public.audit_comments for update to authenticated using (author_id = auth.uid() or public.has_permission('audit:edit')) with check (author_id = auth.uid() or public.has_permission('audit:edit'));
create policy audit_comments_delete on public.audit_comments for delete to authenticated using (author_id = auth.uid() or public.has_permission('audit:delete'));
create policy audit_tasks_select on public.audit_tasks for select to authenticated using (deleted_at is null and public.has_permission('audit:view'));
create policy audit_tasks_modify on public.audit_tasks for all to authenticated using (public.has_permission('audit:edit')) with check (public.has_permission('audit:edit'));
create policy audit_activity_logs_select on public.audit_activity_logs for select to authenticated using (public.has_permission('audit:view'));
create policy audit_activity_logs_insert on public.audit_activity_logs for insert to authenticated with check (true);
create policy audit_activity_logs_no_update on public.audit_activity_logs for update to authenticated using (false);
create policy audit_activity_logs_no_delete on public.audit_activity_logs for delete to authenticated using (false);
create policy audit_templates_select on public.audit_templates for select to authenticated using (true);
create policy audit_templates_modify on public.audit_templates for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));

-- ====================== OBSERVATIONS family =============================
create policy observations_select on public.observations for select to authenticated using (deleted_at is null and public.has_permission('observation:view'));
create policy observations_insert on public.observations for insert to authenticated with check (public.has_permission('observation:create'));
create policy observations_update on public.observations for update to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy observations_delete on public.observations for delete to authenticated using (public.has_permission('observation:delete'));
create policy observation_assignees_select on public.observation_assignees for select to authenticated using (public.has_permission('observation:view'));
create policy observation_assignees_modify on public.observation_assignees for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy observation_team_select on public.observation_team for select to authenticated using (public.has_permission('observation:view'));
create policy observation_team_modify on public.observation_team for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy observation_checklist_select on public.observation_checklist for select to authenticated using (public.has_permission('observation:view'));
create policy observation_checklist_modify on public.observation_checklist for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy observation_updates_select on public.observation_updates for select to authenticated using (public.has_permission('observation:view'));
create policy observation_updates_insert on public.observation_updates for insert to authenticated with check (public.has_permission('observation:comment'));
create policy observation_updates_update on public.observation_updates for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy observation_updates_delete on public.observation_updates for delete to authenticated using (author_id = auth.uid() or public.has_permission('observation:delete'));
create policy observation_documents_select on public.observation_documents for select to authenticated using (public.has_permission('observation:view'));
create policy observation_documents_modify on public.observation_documents for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy observation_timeline_select on public.observation_timeline for select to authenticated using (public.has_permission('observation:view'));
create policy observation_timeline_insert on public.observation_timeline for insert to authenticated with check (true);
create policy observation_timeline_no_update on public.observation_timeline for update to authenticated using (false);
create policy observation_timeline_no_delete on public.observation_timeline for delete to authenticated using (false);
create policy remediation_plans_select on public.remediation_plans for select to authenticated using (public.has_permission('observation:view'));
create policy remediation_plans_modify on public.remediation_plans for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy closure_requests_select on public.closure_requests for select to authenticated using (public.has_permission('observation:view'));
create policy closure_requests_modify on public.closure_requests for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));
create policy closure_reviews_select on public.closure_reviews for select to authenticated using (public.has_permission('observation:view'));
create policy closure_reviews_modify on public.closure_reviews for all to authenticated using (public.has_permission('observation:edit')) with check (public.has_permission('observation:edit'));

-- ====================== RISKS family ====================================
create policy risks_select on public.risks for select to authenticated using (deleted_at is null);
create policy risks_insert on public.risks for insert to authenticated with check (public.has_permission('create'));
create policy risks_update on public.risks for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy risks_delete on public.risks for delete to authenticated using (public.has_permission('delete'));
create policy risk_mitigation_checklist_select on public.risk_mitigation_checklist for select to authenticated using (true);
create policy risk_mitigation_checklist_modify on public.risk_mitigation_checklist for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy risk_department_proposed_plan_select on public.risk_department_proposed_plan for select to authenticated using (true);
create policy risk_department_proposed_plan_modify on public.risk_department_proposed_plan for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy risk_history_select on public.risk_history for select to authenticated using (true);
create policy risk_history_insert on public.risk_history for insert to authenticated with check (true);
create policy risk_history_no_update on public.risk_history for update to authenticated using (false);
create policy risk_history_no_delete on public.risk_history for delete to authenticated using (false);

-- ====================== TRAINING ========================================
create policy training_courses_select on public.training_courses for select to authenticated using (deleted_at is null);
create policy training_courses_insert on public.training_courses for insert to authenticated with check (public.has_permission('create'));
create policy training_courses_update on public.training_courses for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy training_courses_delete on public.training_courses for delete to authenticated using (public.has_permission('delete'));
create policy training_employees_select on public.training_employees for select to authenticated using (true);
create policy training_employees_modify on public.training_employees for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy employee_course_progress_select on public.employee_course_progress for select to authenticated using (true);
create policy employee_course_progress_modify on public.employee_course_progress for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy saudization_metrics_select on public.saudization_metrics for select to authenticated using (true);
create policy saudization_metrics_modify on public.saudization_metrics for all to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));

-- ====================== CALENDAR / MESSAGES =============================
create policy calendar_events_select on public.calendar_events for select to authenticated using (deleted_at is null);
create policy calendar_events_insert on public.calendar_events for insert to authenticated with check (public.has_permission('create'));
create policy calendar_events_update on public.calendar_events for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy calendar_events_delete on public.calendar_events for delete to authenticated using (public.has_permission('delete'));

create policy message_threads_select on public.message_threads for select to authenticated using (
  exists (select 1 from public.message_thread_participants p where p.thread_id = message_threads.id and p.user_id = auth.uid())
);
create policy message_threads_insert on public.message_threads for insert to authenticated with check (created_by = auth.uid());
create policy message_threads_update on public.message_threads for update to authenticated using (
  exists (select 1 from public.message_thread_participants p where p.thread_id = message_threads.id and p.user_id = auth.uid() and p.is_admin)
) with check (true);
create policy message_threads_delete on public.message_threads for delete to authenticated using (created_by = auth.uid());

create policy message_thread_participants_select on public.message_thread_participants for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.message_thread_participants self
    where self.thread_id = message_thread_participants.thread_id and self.user_id = auth.uid()
  )
);
create policy message_thread_participants_modify on public.message_thread_participants for all to authenticated using (
  exists (
    select 1 from public.message_thread_participants p
    where p.thread_id = message_thread_participants.thread_id and p.user_id = auth.uid() and p.is_admin
  ) or user_id = auth.uid()
) with check (true);

create policy messages_select on public.messages for select to authenticated using (
  exists (select 1 from public.message_thread_participants p where p.thread_id = messages.thread_id and p.user_id = auth.uid())
);
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = auth.uid()
  and exists (select 1 from public.message_thread_participants p where p.thread_id = messages.thread_id and p.user_id = auth.uid())
);
create policy messages_update on public.messages for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (sender_id = auth.uid() or public.has_permission('delete'));

-- ====================== NOTIFICATIONS / REPORTS =========================
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (public.has_permission('create') or user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy reports_select on public.reports for select to authenticated using (deleted_at is null);
create policy reports_insert on public.reports for insert to authenticated with check (public.has_permission('report:create'));
create policy reports_update on public.reports for update to authenticated using (public.has_permission('report:create')) with check (public.has_permission('report:create'));
create policy reports_delete on public.reports for delete to authenticated using (public.has_permission('report:delete'));

-- ====================== USER ACTIVITY LOGS (append-only) ================
create policy user_activity_logs_select on public.user_activity_logs for select to authenticated using (user_id = auth.uid() or public.has_permission('team:view'));
create policy user_activity_logs_insert on public.user_activity_logs for insert to authenticated with check (true);
create policy user_activity_logs_no_update on public.user_activity_logs for update to authenticated using (false);
create policy user_activity_logs_no_delete on public.user_activity_logs for delete to authenticated using (false);

-- ====================== HELP ============================================
create policy help_articles_select on public.help_articles for select to authenticated using (true);
create policy help_articles_modify on public.help_articles for all to authenticated using (public.has_permission('settings:edit')) with check (public.has_permission('settings:edit'));
create policy user_help_views_select on public.user_help_views for select to authenticated using (user_id = auth.uid());
create policy user_help_views_modify on public.user_help_views for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ====================== COMPLIANCE EVALUATIONS / SCORES =================
create policy compliance_evaluations_select on public.compliance_evaluations for select to authenticated using (true);
create policy compliance_evaluations_insert on public.compliance_evaluations for insert to authenticated with check (public.has_permission('edit'));
create policy compliance_evaluations_update on public.compliance_evaluations for update to authenticated using (public.has_permission('edit')) with check (public.has_permission('edit'));
create policy compliance_evaluations_delete on public.compliance_evaluations for delete to authenticated using (public.has_permission('delete'));

create policy compliance_scores_cache_select on public.compliance_scores_cache for select to authenticated using (true);
-- INSERT/UPDATE/DELETE go through service_role only (no policy = denied for authenticated)

-- ====================== AUDIT LOGS (global, append-only) ================
create policy audit_logs_select on public.audit_logs for select to authenticated using (user_id = auth.uid() or public.has_permission('team:view'));
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (true);
create policy audit_logs_no_update on public.audit_logs for update to authenticated using (false);
create policy audit_logs_no_delete on public.audit_logs for delete to authenticated using (false);

create policy audit_admin_actions_select on public.audit_admin_actions for select to authenticated using (public.has_permission('team:view'));

-- ====================== JOBS ============================================
create policy jobs_select_admin on public.jobs for select to authenticated using (public.has_permission('settings:view'));
-- INSERT/UPDATE/DELETE = service_role only
