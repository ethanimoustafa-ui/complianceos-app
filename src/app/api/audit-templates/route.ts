// /api/audit-templates — list / create audit templates.
//
// Per BACKEND-API-MAP §4.24 ("Templates"), CRUD on `audit_templates` is gated
// by the canonical permission "Manage Audit Templates" → `settings:edit` in
// the seeded RBAC matrix. We accept either `settings:edit` (canonical) here.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreateAuditTemplateSchema } from '@/lib/api/schemas/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TEMPLATE_COLUMNS =
  'id, name, name_ar, audit_type, category, priority, frequency, frequency_schedule, default_title, default_title_ar, default_description, default_description_ar, default_checklist_items, default_team_roles, framework, status, usage_count, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const status = req.nextUrl.searchParams.get('status') ?? 'active'

    const { data, error } = await supabase
      .from('audit_templates')
      .select(TEMPLATE_COLUMNS)
      .eq('status', status)
      .order('name', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 300, staleWhileRevalidate: 600, tags: [cacheTags.auditTemplates()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateAuditTemplateSchema)

    const { data, error } = await supabase
      .from('audit_templates')
      .insert({
        name: input.name,
        name_ar: input.name_ar ?? null,
        audit_type: input.audit_type,
        category: input.category,
        priority: input.priority,
        frequency: input.frequency,
        frequency_schedule: input.frequency_schedule ?? null,
        default_title: input.default_title,
        default_title_ar: input.default_title_ar ?? null,
        default_description: input.default_description,
        default_description_ar: input.default_description_ar ?? null,
        default_checklist_items: input.default_checklist_items,
        default_team_roles: input.default_team_roles,
        framework: input.framework ?? null,
        status: input.status,
      })
      .select(TEMPLATE_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_template.create',
      entity_type: 'audit_template',
      entity_id: created.id,
      metadata: { name: input.name },
      supabase,
    })

    revalidate(cacheTags.auditTemplates())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
