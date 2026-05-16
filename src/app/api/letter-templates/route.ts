// /api/letter-templates — list + create SAMA letter templates.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateLetterTemplateSchema } from '@/lib/api/schemas/letters'
import { LETTER_TEMPLATE_COLUMNS } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const status = req.nextUrl.searchParams.get('status') ?? 'active'
    const type = req.nextUrl.searchParams.get('type') ?? undefined

    let query = supabase
      .from('sama_letter_templates')
      .select(LETTER_TEMPLATE_COLUMNS)
      .eq('status', status)
    if (type) query = query.eq('type', type)

    const { data, error } = await query.order('name', { ascending: true })
    if (error) throw error
    return ok(data ?? [], {
      cache: {
        sMaxAge: 300,
        staleWhileRevalidate: 600,
        tags: [cacheTags.samaLetterTemplates()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateLetterTemplateSchema)

    const { data, error } = await supabase
      .from('sama_letter_templates')
      .insert({
        name: input.name,
        type: input.type,
        icon: input.icon ?? null,
        color: input.color ?? null,
        description: input.description ?? null,
        status: input.status,
        default_subject_en: input.default_subject_en ?? null,
        default_subject_ar: input.default_subject_ar ?? null,
        default_body_en: input.default_body_en ?? null,
        default_body_ar: input.default_body_ar ?? null,
        default_signer_name: input.default_signer_name ?? null,
        default_signer_title: input.default_signer_title ?? null,
        default_signer_name_ar: input.default_signer_name_ar ?? null,
        default_signer_title_ar: input.default_signer_title_ar ?? null,
        default_signature_image_url: input.default_signature_image_url ?? null,
        default_sama_department: input.default_sama_department ?? null,
        default_recipient_name: input.default_recipient_name ?? null,
        default_recipient_org: input.default_recipient_org ?? null,
        default_recipient_city: input.default_recipient_city ?? null,
        default_recipient_name_ar: input.default_recipient_name_ar ?? null,
        default_recipient_org_ar: input.default_recipient_org_ar ?? null,
        default_recipient_city_ar: input.default_recipient_city_ar ?? null,
        placeholder_defs: input.placeholder_defs,
      })
      .select(LETTER_TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'sama_letter_template.create',
      entity_type: 'sama_letter_template',
      entity_id: created.id,
      metadata: { name: input.name, type: input.type },
      supabase,
    })

    revalidate(cacheTags.samaLetterTemplates())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
