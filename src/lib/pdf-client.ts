// Browser-side PDF helpers.
//
//   requestPdf({ template, data, locale })   -> enqueues + returns { jobId }
//   pollJob(jobId)                            -> resolves with terminal status
//   generatePdf({ ... })                      -> request -> poll -> blob
//   downloadPdf({ ... }, filename)            -> generatePdf + browser save
//
// The cron worker on the server picks up the enqueued job, renders, and
// stashes the PDF in Supabase Storage. The download endpoint streams it.

export type PdfTemplateKey =
  | 'sama-letter'
  | 'audit-report'
  | 'compliance-report'
  | 'risk-register'
  | 'observation-list'
  | 'policy-export'
  | 'correspondence-tracker'
  | 'training-report'
  | 'calendar-export'
  | 'circular-report'
  | 'policy-report'
  | 'training-compliance-report'

export type PdfLocale = 'en' | 'ar'

export interface PdfRequestOptions {
  template: PdfTemplateKey
  data: unknown
  locale?: PdfLocale
  options?: {
    orientation?: 'portrait' | 'landscape'
    includeCharts?: boolean
    includeSummary?: boolean
    watermark?: string
    filenameHint?: string
    /** 'latex' renders via the xelatex microservice instead of @react-pdf. */
    engine?: 'latex' | 'react-pdf'
  }
}

export interface JobStatus {
  id: string
  kind: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'dead'
  attempts: number
  error: string | null
  payload?: Record<string, unknown>
  completed_at?: string | null
}

export class PdfError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'PdfError'
  }
}

/** Enqueue a PDF job. Returns `{ jobId }`. */
export async function requestPdf(opts: PdfRequestOptions): Promise<{ jobId: string }> {
  const res = await fetch('/api/pdf/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      template: opts.template,
      data: opts.data,
      locale: opts.locale ?? 'en',
      options: opts.options,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new PdfError(body?.error?.message ?? `PDF request failed: ${res.status}`, body)
  }
  const json = (await res.json()) as { data: { jobId: string } }
  return { jobId: json.data.jobId }
}

export interface PollOptions {
  /** Total wait, ms. Default 60_000. */
  timeoutMs?: number
  /** Poll interval, ms. Default 2000. */
  intervalMs?: number
  /** AbortSignal — stop polling on demand. */
  signal?: AbortSignal
}

/** Poll the job until terminal status. Rejects on `failed` / `dead` / timeout. */
export async function pollJob(jobId: string, opts: PollOptions = {}): Promise<JobStatus> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const intervalMs = opts.intervalMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new PdfError('PDF polling aborted')

    const res = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
    if (!res.ok) {
      // 404 / 401: terminal; anything else: surface as PdfError.
      const body = await res.json().catch(() => ({}))
      throw new PdfError(body?.error?.message ?? `Job poll failed: ${res.status}`, body)
    }
    const json = (await res.json()) as { data: JobStatus }
    const status = json.data

    if (status.status === 'done') return status
    if (status.status === 'failed' || status.status === 'dead') {
      throw new PdfError(status.error ?? 'PDF render failed', status)
    }
    await sleep(intervalMs)
  }
  throw new PdfError(`PDF job ${jobId} timed out after ${timeoutMs}ms`)
}

/** Convenience: enqueue + poll + fetch binary. Returns a Blob. */
export async function generatePdf(opts: PdfRequestOptions, poll?: PollOptions): Promise<Blob> {
  const { jobId } = await requestPdf(opts)
  await pollJob(jobId, poll)
  const res = await fetch(`/api/pdf/download/${jobId}`, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new PdfError(body?.error?.message ?? `PDF download failed: ${res.status}`, body)
  }
  return res.blob()
}

/** Convenience: trigger a browser-side download. */
export async function downloadPdf(
  opts: PdfRequestOptions,
  filename: string,
  poll?: PollOptions,
): Promise<void> {
  const blob = await generatePdf(opts, poll)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
