// GET /api/audits/[auditId]/cycles/[cycleId] — W50: a single archived cycle
// with its full frozen snapshot (read-only rollback view).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; cycleId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { auditId, cycleId } = await params
    assertUuid(auditId)
    assertUuid(cycleId)
    const { supabase } = await requireUser()

    const { data, error } = await supabase
      .from('audit_cycles')
      .select('id, audit_id, cycle_number, closed_at, due_date, status, progress, snapshot')
      .eq('id', cycleId)
      .eq('audit_id', auditId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Cycle ${cycleId} not found`)
    return ok(data, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
