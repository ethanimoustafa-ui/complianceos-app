// POST /api/settings/framework-config/unpin/[frameworkId]
//
// Removes the row in `framework_pins` for this framework (if any) and
// clears `framework_config.pinned`. No-op if not pinned.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertFrameworkExists } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ frameworkId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { frameworkId } = await params
    const { supabase, user, profile } = await requirePerm('settings:edit')
    await assertFrameworkExists(supabase, frameworkId)

    const { error } = await supabase
      .from('framework_pins')
      .delete()
      .eq('framework_id', frameworkId)
    if (error) throw error

    await supabase
      .from('framework_config')
      .upsert(
        { framework_id: frameworkId, pinned: false },
        { onConflict: 'framework_id' },
      )

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'framework_config.unpin',
      entity_type: 'framework_pin',
      entity_id: frameworkId,
      supabase,
    })

    revalidateAll([
      cacheTags.frameworkConfig(),
      cacheTags.frameworkConfig(frameworkId),
      cacheTags.frameworks(),
    ])
    return ok({ framework_id: frameworkId, pinned: false })
  } catch (e) {
    return handle(e)
  }
}
