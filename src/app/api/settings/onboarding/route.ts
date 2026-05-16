// /api/settings/onboarding — current onboarding state.
//
// Backed by `compliance_settings.onboarding_state` JSONB (added in migration
// 030). If the column doesn't exist yet the handler returns the default
// shape so the frontend can render before migrations are applied.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_STATE = { completed: false, completed_at: null, steps: {} } as const

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('compliance_settings')
      .select('onboarding_state')
      .eq('singleton', true)
      .maybeSingle<{ onboarding_state: unknown }>()
    if (error) {
      // Likely the column is missing — return the default.
      return ok(DEFAULT_STATE, {
        cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.onboarding()] },
      })
    }
    return ok(data?.onboarding_state ?? DEFAULT_STATE, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.onboarding()] },
    })
  } catch (e) {
    return handle(e)
  }
}
