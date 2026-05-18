// /api/observations/[observationId]/remediation — list / create remediation plan.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateRemediationPlanSchema } from '@/lib/api/schemas/observations'
import {
  REMEDIATION_PLAN_COLUMNS,
  assertObservationExists,
  writeObservationTimeline,
} from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ observationId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)

    const { data, error } = await supabase
      .from('remediation_plans')
      .select(REMEDIATION_PLAN_COLUMNS)
      .eq('observation_id', observationId)
      .order('created_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: {
        sMaxAge: 60,
        staleWhileRevalidate: 300,
        tags: [cacheTags.observations(observationId)],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam } = await params
    const { supabase, user, profile } = await requirePerm('observation:edit')
    const observationId = await assertObservationExists(supabase, observationIdParam)
    const input = await parseJson(req, CreateRemediationPlanSchema)

    const { data, error } = await supabase
      .from('remediation_plans')
      .insert({
        observation_id: observationId,
        title: input.title,
        description: input.description,
        due_date: input.due_date,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
      })
      .select(REMEDIATION_PLAN_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.remediation.submit',
        entity_type: 'remediation_plan',
        entity_id: created.id,
        metadata: { observation_id: observationId },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'remediation.submitted',
        description: `Remediation plan submitted: ${input.title}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: created.id,
      }),
    ])

    revalidateAll([cacheTags.observations(), cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
