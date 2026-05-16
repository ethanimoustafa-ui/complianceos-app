// /api/risk-categories — system lookup. Read open; writes gated by settings:edit.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateRiskCategorySchema } from '@/lib/api/schemas/risks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RISK_CATEGORY_COLUMNS =
  'id, key, name_en, name_ar, color, is_default, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('risk_categories')
      .select(RISK_CATEGORY_COLUMNS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: ['risk-categories:list'] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateRiskCategorySchema)

    const { data, error } = await supabase
      .from('risk_categories')
      .insert(input)
      .select(RISK_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'risk_category.create',
      entity_type: 'risk_category',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate('risk-categories:list')
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
