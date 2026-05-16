// GET /api/letters/[letterId]/timeline — read-only timeline feed.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { assertLetterExists } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    const { supabase } = await requireUser()
    await assertLetterExists(supabase, letterId)

    const { data, error } = await supabase
      .from('letter_timeline')
      .select('id, letter_id, title, date, user_name, status')
      .eq('letter_id', letterId)
      .order('date', { ascending: false })
    if (error) throw error

    return ok(data ?? [], {
      cache: { sMaxAge: 30, tags: [cacheTags.letterTimeline(letterId)] },
    })
  } catch (e) {
    return handle(e)
  }
}
