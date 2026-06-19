// POST /api/settings/onboarding/complete — finalize onboarding.

import { requireAnyPerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface OnboardingState {
  completed: boolean
  completed_at: string | null
  steps: Record<string, unknown>
}

const DEFAULT_STATE: OnboardingState = { completed: false, completed_at: null, steps: {} }

export async function POST() {
  try {
    // Onboarding is admin-tier setup that writes compliance_settings (a
    // frameworks:config table) — keep it on settings:edit only, not section-grantable.
    const { supabase, user, profile } = await requireAnyPerm(['settings:edit'])

    const { data: existing } = await supabase
      .from('compliance_settings')
      .select('onboarding_state')
      .eq('singleton', true)
      .maybeSingle<{ onboarding_state: OnboardingState | null }>()

    const current = existing?.onboarding_state ?? DEFAULT_STATE
    const next: OnboardingState = {
      ...current,
      completed: true,
      completed_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('compliance_settings')
      .update({ onboarding_state: next })
      .eq('singleton', true)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'onboarding.complete',
      entity_type: 'onboarding',
      supabase,
    })

    revalidate(cacheTags.onboarding())
    return ok(next)
  } catch (e) {
    return handle(e)
  }
}
