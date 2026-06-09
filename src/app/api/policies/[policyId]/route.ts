// /api/policies/[policyId] — item GET / PATCH / hard-DELETE.
//
// Wave-18: full hardening (PORTING-TEMPLATE §2):
//   - GET: cache:'no-store', nested children, ETag from updated_at, is_expired
//   - PATCH: readIfMatch → before-snapshot → assertNotStale → conditional
//            UPDATE scoped to updated_at (the W17.2 atomic pattern) → 412
//            on 0 rows; per-field diff → policy_versions row + activity log
//   - DELETE: optional If-Match guard before hard-delete (migration 041)

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicySchema } from '@/lib/api/schemas/policies'
import {
  POLICY_DETAIL_COLUMNS,
  assertPolicyExists,
  getPolicyDetail,
  insertPolicyVersion,
  recomputePolicyStatus,
  writePolicyActivity,
  type PolicyFieldChange,
} from '@/lib/api/services/policies'
// Wave-19.3 / Task-B — dual-store activity-log writer for the Policy Leader
// change. Mirrors the Rules `renderBilingual` pattern (Wave-19.1 / Q8).
import { renderBilingual, renderI18nKey } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    // SEC-5: reject a malformed (non-UUID) path segment with a 400.
    assertUuid(policyId)
    const { supabase } = await requireUser()
    const detail = await getPolicyDetail(supabase, policyId)

    // SEC-1: weak ETag so the client can echo `If-Match` on the next PATCH.
    const etag =
      typeof detail.updated_at === 'string'
        ? { ETag: `W/"${detail.updated_at}"` }
        : undefined

    return ok(detail, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

// Translatable field labels for the timeline + version-history diff payloads.
const FIELD_LABEL_KEYS: Record<string, string> = {
  name: 'policies.field.name',
  description: 'policies.field.description',
  category: 'policies.field.category',
  version: 'policies.field.version',
  approval_tier: 'policies.field.approvalTier',
  owner_id: 'policies.field.owner',
  owner_name: 'policies.field.owner',
  owner_department: 'policies.field.ownerDepartment',
  business_owner_department_id: 'policies.field.businessOwner',
  last_review_date: 'policies.field.lastReviewDate',
  next_review_date: 'policies.field.nextReviewDate',
  review_cycle_days: 'policies.field.reviewCycleDays',
  approved_date: 'policies.field.approvedDate',
  status: 'policies.field.status',
  review_schedule: 'policies.field.reviewSchedule',
  framework_ids: 'policies.field.frameworks',
  affected_departments: 'policies.field.affectedDepartments',
  current_review_cycle_id: 'policies.field.currentReviewCycle',
  current_review_cycle_label: 'policies.field.currentReviewCycle',
  current_review_cycle_date: 'policies.field.currentReviewCycleDate',
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    // SEC-5.
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('edit')
    await assertPolicyExists(supabase, policyId)

    // SEC-1: optimistic-concurrency token.
    const ifMatch = readIfMatch(req)

    // HANI-3: raw-body key-presence gate for destructive array columns. A PATCH
    // that omits `framework_ids` / `affected_departments` MUST NOT overwrite
    // them with whatever Zod resolves; only persist when the raw JSON body
    // explicitly carries the key.
    let rawBody: Record<string, unknown> = {}
    try {
      const cloned = req.clone()
      const parsed = await cloned.json()
      if (parsed && typeof parsed === 'object') rawBody = parsed as Record<string, unknown>
    } catch {
      // fall through — parseJson below will surface the parse error.
    }

    const patch = await parseJson(req, UpdatePolicySchema)
    const update: Record<string, unknown> = {}
    const guardedArrayKeys = new Set(['framework_ids', 'affected_departments'])
    // GAP-3: `null` must pass through here so a cleared optional field NULLs
    // its column. Only `undefined` (absent key) is skipped.
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      if (guardedArrayKeys.has(k) && !(k in rawBody)) continue
      update[k] = v
    }

    if (Object.keys(update).length === 0) {
      const detail = await getPolicyDetail(supabase, policyId)
      return ok(detail)
    }

    // Snapshot the full row BEFORE the update so we can compose a specific
    // activity title — and list only the fields whose value actually changed.
    const { data: before } = await supabase
      .from('policies')
      .select(POLICY_DETAIL_COLUMNS)
      .eq('id', policyId)
      .is('deleted_at', null)
      .maybeSingle<Record<string, unknown>>()

    // SEC-1: pre-check the If-Match token against the row's current updated_at.
    assertNotStale(ifMatch, before?.updated_at as string | undefined)

    // W17.2 ATOMIC PATTERN: the read-then-check above is NOT atomic. Close the
    // race by making the UPDATE itself conditional on `updated_at`. Postgres
    // atomically lets exactly one writer win; the loser matches 0 rows → 412.
    let query = supabase
      .from('policies')
      .update(update)
      .eq('id', policyId)
      .is('deleted_at', null)
    if (ifMatch != null) {
      query = query.eq('updated_at', before?.updated_at as string)
    }
    const { data, error } = await query
      .select(POLICY_DETAIL_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    // Per-field diff — reused for the activity log AND the policy_versions row.
    const after = data as Record<string, unknown>
    const sameValue = (a: unknown, b: unknown): boolean => {
      if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((v, i) => v === b[i])
      return (a ?? null) === (b ?? null)
    }
    const displayValue = (v: unknown): string => {
      if (v == null) return ''
      if (Array.isArray(v)) return v.join(', ')
      return String(v)
    }
    const changedKeys = Object.keys(update).filter(
      (k) => !sameValue(before?.[k], after[k]),
    )

    // Structured `[{field,from,to}]` — `field` is an i18n key resolved at
    // render time; from/to are raw data values.
    // BUG-P-R2-05: skip raw FK columns (any key ending in `_id`) from the
    // structured diff. They expose raw UUIDs in Version History ("FROM: 00000000-
    // 0002-4000-…") which is confusing. The human-readable companion column
    // (e.g. owner_name for owner_id) is already included in changedKeys when it
    // changes, so the diff stays complete without the raw UUID row.
    const fieldChanges: PolicyFieldChange[] = changedKeys
      .filter((k) => !k.endsWith('_id'))
      .map((k) => ({
        field: FIELD_LABEL_KEYS[k] ?? k,
        from: displayValue(before?.[k]),
        to: displayValue(after[k]),
      }))

    const actor = profile.name ?? profile.email ?? user.id
    const changedFieldLabels = Array.from(
      new Set(changedKeys.map((k) => FIELD_LABEL_KEYS[k] ?? k)),
    )

    // Wave-19.4 / Item-3 + Wave-19.5 — dual-store body for the generic
    // "Policy updated — {fields}" branch. Both the activity-log row AND the
    // `policy_versions` row reuse the SAME `renderBilingual` body so each
    // language gets the field-label list resolved against its own dictionary
    // (the pre-19.5 activity writer interpolated raw DB column names — e.g.
    // `description` embedded mid-Arabic — bypassing i18n entirely).
    const fieldsByLocale = {
      en: changedFieldLabels.map((k) => renderI18nKey(k, {}, 'en')).join(', '),
      ar: changedFieldLabels.map((k) => renderI18nKey(k, {}, 'ar')).join(', '),
    }
    const fieldsUpdatedBody =
      changedKeys.length > 0
        ? renderBilingual('regulatoryUpdates.timeline.policyVersionUpdated', {
            fields: fieldsByLocale,
          })
        : null

    // Wave-19.3 / Task-B — Policy Leader change. Mirrors the Rules BO-change
    // pattern in `/api/circulars/[id]` PATCH: when `owner_id` OR `owner_name`
    // changes, emit a single dedicated `leader_changed` / `leader_assigned`
    // activity row keyed via `renderBilingual` (dual-store EN + AR). The
    // generic `Policy updated — ...` fallback only fires when the leader
    // didn't change (or the leader change is mixed in with other field
    // edits — in that case we still prefer the dedicated leader row).
    const leaderBefore = String(before?.owner_name ?? '').trim()
    const leaderAfter = String(after.owner_name ?? '').trim()
    const leaderChanged =
      ('owner_id' in update || 'owner_name' in update) &&
      (leaderBefore !== leaderAfter ||
        (before?.owner_id ?? null) !== (after.owner_id ?? null))

    let activityRow: { type: string; text_en: string; text_ar: string } | null = null
    if (leaderChanged) {
      if (leaderBefore) {
        const body = renderBilingual('regulatoryUpdates.timeline.policyLeaderChanged', {
          from: leaderBefore,
          to: leaderAfter || '—',
        })
        activityRow = { type: 'leader_changed', ...body }
      } else {
        const body = renderBilingual('regulatoryUpdates.timeline.policyLeaderAssigned', {
          to: leaderAfter || '—',
        })
        activityRow = { type: 'leader_assigned', ...body }
      }
    } else if (fieldsUpdatedBody) {
      activityRow = { type: 'edited', ...fieldsUpdatedBody }
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.update',
        entity_type: 'policy',
        entity_id: policyId,
        metadata: { fields: changedKeys },
        supabase,
      }),
      activityRow
        ? writePolicyActivity({
            supabase,
            policy_id: policyId,
            type: activityRow.type,
            text_en: activityRow.text_en,
            text_ar: activityRow.text_ar,
            user_name: actor,
          })
        : Promise.resolve(),
    ])

    // W37 — append a `policy_versions` row when a user EDITS policy CONTENT
    // (name, description, category, version, approval tier, owner, schedule,
    // frameworks, affected departments). Previously this fired only when the
    // `version` number changed, so editing any other field via the Edit modal
    // showed an optimistic version-history row that the reconcile then dropped
    // ("pops up then rolls back"). We still EXCLUDE automated/workflow churn —
    // a PATCH that only flips `status` or rotates the review-cycle fields does
    // NOT create a version row (those live in the Activity timeline, per
    // BUG-P-R2-03's original intent).
    const VERSIONABLE_FIELDS = new Set([
      'name', 'description', 'category', 'version', 'approval_tier',
      'owner_id', 'owner_name', 'owner_department', 'business_owner_department_id',
      'review_schedule', 'framework_ids', 'affected_departments',
    ])
    const hasVersionableEdit = changedKeys.some((k) => VERSIONABLE_FIELDS.has(k))
    if (hasVersionableEdit && fieldsUpdatedBody) {
      const versionLabel = (after.version as string | null) ?? 'v?'
      await insertPolicyVersion(
        supabase,
        policyId,
        versionLabel,
        fieldsUpdatedBody,
        actor,
        fieldChanges,
      )
    }

    // §2-7 — server-authoritative recompute on every mutation.
    await recomputePolicyStatus(supabase, policyId)

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    if (update.status !== undefined) revalidate(cacheTags.compliance())

    // Return the canonical detail (with refreshed updated_at + is_expired).
    const detail = await getPolicyDetail(supabase, policyId)
    const etag =
      typeof detail.updated_at === 'string'
        ? { ETag: `W/"${detail.updated_at}"` }
        : undefined
    return ok(detail, { headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    // SEC-5.
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('delete')
    await assertPolicyExists(supabase, policyId)

    // SEC-1: optional optimistic-concurrency guard on delete.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('policies')
        .select('updated_at')
        .eq('id', policyId)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Audit BEFORE physical delete so the trail survives (HANDOFF §5 gotcha #7).
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy.delete',
      entity_type: 'policy',
      entity_id: policyId,
      supabase,
    })

    // Hard-delete — migration 041 confirmed all 6 child tables have ON DELETE CASCADE.
    const { error } = await supabase
      .from('policies')
      .delete()
      .eq('id', policyId)
    if (error) throw error

    revalidateAll([cacheTags.policies(), cacheTags.policies(policyId)])
    revalidate(cacheTags.compliance())
    return ok({ id: policyId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}

// Wave-19.1 / Q2 — the GET response now ships the persisted `is_expired`
// column from `policies` verbatim. The old read-time `isPolicyExpired`
// helper override (which carved out `statu