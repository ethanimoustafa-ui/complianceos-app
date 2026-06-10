// /api/letter-sub-categories — CRUD wrapper over `framework_sub_categories`.
// Filters by `framework_id` query param to scope to a given authority.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { CreateLetterSubCategorySchema } from '@/lib/api/schemas/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, framework_id, key, name_en, name_ar, is_default, created_at, updated_at'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const frameworkId =
      req.nextUrl.searchParams.get('frameworkId') ??
      req.nextUrl.searchParams.get('framework_id') ??
      undefined

    let query = supabase.from('framework_sub_categories').select(COLS)
    if (frameworkId) query = query.eq('framework_id', frameworkId)
    const { data, error } = await query.order('name_en', { ascending: true })
    if (error) throw error

    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: {
        sMaxAge: 3600,
        staleWhileRevalidate: 7200,
        tags: [cacheTags.letterSubCategories()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    // W41: 'edit' (not org_admin-only settings:edit) — sub-categories are
    // added inline from the letter create form's EditableSelect by officers.
    const { supabase, user, profile } = await requirePerm('edit')
    const input = await parseJson(req, CreateLetterSubCategorySchema)

    const { data, error } = await supabase
      .from('framework_sub_categories')
      .insert(input)
      .select(COLS)
      .single()
    if (error) {
      // W41: translate DB violations into actionable envelopes — these used to
      // surface as opaque 500s ("internal server error" on duplicate names).
      const code = (error as { code?: string }).code
      if (code === '23505') {
        throw Conflict('A sub-category with this name already exists for this authority.')
      }
      if (code === '23503') {
        throw Conflict(`Unknown authority/framework '${input.framework_id}' — configure it in Settings first.`)
      }
      throw error
    }
    if (!data) throw NotFound('Insert returned no row')
    const created = data as { id: string }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter_sub_category.create',
      entity_type: 'framework_sub_category',
      entity_id: created.id,
      metadata: { framework_id: input.framework_id, key: input.key },
      supabase,
    })

    revalidate(cacheTags.letterSubCategories())
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
