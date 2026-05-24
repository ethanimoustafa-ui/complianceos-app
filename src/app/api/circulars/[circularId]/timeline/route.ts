// GET  /api/circulars/[circularId]/timeline — read-only timeline feed.
// POST /api/circulars/[circularId]/timeline — append one activity-log row.
//
// GAP-15: GET supports `?offset=&limit=` for newest-first paginated "Load
// More". Returns `{ items, hasMore }`. When the query has no offset/limit
// params the route still returns the same envelope (first `limit` rows).
//
// W15-2: POST appends a single activity-log row — used by the per-step Undo
// affordance to record that a workflow-step mutation was reverted. The body
// carries an i18n `key` + `params`; the server resolves it to both English
// and Arabic via `renderBilingual` and persists the dual-store columns
// (Wave-19.1 / Q8). The author is the acting user (`profile.name`).

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { assertUuid, parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import {
  TIMELINE_COLUMNS,
  assertCircularExists,
  insertCircularTimeline,
} from '@/lib/api/services/circulars'
// Wave-19.1 / Q8 — server-side bilingual renderer for dual-store timeline rows.
import { renderBilingual } from '@/lib/i18n/server'

const CreateTimelineRowSchema = z.object({
  // Wave-19.1 / Q8 — i18n key + params for dual-store rendering.
  key: z.string().min(1).max(200),
  params: z.record(z.string(), z.string()).optional(),
  status: z.string().max(50).optional(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ circularId: string }> }

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase } = await requireUser()
    await assertCircularExists(supabase, circularId)

    const sp = new URL(req.url).searchParams
    const offset = Math.max(0, Number(sp.get('offset')) || 0)
    const rawLimit = Number(sp.get('limit')) || DEFAULT_LIMIT
    const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit))

    // Fetch one extra row to cheaply detect whether more rows remain.
    const { data, error } = await supabase
      .from('circular_timeline')
      .select(TIMELINE_COLUMNS)
      .eq('circular_id', circularId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit)
    if (error) throw error

    const rows = data ?? []
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    return ok({ items, hasMore }, { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { circularId } = await params
    assertUuid(circularId) // SEC-5
    const { supabase, user, profile } = await requirePerm('edit')
    await assertCircularExists(supabase, circularId)
    const input = await parseJson(req, CreateTimelineRowSchema)
    const actor = profile.name ?? profile.email ?? user.id

    await insertCircularTimeline(
      supabase,
      circularId,
      renderBilingual(input.key, input.params ?? {}),
      actor,
      input.status ?? 'completed',
    )

    revalidateAll([cacheTags.circulars(), cacheTags.circulars(circularId)])
    return ok({ ok: true }, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
