// Wave-20 — /api/observations — collection endpoint.
//
// Hardened against PORTING-TEMPLATE §2 countermeasures:
//   - GET: cache:'no-store' on every entity read (§2.2)
//   - POST: server-generated reference via `insertWithRefCode` (§2.10) +
//           dual-store timeline write (§2.11) + recompute hook (§2.7)

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { handle } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateObservationSchema,
  ListObservationsQuerySchema,
} from '@/lib/api/schemas/observations'
import {
  OBSERVATION_LIST_COLUMNS,
  insertObservationTimeline,
  observationActorName,
  recomputeObservationDerivedState,
} from '@/lib/api/services/observations'

import { renderBilingual } from '@/lib/i18n/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = parseQuery(req.nextUrl.searchParams, ListObservationsQuerySchema)

    let query = supabase
      .from('observations')
      .select(OBSERVATION_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)

    if (q.id) query = query.eq('id', q.id)
    if (q.status) query = query.eq('status', q.status)
    if (q.severity) query = query.eq('severity', q.severity)
    if (q.source) query = query.eq('source', q.source)
    if (q.leader_id) query = query.eq('leader_id', q.leader_id)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.q) query = query.ilike('title', `%${q.q}%`)

    if (q.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('key, name_en')
        .eq('id', q.department_id)
        .maybeSingle<{ key: string; name_en: string }>()
      if (!dept) {
        return ok(paginate([], q.page, q.pageSize, 0), { cache: 'no-store' })
      }
      query = query.in('department', [dept.key, dept.name_en])
    }

    // audit_id filter is a no-op until a direct FK exists (see prior comment).
    if (q.audit_id) {
      // intentionally not applied.
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('due_date', { ascending: true })
      .range(from, to)
    if (error) throw error

    // PORTING-TEMPLATE §2.2 — `cache: 'no-store'` on every entity GET; the
    // `sMaxAge`/`staleWhileRevalidate` shape is unreliable for entity reads
    // (rows vanish for up to 60s after a write).
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('observation:create')
    const input = await parseJson(req, CreateObservationSchema)

    // O3: server-generated `reference` with fixed OBS prefix → OBS-YYYY-00001.
    // Uses a retry-on-unique-violation loop (same pattern as insertWithRefCode)
    // so concurrent POSTs never collide. Five-digit zero-padded sequence within
    // each calendar year. The generic insertWithRefCode helper uses 4-digit
    // padding from a title-derived slug; we inline the OBS variant here.
    const obsYear = new Date().getUTCFullYear()
    const obsPrefix = `OBS-${obsYear}-`
    const obsInsertPayload = {
      title: input.title,
      sub_title: input.sub_title ?? null,
      description: input.description,
      source: input.source,
      severity: input.severity,
      due_date: input.due_date,
      remediation_submission_due: input.remediation_submission_due ?? null,
      department: input.department ?? null,
      leader_id: input.leader_id ?? null,
      creator_id: user.id,
      framework_ids: input.framework_ids ?? [],
    }

    // W33-1 — reference-generation hardening.
    //
    // The reference UNIQUE index is global, but the observations SELECT RLS
    // policy filters `deleted_at IS NULL`. Reading the max reference with the
    // user's RLS client therefore misses SOFT-DELETED rows, so the computed
    // sequence collides with a deleted row's reference (23505) and — because
    // every retry recomputed the SAME max — all 8 attempts failed → 500.
    // Fix: (1) read the max with the service-role client (when available) so
    // soft-deleted references are visible (mirrors services/advisory.ts), and
    // (2) parse the numeric max across ALL references (ignoring malformed tails
    // like 'D00001') and ADVANCE the sequence on each retry instead of
    // recomputing it. Insert still goes through the user's RLS client.
    const refReadClient = hasServiceRole() ? getAdminClient() : supabase
    const { data: existingRefs, error: refReadErr } = await refReadClient
      .from('observations')
      .select('reference')
      .ilike('reference', `${obsPrefix}%`)
    if (refReadErr) throw refReadErr
    let maxSeq = 0
    for (const row of (existingRefs ?? []) as { reference: string | null }[]) {
      const tail = (row.reference ?? '').slice(obsPrefix.length)
      if (/^\d+$/.test(tail)) {
        const n = Number(tail)
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n
      }
    }

    let data: { id: string; reference: string } | null = null
    let lastInsertError: unknown = null
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 50)))
      }
      // Advance the sequence every attempt so a collision (concurrent peer or a
      // gap from a deleted row) is skipped rather than retried identically.
      const obsSeq = maxSeq + 1 + attempt
      const obsRef = `${obsPrefix}${String(obsSeq).padStart(5, '0')}`
      const { data: inserted, error: insertErr } = await supabase
        .from('observations')
        .insert({ ...obsInsertPayload, reference: obsRef })
        .select(OBSERVATION_LIST_COLUMNS)
        .single()
      if (!insertErr && inserted) {
        data = inserted as unknown as { id: string; reference: string }
        break
      }
      lastInsertError = insertErr
      if (insertErr && (insertErr as { code?: string }).code !== '23505') break
    }
    if (!data) throw lastInsertError ?? new Error('Failed to insert observation')

    const created = data as unknown as { id: string; reference: string }
    const actor = observationActorName(profile, user.id)
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'observation.create',
        entity_type: 'observation',
        entity_id: created.id,
        metadata: { reference: created.reference, severity: input.severity },
        supabase,
      }),
      insertObservationTimeline({
        supabase,
        observation_id: created.id,
        action_type: 'created',
        user_id: user.id,
        user_name: actor,
        ...renderBilingual('regulatoryUpdates.timeline.observationCreated', {
          title: input.title,
        }),
      }),
    ])

    // §2.7 — server-authoritative recompute. is_overdue is maintained by the
    // SQL trigger (migration 060); this is the call-site hook for future
    // derived rollups.
    await recomputeObservationDerivedState(supabase, created.id)

    revalidateAll([cacheTags.observations(), cacheTags.observations(created.id)])
    revalidate(cacheTags.compliance())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
