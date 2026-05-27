// /api/policies — collection endpoint.
//
// Wave-18: hardened per PORTING-TEMPLATE §2 — `cache: 'no-store'` on every
// entity GET (P1's stale-read trigger), `.strict()` schemas, recompute call
// path and read-time `is_expired` per row (so StatCards count idle expiries
// without a cron).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicySchema, ListPoliciesQuerySchema } from '@/lib/api/schemas/policies'
import {
  POLICY_LIST_COLUMNS,
  recomputePolicyStatus,
  writePolicyActivity,
} from '@/lib/api/services/policies'
import { insertWithRefCode } from '@/lib/api/services/refcode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = ListPoliciesQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )

    let query = supabase
      .from('policies')
      .select(POLICY_LIST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)

    if (q.id) query = query.eq('id', q.id)
    if (q.status) query = query.eq('status', q.status)
    if (q.category) query = query.eq('category', q.category)
    if (q.approval_tier) query = query.eq('approval_tier', q.approval_tier)
    if (q.framework_id) query = query.contains('framework_ids', [q.framework_id])
    if (q.owner_department_id)
      query = query.eq('business_owner_department_id', q.owner_department_id)
    if (q.leader_id) query = query.eq('owner_id', q.leader_id)
    if (q.q) query = query.ilike('name', `%${q.q}%`)
    // P6 (W29): archive filter — default 'active' hides archived rows.
    if (q.archive_filter === 'active') query = query.is('archived_at', null)
    else if (q.archive_filter === 'archived') query = query.not('archived_at', 'is', null)

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('next_review_date', { ascending: true, nullsFirst: false })
      .range(from, to)
    if (error) throw error

    // Wave-19.1 / Q2 — ship the persisted `is_expired` column verbatim.
    // Migration 055 added the bool column on `policies` and a BEFORE
    // INSERT/UPDATE trigger + daily pg_cron resync to keep it in sync with
    // `(next_review_date, status)`. An `approved` policy that is past its
    // review date SHOULD show `is_expired:true` — that's the case the
    // Expired StatCard exists to surface. The previous overlay here
    // additionally exempted `status='approved'`, contradicting that spec.
    //
    // FORENSIC §4 / W3: entity GETs MUST be `cache: 'no-store'` — sMaxAge +
    // staleWhileRevalidate is unreliable; rows can vanish for up to 60s after
    // writes (the user's own auto-memory note).
    return ok(paginate(data ?? [], q.page, q.pageSize, count ?? 0), {
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('create')
    const input = await parseJson(req, CreatePolicySchema)

    // Wave-19 / Q1 — `ref_code` is server-generated from `input.name`. The
    // generic helper handles slug derivation, sequence increment, and retries
    // on UNIQUE-violation (Postgres 23505) for concurrent POST safety —
    // mirrors the `nextCircularReference` retry-loop on circulars.
    const data = await insertWithRefCode<Record<string, unknown> & { id: string }>({
      supabase,
      table: 'policies',
      slugSource: input.name,
      selectColumns: POLICY_LIST_COLUMNS,
      insertPayload: {
        name: input.name,
        description: input.description,
        category: input.category,
        version: input.version ?? 'v1.0',
        approval_tier: input.approval_tier,
        owner_id: input.owner_id ?? null,
        owner_name: input.owner_name ?? null,
        owner_department: input.owner_department ?? null,
        business_owner_department_id: input.business_owner_department_id ?? null,
        last_review_date: input.last_review_date ?? null,
        next_review_date: input.next_review_date ?? null,
        review_cycle_days: input.review_cycle_days ?? 365,
        approved_date: input.approved_date ?? null,
        review_schedule: input.review_schedule ?? null,
        framework_ids: input.framework_ids ?? [],
        affected_departments: input.affected_departments ?? [],
      },
    })
    if (!data) throw NotFound('Insert returned no row')

    const created = data as { id: string; ref_code?: string }
    // W18 / §2-7 — recompute status on insert so a back-dated next_review_date
    // immediately surfaces as `expired`.
    await recomputePolicyStatus(supabase, created.id)

    // W29.1-P1: copy the per-tier workflow step templates into this policy's
    // workflow_steps. First step becomes 'current', the rest 'pending'. Only
    // runs for the 5 named tiers seeded in migration 080; legacy tier_1/2/3
    // policies fall through with no steps (matches pre-W29 behaviour).
    {
      const { data: tplRows } = await supabase
        .from('policy_workflow_step_templates')
        .select('step, sort_order, action_type, description')
        .eq('tier', input.approval_tier)
        .order('sort_order', { ascending: true })
      const templates = (tplRows ?? []) as Array<{
        step: string
        sort_order: number
        action_type: string | null
        description: string | null
      }>
      if (templates.length > 0) {
        const stepRows = templates.map((t) => ({
          policy_id: created.id,
          step: t.step,
          sort_order: t.sort_order,
          action_type: t.action_type,
          description: t.description,
          status: t.sort_order === 1 ? 'current' : 'pending',
          updated_at: new Date().toISOString(),
        }))
        const { error: stepErr } = await supabase
          .from('policy_workflow_steps')
          .insert(stepRows)
        if (stepErr) {
          // eslint-disable-next-line no-console
          console.error('[api/policies] seed workflow steps failed', {
            stepErr,
            policy_id: created.id,
            tier: input.approval_tier,
          })
        }
      }
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'policy.create',
        entity_type: 'policy',
        entity_id: created.id,
        metadata: { ref_code: created.ref_code ?? null, name: input.name },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: created.id,
        type: 'created',
        text_en: `Policy created: ${input.name}`,
        text_ar: `تم إنشاء السياسة: ${input.name}`,
        user_name: profile.name ?? profile.email ?? user.id,
      }),
    ])

    revalidate(cacheTags.policies())
    revalidate(cacheTags.compliance())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
