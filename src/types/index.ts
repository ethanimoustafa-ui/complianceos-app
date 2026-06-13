// User types
export interface User {
  id: string
  name: string
  email: string
  role: 'officer' | 'manager' | 'admin'
  department: string
  avatar?: string
  phone?: string
  avatarSeed?: string
  workload: number
  permissions?: string[]
  lastLogin?: string
  createdAt?: string
}

// App Notification (used by notification-store sidebar panel)
export interface AppNotification {
  id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  sourceType?: CalendarSourceType
  route?: string
  read: boolean
  entityId?: string
  dedupeKey?: string
  createdAt: string
}

// Message types (used by message-store)
export interface MessageThread {
  id: string
  participants: string[]          // participant names
  participantIds: string[]        // participant user IDs
  subject?: string                // optional — auto-generated for groups if not set
  lastMessage: string
  lastMessageAt: string
  unreadCount: number
  isGroup: boolean                // true if 2+ recipients
  avatarUrl?: string              // custom group avatar (base64 data URL)
  createdBy: string               // userId of thread creator
  admins: string[]                // userIds with admin rights (creator is always admin)
}

export interface Message {
  id: string
  threadId: string
  senderId: string
  senderName: string
  content: string
  createdAt: string
  read: boolean
}

// Help article (used by help-store)
export interface HelpArticle {
  id: string
  title: string
  summary: string
  category: string
  content: string
  icon: string
}

// Team Member type (extends User with team-specific fields)
export interface TeamMember extends User {
  status: 'active' | 'inactive' | 'pending'
  joinedAt: string
  invitedBy?: string
  nationality?: string
  assignments?: { title: string; dueDate: string; progress?: number }[]
  accessControls?: { label: string; enabled: boolean }[]
  burnoutSince?: string
}

// Audit types
export interface AuditDocument {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
  uploadedAt: string
  uploadedBy?: string
  // W52: storage object path in the audit_documents bucket — downloads mint
  // a signed URL from it.
  storagePath?: string
}

export interface AuditTeamMember {
  id: string
  // W46: the PROFILE id behind this team row (audit_team_members.user_id) —
  // `id` is the row id post-persist; tasks key assignees by profile id.
  userId?: string
  name: string
  avatar: string
  role: string
  isOwner?: boolean
  addedAt: string
}

export interface AuditComment {
  id: string
  auditId: string
  content: string
  author: {
    id: string
    name: string
    avatar: string
  }
  createdAt: string
  updatedAt?: string
  isEdited?: boolean
}

export type AuditFrequency = 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'ad_hoc'
// AuditCategory is now an opaque string. Default seeds (security_compliance,
// financial_compliance, regulatory_compliance, operational_compliance,
// hr_compliance, sharia_compliance) live in useAuditCategoryStore; existing
// audits with those values keep matching. Users can add custom categories via
// the EditableSelect on the audit picker.
export type AuditCategory = string
export type AuditPriority = 'critical' | 'high' | 'medium' | 'low'

// Audit authority type. 'internal' is always available; the rest are driven at
// runtime by enabled correspondence-based frameworks in useFrameworkConfigStore.
export type AuditAuthority = 'internal' | RegulatoryBodyId

export interface Audit {
  id: string
  title: string
  type: AuditAuthority
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  dueDate: string
  assignee: User
  progress: number
  documents?: AuditDocument[]
  team?: AuditTeamMember[]
  comments?: AuditComment[]
  description?: string
  category?: AuditCategory
  frequency?: AuditFrequency
  priority?: AuditPriority
  closedOverdue?: boolean  // Flag indicating audit was completed after due date
  completedAt?: string     // Timestamp when audit was marked complete
  reviewSchedule?: ReviewSchedule
  frameworkIds?: RegulatoryBodyId[]
  createdAt: string
  updatedAt: string
}

// Observation types
export type ObservationSource =
  | 'sama' | 'cma' | 'ia' | 'zatca' | 'misa' | 'safiu' | 'citc'
  | 'internal' | 'sharia'
  | (string & {})
export type ObservationSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ObservationStatus = 'open' | 'in_progress' | 'remediated' | 'resolved' | 'closed'

export interface ObservationAssignee {
  id?: string
  name: string
  avatar: string
  role: string
}

export interface ObservationTeamMember {
  name: string
  avatar: string
  role: string
}

export interface ObservationChecklistItem {
  id: string
  text: string
  completed: boolean
  deadline?: string                  // YYYY-MM-DD
}

export interface ObservationUpdate {
  id: string
  authorId: string              // For permission checks
  author: {
    name: string
    avatar: string
  }
  text: string
  createdAt: string
  isEdited?: boolean            // Show "edited" label
  editedAt?: string             // Edit timestamp
}

export interface ObservationDocument {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

// Remediation Plan types
export type RemediationPlanStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface RemediationPlan {
  id: string
  title: string
  description: string
  dueDate: string                // Must be < observation.dueDate
  status: RemediationPlanStatus
  submittedAt?: string
  submittedBy?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNotes?: string
  updatedAt?: string
  documents?: ObservationDocument[]
  createdAt: string
}

// Closure request/review types
export interface ClosureRequest {
  requestedAt: string
  requestedBy: string
  requestedByName?: string
  notes?: string
}

export interface ClosureReview {
  reviewedAt: string
  reviewedBy: string
  reviewedByName?: string
  approved: boolean
  notes?: string
}

export interface ObservationTimelineEntry {
  id: string
  date: string
  dateKey?: string // Translation key like 'today', 'yesterday'
  description: string
  descriptionAr?: string // Arabic description for bilingual support
  descriptionKey?: string // Translation key for standard actions
  descriptionParams?: Record<string, string> // Parameters for translation interpolation
  // Wave-20 / PORTING-TEMPLATE §2.11 — dual-store columns. The reader picks
  // textEn vs textAr by current locale (no parse, no regex). `description`
  // / `descriptionAr` are kept for backward-compat with legacy in-memory
  // entries that the store still synthesises optimistically.
  textEn?: string
  textAr?: string
  userId?: string
  userName?: string
  userAvatar?: string
  userRole?: string // e.g., "Compliance Officer"
  userDepartment?: string // e.g., "Risk Management"
  actionType?:
    | 'checklist_add' | 'checklist_edit' | 'checklist_delete' | 'checklist_update'
    | 'status_change' | 'severity_change' | 'observation_updated'
    | 'document_add' | 'document_delete'
    | 'comment_add' | 'comment_edit' | 'comment_delete'
    | 'leader_transfer'
    | 'remediation_submitted' | 'remediation_approved' | 'remediation_rejected'
    | 'created' | 'updated'
  targetId?: string
}

export interface Observation {
  id: string
  title: string
  subTitle?: string
  description: string
  source: ObservationSource
  severity: ObservationSeverity
  status: ObservationStatus
  dueDate: string
  remediationSubmissionDueDate?: string  // Deadline to submit remediation plan
  department: string
  reference: string
  assignee?: ObservationAssignee
  assignees?: ObservationAssignee[]
  team?: ObservationTeamMember[]
  progress?: number
  checklist?: ObservationChecklistItem[]
  updates?: ObservationUpdate[]
  documents?: ObservationDocument[]
  timeline?: ObservationTimelineEntry[]
  creatorId?: string              // User who created the observation
  leaderId?: string               // Current leader (initially = creatorId)
  remediationPlan?: RemediationPlan
  closureRequest?: ClosureRequest   // Present when closure has been requested
  closureReview?: ClosureReview     // Present after closure has been reviewed
  frameworkIds?: RegulatoryBodyId[]
  createdAt?: string
  updatedAt?: string
  // Wave-20 / Q3 — persisted `observations.is_overdue` (migration 060). True
  // when `due_date < current_date` and `status NOT IN ('closed','resolved','completed')`.
  // Maintained by a BEFORE INSERT/UPDATE trigger + a daily pg_cron resync.
  isOverdue?: boolean
  // O7: set when "Mark as Remediated" is clicked (status→closed + archived_at→NOW()).
  // Archived observations are hidden from the default list; visible via "Archived" filter.
  archivedAt?: string | null
}

// Risk types
// RiskCategory is now an opaque string. Default seeds (operational, financial,
// compliance, strategic, reputational) live in useRiskCategoryStore so existing
// risks keep matching. New custom categories may be added via the EditableSelect.
export type RiskCategory = string
export type RiskStatus = 'identified' | 'mitigating' | 'accepted' | 'resolved'
export type MonitoringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'

export interface MitigationChecklistItem {
  id: string
  text: string
  completed: boolean
  deadline?: string                  // YYYY-MM-DD
}

export interface RiskHistoryEntry {
  id: string
  timestamp: string
  user: string
  // First row: client-minted optimistic entries. Second row: actions the API
  // routes write to risk_history (see writeRiskHistory call sites) — list rows
  // hydrate these from the server, so the union must cover both.
  action:
    | 'created' | 'status_changed' | 'score_updated' | 'mitigation_updated' | 'reviewed' | 'assigned' | 'note_added' | 'checklist_added' | 'checklist_toggled' | 'checklist_edited' | 'checklist_removed'
    | 'updated' | 'department_assigned' | 'deadline_set' | 'sent_to_department' | 'plan_submitted' | 'plan_accepted' | 'mitigated'
  previousValue?: string
  newValue?: string
  notes?: string
}

// New mitigation workflow states (officer-driven). Existing `status` stays for the
// risk register lifecycle; this complements it with the per-department workflow.
export type RiskMitigationWorkflowStatus =
  | 'pending-assignment'   // client-only alias of 'not-started' (pre-hydration)
  | 'not-started'          // server default (migration 009) — same meaning as above
  | 'sent-to-department'   // officer has sent the risk
  | 'plan-proposed'        // department has proposed a mitigation plan
  | 'in-progress'          // officer accepted the plan, items being marked off
  | 'mitigated'            // client-only alias of 'resolved' (optimistic toggle-all)
  | 'resolved'             // server terminal value (all checklist items done)

export interface DepartmentProposedPlan {
  id: string
  plan: string
  checklist: MitigationChecklistItem[]
  submittedAt: string
  submittedBy: string      // department user
  notes?: string
}

// A document the department sent with its (received) mitigation plan — bytes
// live in the `risk_plan_documents` storage bucket; this is the metadata.
export interface RiskPlanDocument {
  id: string
  name: string
  type: string
  storagePath: string
  uploadedAt: string
}

export interface Risk {
  id: string
  title: string
  description: string
  category: RiskCategory
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  riskScore: number
  status: RiskStatus
  owner: User
  mitigationPlan?: string
  mitigationChecklist?: MitigationChecklistItem[]
  mitigationProgress: number
  monitoringFrequency: MonitoringFrequency
  lastReviewDate?: string
  nextReviewDate?: string
  reviewSchedule?: ReviewSchedule
  history: RiskHistoryEntry[]
  frameworkIds?: RegulatoryBodyId[]
  // Officer-driven mitigation workflow
  intendedDepartmentId?: string         // department-store id
  mitigationDeadline?: string           // YYYY-MM-DD; hard deadline for mitigation
  mitigationWorkflowStatus?: RiskMitigationWorkflowStatus
  departmentProposedPlan?: DepartmentProposedPlan
  planDocuments?: RiskPlanDocument[]
  sentToDepartmentAt?: string
  createdAt: string
  updatedAt: string
}

// Dashboard stats
export interface DashboardStats {
  complianceHealth: number
  pendingPolicies: number
  upcomingDeadlines: number
  openObservations: number
  samaSubmissions: {
    pending: number
    submitted: number
    approved: number
  }
  riskSummary: {
    high: number
    medium: number
    low: number
  }
}

// Attachment type (used across multiple entities)
export interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size: number
  uploadedAt: string
  uploadedBy: string
  dataUrl?: string
  // W17-1 / SEC-1: optimistic-locking token (server `updated_at`). The
  // attachment-DELETE route consumes this via `If-Match`. Optional — pre-W17
  // persisted attachments may not carry it until the next mutation re-fetches.
  updatedAt?: string
}

// Reminder type
export interface Reminder {
  id: string
  type: 'email' | 'notification' | 'sms'
  time: string // ISO string or relative like "1h", "1d"
  sent: boolean
}

// Comment type (used for observations, audits, etc.)
export interface Comment {
  id: string
  content: string
  author: User
  createdAt: string
  updatedAt?: string
  isEdited?: boolean
  editedAt?: string
}

// Timeline entry type (for activity logs)
export interface TimelineEntry {
  id: string
  action: string
  description: string
  user: User
  timestamp: string
  metadata?: Record<string, unknown>
}

// SAMA Letter Templates
export type TemplateStatus = 'Active' | 'Draft'

// Smart placeholder system for letter templates.
// Authors insert placeholders by token (e.g., {{candidate_name}}). Each token
// has a typed definition that drives the compose-time picker.
export type PlaceholderType = 'date' | 'reference'
export type PlaceholderRefKind = 'observation' | 'audit' | 'letter' | 'rule' | 'policy'

export interface PlaceholderDef {
  key: string                       // token name (used between {{...}} in body/subject)
  label: string                     // shown to the composer
  labelAr?: string
  type: PlaceholderType
  // For 'reference' placeholders, list which entity types are pickable. If empty
  // or omitted, all reference kinds are allowed.
  refKinds?: PlaceholderRefKind[]
  // Compose-time the picker emits this shape and the renderer interpolates
  // `[REF-ID] Title` for reference values.
}

export interface PlaceholderRefValue {
  kind: PlaceholderRefKind
  id: string
  reference: string                 // human reference ID
  title: string
}

export type PlaceholderValue =
  | { type: 'date'; value: string }
  | { type: 'reference'; value: PlaceholderRefValue }

export interface LetterTemplate {
  id: string
  name: string
  type: LetterType
  icon: string
  color: string
  description: string
  status: TemplateStatus
  createdDate: string
  lastModified: string
  usageCount: number
  // Default letter content (carried into new letters)
  defaultSubjectEn?: string
  defaultSubjectAr?: string
  defaultBodyEn?: string
  defaultBodyAr?: string
  defaultSignerName?: string
  defaultSignerTitle?: string
  defaultSignerNameAr?: string
  defaultSignerTitleAr?: string
  defaultSignatureImageUrl?: string  // base64 data URL
  defaultAuthority?: CircularAuthority
  defaultSamaDepartment?: SAMADepartment
  defaultRecipientName?: string
  defaultRecipientOrg?: string
  defaultRecipientCity?: string
  defaultRecipientNameAr?: string
  defaultRecipientOrgAr?: string
  defaultRecipientCityAr?: string
  // Smart placeholders configured at template-author time.
  placeholderDefs?: PlaceholderDef[]
  // W41: quick-strip pinning + per-template sub-category default.
  pinned?: boolean
  defaultSubCategory?: string
}

// SAMA Letters
export type LetterStatus =
  | 'draft'
  | 'pending-approval'
  | 'approved'
  | 'sent'
  | 'response-received'
  | 'overdue'
  | 'rejected'

// Widened to opaque string id so users can add custom letter types via
// useLetterTypeStore. Default seeds match the legacy union values
// ('non-objection' | 'inquiry' | 'submission' | 'notification') so existing
// letters and templates remain valid.
export type LetterType = string
// Department id is now an opaque string scoped per authority (see src/lib/letter-authority.ts).
// Existing SAMA dept IDs (banking-supervision, payment-systems, compliance-aml) remain valid.
export type SAMADepartment = string
// Sub-category id is now an opaque string. Default seeds match the legacy
// kebab-case values (key-function, product-launch, …) so existing letters keep
// matching; users can add custom sub-categories via useSAMASubCategoryStore.
export type SAMASubCategory = string

export interface LetterApprovalStep {
  // W41: chains are configurable (1..10 steps, free-text roles).
  step: number
  role: string
  status: 'pending' | 'approved' | 'rejected'
  assignedTo?: string
  approvedAt?: string
  rejectedAt?: string
  notes?: string
}

export interface LetterTimelineEvent {
  id: string
  title: string
  // Wave-21 dual-store: readers pick the locale-appropriate column.
  textEn?: string
  textAr?: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending' | 'rejected'
}

/** Wave-21 — per-letter version history entry (mirrors PolicyVersionEntry). */
export interface LetterVersionEntry {
  id: string
  date: string
  author: string
  textEn: string
  textAr: string
  fieldChanges: Array<{ field: string; from: string; to: string }> | null
  createdAt: string
}

export interface Letter {
  id: string
  reference: string
  authority: CircularAuthority
  type: LetterType
  subCategory?: SAMASubCategory
  samaDepartment?: SAMADepartment
  subject: string
  subjectAr?: string
  body: string
  bodyAr?: string
  status: LetterStatus
  priority: 'standard' | 'urgent'
  createdBy: string
  assignedTo?: string
  approvalChain: LetterApprovalStep[]
  timeline: LetterTimelineEvent[]
  sentDate?: string
  responseDeadline?: string
  responseReceivedDate?: string
  responseNote?: string | null
  // W40: reviewer's reason when status === 'rejected' (cleared on resubmit).
  rejectionReason?: string | null
  // W41: list decorations (GET /api/letters) for the row badges.
  attachmentCount?: number
  hasPdf?: boolean
  recipientName?: string
  recipientOrg?: string
  recipientCity?: string
  recipientNameAr?: string
  recipientOrgAr?: string
  recipientCityAr?: string
  signerName?: string
  signerTitle?: string
  signerNameAr?: string
  signerTitleAr?: string
  signatureImageUrl?: string   // base64, stamped from template at letter creation
  attachments: Attachment[]
  relatedObservations: string[]
  // Smart placeholder definitions for {{token}} chips embedded in body/subject.
  // When the letter ships post-draft, body/subject are flattened via renderTemplate
  // and these defs become a historical record.
  placeholderDefs?: PlaceholderDef[]
  // Per-token compose-time values keyed by token name.
  placeholderValues?: Record<string, PlaceholderValue | undefined>
  // Wave-21 — version history (populated by detail fetch; absent on list rows).
  versions?: LetterVersionEntry[]
  createdAt: string
  updatedAt: string
}

// Calendar Events
export interface CalendarEvent {
  id: string
  title: string
  // Type id — seeded with 'deadline' | 'meeting' | 'submission' | 'review',
  // user can add new ids via useCalendarEventTypeStore. Render layer uses a
  // fallback config so unknown ids stay readable.
  type: string
  date: string
  startTime?: string
  endTime?: string
  attendees: string[]
  relatedEntityId?: string
  relatedEntityType?: 'audit' | 'observation' | 'letter'
  reminders: Reminder[]
  description?: string
  location?: string
  completed?: boolean
  completedAt?: string
  agency?: 'SAMA' | 'ZATCA' | 'CMA' | 'IA' | 'NCA' | 'MISA' | 'SAFIU' | null
  severity?: 'critical' | 'high' | 'medium' | 'low'
  frameworkIds?: RegulatoryBodyId[]
  createdAt: string
  updatedAt: string
}

// Correspondence
export interface Correspondence {
  id: string
  subject: string
  from: string
  to: string[]
  date: string
  // Type id — seeded with the original literal union, but user can extend via
  // useCorrespondenceTypeStore. Type widened to string; consumers fall back to
  // a neutral color/label config when the id is unknown.
  type: string
  status: 'draft' | 'sent' | 'received'
  body: string
  attachments: Attachment[]
  threadId?: string
  archived?: boolean
  reference?: string
  assignee?: string
  createdAt: string
  updatedAt: string
}

// Advisory types
export type AdvisoryStatus = 'pending' | 'in_progress' | 'completed'
export type AdvisoryPriority = 'low' | 'medium' | 'high'
// BusinessUnit ids — seeded by useBusinessUnitStore with the legacy literal
// union; widened to `string` so user-added ids round-trip safely.
export type BusinessUnit = string

export interface AdvisoryNote {
  id: string
  author: string
  content: string
  timestamp: string
}

// W23 — dual-store activity-log row (text_en + text_ar populated at write time).
export interface AdvisoryTimelineRow {
  id: string
  advisoryId: string
  textEn: string
  textAr: string
  userName: string
  status: string
  createdAt: string
}

// W23 — dual-store version-history row.
export interface AdvisoryVersionRow {
  id: string
  advisoryId: string
  date: string
  author: string
  textEn: string
  textAr: string
  fieldChanges: Array<{ field: string; from: string; to: string }> | null
  createdAt: string
}

export interface AdvisoryRequest {
  id: string
  ref: string
  subject: string
  description: string
  businessUnit: BusinessUnit
  status: AdvisoryStatus
  priority: AdvisoryPriority
  requestedBy: string
  requestedDate: string
  assignedTo?: string
  notes: AdvisoryNote[]
  // W23 additions — populated on detail responses.
  timeline?: AdvisoryTimelineRow[]
  versions?: AdvisoryVersionRow[]
  createdAt: string
  updatedAt: string
}

export interface AdvisoryFilters {
  status?: AdvisoryStatus[]
  priority?: AdvisoryPriority[]
  businessUnit?: BusinessUnit[]
  search?: string
  dateRange?: { from: string; to: string }
}

// Requirement types
export type RequirementStatus = 'implementing' | 'drafting' | 'completed' | 'pending'

export interface Requirement {
  id: string
  name: string
  kind?: 'rule' | 'policy'
  category: string
  affectedDepartment?: string
  releaseDate: string
  status: RequirementStatus
  dueDate: string
  description?: string
  progress: number
  referenceUrl?: string
  linkedCircularId?: string
  checklist?: ChecklistItem[]
  createdAt: string
  updatedAt: string
}

export interface RequirementFilters {
  status?: RequirementStatus[]
  category?: string[]
  kind?: ('rule' | 'policy')[]
  search?: string
  dateRange?: { from: string; to: string }
}

// Training Module
export interface TrainingModule {
  id: string
  title: string
  description: string
  duration: number // in minutes
  completed: boolean
  completedAt?: string
  order: number
}

// Training
export interface Training {
  id: string
  name: string
  type: 'compliance' | 'technical' | 'regulatory'
  department: string
  deadline: string
  completionRate: number
  assignedUsers: string[]
  modules: TrainingModule[]
  status: 'active' | 'completed' | 'overdue'
  createdAt: string
  updatedAt: string
}

// Review Schedule
export type ReviewCadence = 'monthly' | 'quarterly' | 'semi-annual' | 'yearly' | 'adhoc'

export interface ReviewSchedule {
  cadence: ReviewCadence
  dayOfMonth?: number   // 1–28; undefined when cadence === 'adhoc'
  adhocDate?: string    // ISO date (YYYY-MM-DD); only when cadence === 'adhoc'
}

// Policy
export type PolicyStatus = 'draft' | 'under-review' | 'approved' | 'expired' | 'overdue' | 'requires-review'
// PolicyCategory is now an opaque string. Default seeds (compliance, it,
// operations, risk, hr, finance) live in usePolicyCategoryStore. Existing
// policies keep matching; users can add custom categories.
export type PolicyCategory = string
export type PolicyApprovalTier = 'board' | 'management' | 'managerial' | 'sharia' | 'agm' | 'audit_committee' | 'other' | (string & {})

// Wave-19.4 / Item-3 — dual-store: `textEn` + `textAr` replace the
// single-language `changes` string (migration 057). The reader picks the
// locale-matching column at render time.
export interface PolicyVersionEntry { version: string; date: string; author: string; textEn: string; textAr: string; fieldChanges?: VersionFieldChange[] }
export interface PolicyWorkflowStep {
  // P1-fix: server-issued UUID; undefined for optimistic-only rows added
  // before the POST /workflow/steps response arrives.
  id?: string
  step: string
  date: string
  user: string
  status: 'completed' | 'current' | 'pending'
  description?: string
  actionType?: string
  note?: string
  stepState?: 'pending-approval' | 'awaiting-response' | 'awaiting-manager'
  deadline?: string                  // YYYY-MM-DD; must be ≤ parent policy nextReviewDate
}
export interface PolicyOwner { name: string; avatar: string; department: string }
// Policy Leader = person responsible for following up. (Was previously `owner`.)
// Policy Owner / Business Owner = department responsible for complying with the policy.
// We store the dept id (department-store) so renames propagate automatically.

export interface PolicyAttachment {
  id: string
  name: string
  dataUrl: string       // base64 data URL for download
  size: number          // bytes
  uploadedAt: string    // ISO
  uploadedBy: string
}

export interface PolicyEvidence {
  id: string
  name: string
  dataUrl: string
  uploadedAt: string
  uploadedBy: string
  reviewCycleId: string
  reviewCycleLabel: string
  notes?: string
}

export interface PolicyActivityEntry {
  id: string
  timestamp: string   // ISO string, used for ordering
  date: string        // YYYY-MM-DD, for display
  // Wave-19.3 — `leader_changed` / `leader_assigned` added for the Policy
  // Leader change wired through the PATCH route. Catch-all `string` widens
  // the union for forward-compat with server-emitted types not yet enumerated
  // on the client (the activity log feed never crashes on an unknown type).
  type:
    | 'created' | 'edited' | 'step_advanced' | 'step_reverted'
    | 'document_uploaded' | 'document_removed'
    | 'step_added' | 'step_renamed'
    | 'workflow_approved' | 'step_denied'
    | 'evidence_uploaded' | 'evidence_removed'
    | 'phase_deadline_set' | 'phase_deadline_changed' | 'checklist_deadline_set'
    | 'leader_changed' | 'leader_assigned'
    | (string & {})
  textEn: string
  textAr: string
  user?: string
  note?: string       // optional transition note
}

export interface Policy {
  id: string                      // auto: POL-001 (or `ref_code` post Wave-19)
  // Wave-19.3 / P18-BUG-1 — the canonical UUID from `policies.id`. The UI
  // entity id is the `ref_code` (display-friendly), but every API call (PATCH,
  // DELETE, child routes, /activity) requires the UUID.
  uuid?: string
  name: string
  description: string
  status: PolicyStatus
  category: PolicyCategory
  version: string
  approvalTier: PolicyApprovalTier
  // Person responsible for following up on the policy. Surfaced as "Policy Leader" in UI.
  owner: PolicyOwner
  // Wave-19.3 / Task-B — `policies.owner_id` (uuid → profiles.id) lifts the
  // optional FK onto the client so the Leader picker can render the canonical
  // team-member id (not just a display name).
  ownerId?: string
  // Department that owns the policy ("Policy Owner" / "Business Owner"). Stored as dept id.
  businessOwnerDepartmentId?: string
  // Departments impacted by the policy (round-3 §4 propagation). Stored as
  // department ids referencing useDepartmentStore.
  affectedDepartments?: string[]
  lastReviewDate: string
  nextReviewDate: string
  reviewCycleDays: number
  approvedDate?: string
  versionHistory: PolicyVersionEntry[]
  workflowTimeline: PolicyWorkflowStep[]
  activityLog?: PolicyActivityEntry[]
  attachments?: PolicyAttachment[]        // replaces attachmentUrl (kept for seed compat)
  attachmentUrl?: string                  // legacy (seed data only)
  evidence?: PolicyEvidence[]
  overdueCount?: number
  lastOverdueDate?: string
  currentReviewCycleId?: string
  currentReviewCycleLabel?: string
  currentReviewCycleDate?: string
  reviewCycleHistory?: Array<{ id: string; label: string; initiatedAt: string }>
  reviewSchedule?: ReviewSchedule
  frameworkIds?: RegulatoryBodyId[]
  // Wave-19 / Q3: persisted `policies.is_expired` (migration 055) — bool column
  // populated by a BEFORE INSERT/UPDATE trigger + daily pg_cron resync. Cheap
  // O(1) read for StatCard counts; consumers should prefer this over inline
  // `nextReviewDate < new Date()` checks.
  isExpired?: boolean
  // P6 (W29): set when "Archive Policy" is clicked (migration 081). Null = active.
  archivedAt?: string | null
  // W43: completed/total approval-workflow steps as 0-100, decorated on the
  // list response (null when the policy has no steps yet).
  workflowProgress?: number | null
  createdAt: string
  updatedAt: string
}

// Regulatory Update
export interface RegulatoryUpdate {
  id: string
  title: string
  source: 'sama' | 'cma' | 'other'
  publishDate: string
  effectiveDate: string
  impact: 'high' | 'medium' | 'low'
  status: 'new' | 'reviewing' | 'implemented'
  affectedFrameworks: string[]
  description: string
  actionRequired?: string
  createdAt: string
  updatedAt: string
}

// Circular / Rules types
// CircularAuthority is the correspondence authority tag stored on circulars and
// letters. At runtime it's the enabled framework's id (lowercase, e.g., 'sama',
// 'citc', 'sharia-board', 'custom-abc'). Legacy uppercase values ('SAMA', ...)
// from older persisted state remain valid strings and are resolved by the
// display helpers that look up the framework store.
export type CircularAuthority = string
export type CircularPriority = 'critical' | 'high' | 'medium' | 'low'
export type CircularStatus = 'pending' | 'in-progress' | 'completed' | 'overdue'
export type CircularApplicability = 'applicable' | 'not-applicable' | 'pending'
export type CAPStatus = 'not-started' | 'drafting' | 'submitted' | 'approved' | 'in-progress' | 'completed'
export type ArticleRiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type ArticleComplianceStatus = 'compliant' | 'in-progress' | 'non-compliant' | 'not-started'

export interface CircularArticle {
  id: string
  articleNumber: string
  title: string
  description?: string
  riskLevel: ArticleRiskLevel
  responsibleDepartment: string
  complianceStatus: ArticleComplianceStatus
  assignedTo?: string
  notes?: string
  checklist: ChecklistItem[]
  attachments: Attachment[]
  versions?: ArticleVersionEntry[]
  timeline?: ArticleTimelineEvent[]
  // W17-1 / SEC-1: optimistic-locking token (server `updated_at`). Sent as
  // `If-Match: W/"<updatedAt>"` on PATCH/DELETE. Optional for backward
  // compatibility with rows hydrated before this column was surfaced.
  updatedAt?: string
}

export interface CircularWorkflowStep {
  id: string
  phase: 0 | 1 | 2
  label: string
  labelAr: string
  status: 'pending' | 'current' | 'completed'
  date?: string
  user?: string
  notes?: string
  actionLabel: string
  actionLabelAr: string
  requiresNotes: boolean
  actionType: 'approve' | 'notify-bo' | 'notify-authority' | 'advance' | 'submit' | 'acknowledge' | 'start' | 'complete' | 'review'
  deadline?: string                  // YYYY-MM-DD; must be ≤ parent circular dueDate (or capDeadline for CAP-phase steps)
  // Story 11.3: per-step assignee (team-member id). Editable in the inline
  // step editor on the Workflow tab.
  assignedTo?: string
  // W17-1 / SEC-1: optimistic-locking token (server `updated_at`).
  updatedAt?: string
}

export type CircularTimelineEventType =
  | 'phase_deadline_set'
  | 'phase_deadline_changed'
  | 'step_added'
  | 'step_renamed'
  | 'step_removed'
  | 'steps_reordered'

export interface CircularTimelineEvent {
  id: string
  title: string
  titleAr?: string
  textEn?: string
  textAr?: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending'
  type?: CircularTimelineEventType
}

// GAP-19: a single structured per-field diff entry — shared by circular and
// article version history, rendered by the shared `VersionHistoryList` diff
// table (Field Changed / From / To).
export interface VersionFieldChange {
  field: string
  from: string
  to: string
}

export interface CircularVersionEntry {
  version: number
  date: string
  author: string
  // Wave-19.4 / Item-3 — dual-store columns (migration 057). The reader picks
  // `textEn` vs `textAr` based on the current locale; no JSON parse.
  textEn: string
  textAr: string
  // GAP-19: structured per-field diff persisted in `circular_versions.field_changes`.
  // Mirrors `ArticleVersionEntry.fieldChanges`; the circular Version History
  // tab renders it as a Field / From / To table. `[]` for no-diff rows (e.g.
  // the synthetic "Initial registration" entry).
  fieldChanges?: VersionFieldChange[]
  approved: boolean
}

export interface ArticleVersionEntry {
  version: number
  date: string
  author: string
  // Wave-19.4 / Item-3 — dual-store columns (migration 057).
  textEn: string
  textAr: string
  // GAP-13: structured per-field diff persisted in `article_versions.field_changes`.
  // The Version History tab renders this as a Field / From / To table. Empty
  // for pre-migration (Wave-9) rows, which fall back to the locale text.
  fieldChanges: { field: string; from: string; to: string }[]
  approved: boolean
}

export interface ArticleTimelineEvent {
  id: string
  title: string
  titleAr?: string
  // Wave-19.1 / Q8 — dual-store rendered strings persisted on the row at
  // write time. The reader picks the column matching the current locale.
  textEn?: string
  textAr?: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending'
}

export interface CircularPendingEdit {
  data: Partial<Circular>
  requestedBy: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
  fieldChanges?: Record<string, { from: string; to: string }>
  approvals: Array<{
    id: string
    role: string
    roleAr: string
    status: 'pending' | 'approved' | 'rejected'
    date?: string
    user?: string
    notes?: string
  }>
}

export interface Circular {
  id: string                      // internal uuid
  reference: string               // auto: SAMA-2026-001
  authority: CircularAuthority
  title: string
  priority: CircularPriority
  status: CircularStatus
  applicability: CircularApplicability
  departments: string[]
  businessOwnerDepartment?: string
  assignedTo?: string
  progress: number
  issuanceDate: string
  dueDate: string
  capStatus: CAPStatus
  capDueDate?: string
  articles: CircularArticle[]
  description?: string
  pdfUrl?: string
  workflowSteps?: CircularWorkflowStep[]
  // Phase of the current workflow step, stamped by the list endpoint via a
  // side query so the row card can paint the right phase chip BEFORE the
  // detail GET fires. `undefined` means "phase unknown — show skeleton".
  currentPhase?: 0 | 1 | 2
  // True once the detail endpoint has populated the nested workflow_steps /
  // implementations / timeline arrays. Used to gate skeleton placeholders.
  detailHydrated?: boolean
  timeline?: CircularTimelineEvent[]
  versions?: CircularVersionEntry[]
  capAttachments?: Attachment[]
  capResponseDeadline?: string
  remediationAttachments?: Attachment[]
  // GAP-21: multi-file circular PDF attachments (circular_pdf_attachments).
  // Distinct from the legacy single `pdfUrl` column, which is still surfaced.
  pdfAttachments?: Attachment[]
  capDeadline?: string
  remediationDeadline?: string
  referenceUrl?: string
  pendingEdit?: CircularPendingEdit
  frameworkIds?: RegulatoryBodyId[]
  // Wave-19 / Q3: persisted `circulars.is_overdue` (migration 055) — bool column
  // populated by a BEFORE INSERT/UPDATE trigger on (`due_date`, `status`) +
  // daily pg_cron resync. Predicate: `due_date < current_date AND status !=
  // 'completed'`. Cheap O(1) read for StatCard counts.
  isOverdue?: boolean
  createdAt: string
  updatedAt: string
}

export interface CircularFilters {
  authority?: CircularAuthority[]
  status?: CircularStatus[]
  priority?: CircularPriority[]
  applicability?: CircularApplicability[]
  department?: string
  search?: string
  dateRange?: { from: string; to: string }
}

// Report types
export type ReportType = 'compliance' | 'audit' | 'risk' | 'observation' | 'sama' | 'custom'
export type ReportFormat = 'pdf' | 'excel' | 'word' | 'csv'
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom'

export interface Report {
  id: string
  name: string
  type: ReportType
  format: ReportFormat
  period: ReportPeriod
  status: 'draft' | 'generating' | 'ready' | 'scheduled'
  generatedAt?: string
  scheduledFor?: string
  recipients: string[]
  filters?: Record<string, unknown>
  url?: string
  createdAt: string
  updatedAt: string
}

// Notification types
export type NotificationType = 'info' | 'warning' | 'error' | 'success'

export interface Notification {
  id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  actionUrl?: string
  createdAt: string
}

// Framework type
export interface Framework {
  id: string
  name: string
  code: string
  description: string
  version: string
  enabled: boolean
}

// Organization type (for onboarding)
export interface Organization {
  id: string
  name: string
  size: 'small' | 'medium' | 'large' | 'enterprise'
  industry: string
  frameworks: string[]
  integrations: string[]
  createdAt: string
  updatedAt: string
}

// Extended types with relationships
export interface ObservationWithRelations extends Omit<Observation, 'timeline'> {
  comments: Comment[]
  attachments: Attachment[]
  timeline: TimelineEntry[]
  auditId?: string
}

export interface AuditWithRelations extends Omit<Audit, 'documents'> {
  observations: Observation[]
  findings: ObservationWithRelations[]
  checklists: ChecklistItem[]
  documents: Attachment[]
}

export interface ChecklistItem {
  id: string
  title: string
  completed: boolean
  completedBy?: string
  completedAt?: string
  order: number
  deadline?: string                  // YYYY-MM-DD; optional per-item due date
  // W17-1 / SEC-1: optimistic-locking token (server `updated_at`).
  updatedAt?: string
}

// Filter types for list views
export interface ObservationFilters {
  status?: Observation['status'][]
  severity?: Observation['severity'][]
  source?: Observation['source'][]
  assigneeId?: string
  dateRange?: { from: string; to: string }
}

export interface AuditFilters {
  status?: Audit['status'][]
  type?: Audit['type'][]
  assigneeId?: string
  dateRange?: { from: string; to: string }
}

export interface CalendarFilters {
  type?: CalendarEvent['type'][]
  dateRange?: { from: string; to: string }
}

// Unified Calendar types
export type CalendarSourceType =
  | 'audit' | 'observation' | 'policy' | 'sama-letter'
  | 'circular' | 'training' | 'correspondence' | 'advisory'
  | 'risk' | 'user-event'

export interface UnifiedCalendarItem {
  id: string
  sourceType: CalendarSourceType
  title: string
  subtitle?: string
  date: string
  status: string
  priority?: 'critical' | 'high' | 'medium' | 'low' | 'standard'
  assignee?: string
  route: string
  colorKey: CalendarSourceType
  /** True when the source entity/sub-item is complete — drives the calendar's
   *  cross-out + the completed/due/all filter. Computed at the data source. */
  done?: boolean
  /** Set on derived SUB-ITEMS (checklist items, workflow steps, tasks,
   *  remediation plans) so the calendar can visually distinguish them from
   *  top-level entities and label them. Absent on entity-level items. */
  kind?: 'checklist' | 'step' | 'task' | 'remediation'
  /** The parent entity this sub-item belongs to (e.g. the risk/observation
   *  title), shown as "from <parentTitle>" in the calendar detail. */
  parentTitle?: string
}

// Pagination type
export interface PaginationState {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// Risk filters
export interface RiskFilters {
  status?: RiskStatus[]
  category?: RiskCategory[]
  monitoringFrequency?: MonitoringFrequency[]
  dateRange?: { from: string; to: string }
}

// Policy filters
export interface PolicyFilters {
  status?: PolicyStatus[]
  category?: PolicyCategory[]
  approvalTier?: PolicyApprovalTier[]
  search?: string
  dateRange?: { from: string; to: string }
}

// Training page types
export type TrainingStatus = 'completed' | 'in_progress' | 'not_started' | 'overdue'
// TrainingCategory is now an opaque string. Default seeds match the legacy
// extended set (compliance, aml, cybersecurity, sharia, risk, data-privacy,
// ethics, fraud-prevention, governance, operational-risk, business-continuity,
// sanctions, internal-audit) and live in useTrainingCategoryStore.
export type TrainingCategory = string
export type FileUploadCategory = 'saudization' | 'training-list' | 'employee-details'

export interface CourseProgress {
  id: string
  name: string
  category: TrainingCategory
  status: TrainingStatus
  progress: number
  completedDate?: string
  dueDate: string
  score?: number
}

export interface TrainingEmployee {
  id: string
  name: string
  email: string
  department: string
  isSaudi: boolean
  courses: CourseProgress[]
  overallProgress: number
}

export interface DepartmentTraining {
  name: string
  employees: number
  completed: number
  inProgress: number
  overdue: number
  progress: number
}

export interface TrainingCourse {
  id: string
  name: string
  category: TrainingCategory
  dueDate: string
  description?: string
  assignedCount: number
  completedCount: number
  overdueCount: number
  inProgressCount: number
  frameworkIds?: RegulatoryBodyId[]
}

export interface SaudizationDepartment {
  name: string
  total: number
  saudi: number
  percentage: number
}

export interface SaudizationMetrics {
  target: number
  actual: number
  totalEmployees: number
  saudiEmployees: number
  byDepartment: SaudizationDepartment[]
  lastDataSource?: 'manual' | 'file-upload'
  lastUpdated?: string
}

export interface TrainingOverviewStats {
  overallCompletion: number | null
  coursesAssigned: number | null
  overdueCourses: number | null
  inProgressCourses: number | null
}

// Training filters
export interface TrainingFilters {
  status?: Training['status'][]
  type?: Training['type'][]
  department?: string
  dateRange?: { from: string; to: string }
}

// Sort type
export interface SortState {
  field: string
  direction: 'asc' | 'desc'
}

// ── Settings Page Types ──────────────────────────────────────────────────────

export type RegulatoryBodyId =
  // Correspondence authorities (also act as buckets for progress tracking)
  | 'sama' | 'cma' | 'ia' | 'zatca' | 'misa' | 'safiu'
  // NCA cybersecurity frameworks
  | 'nca-ecc' | 'nca-cscc' | 'nca-ccc'
  // Privacy / data protection
  | 'ndmo-pdpl'   // legacy — kept for persisted state back-compat
  | 'sdaia-pdpl'  // current (2023 revision)
  // ISO
  | 'iso-27001' | 'iso-22301' | 'iso-31000'
  // COSO
  | 'coso-ic' | 'coso-erm'
  // Other Saudi regulators / standards
  | 'citc' | 'saso'
  // Islamic finance governance
  | 'sharia-board'

export type ComplianceThreshold = 'strict' | 'standard' | 'relaxed' | 'custom'

// Per-framework weights cover the four correspondence surfaces that generate
// scoring signal for that authority. Policies, training, and risk posture are
// department-wide (not authority-owned) and live in compliance-settings-store.
export type FrameworkWeights = {
  audits: number
  observations: number
  letters: number
  circulars: number
}

export interface FrameworkConfig {
  id: RegulatoryBodyId
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  icon: string
  iconColor: string
  enabled: boolean
  departments: string[]
  threshold: ComplianceThreshold
  customThresholdValue?: number
  alertOnNonCompliance: boolean
  weights: FrameworkWeights
  customFieldValues?: Record<string, string>
  // True = regulator/authority that raises correspondence (letters, audits, observations)
  // and participates in compliance scoring. False = internal self-assessment framework
  // (ISO, COSO, NCA ECC, SDAIA PDPL, etc.) — kept as a tag but excluded from scoring.
  correspondenceBased: boolean
}

export interface Department {
  id: string
  name: string
  nameAr: string
  isDefault: boolean
  /** Optional contact inbox for "inform the department" mailto actions. */
  email?: string
  /**
   * Stable identifier used as the value in free-text department columns
   * (e.g. `observations.department`). Distinct from the display `name`,
   * which can be renamed. Optional because legacy/unsynced rows may not have
   * it; consumers should fall back to `name` for matching in such cases.
   */
  key?: string
}

export type DashboardView = 'executive' | 'managerial' | 'officer'
export type DateFormatPreference = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

export interface UserPreferences {
  dashboardView: DashboardView
  timezone: string
  dateFormat: DateFormatPreference
}

export type NotificationModule = 'rules' | 'policies' | 'audits' | 'observations' | 'samaLetters' | 'training'
export type NotificationEvent = 'dueDates' | 'criticalAlerts' | 'approvalRequests' | 'overdueItems' | 'statusChanges'
export type NotificationScope = 'own' | 'managed' | 'all'

export interface NotificationPreferences {
  modules: Record<NotificationModule, boolean>
  events: Record<NotificationEvent, boolean>
  scope: NotificationScope
  emailDigestEnabled: boolean
  emailDigestAddress: string
  slackEnabled: boolean
}

export type AuditTemplateCategory =
  | 'security-compliance'
  | 'financial-compliance'
  | 'regulatory-compliance'
  | 'operational-compliance'
  | 'data-privacy'
  | 'sharia-compliance'
  | 'internal-controls'
  | 'custom'

export interface FrequencySchedule {
  dayOfMonth?: number
  monthInQuarter?: 1 | 2 | 3
  monthOfYear?: number
  adhocDate?: string // ISO date for ad-hoc frequency
  // H1: optional iconify icon ID persisted alongside frequency metadata so no
  // extra DB column is required (the frequency_schedule jsonb absorbs it).
  templateIcon?: string
  // Reference documents attached to an (audit) template. Stored here in the
  // frequency_schedule jsonb (no dedicated table/column) — same rationale as
  // templateIcon. Files are kept as data URLs for local preview/download.
  attachments?: TemplateAttachment[]
}

export interface TemplateAttachment {
  name: string
  size: number
  dataUrl: string
}

export interface AuditTemplate {
  id: string
  name: string
  nameAr?: string
  auditType: AuditAuthority
  category: AuditTemplateCategory
  priority: AuditPriority
  frequency: AuditFrequency
  frequencySchedule?: FrequencySchedule
  defaultTitle: string
  defaultTitleAr?: string
  defaultDescription: string
  defaultDescriptionAr?: string
  defaultChecklistItems: string[]
  defaultTeamRoles: string[]
  framework?: RegulatoryBodyId
  status: 'active' | 'draft'
  createdAt: string
  updatedAt: string
  usageCount: number
}

export interface PolicyTemplate {
  id: string
  name: string
  nameAr?: string
  category: PolicyCategory
  approvalTier: PolicyApprovalTier
  frequency?: AuditFrequency
  frequencySchedule?: FrequencySchedule
  defaultDescription: string
  defaultDescriptionAr?: string
  defaultWorkflowSteps: Array<{ step: string; description: string; actionType: string }>
  versionPattern: string
  framework?: RegulatoryBodyId
  status: 'active' | 'draft'
  createdAt: string
  updatedAt: string
  usageCount: number
}

export interface CriticalAlert {
  id: string
  source: 'audit' | 'policy' | 'observation' | 'correspondence' | 'risk' | 'training'
  entityId: string
  title: string
  severity: 'critical' | 'high' | 'medium'
  reason: string
  createdAt: string
}
