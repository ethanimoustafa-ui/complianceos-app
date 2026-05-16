// POST /api/settings/framework-config/pin
// Body: { framework_id, pin_index }   pin_index ∈ {1,2,3}
//
// Pins are stored in `framework_pins` with a unique constraint on (position).
// If another framework already holds that slot, it is unpinned first.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { PinFrameworkSchema } from '@/lib/api/schemas/settings'
import { assertFrameworkExists } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, PinFrameworkSchema)
    await assertFrameworkExists(supabase, input.framework_id)

    // Free the slot if another framework is currently pinned there.
    await supabase.from('framework_pins').delete().eq('position', input.pin_index)
    // Remove any existing pin for this framework (a framework can hold only one slot).
    await supabase.from('framework_pins').delete().eq('framework_id', input.framework_id)

    const { error: insertError } = await supabase
      .from('framework_pins')
      .insert({ framework_id: input.framework_id, position: input.pin_index })
    if (insertError) throw insertError

    // Mirror onto framework_config.pinned for convenience.
    await supabase
      .from('framework_config')
      .upsert(
        { framework_id: input.framework_id, pinned: true },
        { onConflict: 'framework_id' },
      )

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'framework_config.pin',
      entity_type: 'framework_pin',
      entity_id: input.framework_id,
      metadata: { pin_index: input.pin_index },
      supabase,
    })

    revalidateAll([
      cacheTags.frameworkConfig(),
      cacheTags.frameworkConfig(input.framework_id),
      cacheTags.frameworks(),
    ])
    return ok({ framework_id: input.framework_id, pin_index: input.pin_index })
  } catch (e) {
    return handle(e)
  }
}
