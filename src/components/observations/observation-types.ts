export type ObservationSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ObservationStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

// ObservationSource is a framework id (lowercase) or 'internal'. The listed
// values below are the built-in seeds that have hardcoded icon/label metadata
// in sourceConfig; custom correspondence frameworks added via settings
// produce additional source values at runtime.
export type ObservationSource =
  | 'sama' | 'cma' | 'ia' | 'zatca' | 'misa' | 'safiu' | 'citc'
  | 'internal' | 'sharia'
  | string & {}

// Remediation Plan types
export type RemediationPlanStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface RemediationPlan {
  id: string
  title: string
  description: string
  dueDate: string
  status: RemediationPlanStatus
  submittedAt?: string
  submittedBy?: string
  reviewedAt?: string
  reviewedBy?: string
  reviewNotes?: string
  updatedAt?: string
  documents?: {
    id: string
    name: string
    type: 'pdf' | 'image' | 'doc'
  }[]
  createdAt: string
}

// Closure types
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
  assignee?: {
    id?: string
    name: string
    avatar: string
    role: string
  }
  assignees?: {
    id?: string
    name: string
    avatar: string
    role: string
  }[]
  team?: {
    name: string
    avatar: string
    role: string
  }[]
  progress?: number
  checklist?: {
    id: string
    text: string
    completed: boolean
  }[]
  updates?: {
    id: string
    authorId?: string              // For permission checks
    author: {
      name: string
      avatar: string
    }
    text: string
    createdAt: string
    isEdited?: boolean            // Show "edited" label
    editedAt?: string             // Edit timestamp
  }[]
  documents?: {
    id: string
    name: string
    type: 'pdf' | 'image' | 'doc'
    isRemediation?: boolean
  }[]
  timeline?: {
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
  }[]
  creatorId?: string              // User who created the observation
  leaderId?: string               // Current leader (initially = creatorId)
  remediationPlan?: RemediationPlan
  closureRequest?: ClosureRequest   // Present when closure has been requested
  closureReview?: ClosureReview     // Present after closure has been reviewed
  // O7: set when "Mark as Remediated" is clicked (status→closed + archived_at→NOW()).
  archivedAt?: string | null
}

export const severityConfig: Record<
  ObservationSeverity,
  { label: string; bgColor: string; textColor: string; badgeClass: string }
> = {
  critical: {
    label: 'Critical',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-600',
    badgeClass: 'bg-rose-50 text-rose-600',
  },
  high: {
    label: 'High',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
    badgeClass: 'bg-orange-50 text-orange-600',
  },
  medium: {
    label: 'Medium',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    badgeClass: 'bg-amber-50 text-amber-600',
  },
  low: {
    label: 'Low',
    bgColor: 'bg-slate-100',
    textColor: 'text-slate-600',
    badgeClass: 'bg-slate-100 text-slate-600',
  },
}

export const statusConfig: Record<
  ObservationStatus,
  { label: string; dotColor: string; textColor: string }
> = {
  open: {
    label: 'Open',
    dotColor: 'bg-slate-300',
    textColor: 'text-slate-700',
  },
  in_progress: {
    label: 'In Progress',
    dotColor: 'bg-amber-400',
    textColor: 'text-slate-700',
  },
  resolved: {
    label: 'Pending Review',
    dotColor: 'bg-blue-500',
    textColor: 'text-slate-700',
  },
  closed: {
    label: 'Verified & Closed',
    dotColor: 'bg-emerald-500',
    textColor: 'text-slate-700',
  },
}

export const sourceConfig: Record<
  ObservationSource,
  { label: string; icon: string; iconColor: string }
> = {
  sama:    { label: 'SAMA',     icon: 'lucide:landmark',        iconColor: 'text-indigo-500' },
  cma:     { label: 'CMA',      icon: 'lucide:trending-up',     iconColor: 'text-emerald-500'},
  ia:      { label: 'IA',       icon: 'lucide:shield',          iconColor: 'text-violet-500'  },
  zatca:   { label: 'ZATCA',    icon: 'lucide:receipt',         iconColor: 'text-teal-500'    },
  misa:    { label: 'MISA',     icon: 'lucide:building-2',      iconColor: 'text-orange-500' },
  safiu:   { label: 'SAFIU',    icon: 'lucide:search',          iconColor: 'text-slate-500'   },
  citc:    { label: 'CITC',     icon: 'lucide:radio-tower',     iconColor: 'text-violet-500' },
  internal:{ label: 'Internal', icon: 'lucide:clipboard-check', iconColor: 'text-blue-600'    },
  sharia:  { label: 'Sharia',   icon: 'lucide:moon',            iconColor: 'text-amber-600'   },
}
