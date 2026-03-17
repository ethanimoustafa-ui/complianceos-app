import type { ComponentScore, ScoreDeduction } from './compliance-engine.types'
import type {
  DashboardHealthInput,
  DashboardHealthResult,
  DashboardHealthComponentKey,
  FrameworkHealthScore,
  LetterSlice,
  CircularSlice,
} from './dashboard-health.types'
import type { FrameworkWeights } from '@/types'
import {
  getConfidence,
  calcAuditCompletion,
  calcObservationClosure,
  calcRiskPosture,
  calcPolicyCurrency,
  calcTrainingCompletion,
  calcOverall,
} from './compliance-engine'

// ── Letter Health ──────────────────────────────────────────────────────

const LETTER_STATUS_CREDIT: Record<string, number> = {
  'response-received': 1.0,
  'sent': 0.8,
  'approved': 0.6,
  'pending-approval': 0.3,
  'draft': 0.1,
  'overdue': 0.0,
}

export function calcLetterHealth(letters: LetterSlice[], weight: number): ComponentScore {
  const dataPoints = letters.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000

  let totalCredit = 0
  for (const letter of letters) {
    let credit = LETTER_STATUS_CREDIT[letter.status] ?? 0

    // Approaching-deadline penalty: sent letters within 7 days of deadline
    if (letter.status === 'sent' && letter.responseDeadline) {
      const deadline = new Date(letter.responseDeadline).getTime()
      if (deadline - now <= sevenDaysMs && deadline > now) {
        credit = 0.6
      }
    }

    totalCredit += credit
  }

  const score = Math.round((totalCredit / dataPoints) * 100)
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Circular Health ────────────────────────────────────────────────────

const CIRCULAR_PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.5,
}

export function calcCircularHealth(circulars: CircularSlice[], weight: number): ComponentScore {
  const dataPoints = circulars.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  let totalPriorityWeight = 0
  let priorityWeightedProgress = 0

  for (const circ of circulars) {
    const pw = CIRCULAR_PRIORITY_WEIGHT[circ.priority] ?? 1
    totalPriorityWeight += pw

    if (circ.status === 'completed') {
      priorityWeightedProgress += pw * 100
    } else if (circ.status === 'in-progress') {
      priorityWeightedProgress += pw * circ.progress
    }
    // overdue & pending = 0% credit
  }

  const score = totalPriorityWeight > 0
    ? Math.round((priorityWeightedProgress / totalPriorityWeight))
    : 0
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Compute all 7 components for a given weight set ───────────────────

function computeComponents(
  input: DashboardHealthInput,
  weights: FrameworkWeights
): Record<DashboardHealthComponentKey, ComponentScore> {
  return {
    audits: calcAuditCompletion(input.audits, weights.audits),
    observations: calcObservationClosure(input.observations, weights.observations),
    letters: calcLetterHealth(input.letters, weights.letters),
    policies: calcPolicyCurrency(input.policies, weights.policies),
    circulars: calcCircularHealth(input.circulars, weights.circulars),
    riskPosture: calcRiskPosture(input.risks, weights.riskPosture),
    training: calcTrainingCompletion(input.trainings, weights.training),
  }
}

// ── Deductions ────────────────────────────────────────────────────────

const COMPONENT_NAMES: Record<string, string> = {
  audits: 'Audit Completion',
  observations: 'Observation Closure',
  letters: 'SAMA Letters',
  policies: 'Policy Currency',
  circulars: 'Circulars',
  riskPosture: 'Risk Posture',
  training: 'Training Completion',
}

function generateHealthDeductions(
  input: DashboardHealthInput,
  components: Record<DashboardHealthComponentKey, ComponentScore>
): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = []

  // Critical observations open → -8 each
  const criticalOpen = input.observations.filter(
    (o) => o.severity === 'critical' && (o.status === 'open' || o.status === 'in_progress')
  )
  for (const obs of criticalOpen) {
    deductions.push({
      points: -8,
      description: `1 critical ${obs.source} observation open`,
      descriptionKey: 'dashboard.deduction.criticalObsOpen',
      descriptionParams: { count: '1', source: obs.source },
      severity: 'critical',
      component: 'observations',
    })
  }

  // High observations open → -3 each
  const highOpen = input.observations.filter(
    (o) => o.severity === 'high' && (o.status === 'open' || o.status === 'in_progress')
  )
  for (const obs of highOpen) {
    deductions.push({
      points: -3,
      description: `1 high severity ${obs.source} observation open`,
      descriptionKey: 'dashboard.deduction.highObsOpen',
      descriptionParams: { count: '1', source: obs.source },
      severity: 'high',
      component: 'observations',
    })
  }

  // Overdue audits → -5 each
  const overdueAudits = input.audits.filter((a) => a.status === 'overdue')
  if (overdueAudits.length > 0) {
    deductions.push({
      points: -5 * overdueAudits.length,
      description: `${overdueAudits.length} overdue compliance audit(s)`,
      descriptionKey: 'dashboard.deduction.overdueAudits',
      descriptionParams: { count: String(overdueAudits.length) },
      severity: 'high',
      component: 'audits',
    })
  }

  // Overdue SAMA letters → -6 each
  const overdueLetters = input.letters.filter((l) => l.status === 'overdue')
  if (overdueLetters.length > 0) {
    deductions.push({
      points: -6 * overdueLetters.length,
      description: `${overdueLetters.length} overdue SAMA letter(s)`,
      descriptionKey: 'dashboard.deduction.overdueLetters',
      descriptionParams: { count: String(overdueLetters.length) },
      severity: 'critical',
      component: 'letters',
    })
  }

  // Overdue circulars → -4 for medium/low, -6 for critical/high
  const overdueCirculars = input.circulars.filter((c) => c.status === 'overdue')
  if (overdueCirculars.length > 0) {
    const highPriority = overdueCirculars.filter((c) => c.priority === 'critical' || c.priority === 'high')
    const otherPriority = overdueCirculars.filter((c) => c.priority !== 'critical' && c.priority !== 'high')

    if (highPriority.length > 0) {
      deductions.push({
        points: -6 * highPriority.length,
        description: `${highPriority.length} overdue high-priority circular(s)`,
        descriptionKey: 'dashboard.deduction.overdueCircularsHigh',
        descriptionParams: { count: String(highPriority.length) },
        severity: 'high',
        component: 'circulars',
      })
    }
    if (otherPriority.length > 0) {
      deductions.push({
        points: -4 * otherPriority.length,
        description: `${otherPriority.length} overdue circular(s)`,
        descriptionKey: 'dashboard.deduction.overdueCirculars',
        descriptionParams: { count: String(otherPriority.length) },
        severity: 'medium',
        component: 'circulars',
      })
    }
  }

  // Insufficient-data components → -2 each
  for (const [key, comp] of Object.entries(components)) {
    if (comp.confidence === 'insufficient') {
      deductions.push({
        points: -2,
        description: `${COMPONENT_NAMES[key]} has insufficient data`,
        descriptionKey: 'dashboard.deduction.insufficientData',
        descriptionParams: { component: COMPONENT_NAMES[key] || key },
        severity: 'low',
        component: key,
      })
    }
  }

  // Any component < 60% → -3 each
  for (const [key, comp] of Object.entries(components)) {
    if (comp.confidence !== 'insufficient' && comp.score < 60) {
      deductions.push({
        points: -3,
        description: `${COMPONENT_NAMES[key]} score critically low (${comp.score}%)`,
        descriptionKey: 'dashboard.deduction.componentLow',
        descriptionParams: { component: COMPONENT_NAMES[key] || key, score: String(comp.score) },
        severity: 'medium',
        component: key,
      })
    }
  }

  deductions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
  return deductions
}

// ── Main orchestrator ────────────────────────────────────────────────

export function calculateDashboardHealth(input: DashboardHealthInput): DashboardHealthResult {
  // Primary framework = first pinned → drives overall score
  const primaryWeights = input.pinnedFrameworks.length > 0
    ? input.pinnedFrameworks[0].weights
    : input.frameworkWeights

  // Compute primary 7-component breakdown
  const components = computeComponents(input, primaryWeights)

  // Overall score from primary weights
  const { overall, confidence } = calcOverall(components)

  // Per-pinned-framework scores — FILTER data by frameworkIds
  const frameworkScores: FrameworkHealthScore[] = input.pinnedFrameworks.map((fw) => {
    const filteredInput: DashboardHealthInput = {
      ...input,
      audits: input.audits.filter(a => a.frameworkIds?.includes(fw.id)),
      observations: input.observations.filter(o => o.frameworkIds?.includes(fw.id)),
      letters: input.letters.filter(l => l.frameworkIds?.includes(fw.id)),
      policies: input.policies.filter(p => p.frameworkIds?.includes(fw.id)),
      circulars: input.circulars.filter(c => c.frameworkIds?.includes(fw.id)),
      risks: input.risks.filter(r => r.frameworkIds?.includes(fw.id)),
      trainings: input.trainings.filter(t => t.frameworkIds?.includes(fw.id)),
    }
    const fwComponents = computeComponents(filteredInput, fw.weights)
    const fwOverall = calcOverall(fwComponents)
    return {
      frameworkId: fw.id,
      frameworkName: fw.name,
      overall: fwOverall.overall,
      confidence: fwOverall.confidence,
      components: fwComponents,
    }
  })

  // Deductions based on primary components
  const deductions = generateHealthDeductions(input, components)

  return {
    overall,
    confidence,
    components,
    frameworkScores,
    deductions,
  }
}
