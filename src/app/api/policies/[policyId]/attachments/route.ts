// /api/policies/[policyId]/attachments — list + register attachment metadata.
//
// Storage upload happens client-side against a Supabase bucket; this endpoint
// just persists the resulting metadata row. Mirrors the
// /api/correspondence/[id]/attachments shape.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyAttachmentSchema } from '@/lib/api/schemas/policies'
import {
  POLICY_ATTACHMENT_COLUMNS,
  assertPolicyExists,
  writePolicyActivity,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_attachments')
      .select(POLICY_ATTACHMENT_COLUMNS)
      .eq('policy_id', uuid)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.policyAttachments(uuid)] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, CreatePolicyAttachmentSchema)

    const { data, error } = await supabase
      .from('policy_attachments')
      .insert({
        policy_id: uuid,
        name: input.name,
        storage_path: input.storage_path,
        size: input.size ?? null,
        uploaded_by: user.id,
      })
      .select(POLICY_ATTACHMENT_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Insert returned no row')

    const created = data as { id: string }
    const actor = profile.name ?? profile.email ?? user.id

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'policy.attachment.register',
        entity_type: 'policy_attachment',
        entity_id: created.id,
        metadata: { policy_id: uuid, name: input.name },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'attachment_added',
        text_en: `Attachment "${input.name}" added`,
        text_ar: `تمت إضافة المرفق "${input.name}"`,
        user_name: actor,
      }),
    ])

    revalidateAll([
      cacheTags.policies(),
      cacheTags.policies(uuid),
      cacheTags.policyAttachments(uuid),
    ])
    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
