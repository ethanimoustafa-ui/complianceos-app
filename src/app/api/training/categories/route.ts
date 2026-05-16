// /api/training/categories — system lookup (cached aggressively).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateTrainingCategorySchema } from '@/lib/api/schemas/training'
import { TRAINING_CATEGORY_COLUMNS } from '@/lib/api/services/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TAG = 'training-categories:list'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('training_categories')
      .select(TRAINING_CATEGORY_COLUMNS)
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
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateTrainingCategorySchema)
    const { data, error } = await supabase
      .from('training_categories')
      .insert(input)
      .select(TRAINING_CATEGORY_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')
    const created = data as { id: string }
    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'training_category.create',
      entity_type: 'training_category',
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
