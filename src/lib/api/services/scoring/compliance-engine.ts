import type {
  PeriodFilter,
  PeriodConfig,
  ConfidenceLevel,
  ComponentScore,
  ScoreDeduction,
  TrendDataPoint,
  ComplianceScoreResult,
  ComplianceEngineInput,
  AuditSlice,
  ObservationSlice,
  CircularSlice,
  PerFrameworkScore,
  PerFrameworkComponentScores,
  FrameworkConfigInput,
} from './compliance-engine.types'

// ── Period helpers ────────────────────────────────────────────────────

export function getPeriodConfig(filter: PeriodFilter): PeriodConfig {
  const now = new Date()
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  // Fiscal year (Saudi FY = calendar year, Jan 1 – Dec 31). 'fiscal' = current
  // year; 'fiscal-YYYY' = a specific year chosen from the UI year-picker. A past
  // year ends Dec 31; the current/future year is capped at today.
  const fiscalYearMatch = /^fiscal-(\d{4})$/.exec(filter)
  if (filter === 'fiscal' || fiscalYearMatch) {
    const year = fiscalYearMatch ? Number(fiscalYearMatch[1]) : now.getFullYear()
    const startDate = new Date(year, 0, 1, 0, 0, 0, 0)
    const yearEnd =
      year >= now.getFullYear() ? endDate : new Date(year, 11, 31, 23, 59, 59, 999)
    return { filter, startDate, endDate: yearEnd }
  }

  let startDate: Date
  switch (filter) {
    case '6months':
      startDate = new Date(now)
      startDate.setMonth(startDate.getMonth() - 6)
      break
    case '12months':
      startDate = new Date(now)
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    case '3months':
    default:
      startDate = new Date(now)
      startDate.setMonth(startDate.getMonth() - 3)
      break
  }

  startDate.setHours(0, 0, 0, 0)
  return { filter, startDate, endDate }
}

function getPreviousPeriodConfig(period: PeriodConfig): PeriodConfig {
  const duration = period.endDate.getTime() - period.startDate.getTime()
  const prevEnd = new Date(period.startDate.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - duration)
  return { filter: period.filter, startDate: prevStart, endDate: prevEnd }
}

// ── Filtering ────────────────────────────────────────────────────────

function filterByPeriod<T extends { createdAt?: string }>(items: T[], period: PeriodConfig): T[] {
  return items.filter((item) => {
    if (!item.createdAt) return true // conservative: include items without createdAt
    const created = new Date(item.createdAt)
    return created >= period.startDate && created <= period.endDate
  })
}

// ── Confidence ───────────────────────────────────────────────────────

export function getConfidence(dataPoints: number): ConfidenceLevel {
  if (dataPoints <= 2) return 'insufficient'
  if (dataPoints <= 5) return 'low'
  if (dataPoints <= 15) return 'moderate'
  return 'high'
}

// ── Severity weighting for observations ──────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.5,
}

// ── Late penalty scale ───────────────────────────────────────────────

function getLatePenaltyCredit(dueDate: string, completedAt?: string): number {
  if (!completedAt) return 0.25 // worst penalty if completedAt missing but closedOverdue

  const due = new Date(dueDate)
  const completed = new Date(completedAt)
  const daysLate = Math.ceil((completed.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLate <= 7) return 0.85
  if (daysLate <= 14) return 0.70
  if (daysLate <= 30) return 0.50
  return 0.25
}

// ── Component: Audit Completion ──────────────────────────────────────

export function calcAuditCompletion(audits: AuditSlice[], weight: number): ComponentScore {
  const dataPoints = audits.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  // totalDue = all audits (they're in the period)
  // completed on time = status completed & not closedOverdue
  // completed late = closedOverdue === true
  // not completed = pending/in_progress/overdue
  let totalCredit = 0

  for (const audit of audits) {
    if (audit.status === 'completed') {
      if (audit.closedOverdue) {
        totalCredit += getLatePenaltyCredit(audit.dueDate, audit.completedAt)
      } else {
        totalCredit += 1 // full credit
      }
    }
    // else: 0 credit
  }

  const score = Math.round((totalCredit / dataPoints) * 100)
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Component: Observation Closure ───────────────────────────────────

export function calcObservationClosure(observations: ObservationSlice[], weight: number): ComponentScore {
  const dataPoints = observations.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  let totalWeight = 0
  let closedWeight = 0

  for (const obs of observations) {
    const w = SEVERITY_WEIGHT[obs.severity] ?? 1
    totalWeight += w
    if (obs.status === 'closed' || obs.status === 'resolved') {
      closedWeight += w
    }
  }

  const score = totalWeight > 0 ? Math.round((closedWeight / totalWeight) * 100) : 0
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Component: Risk Posture ──────────────────────────────────────────

export function calcRiskPosture(risks: { likelihood: number; impact: number; status: string }[], weight: number): ComponentScore {
  const dataPoints = risks.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  let totalWeight = 0
  let resolvedWeight = 0

  for (const risk of risks) {
    const w = risk.likelihood * risk.impact
    totalWeight += w
    if (risk.status === 'resolved' || risk.status === 'accepted') {
      resolvedWeight += w
    }
  }

  const score = totalWeight > 0 ? Math.round((resolvedWeight / totalWeight) * 100) : 0
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Component: Policy Currency ───────────────────────────────────────

export function calcPolicyCurrency(policies: { status: string; nextReviewDate: string }[], weight: number): ComponentScore {
  const dataPoints = policies.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  const now = new Date()
  const activePolicies = policies.filter((p) => p.status === 'approved' || p.status === 'active')
  if (activePolicies.length === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  const current = activePolicies.filter((p) => new Date(p.nextReviewDate) > now)
  const score = Math.round((current.length / activePolicies.length) * 100)
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Component: Training Completion ───────────────────────────────────

export function calcTrainingCompletion(trainings: { completionRate: number }[], weight: number): ComponentScore {
  const dataPoints = trainings.length
  const confidence = getConfidence(dataPoints)

  if (dataPoints === 0) {
    return { score: 0, weight, confidence, dataPoints }
  }

  const avg = trainings.reduce((sum, t) => sum + t.completionRate, 0) / dataPoints
  const score = Math.round(avg)
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Overall score (exclude insufficient, re-normalize) ───────────────

export function calcOverall(components: Record<string, ComponentScore>): { overall: number; confidence: ConfidenceLevel } {
  const eligible = Object.values(components).filter((c) => c.confidence !== 'insufficient')

  if (eligible.length === 0) {
    return { overall: 0, confidence: 'insufficient' }
  }

  const totalWeight = eligible.reduce((sum, c) => sum + c.weight, 0)
  if (totalWeight === 0) {
    return { overall: 0, confidence: 'insufficient' }
  }

  const weightedSum = eligible.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0)
  const overall = Math.round(weightedSum * 10) / 10

  // aggregate confidence = worst among eligible
  const order: ConfidenceLevel[] = ['insufficient', 'low', 'moderate', 'high']
  const worstIdx = Math.min(...eligible.map((c) => order.indexOf(c.confidence)))
  const confidence = order[worstIdx]

  return { overall: Math.min(100, Math.max(0, overall)), confidence }
}

// ── Component: Circular Implementation ───────────────────────────────

const CIRCULAR_PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.5,
}

export function calcCircularImplementation(circulars: CircularSlice[], weight: number): ComponentScore {
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
    ? Math.round(priorityWeightedProgress / totalPriorityWeight)
    : 0
  return { score: Math.min(100, Math.max(0, score)), weight, confidence, dataPoints }
}

// ── Per-framework scores (correspondence authorities only) ───────────

function filterByFramework<T extends { frameworkIds?: string[] }>(items: T[], frameworkId: string): T[] {
  return items.filter(item => item.frameworkIds?.includes(frameworkId))
}

function calcPerFrameworkScore(
  audits: AuditSlice[],
  observations: ObservationSlice[],
  circulars: CircularSlice[],
  policies: { status: string; nextReviewDate: string; frameworkIds?: string[] }[],
  frameworkId: string,
  frameworkWeights: FrameworkConfigInput['weights']
): PerFrameworkScore {
  // Filter each source by authority tag.
  const fwAudits = filterByFramework(audits, frameworkId)
  const fwObs = filterByFramework(observations, frameworkId)
  const fwCirculars = filterByFramework(circulars, frameworkId)
  const fwPolicies = filterByFramework(policies, frameworkId)

  // Four correspondence-based components. `letters` weight reserved for a
  // future letter-responsiveness component — folded into observations today
  // because letters primarily surface via the observations they spawn.
  const auditComp = calcAuditCompletion(fwAudits, frameworkWeights.audits)
  const obsComp = calcObservationClosure(fwObs, frameworkWeights.observations + frameworkWeights.letters)
  const circComp = calcCircularImplementation(fwCirculars, frameworkWeights.circulars)
  // Policies aren't per-authority but we still report a policy component so
  // the dashboard can surface currency at zero weight for visibility.
  const policyComp = calcPolicyCurrency(fwPolicies, 0)

  const components: PerFrameworkComponentScores = {
    audits: auditComp,
    observations: obsComp,
    circulars: circComp,
    policies: policyComp,
  }

  const { overall, confidence } = calcOverall(components as unknown as Record<string, ComponentScore>)
  const totalDataPoints = auditComp.dataPoints + obsComp.dataPoints + circComp.dataPoints + policyComp.dataPoints

  return {
    frameworkId,
    overall,
    confidence,
    dataPoints: totalDataPoints,
    components,
  }
}

// ── Auto-generated deductions ────────────────────────────────────────

function generateDeductions(
  audits: AuditSlice[],
  observations: ObservationSlice[],
  components: Record<string, ComponentScore>
): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = []

  // Critical observations open → -8 each
  const criticalOpen = observations.filter((o) => o.severity === 'critical' && (o.status === 'open' || o.status === 'in_progress'))
  for (const obs of criticalOpen) {
    deductions.push({
      points: -8,
      description: `1 critical ${obs.source} observation open`,
      descriptionKey: 'reports.deduction.criticalObsOpen',
      descriptionParams: { count: '1', source: obs.source },
      severity: 'critical',
      component: 'observationClosure',
    })
  }

  // High observations open → -3 each
  const highOpen = observations.filter((o) => o.severity === 'high' && (o.status === 'open' || o.status === 'in_progress'))
  for (const obs of highOpen) {
    deductions.push({
      points: -3,
      description: `1 high severity ${obs.source} observation open`,
      descriptionKey: 'reports.deduction.highObsOpen',
      descriptionParams: { count: '1', source: obs.source },
      severity: 'high',
      component: 'observationClosure',
    })
  }

  // Overdue audits → -5 each
  const overdueAudits = audits.filter((a) => a.status === 'overdue')
  if (overdueAudits.length > 0) {
    deductions.push({
      points: -5 * overdueAudits.length,
      description: `${overdueAudits.length} overdue compliance audit(s)`,
      descriptionKey: 'reports.deduction.overdueAudits',
      descriptionParams: { count: String(overdueAudits.length) },
      severity: 'high',
      component: 'auditCompletion',
    })
  }

  // Audits completed late → -2 each
  const lateAudits = audits.filter((a) => a.status === 'completed' && a.closedOverdue)
  if (lateAudits.length > 0) {
    deductions.push({
      points: -2 * lateAudits.length,
      description: `${lateAudits.length} audit(s) completed past due date`,
      descriptionKey: 'reports.deduction.lateAudits',
      descriptionParams: { count: String(lateAudits.length) },
      severity: 'medium',
      component: 'auditCompletion',
    })
  }

  // Medium observations open → -1 each
  const mediumOpen = observations.filter((o) => o.severity === 'medium' && (o.status === 'open' || o.status === 'in_progress'))
  if (mediumOpen.length > 0) {
    deductions.push({
      points: -1 * mediumOpen.length,
      description: `${mediumOpen.length} medium observation(s) open`,
      descriptionKey: 'reports.deduction.mediumObsOpen',
      descriptionParams: { count: String(mediumOpen.length) },
      severity: 'medium',
      component: 'observationClosure',
    })
  }

  // Insufficient-data components → -2 each
  const componentNames: Record<string, string> = {
    auditCompletion: 'Audit Completion',
    observationClosure: 'Observation Closure',
    riskPosture: 'Risk Posture',
    policyCurrency: 'Policy Currency',
    trainingCompletion: 'Training Completion',
  }
  for (const [key, comp] of Object.entries(components)) {
    if (comp.confidence === 'insufficient') {
      deductions.push({
        points: -2,
        description: `${componentNames[key]} has insufficient data`,
        descriptionKey: 'reports.deduction.insufficientData',
        descriptionParams: { component: componentNames[key] || key },
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
        description: `${componentNames[key]} score critically low (${comp.score}%)`,
        descriptionKey: 'reports.deduction.componentLow',
        descriptionParams: { component: componentNames[key] || key, score: String(comp.score) },
        severity: 'medium',
        component: key,
      })
    }
  }

  // Sort by absolute points descending
  deductions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))

  return deductions
}

// ── Trend data ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function generateTrend(
  periodAudits: AuditSlice[],
  periodObservations: ObservationSlice[],
  config: ComplianceEngineInput['config'],
  period: ComplianceEngineInput['period']
): TrendDataPoint[] {
  // periodAudits/periodObservations are already filtered to the period window.
  // For each month/quarter, we take the cumulative subset created by that point.

  if (period.filter === 'fiscal' || period.filter.startsWith('fiscal-')) {
    const year = period.startDate.getFullYear()
    const quarters = [
      { label: 'Q1', end: new Date(year, 2, 31, 23, 59, 59, 999) },
      { label: 'Q2', end: new Date(year, 5, 30, 23, 59, 59, 999) },
      { label: 'Q3', end: new Date(year, 8, 30, 23, 59, 59, 999) },
      { label: 'Q4', end: new Date(year, 11, 31, 23, 59, 59, 999) },
    ]

    return quarters.map((q) => {
      const qAudits = periodAudits.filter((a) => !a.createdAt || new Date(a.createdAt) <= q.end)
      const qObs = periodObservations.filter((o) => !o.createdAt || new Date(o.createdAt) <= q.end)
      const score = estimateScoreForSnapshot(qAudits, qObs, config)
      return { month: q.label, actual: score, target: config.targetScore }
    })
  }

  // Monthly trend — exactly N points for an N-month period. startDate is N
  // months before now, so flooring to the 1st of the start month and looping
  // `<= end` double-counts the partial leading month AND the current month
  // (fencepost → N+1). Start one month later to drop the partial leading month;
  // the current month stays as the final point. (JS normalizes a Dec +1 → Jan.)
  const points: TrendDataPoint[] = []
  const cursor = new Date(period.startDate.getFullYear(), period.startDate.getMonth() + 1, 1)
  const end = period.endDate

  while (cursor <= end) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999)
    const label = MONTH_NAMES[cursor.getMonth()]

    const mAudits = periodAudits.filter((a) => !a.createdAt || new Date(a.createdAt) <= monthEnd)
    const mObs = periodObservations.filter((o) => !o.createdAt || new Date(o.createdAt) <= monthEnd)
    const score = estimateScoreForSnapshot(mAudits, mObs, config)

    points.push({ month: label, actual: score, target: config.targetScore })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return points
}

/**
 * Estimate score for a point-in-time snapshot.
 * Known limitation: uses current status, not historical status.
 */
function estimateScoreForSnapshot(
  audits: AuditSlice[],
  observations: ObservationSlice[],
  config: ComplianceEngineInput['config']
): number {
  const auditComp = calcAuditCompletion(audits, config.weights.auditCompletion)
  const obsComp = calcObservationClosure(observations, config.weights.observationClosure)

  const eligible = [auditComp, obsComp].filter((c) => c.confidence !== 'insufficient')
  if (eligible.length === 0) return 0

  const totalW = eligible.reduce((s, c) => s + c.weight, 0)
  if (totalW === 0) return 0

  return Math.round(eligible.reduce((s, c) => s + c.score * (c.weight / totalW), 0) * 10) / 10
}

// ── Main calculation ─────────────────────────────────────────────────

export function calculateComplianceScore(input: ComplianceEngineInput): ComplianceScoreResult {
  const { config, period } = input

  // A. Filter by period
  const audits = filterByPeriod(input.audits, period)
  const observations = filterByPeriod(input.observations, period)
  const risks = filterByPeriod(input.risks, period)
  const policies = filterByPeriod(input.policies, period)
  const trainings = filterByPeriod(input.trainings, period)
  const circulars = filterByPeriod(input.circulars, period)

  // B. Component scores (overall — ALL data, framework-agnostic)
  const components = {
    auditCompletion: calcAuditCompletion(audits, config.weights.auditCompletion),
    observationClosure: calcObservationClosure(observations, config.weights.observationClosure),
    riskPosture: calcRiskPosture(risks, config.weights.riskPosture),
    policyCurrency: calcPolicyCurrency(policies, config.weights.policyCurrency),
    trainingCompletion: calcTrainingCompletion(trainings, config.weights.trainingCompletion),
  }

  // D. Overall score
  const { overall, confidence } = calcOverall(components)

  // E. Per-framework scores — correspondence-based authorities only.
  //    Non-correspondence frameworks (ISO, COSO, NCA ECC, SDAIA PDPL, etc.) are
  //    kept as tags but excluded from scoring per the correspondence-first model.
  const frameworks: Record<string, PerFrameworkScore> = {}
  for (const fwConfig of input.frameworkConfigs) {
    if (!fwConfig.enabled || !fwConfig.correspondenceBased) continue
    frameworks[fwConfig.id] = calcPerFrameworkScore(
      audits, observations, circulars, policies,
      fwConfig.id, fwConfig.weights
    )
  }

  // F. Auto-generated deductions
  const deductions = generateDeductions(audits, observations, components)

  // G. Change calculation — compare to previous period
  const prevPeriod = getPreviousPeriodConfig(period)
  const prevAudits = filterByPeriod(input.audits, prevPeriod)
  const prevObs = filterByPeriod(input.observations, prevPeriod)
  const prevRisks = filterByPeriod(input.risks, prevPeriod)
  const prevPolicies = filterByPeriod(input.policies, prevPeriod)
  const prevTrainings = filterByPeriod(input.trainings, prevPeriod)

  const prevComponents = {
    auditCompletion: calcAuditCompletion(prevAudits, config.weights.auditCompletion),
    observationClosure: calcObservationClosure(prevObs, config.weights.observationClosure),
    riskPosture: calcRiskPosture(prevRisks, config.weights.riskPosture),
    policyCurrency: calcPolicyCurrency(prevPolicies, config.weights.policyCurrency),
    trainingCompletion: calcTrainingCompletion(prevTrainings, config.weights.trainingCompletion),
  }
  const prevOverall = calcOverall(prevComponents).overall

  const hasPrevData = Object.values(prevComponents).some((c) => c.dataPoints > 0)
  const change = hasPrevData ? Math.round((overall - prevOverall) * 10) / 10 : 0

  // H. Trend data (uses period-filtered data)
  const trend = generateTrend(audits, observations, config, period)

  return {
    overall,
    change,
    confidence,
    components,
    frameworks,
    deductions,
    trend,
  }
}
