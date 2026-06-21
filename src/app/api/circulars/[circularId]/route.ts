// /api/circulars/[circularId] — detail / patch / soft-delete.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser, canDriveWorkflow } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertNotStale, assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateCircularSchema } from '@/lib/api/schemas/circulars'
import {
  ARTICLE_CHECKLIST_COLUMNS,
  ARTICLE_TIMELINE_COLUMNS,
  ARTICLE_VERSION_COLUMNS,
  CIRCULAR_ATTACHMENT_COLUMNS,
  CIRCULAR_DETAIL_COLUMNS,
  CIRCULAR_VERSION_COLUMNS,
  IMPLEMENTATION_COLUMNS,
  TIMELINE_COLUMNS,
  WORKFLOW_STEP_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
  insertCircularVersion,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 — dual-store timeline persists rendered EN+AR strings at
// write time (`renderBilingual`).
// Wave-19.4 / Item-3 — `circular_versions` is now dual-store too (migration
// 057); the `{k,p}` writer has been retired. Both timeline AND version-history
// reuse the same `renderBilingual` body.
import { renderBilingual, renderI18nKey } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    // SEC-5: reject a malformed (non-UUID) path segment with a 400 before any
    // DB access — a bad id would otherwise raise a Postgres 22P02 → 500.
    assertUuid(circularId)
    const { supabase } = await requireUser()

    const { data: row, error } = await supabase
      .from('circulars')
      .select(CIRCULAR_DETAIL_COLUMNS)
      .eq('id', circularId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!row) throw NotFound(`Circular ${circularId} not found`)

    // GAP-15 / W15-5: the detail GET fetches only the FIRST 10 rows of each
    // paginated feed (circular timeline + circular versions, newest-first).
    // The Activity / Version History tabs page the rest via dedicated routes.
    // We fetch 11 to cheaply detect `*_has_more`. Article timelines + versions
    // are embedded newest-first capped at 11 each so the per-article tabs get
    // a first page + a `*_has_more` flag without an extra round-trip.
    const PAGE = 10
    const [
      workflow,
      impls,
      timeline,
      capAttachments,
      remediationAttachments,
      pdfAttachments,
      versions,
    ] = await Promise.all([
      supabase
        .from('circular_workflow_steps')
        .select(WORKFLOW_STEP_COLUMNS)
        .eq('circular_id', circularId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('circular_articles')
        .select(
          `${IMPLEMENTATION_COLUMNS}, checklist:article_checklist_items(${ARTICLE_CHECKLIST_COLUMNS}), versions:article_versions(${ARTICLE_VERSION_COLUMNS}), timeline:article_timeline(${ARTICLE_TIMELINE_COLUMNS})`,
        )
        .eq('circular_id', circularId)
        .order('sort_order', { ascending: true })
        // W15-5: embed only the newest 11 article versions / timeline rows so
        // the per-article tabs get a first page + a has_more flag.
        .order('version_no', { ascending: false, referencedTable: 'article_versions' })
        .limit(PAGE + 1, { referencedTable: 'article_versions' })
        .order('date', { ascending: false, referencedTable: 'article_timeline' })
        .order('id', { ascending: false, referencedTable: 'article_timeline' })
        .limit(PAGE + 1, { referencedTable: 'article_timeline' }),
      supabase
        .from('circular_timeline')
        .select(TIMELINE_COLUMNS)
        .eq('circular_id', circularId)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(0, PAGE),
      // GAP-1: CAP + remediation attachments.
      supabase
        .from('circular_cap_attachments')
        .select(CIRCULAR_ATTACHMENT_COLUMNS)
        .eq('circular_id', circularId)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('circular_remediation_attachments')
        .select(CIRCULAR_ATTACHMENT_COLUMNS)
        .eq('circular_id', circularId)
        .order('uploaded_at', { ascending: false }),
      // GAP-21: multi-file circular PDF attachments.
      supabase
        .from('circular_pdf_attachments')
        .select(CIRCULAR_ATTACHMENT_COLUMNS)
        .eq('circular_id', circularId)
        .order('uploaded_at', { ascending: false }),
      // GAP-19 / W15-5: circular version history — first page only, newest-first.
      supabase
        .from('circular_versions')
        .select(CIRCULAR_VERSION_COLUMNS)
        .eq('circular_id', circularId)
        .order('version', { ascending: false })
        .range(0, PAGE),
    ])

    const timelineRows = timeline.data ?? []
    const timelineHasMore = timelineRows.length > PAGE
    const timelineFirstPage = timelineHasMore
      ? timelineRows.slice(0, PAGE)
      : timelineRows

    // W15-5: circular version history — first page + has_more flag.
    const versionRows = versions.data ?? []
    const versionsHasMore = versionRows.length > PAGE
    const versionsFirstPage = versionsHasMore
      ? versionRows.slice(0, PAGE)
      : versionRows

    // W15-5: trim each article's embedded version/timeline first page to PAGE
    // rows and stamp a per-article `versions_has_more` / `timeline_has_more`.
    const implRows = (impls.data ?? []) as Record<string, unknown>[]
    const trimmedImpls = implRows.map((art) => {
      const av = Array.isArray(art.versions) ? art.versions : []
      const at = Array.isArray(art.timeline) ? art.timeline : []
      const avHasMore = av.length > PAGE
      const atHasMore = at.length > PAGE
      return {
        ...art,
        versions: avHasMore ? av.slice(0, PAGE) : av,
        versions_has_more: avHasMore,
        timeline: atHasMore ? at.slice(0, PAGE) : at,
        timeline_has_more: atHasMore,
      }
    })

    // SEC-1: expose the row's `updated_at` as a weak ETag so the client can
    // echo it back as `If-Match` on the next PATCH for optimistic locking.
    const updatedAt = (row as Record<string, unknown>).updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined

    return ok(
      {
        ...row,
        workflow_steps: workflow.data ?? [],
        implementations: trimmedImpls,
        timeline: timelineFirstPage,
        timeline_has_more: timelineHasMore,
        cap_attachments: capAttachments.data ?? [],
        remediation_attachments: remediationAttachments.data ?? [],
        pdf_attachments: pdfAttachments.data ?? [],
        versions: versionsFirstPage,
        versions_has_more: versionsHasMore,
      },
      { cache: 'no-store', headers: etag },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    // SEC-5: reject a malformed (non-UUID) path segment with a 400.
    assertUuid(circularId)
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    if (!ctx.permissions.includes('circular:edit') && !ctx.permissions.includes('edit')) {
      throw Forbidden('Missing permission: circular:edit')
    }
    await assertCircularExists(supabase, circularId)
    // SEC-1: optimistic-concurrency token — the client echoes the row's
    // last-known `updated_at` via `If-Match`. Compared against the live row
    // below (the `before` snapshot) before any write.
    const ifMatch = readIfMatch(req)

    // HANI-3: read the RAW JSON body so we know exactly which keys the client
    // sent. Zod can't tell "absent" from "absent-but-defaulted", so for the
    // destructive array columns (`departments`, `framework_ids`) we gate on
    // raw-key presence — never write an array the client didn't send. A
    // PDF-only PATCH (`{ pdf_url }`) therefore can never touch departments.
    let rawBody: Record<string, unknown> = {}
    try {
      const cloned = req.clone()
      const parsed = await cloned.json()
      if (parsed && typeof parsed === 'object') rawBody = parsed as Record<string, unknown>
    } catch {
      // Fall through — parseJson below will surface the real parse error.
    }

    const patch = await parseJson(req, UpdateCircularSchema)
    const update: Record<string, unknown> = {}
    const guardedArrayKeys = new Set(['departments', 'framework_ids'])
    // GAP-3: `null` must pass through here so a cleared optional field NULLs
    // its column. Only `undefined` (absent key) is skipped.
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue
      // Guarded array columns: only persist when the raw body explicitly
      // carried the key. Belt-and-braces alongside the default-free schema.
      if (guardedArrayKeys.has(k) && !(k in rawBody)) continue
      update[k] = v
    }

    // RBAC (ownership model): status / progress drive the rule's workflow and
    // assigned_to transfers ownership — gate all three like the circular advance
    // route (workflow:advance OR rule ownership) so PATCH can't bypass it. Plain
    // 'circular:edit'/'edit' (checked above) covers only non-lifecycle edits.
    const CIRCULAR_LIFECYCLE_KEYS = ['status', 'progress', 'assigned_to']
    if (CIRCULAR_LIFECYCLE_KEYS.some((k) => k in update)) {
      const { data: ownerRow } = await supabase
        .from('circulars').select('assigned_to').eq('id', circularId)
        .maybeSingle<{ assigned_to: string | null }>()
      if (!canDriveWorkflow(ctx, ownerRow?.assigned_to)) {
        throw Forbidden('Missing permission: workflow:advance (or rule ownership) to change status/assignee')
      }
    }

    // GAP-2: snapshot the full row BEFORE the update so we can compose a
    // specific timeline title — and, for the generic message, list only the
    // fields whose value actually changed (the edit modal sends the whole
    // form, so `Object.keys(update)` alone would name every field).
    const { data: before } = await supabase
      .from('circulars')
      .select(CIRCULAR_DETAIL_COLUMNS)
      .eq('id', circularId)
      .is('deleted_at', null)
      .maybeSingle<Record<string, unknown>>()

    // SEC-1: if the client supplied an `If-Match` token, it must match the
    // row's current `updated_at` EXACTLY. On mismatch a concurrent writer has
    // already changed the row — return 412 and write nothing.
    assertNotStale(ifMatch, before?.updated_at as string | undefined)

    // SEC-1 (Wave-17): the read-then-check above is NOT atomic — two
    // concurrent PATCHes carrying the SAME fresh token can both pass it
    // (TOCTOU) and both write, silently losing one update. Close the race by
    // making the UPDATE itself conditional on `updated_at`: scope the WHERE to
    // the exact token so Postgres atomically lets exactly ONE writer win; the
    // loser matches 0 rows and is surfaced as 412 below. When no `If-Match` is
    // sent the guard is skipped (backward-compatible, same as `assertNotStale`).
    let query = supabase
      .from('circulars')
      .update(update)
      .eq('id', circularId)
      .is('deleted_at', null)
    if (ifMatch != null) {
      query = query.eq('updated_at', before?.updated_at as string)
    }
    const { data, error } = await query
      .select(CIRCULAR_DETAIL_COLUMNS)
      .maybeSingle()
    if (error) throw error
    // No row updated despite the row existing + passing the pre-check: a
    // concurrent writer won the race between our check and our write.
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound('Update returned no row')
    }

    // GAP-2: diff-aware timeline title. Prefer the audit-significant single
    // message (Business Owner / PDF) over the generic field list; only ever
    // one timeline row per PATCH.
    const after = data as Record<string, unknown>
    const boBefore = String(before?.business_owner_department ?? '').trim()
    const boAfter = String(after.business_owner_department ?? '').trim()
    const pdfBefore = (before?.pdf_url as string | null) ?? null
    const pdfAfter = (after.pdf_url as string | null) ?? null
    const boChanged = 'business_owner_department' in update && boBefore !== boAfter
    const pdfChanged = 'pdf_url' in update && pdfBefore !== pdfAfter

    // Human-readable labels for the generic "Circular updated — …" message.
    // RTL-6/7: each DB column maps to an i18n field-label key (resolved at
    // render time) instead of an English string.
    const FIELD_LABEL_KEYS: Record<string, string> = {
      title: 'regulatoryUpdates.timelineField.title',
      authority: 'regulatoryUpdates.timelineField.authority',
      priority: 'regulatoryUpdates.timelineField.priority',
      status: 'regulatoryUpdates.timelineField.status',
      applicability: 'regulatoryUpdates.timelineField.applicability',
      departments: 'regulatoryUpdates.timelineField.departments',
      business_owner_department: 'regulatoryUpdates.timelineField.businessOwner',
      business_owner_department_id: 'regulatoryUpdates.timelineField.businessOwner',
      assigned_to: 'regulatoryUpdates.timelineField.assignee',
      progress: 'regulatoryUpdates.timelineField.progress',
      issuance_date: 'regulatoryUpdates.timelineField.issuanceDate',
      due_date: 'regulatoryUpdates.timelineField.dueDate',
      cap_status: 'regulatoryUpdates.timelineField.capStatus',
      cap_due_date: 'regulatoryUpdates.timelineField.capDueDate',
      cap_deadline: 'regulatoryUpdates.timelineField.capDeadline',
      cap_response_deadline: 'regulatoryUpdates.timelineField.capResponseDeadline',
      remediation_deadline: 'regulatoryUpdates.timelineField.remediationDeadline',
      description: 'regulatoryUpdates.timelineField.description',
      pdf_url: 'regulatoryUpdates.timelineField.pdf',
      reference_url: 'regulatoryUpdates.timelineField.referenceUrl',
      framework_ids: 'regulatoryUpdates.timelineField.frameworks',
    }

    // GAP-19: compute the structured per-field diff once — reused both for the
    // timeline title and for the `circular_versions` history row.
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
    // Deduped list of i18n field-label keys for the changed fields.
    const changedLabelKeys = Array.from(
      new Set(changedKeys.map((k) => FIELD_LABEL_KEYS[k] ?? k)),
    )
    // Structured `[{field,from,to}]` — `field` is an i18n key resolved at
    // render time; from/to are data values (left as-is).
    const fieldChanges = changedKeys.map((k) => ({
      field: FIELD_LABEL_KEYS[k] ?? k,
      from: displayValue(before?.[k]),
      to: displayValue(after[k]),
    }))

    // Wave-19.1 / Q8 + Wave-19.4 / Item-3 — dual-store body (`text_en` +
    // `text_ar`) is rendered at write time and reused for BOTH the timeline
    // AND the `circular_versions` row. The `{fields}` placeholder resolves
    // per-locale via `renderBilingual`'s bilingual-param shape.
    const fieldsByLocale = {
      en: changedLabelKeys.map((k) => renderI18nKey(k, {}, 'en')).join(', '),
      ar: changedLabelKeys.map((k) => renderI18nKey(k, {}, 'ar')).join(', '),
    }

    let timelineBody: { text_en: string; text_ar: string }
    if (boChanged) {
      if (boBefore) {
        timelineBody = renderBilingual('regulatoryUpdates.timeline.boChanged', {
          from: boBefore,
          to: boAfter,
        })
      } else {
        timelineBody = renderBilingual('regulatoryUpdates.timeline.boAssigned', {
          owner: boAfter,
        })
      }
    } else if (pdfChanged) {
      const key =
        pdfBefore === null
          ? 'regulatoryUpdates.timeline.pdfUploaded'
          : pdfAfter === null
          ? 'regulatoryUpdates.timeline.pdfRemoved'
          : 'regulatoryUpdates.timeline.pdfReplaced'
      timelineBody = renderBilingual(key)
    } else if (changedLabelKeys.length > 0) {
      timelineBody = renderBilingual(
        'regulatoryUpdates.timeline.circularUpdatedFields',
        { fields: fieldsByLocale },
      )
    } else {
      timelineBody = renderBilingual('regulatoryUpdates.timeline.circularUpdated')
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.update',
        entity_type: 'circular',
        entity_id: circularId,
        metadata: { fields: Object.keys(update) },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        timelineBody,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    // GAP-19: append a `circular_versions` row ONLY when fields actually
    // changed — never on a no-op edit. `field_changes` is the structured diff
    // (NOT NULL; `[]` is impossible here since changedKeys.length > 0).
    // Wave-19.4 / Item-3 — dual-store: the same `renderBilingual` body that
    // powers the timeline row is persisted directly on the version row.
    if (changedKeys.length > 0) {
      await insertCircularVersion(
        supabase,
        circularId,
        timelineBody,
        profile.name ?? profile.email ?? user.id,
        fieldChanges,
      )
    }

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    // SEC-5: reject a malformed (non-UUID) path segment with a 400.
    assertUuid(circularId)
    const { supabase, user, profile } = await requireAnyPerm(['circular:delete', 'delete'])
    await assertCircularExists(supabase, circularId)

    // SEC-1: optional optimistic-concurrency guard on delete — if the client
    // sends `If-Match`, refuse to delete a row that changed since they read it.
    const ifMatch = readIfMatch(req)
    if (ifMatch != null) {
      const { data: current } = await supabase
        .from('circulars')
        .select('updated_at')
        .eq('id', circularId)
        .is('deleted_at', null)
        .maybeSingle<{ updated_at: string }>()
      assertNotStale(ifMatch, current?.updated_at)
    }

    // Write the audit row BEFORE the delete so it survives the FK cascade.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'circular.delete',
      entity_type: 'circular',
      entity_id: circularId,
      supabase,
    })

    const { error } = await supabase
      .from('circulars')
      .delete()
      .eq('id', circularId)
    if (error) throw error

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    revalidate(cacheTags.compliance())
    return ok({ id: circularId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
