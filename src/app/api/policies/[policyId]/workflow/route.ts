// GET /api/policies/[policyId]/workflow — list workflow steps.
// POST is exposed at /workflow/advance (see sibling route).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import {
  POLICY_WORKFLOW_STEP_COLUMNS,
  assertPolicyExists,
} from '@/lib/api/services/policies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ policyId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { policyId } = await params
    const { supabase } = await requireUser()
    await assertPolicyExists(supabase, policyId)

    const { data, error } = await supabase
      .from('policy_workflow_steps')
      .select(POLICY_WORKFLOW_STEP_COLUMNS)
      .eq('policy_id', policyId)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 60, tags: [cacheTags.policies(policyId)] },
    })
  } catch (e) {
    return handle(e)
  }
}
