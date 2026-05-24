// GET /api/letters/[letterId]/timeline — read-only timeline feed.
//
// Wave-21: assertUuid + cache:'no-store' + select text_en/text_ar dual-store
//          columns (migration 065).

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid } from '@/lib/api/validate'
import { assertLetterExists } from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { letterId } = await params
    assertUuid(letterId)
    const { supabase } = await requireUser()
    await assertLetterExists(supabase, letterId)

    const { data, error } = await supabase
      .from('letter_timeline')
      // Wave-21: select both dual-store columns so the client can pick the
      // locale-appropriate one without an additional fetch.
      .select('id, letter_id, title, text_en, text_ar, date, user_name, status')
      .eq('letter_id', letterId)
      .order('date', { ascending: false })
    if (error) throw error

    // PORTING-TEMPLATE §2.2 — cache:'no-store' on entity reads.
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}
