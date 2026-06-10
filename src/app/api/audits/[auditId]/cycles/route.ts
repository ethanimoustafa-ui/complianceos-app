// GET /api/audits/[auditId]/cycles — W50: archived cycle summaries
// (newest-first). The full frozen snapshot ships from the per-cycle route.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { assertAuditExists } from '@/lib/api/services/audits'

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
      .from('audit_cycles')
      .select('id, cycle_number, closed_at, due_date, status, progress, snapshot')
      .eq('audit_id', auditId)
      .order('cycle_number', { ascending: false })
    if (error) throw error

    // Summaries only — counts derived from the snapshot, snapshot stripped.
    const rows = (data ?? []).map((r) => {
      const snap = (r.snapshot ?? {}) as {
        tasks?: unknown[]
        documents?: unknown[]
        comments?: unknown[]
      }
      return {
        id: r.id,
        cycle_number: r.cycle_number,
        closed_at: r.closed_at,
        due_date: r.due_date,
        status: r.status,
        progress: r.progress,
        counts: {
          tasks: snap.tasks?.length ?? 0,
          documents: snap.documents?.length ?? 0,
          comments: snap.comments?.length ?? 0,
        },
      }
    })
    return ok(rows, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
