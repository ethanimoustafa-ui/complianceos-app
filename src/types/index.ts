// User types
export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'compliance_officer' | 'auditor' | 'viewer'
  department: string
  avatar?: string
  workload: number
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
export interface Observation {
  id: string
  title: string
  description: string
  source: 'sama' | 'internal_audit' | 'sharia_board' | 'external'
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assignee: User
  dueDate: string
  createdAt: string
  updatedAt: string
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
