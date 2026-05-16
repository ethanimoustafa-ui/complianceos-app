// /api/audit-categories — system lookup (cached aggressively).
//
// Read is open to any authenticated user; writes gated by `settings:edit`
// (org_admin only per the seeded permission matrix).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateAuditCategorySchema } from '@/lib/api/schemas/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY_COLUMNS = 'id, key, name_en, name_ar, is_default, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('audit_categories')
      .select(CATEGORY_COLUMNS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.auditCategories()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateAuditCategorySchema)

    const { data, error } = await supabase
      .from('audit_categories')
      .insert(input)
      .select(CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit_category.create',
      entity_type: 'audit_category',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate(cacheTags.auditCategories())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
