// /api/policy-templates — list / create policy templates.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyTemplateSchema } from '@/lib/api/schemas/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLICY_TEMPLATE_COLUMNS =
  'id, name, name_ar, category, approval_tier, frequency, frequency_schedule, default_description, default_description_ar, default_workflow_steps, version_pattern, framework, status, usage_count, created_at, updated_at'

const TAG = 'policy-templates:list'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const status = req.nextUrl.searchParams.get('status') ?? 'active'

    const { data, error } = await supabase
      .from('policy_templates')
      .select(POLICY_TEMPLATE_COLUMNS)
      .eq('status', status)
      .order('name', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 300, staleWhileRevalidate: 600, tags: [TAG] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreatePolicyTemplateSchema)

    const { data, error } = await supabase
      .from('policy_templates')
      .insert({
        name: input.name,
        name_ar: input.name_ar ?? null,
        category: input.category,
        approval_tier: input.approval_tier,
        frequency: input.frequency ?? null,
        frequency_schedule: input.frequency_schedule ?? null,
        default_description: input.default_description,
        default_description_ar: input.default_description_ar ?? null,
        default_workflow_steps: input.default_workflow_steps,
        version_pattern: input.version_pattern,
        framework: input.framework ?? null,
        status: input.status,
      })
      .select(POLICY_TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_template.create',
      entity_type: 'policy_template',
      entity_id: created.id,
      metadata: { name: input.name },
      supabase,
    })

    revalidate(TAG)
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
