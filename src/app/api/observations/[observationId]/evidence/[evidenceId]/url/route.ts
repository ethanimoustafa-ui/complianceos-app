// GET /api/observations/[observationId]/evidence/[evidenceId]/url
//
// Mints a short-lived signed URL so ANY authenticated user with access to the
// observation (reviewers, leaders, admins — not just the uploader) can open a
// remediation/evidence document. The `observation_documents` storage bucket is
// private with owner-only RLS (`owner = auth.uid()`), so a reviewer's own
// session client cannot sign a URL for a file someone else uploaded. We mint it
// with the service-role client (bypasses storage RLS) after verifying the row
// belongs to the observation. Falls back to the user client when the service
// role key is absent (then only the uploader can sign — degraded but safe).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { assertObservationExists } from '@/lib/api/services/observations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OBSERVATION_DOCUMENTS_BUCKET = 'observation_documents'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour — long enough to open/download.

type Params = { params: Promise<{ observationId: string; evidenceId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { observationId: observationIdParam, evidenceId } = await params
    assertUuid(evidenceId)
    const { supabase } = await requireUser()
    const observationId = await assertObservationExists(supabase, observationIdParam)

    // Look up the document row (scoped to the observation) via the user client —
    // reading the metadata row is governed by table RLS, which already lets any
    // observation viewer see the evidence list.
    const { data: doc, error } = await supabase
      .from('observation_documents')
      .select('id, name, storage_path')
      .eq('id', evidenceId)
      .eq('observation_id', observationId)
      .maybeSingle<{ id: string; name: string; storage_path: string }>()
    if (error) throw error
    if (!doc) throw NotFound(`Document ${evidenceId} not found`)
    if (!doc.storage_path) {
      // Legacy / metadata-only rows have no real file behind them.
      throw NotFound('This document has no stored file to open.')
    }

    // Service-role client bypasses the owner-only storage RLS so reviewers can
    // sign a URL for files uploaded by the assignee. Fall back to the user
    // client (uploader-only) when no service role is configured.
    const signer = hasServiceRole() ? getAdminClient() : supabase
    const { data: signed, error: signErr } = await signer.storage
      .from(OBSERVATION_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS)
    if (signErr || !signed?.signedUrl) {
      throw signErr ?? NotFound('Could not generate a link for this document.')
    }

    return ok({ url: signed.signedUrl, name: doc.name }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
