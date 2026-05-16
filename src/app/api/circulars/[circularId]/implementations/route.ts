// /api/circulars/[circularId]/implementations — list + create.
// Implementations are modelled on the `circular_articles` table.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateImplementationSchema } from '@/lib/api/schemas/circulars'
import {
  IMPLEMENTATION_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)
    const { data, error } = await supabase
      .from('circular_articles')
      .select(IMPLEMENTATION_COLUMNS)
      .eq('circular_id', circularId)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.circularImplementations(circularId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const input = await parseJson(req, CreateImplementationSchema)

    const { data, error } = await supabase
      .from('circular_articles')
      .insert({
        circular_id: circularId,
        article_number: input.article_number,
        title: input.title,
        description: input.description ?? null,
        risk_level: input.risk_level,
        responsible_department: input.responsible_department ?? null,
        compliance_status: input.compliance_status,
        assigned_to: input.assigned_to ?? null,
        notes: input.notes ?? null,
        sort_order: input.sort_order,
      })
      .select(IMPLEMENTATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'circular.implementation.create',
        entity_type: 'circular_article',
        entity_id: created.id,
        metadata: { circular_id: circularId, article_number: input.article_number },
        supabase,
      }),
      insertCircularTimeline(
        supabase,
        circularId,
        `Implementation added: ${input.article_number} — ${input.title}`,
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([
      cacheTags.circulars(circularId),
      cacheTags.circularImplementations(circularId),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
