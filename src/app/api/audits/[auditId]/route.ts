// /api/audits/[auditId] — item endpoint.
//
//   GET    — detail (cache: 'no-store', ETag: W/"updated_at")
//   PATCH  — partial update with If-Match / ETag optimistic locking
//   DELETE — hard-delete (cascades)
//
// W26-A pattern stack:
//   §2.2  cache: 'no-store' on GET (no sMaxAge)
//   §2.12 ETag on GET + If-Match/assertNotStale on PATCH
//   §2.13 assertUuid at every route entry (SEC-5)
//   §2.6  per-field diff + audit_versions writer
//   §2.11 dual-store activity log via insertAuditTimeline

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser, canDriveWorkflow } from '@/lib/api/auth'
import { handle, NotFound, Forbidden } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid, readIfMatch, assertNotStale } from '@/lib/api/validate'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuditSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_LIST_COLUMNS,
  AUDIT_FIELD_LABEL_KEYS,
  assertAuditExists,
  getAuditDetail,
  insertAuditTimeline,
  insertAuditVersion,
  type AuditFieldChange,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    // SEC-5: validate route param before any DB access.
    assertUuid(auditId)
    const { supabase } = await requireUser()
    const detail = await getAuditDetail(supabase, auditId)
    // W26-A §2.2: cache: 'no-store' — never allow stale entity reads.
    // W26-A §2.12: ETag = W/"updated_at" for optimistic locking.
    return ok(detail, {
      headers: {
        'Cache-Control': 'no-store',
        'ETag': `W/"${detail.updated_at}"`,
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    // SEC-5: validate route param.
    assertUuid(auditId)
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    if (!ctx.permissions.includes('audit:edit')) {
      throw Forbidden('Missing permission: audit:edit')
    }

    // W26-A §2.12: read the client's If-Match token BEFORE any DB access.
    const ifMatch = readIfMatch(req)

    // Fetch the current row to get updated_at for If-Match guard and for diff.
    const current = await assertAuditExists(supabase, auditId)

    // W26-A §2.12: throw 412 when the client's token is stale.
    assertNotStale(ifMatch, current.updated_at)

    const patch = await parseJson(req, UpdateAuditSchema)

    // Only forward fields the caller explicitly sent (raw-body key-presence gate,
    // PORTING §2.5 / P2). The Zod .strict() already blocked unknown keys; here
    // we strip `undefined` values so we never PATCH with defaults.
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) update[k] = v
    }

    // RBAC (ownership model): status / progress / completion / assignee changes
    // DRIVE the audit lifecycle — gate them exactly like /start and /complete
    // (workflow:advance OR assignee-ownership) so a PATCH can't bypass those gated
    // routes. Plain 'audit:edit' (checked above) covers only non-lifecycle edits.
    const AUDIT_LIFECYCLE_KEYS = ['status', 'progress', 'completed_at', 'closed_overdue', 'assignee_id']
    if (AUDIT_LIFECYCLE_KEYS.some((k) => k in update)) {
      const { data: ownerRow } = await supabase
        .from('audits').select('assignee_id').eq('id', auditId)
        .maybeSingle<{ assignee_id: string | null }>()
      if (!canDriveWorkflow(ctx, ownerRow?.assignee_id)) {
        throw Forbidden('Missing permission: workflow:advance (or audit ownership) to change audit status/assignee')
      }
    }

    if (Object.keys(update).length === 0) {
      const detail = await getAuditDetail(supabase, auditId)
      return ok(detail, {
        headers: {
          'Cache-Control': 'no-store',
          'ETag': `W/"${detail.updated_at}"`,
        },
      })
    }

    // Fetch before-state for per-field diff (P6 / FORENSIC countermeasure).
    const { data: before, error: beforeErr } = await supabase
      .from('audits')
      .select(AUDIT_LIST_COLUMNS)
      .eq('id', auditId)
      .single()
    if (beforeErr || !before) throw beforeErr ?? NotFound('Audit not found')

    const { data, error } = await supabase
      .from('audits')
      .update(update)
      .eq('id', auditId)
      // W26-A §2.12: conditional update — 0 rows returned when token is stale
      // (another writer advanced updated_at between our read and our write).
      .eq('updated_at', current.updated_at)
      .select(AUDIT_LIST_COLUMNS)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      // 0 rows = concurrent write advanced updated_at → 412.
      const { PreconditionFailed } = await import('@/lib/api/errors')
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    // Per-field diff (P6 — detect what actually changed, not what was sent).
    const fieldChanges: AuditFieldChange[] = []
    const after = data as Record<string, unknown>
    const beforeRecord = before as Record<string, unknown>
    for (const key of Object.keys(update)) {
      const fromVal = String(beforeRecord[key] ?? '')
      const toVal = String(after[key] ?? '')
      if (fromVal !== toVal) {
        const i18nKey = AUDIT_FIELD_LABEL_KEYS[key] ?? `audits.field.${key}`
        fieldChanges.push({ field: i18nKey, from: fromVal, to: toVal })
      }
    }

    const actorName = profile.name ?? profile.email ?? user.id

    // Fire-and-forget: dual-store activity log + version row.
    if (fieldChanges.length > 0) {
      const fieldLabels = fieldChanges.map((c) => c.field).join(', ')
      void Promise.all([
        insertAuditTimeline({
          auditId,
          action: 'updated',
          i18nKey: 'auditDetail.activityUpdatedAudit',
          params: { title: (after.title as string) ?? '' },
          userId: user.id,
          userName: actorName,
          metadata: { fields: Object.keys(update) },
          supabase,
        }),
        insertAuditVersion({
          auditId,
          changedBy: user.id,
          changedByName: actorName,
          fieldChanges,
          supabase,
        }),
      ])
    }

    // Compliance audit log.
    void writeAudit({
      actor_id: user.id,
      actor_name: actorName,
      action: 'audit.update',
      entity_type: 'audit',
      entity_id: auditId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok(data, {
      headers: {
        'Cache-Control': 'no-store',
        'ETag': `W/"${(data as { updated_at: string }).updated_at}"`,
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    // SEC-5: validate route param.
    assertUuid(auditId)
    const { supabase, user, profile } = await requirePerm('audit:delete')
    await assertAuditExists(supabase, auditId)

    // Write the compliance-log entry BEFORE the DELETE so we never lose the
    // breadcrumb if the cascade fails midway.
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.delete',
      entity_type: 'audit',
      entity_id: auditId,
      supabase,
    })

    // Dual-store activity log before the row is gone.
    void insertAuditTimeline({
      auditId,
      action: 'deleted',
      i18nKey: 'auditDetail.activityClosedAudit',
      params: { title: auditId },
      userId: user.id,
      userName: profile.name ?? profile.email ?? user.id,
      supabase,
    })

    const { error } = await supabase
      .from('audits')
      .delete()
      .eq('id', auditId)
    if (error) throw error

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    revalidate(cacheTags.compliance())
    return ok({ id: auditId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
