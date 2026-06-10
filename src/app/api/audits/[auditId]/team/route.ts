// /api/audits/[auditId]/team — list & add audit team members.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { AddAuditTeamMemberSchema } from '@/lib/api/schemas/audits'
import {
  AUDIT_TEAM_MEMBER_COLUMNS,
  assertAuditExists,
} from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    assertUuid(auditId)
    const { supabase } = await requireUser()
    await assertAuditExists(supabase, auditId)

    const { data, error } = await supabase
      .from('audit_team_members')
      .select(AUDIT_TEAM_MEMBER_COLUMNS)
      .eq('audit_id', auditId)
      .order('added_at', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      // FORENSIC §4 / W45: no-store — sMaxAge served stale children post-write.
      cache: 'no-store',
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { auditId } = await params
    assertUuid(auditId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)
    const input = await parseJson(req, AddAuditTeamMemberSchema)

    const { data, error } = await supabase
      .from('audit_team_members')
      .insert({
        audit_id: auditId,
        user_id: input.user_id,
        role: input.role,
        is_owner: input.is_owner ?? false,
      })
      .select(AUDIT_TEAM_MEMBER_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    void writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'audit.team.add',
      entity_type: 'audit_team_member',
      entity_id: created.id,
      metadata: { audit_id: auditId, user_id: input.user_id, role: input.role },
      supabase,
    })

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
