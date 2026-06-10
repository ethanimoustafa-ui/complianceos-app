// /api/audit-task-categories — W49: user-added audit-task categories, scoped
// per correspondence authority (?authority= filter). Seeded sets per
// authority live client-side; this collection holds extensions only.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { Conflict, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { writeAudit } from '@/lib/api/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, authority, key, label_en, label_ar, created_at, updated_at'

const CreateSchema = z
  .object({
    authority: z.string().min(1).max(50),
    key: z.string().min(1).max(100),
    label_en: z.string().min(1).max(200),
    label_ar: z.string().min(1).max(200),
  })
  .strict()

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const authority = req.nextUrl.searchParams.get('authority') ?? undefined
    let query = supabase.from('audit_task_categories').select(COLS)
    if (authority) query = query.eq('authority', authority.toLowerCase())
    const { data, error } = await query.order('label_en', { ascending: true })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('edit')
    const input = await parseJson(req, CreateSchema)

    const { data, error } = await supabase
      .from('audit_task_categories')
      .insert({ ...input, authority: input.authority.toLowerCase() })
      .select(COLS)
      .single()
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw Conflict('A task category with this name already exists for this framework.')
      }
      throw error
    }
    if (!data) throw NotFound('Insert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.task_category.create',
      entity_type: 'audit_task_category',
      entity_id: (data as { id: string }).id,
      metadata: { authority: input.authority, key: input.key },
      supabase,
    })

    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
