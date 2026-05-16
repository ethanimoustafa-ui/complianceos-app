// /api/settings/scale-labels — list / batch upsert.
//
// `scale_label_overrides` is per-(scale, key, lang) display override. There
// is no singleton row; the API exposes all overrides at once and accepts a
// batch upsert payload `{ overrides: [{ scale, key, lang, value }] }`.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { PatchScaleLabelsSchema } from '@/lib/api/schemas/settings'
import { SCALE_LABEL_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('scale_label_overrides')
      .select(SCALE_LABEL_COLUMNS)
      .order('scale', { ascending: true })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.scaleLabels()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, PatchScaleLabelsSchema)

    const { error } = await supabase
      .from('scale_label_overrides')
      .upsert(input.overrides, { onConflict: 'scale,key,lang' })
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'scale_label.upsert',
      entity_type: 'scale_label_override',
      metadata: { count: input.overrides.length },
      supabase,
    })

    revalidate(cacheTags.scaleLabels())
    return ok({ upserted: input.overrides.length })
  } catch (e) {
    return handle(e)
  }
}
