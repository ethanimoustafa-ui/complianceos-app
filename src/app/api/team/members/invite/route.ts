// /api/team/members/invite — admin-creates-user via Supabase Auth admin API.
//
// Requires `SUPABASE_SERVICE_ROLE_KEY` to be set; otherwise returns 503.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { ApiError, handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { InviteMemberSchema } from '@/lib/api/schemas/team'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function randomPassword(): string {
  // 24 bytes → 32 chars base64; meets Supabase Auth requirements.
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function POST(req: NextRequest) {
  try {
    if (!hasServiceRole()) {
      throw new ApiError(
        'internal',
        503,
        'service_unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured — invite disabled',
      )
    }
    const { user, profile } = await requirePerm('team:invite')
    const input = await parseJson(req, InviteMemberSchema)

    const admin = getAdminClient()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: input.email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { name: input.name },
    })
    if (createErr || !created.user) throw new ApiError('conflict', 409, createErr?.message ?? 'createUser failed')

    const newUserId = created.user.id

    // Insert the profile row (auth trigger may also seed it; upsert defensively).
    const { error: profErr } = await admin
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          email: input.email,
          name: input.name,
          role: input.role_key,
          department_id: input.department_id ?? null,
          phone: input.phone ?? null,
          status: 'pending',
          invited_by: user.id,
        },
        { onConflict: 'id' },
      )
    if (profErr) throw profErr

    // Insert the user_roles row.
    await admin
      .from('user_roles')
      .upsert(
        { user_id: newUserId, role_key: input.role_key, granted_by: user.id },
        { onConflict: 'user_id,role_key' },
      )

    // Optional explicit permission grants.
    if (input.permissions && input.permissions.length > 0) {
      await admin
        .from('user_permissions')
        .upsert(
          input.permissions.map((permission_key) => ({
            user_id: newUserId,
            permission_key,
            granted: true,
            granted_by: user.id,
          })),
          { onConflict: 'user_id,permission_key' },
        )
    }

    // Send the password-reset (recovery) email so they can set a real password.
    // Failures here don't roll back the user; we just log.
    try {
      await admin.auth.resetPasswordForEmail(input.email)
    } catch (e) {
      console.warn('[team/invite] resetPasswordForEmail failed (non-fatal):', e)
    }

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'team.invite',
      entity_type: 'profile',
      entity_id: newUserId,
      metadata: { email: input.email, role: input.role_key },
    })

    revalidateAll([cacheTags.team(), cacheTags.team(newUserId)])
    return ok(
      {
        id: newUserId,
        email: input.email,
        name: input.name,
        role: input.role_key,
        status: 'pending',
      },
      { status: 201 },
    )
  } catch (e) {
    return handle(e)
  }
}
