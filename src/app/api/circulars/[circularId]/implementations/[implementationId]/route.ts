// /api/circulars/[circularId]/implementations/[implementationId] — GET / PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound, PreconditionFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson, readIfMatch } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateImplementationSchema } from '@/lib/api/schemas/circulars'
import {
  IMPLEMENTATION_COLUMNS,
  articleDisplayName,
  assertCircularExists,
  insertArticleVersion,
  insertCircularTimeline,
  recomputeCircularProgress,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 + Wave-19.4 / Item-3 — both timeline (`text_en`+`text_ar`)
// AND `article_versions` (migration 057) are dual-store, rendered at write
// time via `renderBilingual`. The `{k,p}` writer has been retired.
import { renderBilingual, renderI18nKey } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string; implementationId: string }> }

// W17.2: single-resource GET so the client can read the current `updated_at`
// (echoed as `ETag: W/"<updated_at>"`) before issuing an `If-Match`-guarded
// PATCH/DELETE. Mirrors the parent `circulars/[circularId]` GET etag shape.
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    assertUuid(circularId, implementationId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const { data, error } = await supabase
      .from('circular_articles')
      .select(IMPLEMENTATION_COLUMNS)
      .eq('id', implementationId)
      .eq('circular_id', circularId)
      .maybeSingle<Record<string, unknown>>()
    if (error) throw error
    if (!data) throw NotFound(`Implementation ${implementationId} not found`)

    const updatedAt = data.updated_at
    const etag =
      typeof updatedAt === 'string' ? { ETag: `W/"${updatedAt}"` } : undefined
    return ok(data, { cache: 'no-store', headers: etag })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    assertUuid(circularId, implementationId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    // W17-1 / SEC-1: optimistic-concurrency token. The client echoes the row's
    // last-known `updated_at` via `If-Match`. The UPDATE below is made atomic
    // by scoping `WHERE updated_at = token` so Postgres lets exactly ONE
    // concurrent writer win; the loser matches 0 rows and is surfaced as 412.
    const ifMatch = readIfMatch(req)
    const patch = await parseJson(req, UpdateImplementationSchema)
    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    // GAP-11: snapshot the article BEFORE the update so we can deep-compare
    // each field afterwards and emit an `article_versions` history row when
    // anything actually changed (Story 5.10) — mirrors the circular PATCH.
    const { data: before } = await supabase
      .from('circular_articles')
      .select(IMPLEMENTATION_COLUMNS)
      .eq('id', implementationId)
      .eq('circular_id', circularId)
      .maybeSingle<Record<string, unknown>>()

    if (!before) {
      throw NotFound(`Implementation ${implementationId} not found`)
    }

    let query = supabase
      .from('circular_articles')
      .update(update)
      .eq('id', implementationId)
      .eq('circular_id', circularId)
    if (ifMatch != null) {
      // W17.2: scope on the CLIENT's claimed token (not the just-read server
      // value) so a stale `If-Match` matches 0 rows and trips 412 below.
      query = query.eq('updated_at', ifMatch)
    }
    const { data, error } = await query.select(IMPLEMENTATION_COLUMNS).maybeSingle()
    if (error) throw error
    if (!data) {
      if (ifMatch != null) {
        throw PreconditionFailed(
          'This record was changed by someone else — reload to see the latest.',
        )
      }
      throw NotFound(`Implementation ${implementationId} not found`)
    }

    // GAP-11: diff each tracked field `before` vs `after`. Optional strings
    // treat '' ≡ null/undefined as equal so a no-op edit writes no row.
    const after = data as Record<string, unknown>
    // RTL-6/7: DB column → i18n field-label key.
    const ARTICLE_FIELD_LABEL_KEYS: Record<string, string> = {
      title: 'regulatoryUpdates.timelineField.title',
      description: 'regulatoryUpdates.timelineField.description',
      risk_level: 'regulatoryUpdates.timelineField.riskLevel',
      responsible_department: 'regulatoryUpdates.timelineField.responsibleDepartment',
      compliance_status: 'regulatoryUpdates.timelineField.complianceStatus',
      assigned_to: 'regulatoryUpdates.timelineField.assignee',
      notes: 'regulatoryUpdates.timelineField.notes',
      article_number: 'regulatoryUpdates.timelineField.articleNumber',
      sort_order: 'regulatoryUpdates.timelineField.order',
    }
    const sameValue = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null)
    const changedLabelKeys = Array.from(
      new Set(
        Object.keys(ARTICLE_FIELD_LABEL_KEYS)
          .filter((k) => !sameValue(before?.[k], after[k]))
          .map((k) => ARTICLE_FIELD_LABEL_KEYS[k]),
      ),
    )

    // GAP-13: build a structured per-field diff `[{ field, from, to }]` —
    // one entry per changed field — persisted into `article_versions.field_changes`
    // so the Version History tab can render a Field / From / To table. The
    // `field` label reuses the readable labels above, capitalised for display;
    // values are stringified (null/'' → '').
    const displayValue = (v: unknown): string => (v == null ? '' : String(v))
    const fieldChanges = Object.keys(ARTICLE_FIELD_LABEL_KEYS)
      .filter((k) => !sameValue(before?.[k], after[k]))
      .map((k) => ({
        field: ARTICLE_FIELD_LABEL_KEYS[k],
        from: displayValue(before?.[k]),
        to: displayValue(after[k]),
      }))

    // HANI-4: log the human-readable article identity, not the raw UUID.
    const updatedArticle = data as { article_number?: string; title?: string }
    const articleLabel = articleDisplayName(updatedArticle.article_number, updatedArticle.title)

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.implementation.update',
        entity_type: 'circular_article',
        entity_id: implementationId,
        metadata: { circular_id: circularId, fields: Object.keys(update) },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        renderBilingual('regulatoryUpdates.timeline.articleUpdated', {
          article: articleLabel,
        }),
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    // GAP-11: emit a version-history row only when a field actually changed.
    // Fire-and-forget — a failure here never breaks the PATCH response.
    // Wave-19.4 / Item-3 — dual-store: the `{fields}` placeholder resolves
    // per-locale (each language's label list is translated against its own
    // dictionary before interpolation).
    if (changedLabelKeys.length > 0) {
      const fieldsByLocale = {
        en: changedLabelKeys.map((k) => renderI18nKey(k, {}, 'en')).join(', '),
        ar: changedLabelKeys.map((k) => renderI18nKey(k, {}, 'ar')).join(', '),
      }
      await insertArticleVersion(
        supabase,
        implementationId,
        renderBilingual('regulatoryUpdates.timeline.versionUpdatedFields', {
          fields: fieldsByLocale,
        }),
        profile.name ?? profile.email ?? user.id,
        fieldChanges,
      )
    }

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { circularId, implementationId } = await params
    assertUuid(circularId, implementationId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    // W17-1 / SEC-1: optimistic-concurrency token. The DELETE below is scoped
    // to `WHERE updated_at = token` when `If-Match` is sent so a concurrent
    // writer that already changed the row trips a 412 instead of silently
    // deleting the modified row.
    const ifMatch = readIfMatch(req)

    // HANI-4: capture the article identity BEFORE the delete so the timeline
    // row can name it instead of logging a raw UUID.
    const { data: doomed } = await supabase
      .from('circular_articles')
      .select('article_number, title, updated_at')
      .eq('id', implementationId)
      .eq('circular_id', circularId)
      .maybeSingle<{ article_number: string; title: string; updated_at: string }>()
    const articleLabel = articleDisplayName(doomed?.article_number, doomed?.title)

    let delQuery = supabase
      .from('circular_articles')
      .delete()
      .eq('id', implementationId)
      .eq('circular_id', circularId)
    if (ifMatch != null) {
      // W17.2: scope on the CLIENT's claimed token (see PATCH above).
      delQuery = delQuery.eq('updated_at', ifMatch)
    }
    const { data: deletedRows, error } = await delQuery.select('id')
    if (error) throw error
    if (ifMatch != null && (!deletedRows || deletedRows.length === 0)) {
      throw PreconditionFailed(
        'This record was changed by someone else — reload to see the latest.',
      )
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.implementation.delete',
        entity_type: 'circular_article',
        entity_id: implementationId,
        metadata: { circular_id: circularId },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        renderBilingual('regulatoryUpdates.timeline.articleDeleted', {
          article: articleLabel,
        }),
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    // Removing an article wipes its checklist via cascade, which may shrink
    // checklistTotal/Done and so change progress. Recompute so the DB stays
    // in sync with the new totals.
    await recomputeCircularProgress(supabase, circularId)

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok({ id: implementationId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
