// /api/settings/framework-config/[frameworkId] — update one framework's config.
//
// Upserts a row in `framework_config` for the given framework. Changes that
// affect scoring (weight, threshold, enabled) bust the compliance score cache.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateFrameworkConfigSchema } from '@/lib/api/schemas/settings'
import {
  FRAMEWORK_CONFIG_COLUMNS,
  assertFrameworkExists,
} from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ frameworkId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { frameworkId } = await params
    const { supabase, user, profile } = await requireAnyPerm(['frameworks:config', 'settings:edit'])
    await assertFrameworkExists(supabase, frameworkId)
    const patch = await parseJson(req, UpdateFrameworkConfigSchema)

    const update: Record<string, unknown> = { framework_id: frameworkId }
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('framework_config')
      .upsert(update, { onConflict: 'framework_id' })
      .select(FRAMEWORK_CONFIG_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Upsert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'framework_config.update',
      entity_type: 'framework_config',
      entity_id: frameworkId,
      metadata: { fields: Object.keys(patch) },
      supabase,
    })

    revalidateAll([
      cacheTags.frameworkConfig(),
      cacheTags.frameworkConfig(frameworkId),
      cacheTags.frameworks(),
      cacheTags.compliance(),
    ])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
