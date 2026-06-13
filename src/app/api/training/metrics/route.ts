// /api/training/metrics — the saudization_metrics SINGLETON row.
//
// Persists the training page's manually-entered metrics (saudization
// headcounts + overall completion % + courses assigned) so "Edit Metrics"
// survives reload. The AI Excel-ingestion pipeline will later write through
// the same row (`last_data_source: 'upload'`).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidate } from '@/lib/api/cache'
import { UpdateTrainingMetricsSchema } from '@/lib/api/schemas/training'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const METRICS_COLUMNS =
  'id, target, actual, total_employees, saudi_employees, by_department, overall_completion, courses_assigned, last_data_source, last_updated, updated_at'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('saudization_metrics')
      .select(METRICS_COLUMNS)
      .eq('singleton', true)
      .maybeSingle()
    if (error) throw error
    // No row yet = nothing ever entered; the client keeps its defaults.
    return ok(data ?? null, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase } = await requirePerm('edit')
    const input = await parseJson(req, UpdateTrainingMetricsSchema)

    // Upsert against the `singleton` unique flag — first manual entry creates
    // the row, every later one updates it.
    const { data, error } = await supabase
      .from('saudization_metrics')
      .upsert(
        { singleton: true, ...input, last_updated: new Date().toISOString() },
        { onConflict: 'singleton' },
      )
      .select(METRICS_COLUMNS)
      .single()
    if (error) throw error

    revalidate(cacheTags.training())
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
