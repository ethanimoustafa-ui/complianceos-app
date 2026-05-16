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

    const rows = Object.entries(input.permissions).map(([permission_key, granted]) => ({
      user_id: userId,
      permission_key,
      granted,
      granted_by: user.id,
    }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('user_permissions')
        .upsert(rows, { onConflict: 'user_id,permission_key' })
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
