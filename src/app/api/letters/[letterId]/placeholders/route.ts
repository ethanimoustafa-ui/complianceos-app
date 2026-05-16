// /api/letters/[letterId]/placeholders
//   GET   → effective list = letter.placeholder_defs (or template_defs if
//           letter has none), merged with current letter.placeholder_values.
//   PATCH → bulk-update placeholder_values, render shadow rendered fields.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePlaceholdersSchema } from '@/lib/api/schemas/letters'
import {
  assertLetterExists,
  insertLetterTimeline,
  renderLetterFields,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase } = await requireUser()

    const { data, error } = await supabase
      .from('sama_letters')
      .select('id, placeholder_defs, placeholder_values, subject, subject_ar, body, body_ar')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Letter ${letterId} not found`)

    return ok(
      {
        defs: (data as { placeholder_defs: unknown }).placeholder_defs ?? [],
        values: (data as { placeholder_values: unknown }).placeholder_values ?? {},
      },
      {
        cache: { sMaxAge: 60, tags: [cacheTags.samaLetterPlaceholders(letterId)] },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    await assertLetterExists(supabase, letterId)
    const body = await parseJson(req, UpdatePlaceholdersSchema)

    // Pull source text to render preview values; render is informational —
    // canonical templated body remains in DB.
    const { data: src } = await supabase
      .from('sama_letters')
      .select('subject, subject_ar, body, body_ar')
      .eq('id', letterId)
      .maybeSingle<{
        subject: string | null
        subject_ar: string | null
        body: string | null
        body_ar: string | null
      }>()
    renderLetterFields(
      {
        subject: src?.subject ?? undefined,
        subject_ar: src?.subject_ar ?? undefined,
        body: src?.body ?? undefined,
        body_ar: src?.body_ar ?? undefined,
      },
      body.placeholder_values,
    )

    const { data, error } = await supabase
      .from('sama_letters')
      .update({ placeholder_values: body.placeholder_values })
      .eq('id', letterId)
      .is('deleted_at', null)
      .select('id, placeholder_defs, placeholder_values')
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'sama_letter.placeholders.update',
        entity_type: 'sama_letter',
        entity_id: letterId,
        metadata: { keys: Object.keys(body.placeholder_values) },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        letterId,
        'Placeholders updated',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([
      cacheTags.samaLetters(letterId),
      cacheTags.samaLetterPlaceholders(letterId),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
