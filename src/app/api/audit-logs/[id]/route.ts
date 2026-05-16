// /api/audit-logs/[id] — read one row from the global audit log.

import type { NextRequest } from 'next/server'
import { requirePerm } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { AUDIT_LOG_COLUMNS } from '@/lib/api/services/audit-logs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const { supabase } = await requirePerm('audit:view')
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      throw NotFound(`Audit log row ${id} not found`)
    }
    const { data, error } = await supabase
      .from('audit_logs')
      .select(AUDIT_LOG_COLUMNS)
      .eq('id', numericId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Audit log row ${id} not found`)
    return ok(data, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
