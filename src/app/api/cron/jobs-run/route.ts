// POST /api/cron/jobs-run  (also GET, for Vercel Cron's default GET trigger)
//
// Worker tick. Vercel Cron calls this every minute (per `vercel.json`).
// Authenticates via `Authorization: Bearer ${CRON_SECRET}` header, claims
// up to `CLAIM_BATCH_SIZE` queued jobs via `public.claim_jobs()`, and
// dispatches each by `kind`. For `pdf.generate` it runs `renderPdf`,
// uploads the buffer to Supabase Storage at `pdf-renders/<jobId>.pdf`,
// then UPDATEs the job to `status='done'` with the storage path stuffed
// into `payload.result_meta` (so the download route can find it).
//
// On error we increment attempts and either re-queue with backoff or
// mark `failed` once `attempts >= max_attempts`. Each job runs in its
// own try/catch so one bad job doesn't abort the batch.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { renderPdf, isTemplateKey } from '@/lib/pdf/render'
import type { Locale } from '@/lib/pdf/base'
import type { TemplateOptions } from '@/lib/pdf/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Max jobs claimed per cron tick. Keep small on free tier (60s function timeout). */
const CLAIM_BATCH_SIZE = 5

interface JobRow {
  id: string
  kind: string
  status: string
  attempts: number
  max_attempts: number
  payload: Record<string, unknown>
  // claim_jobs() sets these but we don't use them here.
}

async function authorized(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Misconfigured environments should refuse to run rather than open
    // the worker to the public internet.
    // eslint-disable-next-line no-console
    console.error('[cron/jobs-run] CRON_SECRET is not set — refusing to run.')
    return false
  }
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const header = req.headers.get('authorization') ?? ''
  if (header === `Bearer ${expected}`) return true
  // Also accept x-vercel-cron token via the same env var for local poking.
  const xCron = req.headers.get('x-cron-secret')
  if (xCron && xCron === expected) return true
  return false
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'invalid cron secret' } }, { status: 403 })
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: { code: 'service_unavailable', message: 'SUPABASE_SERVICE_ROLE_KEY not configured' } },
      { status: 503 },
    )
  }

  const admin = getAdminClient()

  // Claim a batch via the SQL helper (FOR UPDATE SKIP LOCKED).
  const { data: claimed, error: claimErr } = await admin.rpc('claim_jobs', {
    batch_size: CLAIM_BATCH_SIZE,
  })
  if (claimErr) {
    return NextResponse.json(
      { error: { code: 'internal', message: claimErr.message } },
      { status: 500 },
    )
  }

  const jobs = (claimed ?? []) as JobRow[]
  const results: Array<{ id: string; status: 'done' | 'failed' | 'requeued'; error?: string }> = []

  for (const job of jobs) {
    try {
      await dispatch(job)
      results.push({ id: job.id, status: 'done' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error'
      // eslint-disable-next-line no-console
      console.error(`[cron/jobs-run] job ${job.id} (${job.kind}) failed:`, e)

      const failedTerminally = job.attempts >= job.max_attempts
      const nextStatus = failedTerminally ? 'failed' : 'queued'
      // Exponential backoff: 30s, 2m, 8m, ...
      const backoffSeconds = Math.min(2 ** Math.max(0, job.attempts) * 30, 60 * 30)
      const scheduledFor = new Date(Date.now() + backoffSeconds * 1000).toISOString()

      await admin
        .from('jobs')
        .update({
          status: nextStatus,
          error: message,
          scheduled_for: failedTerminally ? undefined : scheduledFor,
        })
        .eq('id', job.id)

      results.push({
        id: job.id,
        status: failedTerminally ? 'failed' : 'requeued',
        error: message,
      })
    }
  }

  return NextResponse.json({ data: { claimed: jobs.length, results } })
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatch by job.kind
// ─────────────────────────────────────────────────────────────────────────

async function dispatch(job: JobRow): Promise<void> {
  switch (job.kind) {
    case 'pdf.generate':
      return runPdfGenerate(job)
    default:
      throw new Error(`Unknown job kind: ${job.kind}`)
  }
}

interface PdfJobPayload {
  template: string
  data: unknown
  locale?: Locale
  options?: TemplateOptions
  requested_by?: string
}

async function runPdfGenerate(job: JobRow): Promise<void> {
  const payload = job.payload as unknown as PdfJobPayload
  if (!payload?.template || !isTemplateKey(payload.template)) {
    throw new Error(`pdf.generate: invalid template '${payload?.template}'`)
  }

  const { buffer, filename } = await renderPdf({
    template: payload.template,
    data: payload.data,
    locale: payload.locale ?? 'en',
    options: payload.options,
  })

  const admin = getAdminClient()
  const storagePath = `${job.id}.pdf`
  const upload = await admin.storage
    .from('pdf-renders')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (upload.error) throw upload.error

  // Merge result_meta into payload (preserve original payload).
  const updatedPayload = {
    ...payload,
    result_meta: { storage_path: storagePath, filename, template: payload.template },
  }

  const { error: updateErr } = await admin
    .from('jobs')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      payload: updatedPayload,
      error: null,
    })
    .eq('id', job.id)
  if (updateErr) throw updateErr
}
