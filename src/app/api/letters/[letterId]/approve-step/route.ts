// POST /api/letters/[letterId]/approve-step
//   body: { step_index: 1|2|3, notes?: string }
// Advances the 3-step approval chain. On final step → status `approved`.
//
// Auth (ownership model — Area B): requireUser() + canDriveWorkflow against the
// letter's creator. The generic 'edit' (officers hold it) no longer grants
// committing an approval step; advancing requires the global 'workflow:advance'
// grant (managers/admins by role; officers via the Access Matrix) OR being the
// letter's CREATOR (created_by).
//
// FLAG — per-step role enforcement NEEDS DESIGN (deliberately NOT implemented):
//   `letter_approval_steps.role` holds human-readable chain roles
//   ('Compliance Officer' / 'Department Head' / 'Compliance Director'), while
//   `profiles.role` holds the 4-tier keys (admin/manager/officer). There is no
//   clean, safe mapping between the two (e.g. is "Department Head" == manager?
//   is "Compliance Director" == admin?), so enforcing "caller's role must match
//   the current step's role" would either be a guess or risk locking people out.
//   Per the Area-B constraint, we gate ONLY on canDriveWorkflow here and leave
//   the chain-role gate for a future design pass (would need a steps.role →
//   profile.role map, or an explicit per-step assigned_to enforcement).
//
// Wave-21: assertUuid + dual-store timeline write.

import type { NextRequest } from 'next/server'
import { canDriveWorkflow, requireUser } from '@/lib/api/auth'
import { callerMeetsStepRole } from '@/lib/letters/letter-approval-roles'
import { Conflict, Forbidden, handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { ApproveStepSchema } from '@/lib/api/schemas/letters'
import {
  LETTER_LIST_COLUMNS,
  assertIsCurrentStep,
  assertLetterExists,
  getApprovalSteps,
  insertLetterTimeline,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ letterId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { letterId: letterIdParam } = await params
    // W26-C param parity: resolve UUID or reference → canonical UUID.
    const ctx = await requireUser()
    const { supabase, user, profile } = ctx
    const letterId = await assertLetterExists(supabase, letterIdParam)
    const body = await parseJson(req, ApproveStepSchema)

    const { data: letter, error: lErr } = await supabase
      .from('letters')
      .select('id, status, created_by')
      .eq('id', letterId)
      .is('deleted_at', null)
      .maybeSingle<{ id: string; status: string; created_by: string | null }>()
    if (lErr) throw lErr
    if (!letter) throw NotFound(`Letter ${letterId} not found`)
    // RBAC (ownership model): committing an approval step requires the global
    // 'workflow:advance' grant OR being the letter's CREATOR. See the FLAG above
    // re: per-step chain-role enforcement (intentionally not gated here).
    if (!canDriveWorkflow(ctx, letter.created_by)) {
      throw Forbidden('Missing permission: workflow:advance (or letter ownership)')
    }
    if (letter.status !== 'pending-approval') {
      throw Conflict(`Cannot approve in status ${letter.status}`)
    }

    const steps = await getApprovalSteps(supabase, letterId)
    if (steps.length === 0) throw Conflict('No approval steps configured')
    assertIsCurrentStep(steps, body.step_index)

    // Separation of duties: in addition to being able to drive the letter
    // (checked above), the caller's role must satisfy THIS step's required role
    // (hierarchy; admin clears every step). e.g. an officer may commit a
    // "Compliance Officer" step but a "Department Head" step needs a manager+.
    const { data: stepRow } = await supabase
      .from('letter_approval_steps')
      .select('role')
      .eq('letter_id', letterId)
      .eq('step', body.step_index)
      .maybeSingle<{ role: string | null }>()
    if (!callerMeetsStepRole(profile.role, stepRow?.role)) {
      throw Forbidden(`This approval step requires the '${stepRow?.role ?? 'appropriate'}' role`)
    }

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('letter_approval_steps')
      .update({ status: 'approved', approved_at: now, notes: body.notes ?? null })
      .eq('letter_id', letterId)
      .eq('step', body.step_index)
    if (updErr) throw updErr

    // If this was the last step → set letter status to 'approved'.
    const remainingPending = steps.filter(
      (s) => s.step !== body.step_index && s.status === 'pending',
    )
    let letterAfter: Record<string, unknown> | null = null
    if (remainingPending.length === 0) {
      const { data, error } = await supabase
        .from('letters')
        .update({ status: 'approved' })
        .eq('id', letterId)
        .select(LETTER_LIST_COLUMNS)
        .single()
      if (error) throw error
      letterAfter = data as Record<string, unknown>
    } else {
      const { data } = await supabase
        .from('letters')
        .select(LETTER_LIST_COLUMNS)
        .eq('id', letterId)
        .maybeSingle()
      letterAfter = data as Record<string, unknown>
    }

    const actor = profile.name ?? profile.email ?? user.id
    const isLastStep = remainingPending.length === 0

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: actor,
        action: 'letter.approval_step_committed',
        entity_type: 'letter',
        entity_id: letterId,
        metadata: { step: body.step_index, decision: 'approved' },
        supabase,
      }),
      // Wave-21 P6 fix — dual-store timeline write with step number interpolation.
      insertLetterTimeline(
        supabase,
        letterId,
        isLastStep ? 'letters.letterAllStepsApproved' : 'letters.letterStepApproved',
        { step: String(body.step_index) },
        actor,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(letterId)])
    return ok(letterAfter)
  } catch (e) {
    return handle(e)
  }
}
