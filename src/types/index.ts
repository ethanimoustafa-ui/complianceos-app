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
}

// Audit types
export interface Audit {
  id: string
  title: string
  type: 'internal' | 'sama' | 'sharia'
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  dueDate: string
  assignee: User
  progress: number
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
  createdAt?: string
  updatedAt?: string
}

// Risk types
export interface Risk {
  id: string
  title: string
  description: string
  category: string
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  riskScore: number
  status: 'identified' | 'mitigating' | 'accepted' | 'resolved'
  owner: User
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

// SAMA Letters
export interface SAMALetter {
  id: string
  type: 'non-objection' | 'inquiry' | 'submission' | 'notification'
  reference: string
  recipient: string
  subject: string
  body: string
  status: 'draft' | 'sent' | 'received' | 'closed'
  sentDate?: string
  responseDeadline?: string
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
  type: 'internal' | 'external' | 'sama'
  status: 'draft' | 'sent' | 'received'
  body: string
  attachments: Attachment[]
  threadId?: string
  createdAt: string
  updatedAt: string
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

// Policy
export interface Policy {
  id: string
  name: string
  version: string
  status: 'draft' | 'active' | 'archived'
  lastReviewDate: string
  nextReviewDate: string
  owner: string
  department: string
  content: string
  category: string
  attachments: Attachment[]
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

export interface AuditWithRelations extends Audit {
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

// Sort type
export interface SortState {
  field: string
  direction: 'asc' | 'desc'
}
