import type { ConfidenceLevel, ComponentScore, ScoreDeduction } from './compliance-engine.types'
import type { FrameworkWeights } from '@/types'

// The 7 dashboard health components matching FrameworkWeights keys
export type DashboardHealthComponentKey =
  | 'audits'
  | 'observations'
  | 'letters'
  | 'policies'
  | 'circulars'
  | 'riskPosture'
  | 'training'

// Slim data slices for the two new components
export interface LetterSlice {
  id: string
  status: 'draft' | 'pending-approval' | 'approved' | 'sent' | 'response-received' | 'overdue'
  responseDeadline?: string
}

export interface CircularSlice {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in-progress' | 'completed' | 'overdue'
  progress: number
}

// Input for the dashboard health engine
export interface DashboardHealthInput {
  audits: import('./compliance-engine.types').AuditSlice[]
  observations: import('./compliance-engine.types').ObservationSlice[]
  risks: { likelihood: number; impact: number; status: string }[]
  policies: { status: string; nextReviewDate: string }[]
  trainings: { completionRate: number }[]
  letters: LetterSlice[]
  circulars: CircularSlice[]
  frameworkWeights: FrameworkWeights
  pinnedFrameworks: Array<{ id: string; name: string; weights: FrameworkWeights }>
  targetScore: number
}

// Per-framework health score
export interface FrameworkHealthScore {
  frameworkId: string
  frameworkName: string
  overall: number
  confidence: ConfidenceLevel
  components: Record<DashboardHealthComponentKey, ComponentScore>
}

// Full result from the dashboard health engine
export interface DashboardHealthResult {
  overall: number
  confidence: ConfidenceLevel
  components: Record<DashboardHealthComponentKey, ComponentScore>
  frameworkScores: FrameworkHealthScore[]
  deductions: ScoreDeduction[]
}
