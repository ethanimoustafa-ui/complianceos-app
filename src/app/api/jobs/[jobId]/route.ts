// GET /api/jobs/[jobId] — current status of a background job.
//
// Used by clients polling after enqueueing a long-running operation (e.g.
// compliance.recompute, pdf.generate). No client-side POST — jobs are
// enqueued by other handlers internally; the cron worker tick endpoint
// arrives in Phase 9.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { JOB_COLUMNS } from '@/lib/api/services/jobs'
import { JobIdParam } from '@/lib/api/schemas/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jobId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params
    const parsed = JobIdParam.safeParse(jobId)
    if (!parsed.success) throw NotFound(`Job ${jobId} not found`)

    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('jobs')
      .select(JOB_COLUMNS)
      .eq('id', parsed.data)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound(`Job ${jobId} not found`)
    return ok(data, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
