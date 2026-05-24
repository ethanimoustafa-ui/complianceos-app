// /api/circulars — list + create circulars.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateCircularSchema,
  ListCircularsQuerySchema,
} from '@/lib/api/schemas/circulars'
import {
  CIRCULAR_LIST_COLUMNS,
  insertCircularTimeline,
  nextCircularReference,
} from '@/lib/api/services/circulars'
import { buildDefaultWorkflowStepRows } from '@/lib/workflow-defaults'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListCircularsQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('circulars')
      .select(CIRCULAR_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)

    if (q.status) query = query.eq('status', q.status)
    const authority = q.authority ?? q.authority_id
    if (authority) query = query.eq('authority', authority)
    if (q.priority) query = query.eq('priority', q.priority)
    if (q.applicability) query = query.eq('applicability', q.applicability)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('title', `%${q.q}%`)

    if (q.has_pending_edits === 'true' || q.has_pending_edits === 'false') {
      const { data: rows } = await supabase
        .from('circular_pending_edits')
        .select('circular_id')
        .eq('status', 'pending')
      const set = new Set(((rows ?? []) as { circular_id: string }[]).map((r) => r.circular_id))
      if (q.has_pending_edits === 'true') {
        if (set.size === 0) {
          return ok(paginate([], q.page, q.pageSize, 0), { cache: 'no-store' })
        }
        query = query.in('id', Array.from(set))
      } else if (set.size > 0) {
        query = query.not('id', 'in', `(${Array.from(set).join(',')})`)
      }
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('issuance_date', { ascending: false })
      .range(from, to)
    if (error) throw error

    // Stamp each row with `current_phase` so the row card can render the
    // correct CAP / CAP-Approval / Remediation chip without waiting on a
    // detail fetch. One side query, indexed on (circular_id, status).
    const rows = (data ?? []) as Array<{ id: string; [k: string]: unknown }>
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id)
      const { data: currentSteps } = await supabase
        .from('circular_workflow_steps')
        .select('circular_id, phase')
        .in('circular_id', ids)
        .eq('status', 'current')
      const phaseById = new Map<string, number>()
      for (const s of (currentSteps ?? []) as Array<{ circular_id: string; phase: number }>) {
        phaseById.set(s.circular_id, s.phase)
      }
      for (const r of rows) r.current_phase = phaseById.get(r.id) ?? null
    }

    return ok(paginate(rows, q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('create')
    const input = await parseJson(req, CreateCircularSchema)

    // SEC-11: `nextCircularReference` does a `SELECT max(reference)+1`, which
    // races under concurrent POSTs — `circulars.reference` has a UNIQUE
    // constraint (`circulars_reference_key`) so a colliding insert fails with
    // Postgres `23505`. Retry on `23505`: recompute the next reference and try
    // again. Between attempts we add a small random jitter so concurrent
    // retriers desynchronise and re-read different `max` values rather than
    // colliding again in lockstep. ~8 attempts is ample for realistic burst
    // concurrency; anything beyond that fails cleanly with the last error.
    const MAX_REFERENCE_ATTEMPTS = 8
    let inserted: Record<string, unknown> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // Jittered backoff (10–60ms) so peers re-read `max` at different times.
        await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 50)))
      }
      const reference = await nextCircularReference(supabase, input.authority)
      const { data, error } = await supabase
        .from('circulars')
        .insert({
          reference,
          authority: input.authority,
          title: input.title,
          priority: input.priority,
          status: input.status,
          applicability: input.applicability,
          departments: input.departments,
          business_owner_department: input.business_owner_department ?? null,
          business_owner_department_id: input.business_owner_department_id ?? null,
          assigned_to: input.assigned_to ?? null,
          progress: input.progress,
          issuance_date: input.issuance_date,
          due_date: input.due_date,
          cap_status: input.cap_status,
          cap_due_date: input.cap_due_date ?? null,
          cap_deadline: input.cap_deadline ?? null,
          cap_response_deadline: input.cap_response_deadline ?? null,
          remediation_deadline: input.remediation_deadline ?? null,
          description: input.description ?? null,
          pdf_url: input.pdf_url ?? null,
          reference_url: input.reference_url ?? null,
          framework_ids: input.framework_ids,
        })
        .select(CIRCULAR_LIST_COLUMNS)
        .single()
      if (!error && data) {
        inserted = data as Record<string, unknown>
        break
      }
      lastError = error
      if (error && (error as { code?: string }).code !== '23505') break
    }
    if (!inserted) throw lastError ?? NotFound('Insert returned no row')

    const created = inserted as { id: string; reference: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.create',
        entity_type: 'circular',
        entity_id: created.id,
        metadata: { reference: created.reference, authority: input.authority },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        created.id,
        renderBilingual('regulatoryUpdates.timeline.circularCreated'),
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    const rows = buildDefaultWorkflowStepRows(created.id)
    const { error: seedErr } = await supabase.from('circular_workflow_steps').insert(rows)
    if (seedErr) {
      // eslint-disable-next-line no-console
      console.error('[api/circulars] workflow step seed failed', { error: seedErr, circular_id: created.id })
      // non-fatal — the circular itself succeeded
    }

    revalidate(cacheTags.circulars())
    return ok(inserted, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
