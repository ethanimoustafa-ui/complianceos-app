// /api/team/me — current user profile + roles + permissions.

import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { getMemberDetail } from '@/lib/api/services/team'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, user, profile, permissions } = await requireUser()
    // Detail includes recent_activity + user_permissions overrides.
    const detail = await getMemberDetail(supabase, user.id)
    return ok(
      {
        ...detail,
        // Always trust the auth.ts memo for the resolved permissions list.
        permissions,
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
