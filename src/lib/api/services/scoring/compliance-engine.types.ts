// ── Period Configuration ──────────────────────────────────────────────
// 'fiscal' = current fiscal (calendar) year. `fiscal-YYYY` selects a specific
// past fiscal year (UI year-picker) — same Jan–Dec window, capped at Dec 31 of
// that year. Purely a retrieval key; no schema/data changes involved.
export type PeriodFilter = '3months' | '6months' | '12months' | 'fiscal' | `fiscal-${number}`

export interface PeriodConfig {
  filter: PeriodFilter
  startDate: Date
  endDate: Date
}

// ── Weight Configuration ─────────────────────────────────────────────
export interface ComponentWeights {
  auditCompletion: number
  observationClosure: number
  riskPosture: number
  policyCurrency: number
  trainingCompletion: number
}

export interface ComplianceConfig {
  weights: ComponentWeights
  targetScore: number
}

// ── Confidence ───────────────────────────────────────────────────────
export type ConfidenceLevel = 'insufficient' | 'low' | 'moderate' | 'high'

// ── Component Score ──────────────────────────────────────────────────
export interface ComponentScore {
  score: number
  weight: number
  confidence: ConfidenceLevel
  dataPoints: number
}

// ── Deductions ───────────────────────────────────────────────────────
export type DeductionSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface ScoreDeduction {
  points: number
  description: string
  descriptionKey: string
  descriptionParams: Record<string, string>
  severity: DeductionSeverity
  component: string
}

// ── Framework Score ──────────────────────────────────────────────────
export interface FrameworkScore {
  score: number
  confidence: ConfidenceLevel
  dataPoints: number
}

// ── Per-Framework Scoring (correspondence-based authorities only) ────
export interface PerFrameworkComponentScores {
  audits: ComponentScore
  observations: ComponentScore
  circulars: ComponentScore
  policies: ComponentScore
}

export interface PerFrameworkScore {
  frameworkId: string
  overall: number
  confidence: ConfidenceLevel
  dataPoints: number
  components: PerFrameworkComponentScores
}

// ── Trend ────────────────────────────────────────────────────────────
export interface TrendDataPoint {
  month: string
  actual: number
  target: number
}

// ── Framework Config (passed to engine) ─────────────────────────────
export interface FrameworkConfigInput {
  id: string
  weights: { audits: number; observations: number; letters: number; circulars: number }
  enabled: boolean
  correspondenceBased: boolean
}

// ── Engine Result ────────────────────────────────────────────────────
export interface ComplianceScoreResult {
  overall: number
  change: number
  confidence: ConfidenceLevel
  components: {
    auditCompletion: ComponentScore
    observationClosure: ComponentScore
    riskPosture: ComponentScore
    policyCurrency: ComponentScore
    trainingCompletion: ComponentScore
  }
  frameworks: Record<string, PerFrameworkScore>
  deductions: ScoreDeduction[]
  trend: TrendDataPoint[]
}

// ── Slim data slices (only fields the engine needs) ──────────────────
export interface AuditSlice {
  id: string
  type: string  // 'internal' or any RegulatoryBodyId (enabled correspondence authority)
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  dueDate: string
  completedAt?: string
  closedOverdue?: boolean
  createdAt: string
  progress: number
  priority?: 'critical' | 'high' | 'medium' | 'low'
  frameworkIds?: string[]
}

export interface ObservationSlice {
  id: string
  source: string  // framework id (lowercase) or 'internal'
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  dueDate: string
  createdAt?: string
  frameworkIds?: string[]
}

export interface RiskSlice {
  id: string
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  status: 'identified' | 'mitigating' | 'accepted' | 'resolved'
  createdAt: string
  frameworkIds?: string[]
}

export interface PolicySlice {
  id: string
  status: string   // 'approved' | 'under-review' | 'draft' | 'expired' (legacy: 'active' | 'archived')
  nextReviewDate: string
  createdAt: string
  frameworkIds?: string[]
}

export interface TrainingSlice {
  id: string
  completionRate: number
  status: 'active' | 'completed' | 'overdue'
  createdAt: string
  frameworkIds?: string[]
}

export interface CircularSlice {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in-progress' | 'completed' | 'overdue'
  progress: number
  frameworkIds?: string[]
  createdAt?: string
}

// ── Engine Input ─────────────────────────────────────────────────────
// Calendar events and audit-tasks are intentionally excluded — they are
// user-owned planning artifacts and do not participate in compliance scoring.
export interface ComplianceEngineInput {
  audits: AuditSlice[]
  observations: ObservationSlice[]
  risks: RiskSlice[]
  policies: PolicySlice[]
  trainings: TrainingSlice[]
  circulars: CircularSlice[]
  frameworkConfigs: FrameworkConfigInput[]
  config: ComplianceConfig
  period: PeriodConfig
}
