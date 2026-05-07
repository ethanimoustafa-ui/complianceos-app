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
  frameworkIds?: string[]
}

export interface CircularSlice {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in-progress' | 'completed' | 'overdue'
  progress: number
  frameworkIds?: string[]
}

// Dashboard combines per-framework weights (audits/observations/letters/circulars)
// with department-wide weights for policy/risk/training, producing a 7-component
// health snapshot.
export type DashboardWeights = FrameworkWeights & {
  policies: number
  riskPosture: number
  training: number
}

// Input for the dashboard health engine
export interface DashboardHealthInput {
  audits: import('./compliance-engine.types').AuditSlice[]
  observations: import('./compliance-engine.types').ObservationSlice[]
  risks: { likelihood: number; impact: number; status: string; frameworkIds?: string[] }[]
  policies: { status: string; nextReviewDate: string; frameworkIds?: string[] }[]
  trainings: { completionRate: number; frameworkIds?: string[] }[]
  letters: LetterSlice[]
  circulars: CircularSlice[]
  frameworkWeights: DashboardWeights
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
  // Per-department compliance score sourced from the Compliance Review tab
  // (rules + policies marked compliant/non-compliant). Surfaced on the
  // dashboard's "Compliance Health" hero card; the existing `overall` is
  // re-labelled "Team Score" in the UI.
  businessComplianceScore: number
}
