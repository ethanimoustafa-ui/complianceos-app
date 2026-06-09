// W17-3 — Single shared formatter for every Rules-page enum.
//
// PRINCIPLE: NEVER inline an enum label (`'in-progress' → 'In Progress'`) in a
// component file. Every render site that displays a circulars/articles enum
// goes through one of these helpers. The mapping (enum value → i18n key) lives
// here once; the LABEL TEXT lives in `src/i18n/dictionaries/{en,ar}.json` once.
//
// Why the formatter takes `t` and not a Dictionary directly:
//   - It works inside React components (`t` from `useTranslation()`).
//   - It works in tests with a fake `t` that returns keys.
//   - It avoids dragging the entire dictionary loader into modules that just
//     need to format one value.
//
// Fallback rule: an UNKNOWN enum value (e.g. a future status the UI hasn't
// caught up with) is returned VERBATIM. That mirrors the previous
// `labels[value] ?? value` pattern across all render sites — never silently
// drop a value, never blow up the page.

import type { TranslationKey } from '@/i18n'

// Loose function shape — any caller can pass either the strongly-typed
// `t: (k: TranslationKey, params?: …) => string` from `useTranslation()`, or a
// fake `(k) => k` for tests. We constrain to a string-input function to avoid
// `unknown` proliferation.
type Translator = (key: TranslationKey) => string

// Resolve a key through `t`, falling back to the raw enum value when no key
// is configured. Centralised so every helper below has identical behaviour.
function lookup<T extends string>(
  t: Translator,
  value: T | null | undefined,
  map: Partial<Record<T, TranslationKey>>,
): string {
  if (value == null) return ''
  const key = map[value]
  if (!key) return value
  const out = t(key)
  // If the i18n loader couldn't resolve the key it typically returns the key
  // itself (verified in `useTranslation`); we still return that — a missing-
  // key warning surfaces in the console, but the chip stays human-readable.
  return out
}

// ── Status (circulars + checklist items) ──────────────────────────────────
// Enum values that flow through here:
//   `pending` | `in-progress` | `completed` | `overdue`
const STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  'pending': 'regulatoryUpdates.statusPending',
  'in-progress': 'regulatoryUpdates.statusInProgress',
  'completed': 'regulatoryUpdates.statusCompleted',
  'overdue': 'regulatoryUpdates.statusOverdue',
}

export function formatStatus(t: Translator, value: string | null | undefined): string {
  return lookup(t, value, STATUS_KEYS)
}

// ── Priority ─────────────────────────────────────────────────────────────
// `critical` | `high` | `medium` | `low`
const PRIORITY_KEYS: Partial<Record<string, TranslationKey>> = {
  'critical': 'regulatoryUpdates.critical',
  'high': 'regulatoryUpdates.high',
  'medium': 'regulatoryUpdates.medium',
  'low': 'regulatoryUpdates.low',
}

export function formatPriority(t: Translator, value: string | null | undefined): string {
  return lookup(t, value, PRIORITY_KEYS)
}

// ── Applicability ─────────────────────────────────────────────────────────
// `applicable` | `not-applicable` | `pending`
const APPLICABILITY_KEYS: Partial<Record<string, TranslationKey>> = {
  'applicable': 'regulatoryUpdates.applicable',
  'not-applicable': 'regulatoryUpdates.notApplicable',
  'pending': 'regulatoryUpdates.applicabilityPending',
}

export function formatApplicability(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, APPLICABILITY_KEYS)
}

// ── Compliance status (per-article) ──────────────────────────────────────
// `compliant` | `in-progress` | `non-compliant` | `not-started`
const COMPLIANCE_STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  'compliant': 'regulatoryUpdates.complianceCompliant',
  'in-progress': 'regulatoryUpdates.complianceInProgress',
  'non-compliant': 'regulatoryUpdates.complianceNonCompliant',
  'not-started': 'regulatoryUpdates.complianceNotStarted',
}

export function formatComplianceStatus(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, COMPLIANCE_STATUS_KEYS)
}

// ── Risk level (per-article) ──────────────────────────────────────────────
// `critical` | `high` | `medium` | `low`. SAME source values as Priority — we
// keep them as separate helpers because future copy may diverge.
const RISK_LEVEL_KEYS: Partial<Record<string, TranslationKey>> = {
  'critical': 'regulatoryUpdates.critical',
  'high': 'regulatoryUpdates.high',
  'medium': 'regulatoryUpdates.medium',
  'low': 'regulatoryUpdates.low',
}

export function formatRiskLevel(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, RISK_LEVEL_KEYS)
}

// ── Workflow action_type ──────────────────────────────────────────────────
// `approve` | `notify-bo` | `notify-authority` | `advance` | `submit` |
// `acknowledge` | `start` | `complete` | `review`
const ACTION_TYPE_KEYS: Partial<Record<string, TranslationKey>> = {
  'approve': 'regulatoryUpdates.actionTypeApprove',
  'notify-bo': 'regulatoryUpdates.actionTypeNotifyBo',
  'notify-authority': 'regulatoryUpdates.actionTypeNotifyAuthority',
  'advance': 'regulatoryUpdates.actionTypeAdvance',
  'submit': 'regulatoryUpdates.actionTypeSubmit',
  'acknowledge': 'regulatoryUpdates.actionTypeAcknowledge',
  'start': 'regulatoryUpdates.actionTypeStart',
  'complete': 'regulatoryUpdates.actionTypeComplete',
  'review': 'regulatoryUpdates.actionTypeReview',
}

export function formatActionType(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, ACTION_TYPE_KEYS)
}

// ── Policy enums (Wave-18) ────────────────────────────────────────────────
// Policy status: `draft` | `under-review` | `approved` | `expired` | `overdue` |
// `requires-review`. Centralised here so every render site uses the same
// labels (FORENSIC §5 — "Enum values render through per-site label maps" was a
// recurring drift source on Rules; this is the W18 sweep for Policies).
const POLICY_STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  'draft': 'policies.statusDraft',
  'under-review': 'policies.statusUnderReview',
  'approved': 'policies.statusApproved',
  'expired': 'policies.statusExpired',
  'overdue': 'policies.statusOverdue',
  'requires-review': 'policies.statusRequiresReview',
}

export function formatPolicyStatus(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, POLICY_STATUS_KEYS)
}

// Policy approval tier: `board` | `management` | `managerial` | `sharia` | `agm` | `audit_committee` (extensible).
//
// Wave-19.7 — this static map is now a fallback only. The canonical render
// path goes through `formatEnumValue('policy.approval_tier', value, locale)`
// which reads from the user-editable `enum_value_definitions` table. The map
// below remains so any render site that hasn't been migrated yet keeps
// working with the legacy English labels.
//
// P2 (W28.1): added `managerial` and `audit_committee` — migration 074 renamed
// `management` → `managerial` and added `audit_committee`, but this static
// fallback map wasn't updated, causing the list-view chip to leak the raw key.
const POLICY_APPROVAL_TIER_KEYS: Partial<Record<string, TranslationKey>> = {
  'board': 'policies.tierBoard',
  'management': 'policies.tierManagement',
  'managerial': 'policies.tierManagerial',
  'sharia': 'policies.tierSharia',
  'agm': 'policies.tierAgm',
  'audit_committee': 'policies.tierAuditCommittee',
  'other': 'policies.tierOther',
}

export function formatPolicyApprovalTier(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, POLICY_APPROVAL_TIER_KEYS)
}

// ── Wave-19.7 — domain-driven enum lookup ────────────────────────────────
// Reads the user-configurable label list from `useEnumValuesStore` (which
// hydrates from `/api/settings/enum-values?domain=…`). Falls back to the
// raw `key` when no definition exists — same forgiving contract as the
// other helpers, so a stored value never renders blank even if the lookup
// row hasn't loaded yet.
//
// `t` is accepted in the signature but not used here — the enum-values
// table stores literal labels, not i18n keys. The translator slot is kept
// for symmetry with the other helpers (no call-site change is needed if a
// future domain DOES want to route through `t`).
import { useEnumValuesStore } from '@/stores/enum-values-store'

export function formatEnumValue(
  _t: Translator,
  domain: string,
  value: string | null | undefined,
  locale: 'en' | 'ar' = 'en',
): string {
  if (value == null) return ''
  // Read the live store state directly — no React hooks, so this can be
  // called from any context.
  return useEnumValuesStore.getState().formatValue(domain, value, locale)
}

// Policy category — user-defined open string. Default seeds get keys; unknown
// categories fall through to the raw value (per the global lookup contract).
const POLICY_CATEGORY_KEYS: Partial<Record<string, TranslationKey>> = {
  'compliance': 'policies.categoryCompliance',
  'it': 'policies.categoryIT',
  'operations': 'policies.categoryOperations',
  'risk': 'policies.categoryRisk',
  'hr': 'policies.categoryHR',
  'finance': 'policies.categoryFinance',
}

export function formatPolicyCategory(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, POLICY_CATEGORY_KEYS)
}

// Policy workflow step status — same shape as circulars but distinct copy.
const POLICY_WORKFLOW_STEP_STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  'completed': 'policies.workflowCompleted',
  'current': 'policies.workflowCurrent',
  'pending': 'policies.workflowPending',
}

export function formatPolicyWorkflowStepStatus(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, POLICY_WORKFLOW_STEP_STATUS_KEYS)
}

// ── Observation enums (Wave-20) ───────────────────────────────────────────
// Observation severity: `critical` | `high` | `medium` | `low`. Status:
// `open` | `in_progress` | `resolved` | `closed`. Source: `sama` | `internal`
// | `sharia`. Render sites should route through these helpers rather than
// inline `t()` calls so future copy lives in one place.
const OBSERVATION_SEVERITY_KEYS: Partial<Record<string, TranslationKey>> = {
  'critical': 'observations.severityOptions.critical',
  'high': 'observations.severityOptions.high',
  'medium': 'observations.severityOptions.medium',
  'low': 'observations.severityOptions.low',
}

export function formatObservationSeverity(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, OBSERVATION_SEVERITY_KEYS)
}

const OBSERVATION_STATUS_KEYS: Partial<Record<string, TranslationKey>> = {
  'open': 'observations.statusOptions.open',
  'in_progress': 'observations.statusOptions.inProgress',
  'remediated': 'observations.statusOptions.remediated',
  'resolved': 'observations.statusOptions.pendingReview',
  'closed': 'observations.statusOptions.closed',
}

export function formatObservationStatus(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, OBSERVATION_STATUS_KEYS)
}

const OBSERVATION_SOURCE_KEYS: Partial<Record<string, TranslationKey>> = {
  'sama': 'observations.sources.sama',
  'internal': 'observations.sources.internal',
  // 'sharia' falls through to the raw value until a key is added.
}

export function formatObservationSource(
  t: Translator,
  value: string | null | undefined,
): string {
  return lookup(t, value, OBSERVATION_SOURCE_KEYS)
}

// ── Department ───────────────────────────────────────────────────────────
// Departments are user-defined (not a fixed enum), so the formatter resolves
// the display name through the department store rather than a key map. We
// accept either a department `id` or a `name` (mirrors the existing
// `getDeptLabel` helpers across the rules components).
export interface DepartmentLike {
  id: string
  name: string
  nameAr: string
}

export function formatDepartment(
  _t: Translator,
  value: string | null | undefined,
  departments: readonly DepartmentLike[],
  locale: 'en' | 'ar' = 'en',
): string {
  // `_t` is accepted but unused — kept in the signature for symmetry with the
  // other helpers so future copy (e.g. "All Departments", "Unassigned") can
  // be routed through the same call site without changing call sites.
  if (!value) return ''
  const dept = departments.find((d) => d.id === value || d.name === value)
  if (!dept) return value
  return locale === 'ar' ? dept.nameAr : dept.name
}
