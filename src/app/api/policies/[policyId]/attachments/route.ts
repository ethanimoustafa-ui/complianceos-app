// /api/policies/[policyId]/attachments — list + register attachment metadata.
//
// Storage upload happens client-side against a Supabase bucket; this endpoint
// persists the resulting metadata row. Wave-18 hardening: SEC-10 basename
// sanitization, assertUuid, no-store cache.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { CreatePolicyAttachmentSchema } from '@/lib/api/schemas/policies'
import { safeBasename } from '@/lib/api/sanitize'
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
    assertUuid(policyId)
    const { supabase } = await requireUser()
    const uuid = await assertPolicyExists(supabase, policyId)
    const { data, error } = await supabase
      .from('policy_attachments')
      .select(POLICY_ATTACHMENT_COLUMNS)
      .eq('policy_id', uuid)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    assertUuid(policyId)
    const { supabase, user, profile } = await requirePerm('edit')
    const uuid = await assertPolicyExists(supabase, policyId)
    const input = await parseJson(req, CreatePolicyAttachmentSchema)

    // SEC-10: reduce the user-supplied name to a safe basename
    // (path-traversal defence).
    const safeName = safeBasename(input.name)

    const { data, error } = await supabase
      .from('policy_attachments')
      .insert({
        policy_id: uuid,
        name: safeName,
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
        metadata: { policy_id: uuid, name: safeName },
        supabase,
      }),
      writePolicyActivity({
        supabase,
        policy_id: uuid,
        type: 'attachment_added',
        text_en: `Attachment "${safeName}" added`,
        text_ar: `تمت إضافة المرفق "${safeName}"`,
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
