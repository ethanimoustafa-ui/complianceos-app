// /api/settings/saudization — singleton metrics GET / PATCH.
//
// `saudization_metrics` is a single-row config (one row, `singleton = true`).
// Created during seeding. Admin can update target / actual / per-department
// breakdown via PATCH.

import type { NextRequest } from 'next/server'
import { requireAnyPerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { PatchSaudizationSchema } from '@/lib/api/schemas/settings'
import { SAUDIZATION_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('saudization_metrics')
      .select(SAUDIZATION_COLUMNS)
      .eq('singleton', true)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound('saudization_metrics singleton missing')
    return ok(data, {
      cache: { sMaxAge: 300, staleWhileRevalidate: 900, tags: [cacheTags.saudization()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireAnyPerm(['lists:config', 'settings:edit'])
    const patch = await parseJson(req, PatchSaudizationSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('saudization_metrics')
      .update(update)
      .eq('singleton', true)
      .select(SAUDIZATION_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'saudization.update',
      entity_type: 'saudization_metrics',
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidate(cacheTags.saudization())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
