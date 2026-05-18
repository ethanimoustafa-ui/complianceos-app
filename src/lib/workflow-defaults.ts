// Default workflow phases for newly-created circulars.
//
// Shared by:
//   • the server `POST /api/circulars` route (seeds rows after insert)
//   • the client `buildInitialWorkflowSteps()` shim in `circular-store.ts`
//     (still used for offline/empty fallbacks on legacy circulars that pre-date
//     server-side seeding)
//
// The shape mirrors the `circular_workflow_steps` row contract; client-side
// callers cast to `CircularWorkflowStep` via the `id`-injection step.

export type CircularWorkflowStepActionType =
  | 'approve'
  | 'notify-bo'
  | 'notify-authority'
  | 'advance'
  | 'submit'
  | 'acknowledge'
  | 'start'
  | 'complete'
  | 'review'

export interface CircularWorkflowStepDefault {
  /** Stable client-side id used when the step is rendered without a DB row. */
  fallback_id: string
  phase: 0 | 1 | 2
  label: string
  label_ar: string
  action_label: string
  action_label_ar: string
  requires_notes: boolean
  action_type: CircularWorkflowStepActionType
}

export const DEFAULT_CIRCULAR_WORKFLOW_STEPS: CircularWorkflowStepDefault[] = [
  { fallback_id: 'cap-review',              phase: 0, label: 'CAP Review',                                            label_ar: 'مراجعة خطة التقييم',                action_label: 'Start Review',         action_label_ar: 'بدء المراجعة',  requires_notes: false, action_type: 'review' },
  { fallback_id: 'cap-approved',            phase: 0, label: 'CAP Approval',                                          label_ar: 'اعتماد خطة التقييم',                action_label: 'Approve',              action_label_ar: 'اعتماد',         requires_notes: true,  action_type: 'approve' },
  { fallback_id: 'notify-bo',               phase: 1, label: 'Notify Business Owner',                                 label_ar: 'إشعار المالك التنفيذي',             action_label: 'Notify',               action_label_ar: 'إشعار',          requires_notes: false, action_type: 'notify-bo' },
  { fallback_id: 'cap-received',            phase: 1, label: 'Corrective Action Plan Received',                       label_ar: 'استلام خطة العمل التصحيحي',         action_label: 'Acknowledge Receipt',  action_label_ar: 'تأكيد الاستلام', requires_notes: false, action_type: 'acknowledge' },
  { fallback_id: 'cap-under-review',        phase: 1, label: 'Corrective Action Plan Under Review',                   label_ar: 'مراجعة خطة العمل التصحيحي',         action_label: 'Start Review',         action_label_ar: 'بدء المراجعة',  requires_notes: false, action_type: 'review' },
  { fallback_id: 'cap-final-approved',      phase: 1, label: 'Corrective Action Plan Approved — Notify Authority',    label_ar: 'اعتماد نهائي — إشعار الجهة',         action_label: 'Notify Authority',     action_label_ar: 'إشعار الجهة',    requires_notes: true,  action_type: 'notify-authority' },
  { fallback_id: 'remediation-in-progress', phase: 2, label: 'Remediation In Progress',                                label_ar: 'التنفيذ جارٍ',                       action_label: 'Start Remediation',    action_label_ar: 'بدء التنفيذ',    requires_notes: false, action_type: 'start' },
  { fallback_id: 'remediation-submitted',   phase: 2, label: 'Evidence Submitted',                                     label_ar: 'تقديم الأدلة',                       action_label: 'Submit Evidence',      action_label_ar: 'تقديم الأدلة',   requires_notes: false, action_type: 'submit' },
  { fallback_id: 'remediation-under-review',phase: 2, label: 'Remediation Under Review',                               label_ar: 'مراجعة التنفيذ',                     action_label: 'Start Review',         action_label_ar: 'بدء المراجعة',  requires_notes: false, action_type: 'review' },
  { fallback_id: 'remediation-approved',    phase: 2, label: 'Completed — Authority Notified',                         label_ar: 'مكتمل — تم إشعار الجهة',             action_label: 'Complete',             action_label_ar: 'إتمام',          requires_notes: true,  action_type: 'complete' },
]

/**
 * Build the array of rows ready to insert into `circular_workflow_steps`.
 * The first row gets status='current'; the rest get 'pending'.
 */
export function buildDefaultWorkflowStepRows(
  circularId: string,
): Array<Record<string, unknown>> {
  return DEFAULT_CIRCULAR_WORKFLOW_STEPS.map((step, index) => ({
    circular_id: circularId,
    phase: step.phase,
    label: step.label,
    label_ar: step.label_ar,
    status: index === 0 ? 'current' : 'pending',
    action_label: step.action_label,
    action_label_ar: step.action_label_ar,
    requires_notes: step.requires_notes,
    action_type: step.action_type,
    sort_order: index,
  }))
}
