// POST /api/settings/onboarding/step
// Body: { step: string, payload: object }
// Persists one onboarding step result into compliance_settings.onboarding_state.

import type { NextRequest } from 'next/server'
import { requireAnyPerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { OnboardingStepSchema } from '@/lib/api/schemas/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface OnboardingState {
  completed: boolean
  completed_at: string | null
  steps: Record<string, { completed_at: string; payload: Record<string, unknown> }>
}

const DEFAULT_STATE: OnboardingState = { completed: false, completed_at: null, steps: {} }

export async function POST(req: NextRequest) {
  try {
    // Onboarding is admin-tier setup that writes compliance_settings (a
    // frameworks:config table) — keep it on settings:edit only, not section-grantable.
    const { supabase, user, profile } = await requireAnyPerm(['settings:edit'])
    const input = await parseJson(req, OnboardingStepSchema)

    const { data: existing } = await supabase
      .from('compliance_settings')
      .select('onboarding_state')
      .eq('singleton', true)
      .maybeSingle<{ onboarding_state: OnboardingState | null }>()

    const current: OnboardingState = existing?.onboarding_state ?? DEFAULT_STATE
    const next: OnboardingState = {
      ...current,
      steps: {
        ...current.steps,
        [input.step]: {
          completed_at: new Date().toISOString(),
          payload: input.payload,
        },
      },
    }

    const { error } = await supabase
      .from('compliance_settings')
      .update({ onboarding_state: next })
      .eq('singleton', true)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'onboarding.step',
      entity_type: 'onboarding',
      entity_id: input.step,
      metadata: { step: input.step },
      supabase,
    })

    revalidate(cacheTags.onboarding())
    return ok(next)
  } catch (e) {
    return handle(e)
  }
}
