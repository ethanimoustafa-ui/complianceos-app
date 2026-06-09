// /api/policy-workflow-step-templates?tier=X — list the seeded default workflow
// steps for an approval tier (migration 080). Read-only; used to pre-fill the
// "Edit Approval Tier" modal so a SEEDED tier's steps can be reviewed and
// customized (the customization is then persisted as a policy_template override
// that the policy CREATE route prefers). The table holds reference/seed data
// and has no RLS, so a plain authenticated read is sufficient.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const tier = req.nextUrl.searchParams.get('tier')
    const { supabase } = await requireUser()
    if (!tier) return ok([], { cache: 'no-store' })

    const { data, error } = await supabase
      .from('policy_workflow_step_templates')
      .select('step, description, action_type, sort_order')
      .eq('tier', tier)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
