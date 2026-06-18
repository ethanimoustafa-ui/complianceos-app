// /api/team/members/[userId]/permissions — effective permissions + bulk override.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { SetPermissionsSchema } from '@/lib/api/schemas/team'
import { assertProfileExists, getMemberDetail } from '@/lib/api/services/team'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ userId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { userId } = await params
    const { supabase } = await requireUser()
    const detail = await getMemberDetail(supabase, userId)
    return ok(
      {
        user_id: userId,
        roles: detail.roles,
        permissions: detail.permissions,
        user_permissions: detail.user_permissions,
      },
      {
        cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.team(userId)] },
      },
    )
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await params
    const { supabase, user, profile } = await requirePerm('team:edit')
    await assertProfileExists(supabase, userId)
    const input = await parseJson(req, SetPermissionsSchema)

    // The matrix sends backend permission keys (FK to public.permissions.key).
    // Granted keys become explicit additive `user_permissions` rows; ungranted
    // keys are DELETED rather than written as `granted = false`. Deleting (not
    // false-upserting) means a disabled toggle just removes the per-user
    // override and falls back to the user's ROLE defaults, instead of stamping
    // an explicit revoke that would strip a key the role still grants.
    const granted: string[] = []
    const revoked: string[] = []
    for (const [permission_key, isGranted] of Object.entries(input.permissions)) {
      ;(isGranted ? granted : revoked).push(permission_key)
    }

    if (granted.length > 0) {
      const rows = granted.map((permission_key) => ({
        user_id: userId,
        permission_key,
        granted: true,
        granted_by: user.id,
      }))
      const { error } = await supabase
        .from('user_permissions')
        .upsert(rows, { onConflict: 'user_id,permission_key' })
      if (error) throw error
    }

    if (revoked.length > 0) {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .in('permission_key', revoked)
      if (error) throw error
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'team.permissions.update',
      entity_type: 'profile',
      entity_id: userId,
      metadata: { permissions: input.permissions },
      supabase,
    })

    revalidateAll([cacheTags.team(), cacheTags.team(userId), cacheTags.me()])
    const detail = await getMemberDetail(supabase, userId)
    return ok({
      user_id: userId,
      roles: detail.roles,
      permissions: detail.permissions,
      user_permissions: detail.user_permissions,
    })
  } catch (e) {
    return handle(e)
  }
}
