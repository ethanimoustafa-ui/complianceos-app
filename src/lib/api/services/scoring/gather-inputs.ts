// Input gatherer for the server-side scoring engines.
//
// Given a `{ period, framework_id?, department_id? }` selector, queries
// Supabase in parallel for every source slice the compliance / dashboard
// engines consume and returns a `ComplianceEngineInput` + the auxiliary
// slices the dashboard-health engine needs on top (letters, pinned
// framework configs, target score).
//
// Performance notes (free-tier conscious):
//   - All independent queries run in parallel via `Promise.all`.
//   - Each select pulls ONLY the columns the engine reads.
//   - Period boundaries are filtered in SQL via `.gte()/.lte()` on
//     `created_at` instead of post-filtering in JS.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPeriodConfig,
} from './compliance-engine'
import type {
  ComplianceEngineInput,
  PeriodFilter,
  AuditSlice,
  ObservationSlice,
  RiskSlice,
  PolicySlice,
  TrainingSlice,
  CircularSlice,
  FrameworkConfigInput,
  ComponentWeights,
} from './compliance-engine.types'
import type {
  DashboardHealthInput,
  LetterSlice,
  DashboardWeights,
} from './dashboard-health.types'
import type { FrameworkWeights } from '@/types'

// ---------- raw row types (subset of columns we select) -----------------------

interface AuditRow {
  id: string
  type: string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  due_date: string
  completed_at: string | null
  closed_overdue: boolean | null
  priority: string | null
  progress: number
  framework_ids: string[] | null
  created_at: string
}
interface ObservationRow {
  id: string
  source: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  due_date: string
  framework_ids: string[] | null
  created_at: string
}
interface RiskRow {
  id: string
  likelihood: number
  impact: number
  status: 'identified' | 'mitigating' | 'accepted' | 'resolved'
  framework_ids: string[] | null
  created_at: string
}
interface PolicyRow {
  id: string
  status: string
  next_review_date: string | null
  framework_ids: string[] | null
  created_at: string
}
interface CourseRow {
  id: string
  assigned_count: number
  completed_count: number
  framework_ids: string[] | null
  created_at: string
}
interface CircularRow {
  id: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'in-progress' | 'completed' | 'overdue'
  progress: number
  framework_ids: string[] | null
  created_at: string
}
interface LetterRow {
  id: string
  status: LetterSlice['status']
  response_deadline: string | null
  framework_ids: string[] | null
}
interface FrameworkRow {
  id: string
  enabled: boolean
  correspondence_based: boolean
  weights: FrameworkWeights | null
  name_en: string | null
}
interface ComplianceSettingsRow {
  weights: ComponentWeights | null
  target_score: number | null
}
interface FrameworkPinRow {
  framework_id: string
  position: number
}

// ---------- public types ------------------------------------------------------

export interface GatherSelector {
  period: PeriodFilter
  framework_id?: string | null
  department_id?: string | null
}

export interface GatheredInputs {
  /** Engine-ready input for the compliance score engine. */
  engineInput: ComplianceEngineInput
  /** Engine-ready input for the dashboard-health engine. */
  dashboardInput: DashboardHealthInput
  /** Pinned correspondence-based frameworks (used to assemble dashboard view). */
  pinnedFrameworks: Array<{ id: string; name: string; weights: FrameworkWeights }>
  /** Computed inputs hash for cache-key invariance. */
  inputsHash: string
  /** Raw frameworks list (for diagnostics / future use). */
  frameworks: FrameworkRow[]
}

// ---------- main entrypoint ---------------------------------------------------

export async function gatherScoringInputs(
  supabase: SupabaseClient,
  selector: GatherSelector,
): Promise<GatheredInputs> {
  const period = getPeriodConfig(selector.period)
  const startISO = period.startDate.toISOString()
  const endISO = period.endDate.toISOString()
  const fwFilter = selector.framework_id && selector.framework_id !== 'overall'
    ? selector.framework_id
    : null

  // Fire every independent query in parallel.
  const [
    auditsRes,
    observationsRes,
    risksRes,
    policiesRes,
    coursesRes,
    circularsRes,
    lettersRes,
    frameworksRes,
    settingsRes,
    pinsRes,
  ] = await Promise.all([
    supabase
      .from('audits')
      .select('id, type, status, due_date, completed_at, closed_overdue, priority, progress, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('observations')
      .select('id, source, severity, status, due_date, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('risks')
      .select('id, likelihood, impact, status, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('policies')
      .select('id, status, next_review_date, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('training_courses')
      .select('id, assigned_count, completed_count, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('circulars')
      .select('id, priority, status, progress, framework_ids, created_at')
      .is('deleted_at', null)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('sama_letters')
      .select('id, status, response_deadline, framework_ids')
      .is('deleted_at', null),
    supabase
      .from('frameworks')
      .select('id, enabled, correspondence_based, weights, name_en'),
    supabase
      .from('compliance_settings')
      .select('weights, target_score')
      .eq('singleton', true)
      .maybeSingle<ComplianceSettingsRow>(),
    supabase
      .from('framework_pins')
      .select('framework_id, position')
      .order('position', { ascending: true }),
  ])

  // Bubble up any DB error as a Promise rejection — the route handler maps it
  // to a 500 via `handle()`.
  for (const r of [auditsRes, observationsRes, risksRes, policiesRes, coursesRes, circularsRes, lettersRes, frameworksRes, pinsRes]) {
    if (r.error) throw r.error
  }

  const audits: AuditSlice[] = ((auditsRes.data ?? []) as AuditRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    dueDate: r.due_date,
    completedAt: r.completed_at ?? undefined,
    closedOverdue: r.closed_overdue ?? false,
    createdAt: r.created_at,
    progress: r.progress,
    priority: (r.priority as AuditSlice['priority']) ?? undefined,
    frameworkIds: r.framework_ids ?? [],
  }))

  const observations: ObservationSlice[] = ((observationsRes.data ?? []) as ObservationRow[]).map((r) => ({
    id: r.id,
    source: r.source,
    severity: r.severity,
    status: r.status,
    dueDate: r.due_date,
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const risks: RiskSlice[] = ((risksRes.data ?? []) as RiskRow[]).map((r) => ({
    id: r.id,
    likelihood: r.likelihood as 1 | 2 | 3 | 4 | 5,
    impact: r.impact as 1 | 2 | 3 | 4 | 5,
    status: r.status,
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const policies: PolicySlice[] = ((policiesRes.data ?? []) as PolicyRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    nextReviewDate: r.next_review_date ?? '',
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const trainings: TrainingSlice[] = ((coursesRes.data ?? []) as CourseRow[]).map((r) => ({
    id: r.id,
    completionRate: r.assigned_count > 0 ? Math.round((r.completed_count / r.assigned_count) * 100) : 0,
    status: 'active',
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const circulars: CircularSlice[] = ((circularsRes.data ?? []) as CircularRow[]).map((r) => ({
    id: r.id,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    frameworkIds: r.framework_ids ?? [],
    createdAt: r.created_at,
  }))

  const letters: LetterSlice[] = ((lettersRes.data ?? []) as LetterRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    responseDeadline: r.response_deadline ?? undefined,
    frameworkIds: r.framework_ids ?? [],
  }))

  const frameworks = (frameworksRes.data ?? []) as FrameworkRow[]
  const settings = (settingsRes.data ?? null) as ComplianceSettingsRow | null
  const pins = (pinsRes.data ?? []) as FrameworkPinRow[]

  // Default weights match the migration 004 default if no row exists.
  const componentWeights: ComponentWeights = settings?.weights ?? {
    auditCompletion: 25,
    observationClosure: 25,
    riskPosture: 20,
    policyCurrency: 15,
    trainingCompletion: 15,
  }
  const targetScore = settings?.target_score ?? 85

  const frameworkConfigs: FrameworkConfigInput[] = frameworks.map((f) => ({
    id: f.id,
    enabled: f.enabled,
    correspondenceBased: f.correspondence_based,
    weights: f.weights ?? { audits: 30, observations: 25, letters: 20, circulars: 25 },
  }))

  // Optional narrowing for per-framework view: when the caller asks for a
  // single framework_id we still pass the full slice arrays to the engine
  // (the engine itself filters by framework). When `framework_id` is set
  // we ALSO use it as a hash discriminator so the cache key differs.
  if (fwFilter) {
    // Keep arrays intact; only frameworkConfigs is constrained.
  }

  // Pinned frameworks — only correspondence-based, drop misses.
  const pinnedFrameworks = pins
    .map((p) => frameworks.find((f) => f.id === p.framework_id))
    .filter((f): f is FrameworkRow => !!f && f.correspondence_based)
    .map((f) => ({
      id: f.id,
      name: f.name_en ?? f.id,
      weights: f.weights ?? { audits: 30, observations: 25, letters: 20, circulars: 25 },
    }))

  // Build dashboard-health primary weights: first pinned framework's 4
  // correspondence weights merged with department-wide globals. Mirrors the
  // legacy `useDashboardHealth` hook exactly.
  const fwPrimary: FrameworkWeights = pinnedFrameworks.length > 0
    ? pinnedFrameworks[0].weights
    : { audits: 30, observations: 25, letters: 20, circulars: 25 }
  const dashboardWeights: DashboardWeights = {
    ...fwPrimary,
    policies: componentWeights.policyCurrency,
    riskPosture: componentWeights.riskPosture,
    training: componentWeights.trainingCompletion,
  }

  const engineInput: ComplianceEngineInput = {
    audits,
    observations,
    risks,
    policies,
    trainings,
    circulars,
    frameworkConfigs,
    config: { weights: componentWeights, targetScore },
    period,
  }

  const dashboardInput: DashboardHealthInput = {
    audits,
    observations,
    risks,
    policies,
    trainings,
    letters,
    circulars,
    frameworkWeights: dashboardWeights,
    pinnedFrameworks,
    targetScore,
  }

  // Cheap, deterministic hash — period + filters + counts of every source
  // slice + setting versions. Good enough for cache invariance without
  // hashing the whole payload.
  const hashSource = JSON.stringify({
    p: selector.period,
    f: fwFilter,
    d: selector.department_id ?? null,
    a: audits.length,
    o: observations.length,
    r: risks.length,
    pol: policies.length,
    t: trainings.length,
    c: circulars.length,
    l: letters.length,
    fw: frameworkConfigs.length,
    w: componentWeights,
    ts: targetScore,
  })
  const inputsHash = simpleHash(hashSource)

  return {
    engineInput,
    dashboardInput,
    pinnedFrameworks,
    inputsHash,
    frameworks,
  }
}

// Small non-crypto hash (fnv-1a 32-bit) — sufficient for cache discriminator.
function simpleHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
