// /api/audits/[auditId]/team/[memberId] — remove a team member.
// W26-A: assertUuid on both params + dual-store timeline.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { assertAuditExists, insertAuditTimeline } from '@/lib/api/services/audits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; memberId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { auditId, memberId } = await params
    // SEC-5: validate both route params.
    assertUuid(auditId, memberId)
    const { supabase, user, profile } = await requirePerm('audit:edit')
    await assertAuditExists(supabase, auditId)

    // `memberId` from the URL may be either the `audit_team_members.id`
    // (preferred — what the API returns) or the `user_id` (what the client
    // store currently stores in `member.id`). Match either so legacy callers
    // keep working until the store is fully migrated.
    const { error } = await supabase
      .from('audit_team_members')
      .delete()
      .eq('audit_id', auditId)
      .or(`id.eq.${memberId},user_id.eq.${memberId}`)
    if (error) throw error

    const actorName = profile.name ?? profile.email ?? user.id
    void Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actorName,
        action: 'audit.team.remove',
        entity_type: 'audit_team_member',
        entity_id: memberId,
        metadata: { audit_id: auditId },
        supabase,
      }),
      insertAuditTimeline({
        auditId,
        action: 'team.removed',
        i18nKey: 'auditDetail.activityRemovedTeamMember',
        params: {},
        userId: user.id,
        userName: actorName,
        metadata: { member_id: memberId },
        supabase,
      }),
    ])

    revalidateAll([cacheTags.audits(), cacheTags.audits(auditId)])
    return ok({ id: memberId, deleted: true })
  } catch (e) {
    return handle(e)
  }
}
