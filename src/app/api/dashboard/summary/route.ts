// GET /api/dashboard/summary — single precomputed KPI blob for the dashboard.
//
// Scalability audit Part 5/6 (.planning/dashboard-rollup-design.md):
// Replaces the dashboard's ~7-endpoint fan-out + client-side counting (which is
// wrong past the page size — finding B2) with ONE indexed point-lookup against
// the `dashboard_rollup` read-model (migration 104). The blob's shape mirrors
// the count-based groups of `DashboardMetrics` so the client can bind directly.
//
// The rollup is kept fresh by a pg_cron job (every minute); this handler just
// reads it. Cold-start safety: if the row is somehow absent, compute it once
// via the service-role client (the refresh function is not exposed to
// `authenticated`) and re-read.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RollupRow {
  data: Record<string, unknown>
  refreshed_at: string
}

async function readOrgRollup(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
): Promise<RollupRow | null> {
  const { data } = await supabase
    .from('dashboard_rollup')
    .select('data, refreshed_at')
    .eq('scope_type', 'org')
    .is('scope_id', null)
    .maybeSingle<RollupRow>()
  return data ?? null
}

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireUser()

    let row = await readOrgRollup(supabase)

    // Cold start: rollup not yet populated. Compute once via service-role, then
    // re-read. (The refresh function is REVOKEd from authenticated.)
    if (!row && hasServiceRole()) {
      await getAdminClient().rpc('refresh_dashboard_rollup')
      row = await readOrgRollup(supabase)
    }

    return ok(
      { scope: 'org', data: row?.data ?? null, refreshed_at: row?.refreshed_at ?? null },
      { cache: 'no-store' },
    )
  } catch (e) {
    return handle(e)
  }
}
