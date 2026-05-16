// /api/policy-templates/[templateId] — PATCH / DELETE.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdatePolicyTemplateSchema } from '@/lib/api/schemas/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLICY_TEMPLATE_COLUMNS =
  'id, name, name_ar, category, approval_tier, frequency, frequency_schedule, default_description, default_description_ar, default_workflow_steps, version_pattern, framework, status, usage_count, created_at, updated_at'

const TAG = 'policy-templates:list'

type Params = { params: Promise<{ templateId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, UpdatePolicyTemplateSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('policy_templates')
      .update(update)
      .eq('id', templateId)
      .select(POLICY_TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound(`Policy template ${templateId} not found`)

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_template.update',
      entity_type: 'policy_template',
      entity_id: templateId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(TAG)
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')

    const { error } = await supabase
      .from('policy_templates')
      .delete()
      .eq('id', templateId)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_template.delete',
      entity_type: 'policy_template',
      entity_id: templateId,
      supabase,
    })

    revalidate(TAG)
    return ok({ id: templateId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
