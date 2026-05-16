// /api/audit-templates/[templateId] — update or delete a template.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateAuditTemplateSchema } from '@/lib/api/schemas/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TEMPLATE_COLUMNS =
  'id, name, name_ar, audit_type, category, priority, frequency, frequency_schedule, default_title, default_title_ar, default_description, default_description_ar, default_checklist_items, default_team_roles, framework, status, usage_count, created_at, updated_at'

type Params = { params: Promise<{ templateId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdateAuditTemplateSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('audit_templates')
      .update(update)
      .eq('id', templateId)
      .select(TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Template ${templateId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_template.update',
      entity_type: 'audit_template',
      entity_id: templateId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.auditTemplates(), cacheTags.auditTemplates(templateId)])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')

    const { error } = await supabase.from('audit_templates').delete().eq('id', templateId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_template.delete',
      entity_type: 'audit_template',
      entity_id: templateId,
      supabase,
    })

    revalidateAll([cacheTags.auditTemplates(), cacheTags.auditTemplates(templateId)])
    return ok({ id: templateId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
