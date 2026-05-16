// /api/observations/[observationId]/evidence — list / register evidence.
//
// Evidence and attachments both map to the `observation_documents` table —
// this route is an alias of /attachments for the frontend's evidence UI.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { RegisterObservationDocumentSchema } from '@/lib/api/schemas/observations'
import {
  OBSERVATION_DOCUMENT_COLUMNS,
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
      .from('observation_documents')
      .select(OBSERVATION_DOCUMENT_COLUMNS)
      .eq('observation_id', observationId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.observations(observationId)] },
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
    const input = await parseJson(req, RegisterObservationDocumentSchema)

    const { data, error } = await supabase
      .from('observation_documents')
      .insert({
        observation_id: observationId,
        name: input.name,
        type: input.type,
        storage_path: input.storage_path,
        uploaded_by: user.id,
      })
      .select(OBSERVATION_DOCUMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'observation.evidence.add',
        entity_type: 'observation_document',
        entity_id: created.id,
        metadata: { observation_id: observationId, name: input.name },
        supabase,
      }),
      writeObservationTimeline({
        supabase,
        observation_id: observationId,
        action_type: 'evidence.added',
        description: `Evidence added: ${input.name}`,
        user_id: user.id,
        user_name: profile.name ?? profile.email ?? user.id,
        target_id: created.id,
      }),
    ])

    revalidateAll([cacheTags.observations(observationId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
