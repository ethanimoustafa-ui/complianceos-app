// /api/policy-categories — system lookup CRUD.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreatePolicyCategorySchema } from '@/lib/api/schemas/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLICY_CATEGORY_COLUMNS =
  'id, key, name_en, name_ar, is_default, created_at, updated_at'

const TAG = 'policy-categories:list'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('policy_categories')
      .select(POLICY_CATEGORY_COLUMNS)
      .order('name_en', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [TAG] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const input = await parseJson(req, CreatePolicyCategorySchema)

    const { data, error } = await supabase
      .from('policy_categories')
      .insert(input)
      .select(POLICY_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'policy_category.create',
      entity_type: 'policy_category',
      entity_id: created.id,
      metadata: { key: input.key },
      supabase,
    })

    revalidate(TAG)
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
