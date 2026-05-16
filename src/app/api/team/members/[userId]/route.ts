// /api/team/members/[userId] — GET detail / PATCH update / DELETE soft.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { UpdateMemberSchema } from '@/lib/api/schemas/team'
import {
  PROFILE_LIST_COLUMNS,
  assertProfileExists,
  getMemberDetail,
} from '@/lib/api/services/team'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ userId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { userId } = await params
    const { supabase } = await requireUser()
    const detail = await getMemberDetail(supabase, userId)
    return ok(detail, {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.team(userId)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId } = await params
    const { supabase, user, profile } = await requirePerm('team:edit')
    await assertProfileExists(supabase, userId)
    const patch = await parseJson(req, UpdateMemberSchema)

    const update: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) update[k] = v

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .is('deleted_at', null)
      .select(PROFILE_LIST_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    // If role changed, sync user_roles too.
    if (patch.role) {
      // Replace user_roles for this user with the single new role to keep
      // the canonical role on profiles and the user_roles many-to-many aligned.
      await supabase.from('user_roles').delete().eq('user_id', userId)
      await supabase
        .from('user_roles')
        .upsert(
          { user_id: userId, role_key: patch.role, granted_by: user.id },
          { onConflict: 'user_id,role_key' },
        )
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'team.update',
      entity_type: 'profile',
      entity_id: userId,
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.team(), cacheTags.team(userId), cacheTags.me()])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { userId } = await params
    const { supabase, user, profile } = await requirePerm('team:remove')
    await assertProfileExists(supabase, userId)

    // Soft-delete: status=inactive + deleted_at stamp. Auth.users row is left intact.
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'inactive', deleted_at: new Date().toISOString() })
      .eq('id', userId)
      .is('deleted_at', null)
    if (error) throw error

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'team.remove',
      entity_type: 'profile',
      entity_id: userId,
      supabase,
    })

    revalidateAll([cacheTags.team(), cacheTags.team(userId), cacheTags.me()])
    return ok({ id: userId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
