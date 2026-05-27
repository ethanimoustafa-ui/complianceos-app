// /api/entity-templates — list + create generic entity templates (M2).
// Supports circular (Rules), policy, and audit templates via a shared table.
// Initially wired for 'circular' entity type; future waves extend to others.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ListQuerySchema = z.object({
  entity_type: z.string().min(1).max(50),
})

const CreateTemplateSchema = z
  .object({
    entity_type: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    name_ar: z.string().max(200).optional(),
    fields: z.record(z.string(), z.unknown()).default({}),
    is_default: z.boolean().default(false),
  })
  .strict()

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const q = parseQuery(req.nextUrl.searchParams, ListQuerySchema)

    const { data, error } = await supabase
      .from('entity_templates')
      .select('id, entity_type, name, name_ar, fields, is_default, created_at')
      .eq('entity_type', q.entity_type)
      .is('deleted_at', null)
      .order('name', { ascending: true })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateTemplateSchema)

    const { data, error } = await supabase
      .from('entity_templates')
      .insert({
        entity_type: input.entity_type,
        name: input.name,
        name_ar: input.name_ar ?? null,
        fields: input.fields,
        is_default: input.is_default,
        created_by: user.id,
      })
      .select('id, entity_type, name, name_ar, fields, is_default, created_at')
      .single()
    if (error) throw error
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
