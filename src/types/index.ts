// User types
export interface User {
  id: string
  name: string
  email: string
  role: 'officer' | 'manager' | 'admin'
  department: string
  avatar?: string
  workload: number
  permissions?: string[]
  lastLogin?: string
  createdAt?: string
}

// Team Member type (extends User with team-specific fields)
export interface TeamMember extends User {
  status: 'active' | 'inactive' | 'pending'
  joinedAt: string
  invitedBy?: string
  nationality?: string
}

// Audit types
export interface AuditDocument {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
  uploadedAt: string
  uploadedBy?: string
}

export interface AuditTeamMember {
  id: string
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
export type AuditCategory = 'security_compliance' | 'financial_compliance' | 'regulatory_compliance' | 'operational_compliance' | 'hr_compliance' | 'sharia_compliance'
export type AuditPriority = 'critical' | 'high' | 'medium' | 'low'

export interface Audit {
  id: string
  title: string
  type: 'internal' | 'sama' | 'sharia'
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
  createdAt: string
  updatedAt: string
}

// Observation types
export type ObservationSource = 'sama' | 'internal' | 'sharia'
export type ObservationSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ObservationStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

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
  createdAt?: string
  updatedAt?: string
}

// Risk types
export type RiskCategory = 'operational' | 'financial' | 'compliance' | 'strategic' | 'reputational'
export type RiskStatus = 'identified' | 'mitigating' | 'accepted' | 'resolved'
export type MonitoringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'

export interface MitigationChecklistItem {
  id: string
  text: string
  completed: boolean
}

export interface RiskHistoryEntry {
  id: string
  timestamp: string
  user: string
  action: 'created' | 'status_changed' | 'score_updated' | 'mitigation_updated' | 'reviewed' | 'assigned' | 'note_added' | 'checklist_added' | 'checklist_toggled' | 'checklist_edited' | 'checklist_removed'
  previousValue?: string
  newValue?: string
  notes?: string
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

export interface LetterTemplate {
  id: string
  name: string
  type: SAMALetterType
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
  defaultSamaDepartment?: SAMADepartment
  defaultRecipientName?: string
  defaultRecipientOrg?: string
  defaultRecipientCity?: string
  defaultRecipientNameAr?: string
  defaultRecipientOrgAr?: string
  defaultRecipientCityAr?: string
}

// SAMA Letters
export type SAMALetterStatus =
  | 'draft'
  | 'pending-approval'
  | 'approved'
  | 'sent'
  | 'response-received'
  | 'overdue'

export type SAMALetterType = 'non-objection' | 'inquiry' | 'submission' | 'notification'
export type SAMADepartment = 'banking-supervision' | 'payment-systems' | 'compliance-aml'
export type SAMASubCategory =
  | 'key-function' | 'product-launch' | 'equity-participation'
  | 'circular-clarification' | 'regulatory-interpretation'
  | 'quarterly-aml' | 'annual-compliance'
  | 'incident-notification' | 'system-outage'

export interface SAMALetterApprovalStep {
  step: 1 | 2 | 3
  role: 'Compliance Officer' | 'Department Head' | 'CEO'
  status: 'pending' | 'approved' | 'rejected'
  assignedTo?: string
  approvedAt?: string
  rejectedAt?: string
  notes?: string
}

export interface SAMALetterTimelineEvent {
  id: string
  title: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending'
}

export interface SAMALetter {
  id: string
  reference: string
  type: SAMALetterType
  subCategory?: SAMASubCategory
  samaDepartment?: SAMADepartment
  subject: string
  subjectAr?: string
  body: string
  bodyAr?: string
  status: SAMALetterStatus
  priority: 'standard' | 'urgent'
  createdBy: string
  assignedTo?: string
  approvalChain: SAMALetterApprovalStep[]
  timeline: SAMALetterTimelineEvent[]
  sentDate?: string
  responseDeadline?: string
  responseReceivedDate?: string
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
  createdAt: string
  updatedAt: string
}

// Calendar Events
export interface CalendarEvent {
  id: string
  title: string
  type: 'deadline' | 'meeting' | 'submission' | 'review'
  date: string
  startTime?: string
  endTime?: string
  attendees: string[]
  relatedEntityId?: string
  relatedEntityType?: 'audit' | 'observation' | 'letter'
  reminders: Reminder[]
  description?: string
  location?: string
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
  type: 'sama' | 'cma' | 'internal' | 'external_auditor' | 'sharia_board' | 'vendor' | 'other'
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
export type BusinessUnit = 'corporate_banking' | 'compliance' | 'it' | 'risk_management' | 'finance' | 'operations' | 'hr'

export interface AdvisoryNote {
  id: string
  author: string
  content: string
  timestamp: string
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
export type PolicyCategory = 'compliance' | 'it' | 'operations' | 'risk' | 'hr' | 'finance'
export type PolicyApprovalTier = 'board' | 'management' | 'sharia' | 'agm'

export interface PolicyVersionEntry { version: string; date: string; author: string; changes: string }
export interface PolicyWorkflowStep {
  step: string
  date: string
  user: string
  status: 'completed' | 'current' | 'pending'
  description?: string
  actionType?: string
  note?: string
  stepState?: 'pending-approval' | 'awaiting-response' | 'awaiting-manager'
}
export interface PolicyOwner { name: string; avatar: string; department: string }

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
  type: 'created' | 'edited' | 'step_advanced' | 'step_reverted' | 'document_uploaded' | 'document_removed' | 'step_added' | 'workflow_approved' | 'step_denied' | 'evidence_uploaded' | 'evidence_removed'
  textEn: string
  textAr: string
  user?: string
  note?: string       // optional transition note
}

export interface Policy {
  id: string                      // auto: POL-001
  name: string
  description: string
  status: PolicyStatus
  category: PolicyCategory
  version: string
  approvalTier: PolicyApprovalTier
  owner: PolicyOwner
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
  reviewCycleHistory?: Array<{ id: string; label: string; initiatedAt: string }>
  reviewSchedule?: ReviewSchedule
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
export type CircularAuthority = 'SAMA' | 'CMA' | 'IA' | 'ZATCA' | 'MISA' | 'SAFIU'
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
}

export interface CircularTimelineEvent {
  id: string
  title: string
  titleAr?: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending'
}

export interface CircularVersionEntry {
  version: number
  date: string
  author: string
  changes: string
  fieldChanges?: Record<string, { from: string; to: string }>
  approved: boolean
}

export interface ArticleVersionEntry {
  version: number
  date: string
  author: string
  summary: string
  fieldChanges: Record<string, { from: string; to: string }>
  approved: boolean
}

export interface ArticleTimelineEvent {
  id: string
  title: string
  titleAr?: string
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
  progress: number
  issuanceDate: string
  dueDate: string
  capStatus: CAPStatus
  capDueDate?: string
  articles: CircularArticle[]
  description?: string
  pdfUrl?: string
  workflowSteps?: CircularWorkflowStep[]
  timeline?: CircularTimelineEvent[]
  versions?: CircularVersionEntry[]
  capAttachments?: Attachment[]
  capResponseDeadline?: string
  remediationAttachments?: Attachment[]
  capDeadline?: string
  remediationDeadline?: string
  referenceUrl?: string
  pendingEdit?: CircularPendingEdit
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
