// /api/entity-templates/[templateId] — delete a specific entity template.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ templateId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { templateId } = await params
    const { supabase } = await requirePerm('settings:edit')

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
