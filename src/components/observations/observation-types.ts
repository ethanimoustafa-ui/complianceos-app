export type ObservationSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ObservationStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export type ObservationSource = 'sama' | 'internal' | 'sharia'

export interface Observation {
  id: string
  title: string
  description: string
  source: ObservationSource
  severity: ObservationSeverity
  status: ObservationStatus
  dueDate: string
  department: string
  reference: string
  assignee?: {
    name: string
    avatar: string
    role: string
  }
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
    author: {
      name: string
      avatar: string
    }
    text: string
    createdAt: string
  }[]
  documents?: {
    id: string
    name: string
    type: 'pdf' | 'image' | 'doc'
  }[]
  timeline?: {
    id: string
    date: string
    description: string
  }[]
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
  sama: {
    label: 'SAMA',
    icon: 'lucide:landmark',
    iconColor: 'text-emerald-500',
  },
  internal: {
    label: 'Internal',
    icon: 'lucide:clipboard-check',
    iconColor: 'text-blue-500',
  },
  sharia: {
    label: 'Sharia',
    icon: 'lucide:moon',
    iconColor: 'text-amber-500',
  },
}
