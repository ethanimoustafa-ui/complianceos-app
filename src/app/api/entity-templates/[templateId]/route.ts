// /api/entity-templates/[templateId] — rename / delete an entity template.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ templateId: string }> }

const RenameSchema = z
  .object({
    name: z.string().min(1).max(200),
    name_ar: z.string().min(1).max(200).optional(),
  })
  .strict()

// W49: rename (policy-template parity — the Select Template dropdown exposes
// edit/delete per saved template).
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase } = await requirePerm('edit')
    const input = await parseJson(req, RenameSchema)

    const { data, error } = await supabase
      .from('entity_templates')
      .update({ name: input.name, ...(input.name_ar ? { name_ar: input.name_ar } : {}) })
      .eq('id', templateId)
      .is('deleted_at', null)
      .select('id, entity_type, name, name_ar, fields, is_default, created_at')
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Template ${templateId} not found`)
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    // W49: 'edit' (was org_admin-only settings:edit) — officers manage the
    // templates they save from the scheduling modal.
    const { supabase } = await requirePerm('edit')

    const { data, error } = await supabase
      .from('entity_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', templateId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Template ${templateId} not found`)
    return ok({ id: templateId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
