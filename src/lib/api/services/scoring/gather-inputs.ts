// Input gatherer for the server-side scoring engines.
//
// Given a `{ period, framework_id?, department_id? }` selector, returns a
// `ComplianceEngineInput` + the auxiliary slices the dashboard-health engine
// needs on top (letters, pinned framework configs, target score).
//
// Performance (Phase 11 / Agent P):
//   - PRIMARY: single `compute_compliance_inputs()` RPC (migration 027) that
//     returns one JSONB envelope with all 10 source slices. One round-trip
//     instead of ten.
//   - FALLBACK: legacy 10-query Promise.all path — used when the RPC isn't
//     present or errors. Keeps the app working during migration rollout.
//   - Each select pulls ONLY the columns the engine reads.
//   - Period boundaries are filtered in SQL via `.gte()/.lte()` on
//     `created_at` instead of post-filtering in JS (also applied inside the
//     RPC).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
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

interface RpcEnvelope {
  audits?: AuditRow[]
  observations?: ObservationRow[]
  risks?: RiskRow[]
  policies?: PolicyRow[]
  trainings?: CourseRow[]
  circulars?: CircularRow[]
  letters?: LetterRow[]
  frameworks?: FrameworkRow[]
  settings?: ComplianceSettingsRow | null
  framework_pins?: FrameworkPinRow[]
}

interface SliceArrays {
  audits: AuditRow[]
  observations: ObservationRow[]
  risks: RiskRow[]
  policies: PolicyRow[]
  trainings: CourseRow[]
  circulars: CircularRow[]
  letters: LetterRow[]
  frameworks: FrameworkRow[]
  settings: ComplianceSettingsRow | null
  pins: FrameworkPinRow[]
}

/**
 * Fast path: single RPC round-trip via `compute_compliance_inputs()`
 * (migration 027). Returns null if the RPC is unavailable / errors so the
 * caller can fall back to the legacy 10-query path.
 */
async function fetchViaRpc(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  fwFilter: string | null,
  departmentId: string | null,
): Promise<SliceArrays | null> {
  // Security (audit C4): this SECURITY DEFINER aggregator returns org-wide data
  // bypassing RLS, so migration 103 REVOKEs EXECUTE from `authenticated`/`anon`
  // to close the direct /rest/v1/rpc exposure. Call it with the service-role
  // client instead. Falls back to the passed-in user client when no service key
  // is configured — there the RPC errors post-revoke and gatherScoringInputs
  // drops to the RLS-scoped multi-select path (fetchViaSelects).
  const rpcClient = hasServiceRole() ? getAdminClient() : supabase
  const { data, error } = await rpcClient.rpc('compute_compliance_inputs', {
    p_period_start: startISO,
    p_period_end: endISO,
    p_framework_id: fwFilter,
    p_department_id: departmentId,
  })
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[scoring] compute_compliance_inputs RPC failed; falling back to multi-select path', error.message)
    }
    return null
  }
  const env = data as RpcEnvelope
  return {
    audits: env.audits ?? [],
    observations: env.observations ?? [],
    risks: env.risks ?? [],
    policies: env.policies ?? [],
    trainings: env.trainings ?? [],
    circulars: env.circulars ?? [],
    letters: env.letters ?? [],
    frameworks: env.frameworks ?? [],
    settings: env.settings ?? null,
    pins: env.framework_pins ?? [],
  }
}

/**
 * Fallback path: legacy 10-query Promise.all. Used only when the RPC isn't
 * present or returns an error.
 */
async function fetchViaSelects(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
): Promise<SliceArrays> {
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
      .from('letters')
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

  for (const r of [auditsRes, observationsRes, risksRes, policiesRes, coursesRes, circularsRes, lettersRes, frameworksRes, pinsRes]) {
    if (r.error) throw r.error
  }

  return {
    audits: (auditsRes.data ?? []) as AuditRow[],
    observations: (observationsRes.data ?? []) as ObservationRow[],
    risks: (risksRes.data ?? []) as RiskRow[],
    policies: (policiesRes.data ?? []) as PolicyRow[],
    trainings: (coursesRes.data ?? []) as CourseRow[],
    circulars: (circularsRes.data ?? []) as CircularRow[],
    letters: (lettersRes.data ?? []) as LetterRow[],
    frameworks: (frameworksRes.data ?? []) as FrameworkRow[],
    settings: (settingsRes.data ?? null) as ComplianceSettingsRow | null,
    pins: (pinsRes.data ?? []) as FrameworkPinRow[],
  }
}

export async function gatherScoringInputs(
  supabase: SupabaseClient,
  selector: GatherSelector,
): Promise<GatheredInputs> {
  const period = getPeriodConfig(selector.period)
  const startISO = period.startDate.toISOString()
  const endISO = period.endDate.toISOString()
  // Sentinel + uuid validation: `framework_id` arrives here as either a real
  // framework uuid, the `'overall'` aggregate-mode discriminator, or the
  // `'dashboard-health'` synthetic cache key used by /api/compliance/dashboard-health.
  // Only a real uuid is safe to pass to the SQL function (its param is `uuid`),
  // so coerce every non-uuid sentinel to null.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const fwFilter = selector.framework_id && UUID_RE.test(selector.framework_id)
    ? selector.framework_id
    : null

  // PRIMARY: single RPC round-trip. FALLBACK: 10-query Promise.all.
  const slices =
    (await fetchViaRpc(supabase, startISO, endISO, fwFilter, selector.department_id ?? null)) ??
    (await fetchViaSelects(supabase, startISO, endISO))

  const audits: AuditSlice[] = (slices.audits as AuditRow[]).map((r) => ({
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

  const observations: ObservationSlice[] = (slices.observations as ObservationRow[]).map((r) => ({
    id: r.id,
    source: r.source,
    severity: r.severity,
    status: r.status,
    dueDate: r.due_date,
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const risks: RiskSlice[] = (slices.risks as RiskRow[]).map((r) => ({
    id: r.id,
    likelihood: r.likelihood as 1 | 2 | 3 | 4 | 5,
    impact: r.impact as 1 | 2 | 3 | 4 | 5,
    status: r.status,
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const policies: PolicySlice[] = (slices.policies as PolicyRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    nextReviewDate: r.next_review_date ?? '',
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const trainings: TrainingSlice[] = (slices.trainings as CourseRow[]).map((r) => ({
    id: r.id,
    completionRate: r.assigned_count > 0 ? Math.round((r.completed_count / r.assigned_count) * 100) : 0,
    status: 'active',
    createdAt: r.created_at,
    frameworkIds: r.framework_ids ?? [],
  }))

  const circulars: CircularSlice[] = (slices.circulars as CircularRow[]).map((r) => ({
    id: r.id,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    frameworkIds: r.framework_ids ?? [],
    createdAt: r.created_at,
  }))

  const letters: LetterSlice[] = (slices.letters as LetterRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    responseDeadline: r.response_deadline ?? undefined,
    frameworkIds: r.framework_ids ?? [],
  }))

  const frameworks = slices.frameworks as FrameworkRow[]
  const settings = slices.settings
  const pins = slices.pins as FrameworkPinRow[]

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

  // Pinned frameworks — only correspondence-based, drop misses. When the org
  // never explicitly pinned anything (`framework_pins` empty), fall back to
  // the same defaults the settings UI presents as pinned (framework-config-
  // store DEFAULT_PINNED), restricted to enabled frameworks — otherwise the
  // dashboard / Team Score "Framework Scores" gauges render blank even though
  // the settings page shows three pinned authorities.
  const explicitPinned = pins
    .map((p) => frameworks.find((f) => f.id === p.framework_id))
    .filter((f): f is FrameworkRow => !!f && f.correspondence_based)
  const defaultPinned = ['sama', 'cma', 'sharia-board']
    .map((id) => frameworks.find((f) => f.id === id))
    .filter((f): f is FrameworkRow => !!f && f.correspondence_based && f.enabled)
  const pinnedFrameworks = (explicitPinned.length > 0 ? explicitPinned : defaultPinned)
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
    // Pin-set changes must produce a different hash — frameworkScores in the
    // cached dashboard-health payload depend on it.
    pins: pinnedFrameworks.map((f) => f.id),
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
