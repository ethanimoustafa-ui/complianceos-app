// /api/letters/approval-chains — W41 configurable per-authority approval chains.
//
//   GET  → list all configured chains (authority → steps)
//   POST → upsert the chain for one authority { authority, steps }
//
// Consumed by the approval-card "Configure" modal (apply-to-authority scope)
// and by submit-for-approval seeding via resolveApprovalChain().

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { writeAudit } from '@/lib/api/audit'
import { UpsertApprovalChainSchema } from '@/lib/api/schemas/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, authority, steps, updated_at'

export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('letter_approval_chains')
      .select(COLS)
      .order('authority', { ascending: true })
    if (error) throw error
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('edit')
    const input = await parseJson(req, UpsertApprovalChainSchema)

    // Normalize: lowercase authority, steps renumbered 1..n in given order.
    const authority = input.authority.toLowerCase()
    const steps = input.steps
      .slice()
      .sort((a, b) => a.step - b.step)
      .map((s, i) => ({ step: i + 1, role: s.role }))

    const { data, error } = await supabase
      .from('letter_approval_chains')
      .upsert({ authority, steps }, { onConflict: 'authority' })
      .select(COLS)
      .single()
    if (error || !data) throw error ?? NotFound('Upsert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'letter.approval_chain.configure',
      entity_type: 'letter_approval_chain',
      entity_id: (data as { id: string }).id,
      metadata: { authority, steps },
      supabase,
    })

    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
