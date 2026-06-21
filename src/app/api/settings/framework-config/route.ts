// /api/settings/framework-config — current config for every framework.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { FRAMEWORK_CONFIG_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const [configRes, pinsRes] = await Promise.all([
      supabase.from('framework_config').select(FRAMEWORK_CONFIG_COLUMNS),
      supabase.from('framework_pins').select('framework_id, position'),
    ])
    if (configRes.error) throw configRes.error
    if (pinsRes.error) throw pinsRes.error
    return ok(
      {
        config: configRes.data ?? [],
        pins: pinsRes.data ?? [],
      },
      {
        cache: { scope: 'public', sMaxAge: 300, staleWhileRevalidate: 900, tags: [cacheTags.frameworkConfig()] },
      },
    )
  } catch (e) {
    return handle(e)
  }
}
