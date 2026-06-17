// /api/team/me — current user profile + roles + permissions (GET); self-service
// preference update (PATCH).

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { getMemberDetail } from '@/lib/api/services/team'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user, profile, permissions } = await requireUser()
    // Detail includes recent_activity + user_permissions overrides.
    const detail = await getMemberDetail(supabase, user.id)
    // The one server-backed preference (the daily-digest cron must read it).
    const { data: prefRow } = await supabase
      .from('profiles')
      .select('email_digest_enabled')
      .eq('id', user.id)
      .maybeSingle<{ email_digest_enabled: boolean | null }>()
    return ok(
      {
        ...detail,
        // Always trust the auth.ts memo for the resolved permissions list.
        permissions,
        email_digest_enabled: prefRow?.email_digest_enabled ?? true,
        profile: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          department_id: profile.department_id,
          preferred_language: profile.preferred_language,
        },
      },
      {
        cache: { sMaxAge: 30, staleWhileRevalidate: 120, tags: [cacheTags.me()] },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

const PatchMeSchema = z.object({
  email_digest_enabled: z.boolean(),
})

export async function PATCH(req: NextRequest) {
  try {
    const { user, supabase } = await requireUser()
    const body = await parseJson(req, PatchMeSchema)

    // Self-update of a single non-sensitive preference. Use the admin client so
    // it doesn't depend on profiles-UPDATE RLS (gated to team:edit) — strictly
    // scoped to the caller's own row and the one boolean column.
    const client = hasServiceRole() ? getAdminClient() : supabase
    const { error } = await client
      .from('profiles')
      .update({ email_digest_enabled: body.email_digest_enabled })
      .eq('id', user.id)
    if (error) throw error

    revalidate(cacheTags.me())
    return ok({ email_digest_enabled: body.email_digest_enabled })
  } catch (e) {
    return handle(e)
  }
}
