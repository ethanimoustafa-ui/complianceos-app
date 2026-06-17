// Server-side helper to enqueue an `email.send` job.
//
// Used by notification mirroring (Phase 2) and the escalation engine (Phase 3),
// plus the `/api/email/test` route. Wraps the `jobs` insert and adds two things
// the raw insert doesn't give you:
//
//   • Idempotent dedup — pass `idempotencyKey` and the table's
//     `unique(kind, idempotency_key)` constraint guarantees the same email is
//     never queued twice (e.g. don't re-send the "3 days left" reminder if the
//     scan runs again). A duplicate is reported as `{ deduped: true }`.
//   • Local-dev inline send — Vercel Cron never fires on localhost, so a queued
//     job would sit forever. When not on Vercel (and the service-role key is
//     present), due jobs are processed inline, exactly like /api/pdf/generate.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { runEmailSendJob, type EmailJobPayload } from './run-email-job'

export interface EnqueueEmailInput extends EmailJobPayload {
  /** Dedup key — same (kind, key) is only ever enqueued once. */
  idempotencyKey?: string
  /** Delay delivery until this time (used by tiered escalation reminders). */
  scheduledFor?: string | Date
}

export interface EnqueueEmailResult {
  jobId: string | null
  deduped: boolean
}

export async function enqueueEmail(
  client: SupabaseClient,
  input: EnqueueEmailInput,
): Promise<EnqueueEmailResult> {
  const { idempotencyKey, scheduledFor, ...payload } = input

  const scheduledIso =
    scheduledFor instanceof Date ? scheduledFor.toISOString() : scheduledFor

  const row: Record<string, unknown> = { kind: 'email.send', payload }
  if (idempotencyKey) row.idempotency_key = idempotencyKey
  if (scheduledIso) row.scheduled_for = scheduledIso

  const { data: job, error } = await client
    .from('jobs')
    .insert(row)
    .select('id')
    .single<{ id: string }>()

  if (error) {
    // Unique (kind, idempotency_key) violation → already enqueued; not an error.
    if ((error as { code?: string }).code === '23505' && idempotencyKey) {
      return { jobId: null, deduped: true }
    }
    throw error
  }

  // Local-dev inline processing (see /api/pdf/generate for the rationale).
  // Only run jobs that are actually due now — future-scheduled reminders wait.
  const dueNow = !scheduledIso || new Date(scheduledIso).getTime() <= Date.now()
  if (!process.env.VERCEL && hasServiceRole() && dueNow) {
    try {
      await runEmailSendJob(job.id, payload as EmailJobPayload)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'email send failed'
      await getAdminClient()
        .from('jobs')
        .update({ status: 'failed', error: message })
        .eq('id', job.id)
      console.error(`[email/enqueue] inline send failed for job ${job.id}:`, e)
    }
  }

  return { jobId: job.id, deduped: false }
}
