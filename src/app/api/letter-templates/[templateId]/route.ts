// /api/letter-templates/[templateId] — PATCH / DELETE letter template.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateLetterTemplateSchema } from '@/lib/api/schemas/letters'
import { LETTER_TEMPLATE_COLUMNS } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ templateId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const patch = await parseJson(req, UpdateLetterTemplateSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('letter_templates')
      .update(update)
      .eq('id', templateId)
      .select(LETTER_TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Template ${templateId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_template.update',
      entity_type: 'letter_template',
      entity_id: templateId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.letterTemplates())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])

    const { error } = await supabase
      .from('letter_templates')
      .delete()
      .eq('id', templateId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_template.delete',
      entity_type: 'letter_template',
      entity_id: templateId,
      supabase,
    })

    revalidate(cacheTags.letterTemplates())
    return ok({ id: templateId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
