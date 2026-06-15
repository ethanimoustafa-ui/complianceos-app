// GET /api/dashboard/workload — live per-member assignment counts for the Team
// Workload widgets (Executive / Managerial / Officer).
//
// Phase B: replaces the client-side fan-out where useWorkload/useTeamWorkloads
// read 8 entity stores in the browser (which under-counted on the Executive
// view once it stopped hydrating those stores). The % formula stays client-side
// (it needs per-member burnoutSince + manual assignments); this returns just the
// 8 server-computed counts per member.
//
// compute_team_workload() is SECURITY DEFINER and REVOKEd from authenticated, so
// it's invoked via the service-role admin client (mirrors the rollup refresh).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    await requireUser() // auth gate

    // Without a service-role key the aggregator isn't callable; degrade to empty
    // (widgets fall back to the member's stored workload) rather than error.
    if (!hasServiceRole()) {
      return ok({ workloads: {} }, { cache: 'no-store' })
    }

    const { data, error } = await getAdminClient().rpc('compute_team_workload')
    if (error) throw error
    return ok({ workloads: data ?? {} }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
