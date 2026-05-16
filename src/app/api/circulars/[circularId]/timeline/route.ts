// GET /api/circulars/[circularId]/timeline — read-only timeline feed.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { TIMELINE_COLUMNS, assertCircularExists } from '@/lib/api/services/circulars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const { data, error } = await supabase
      .from('circular_timeline')
      .select(TIMELINE_COLUMNS)
      .eq('circular_id', circularId)
      .order('date', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 30, tags: [cacheTags.circularTimeline(circularId)] },
    })
  } catch (e) {
    return handle(e)
  }
}
