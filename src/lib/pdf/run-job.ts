// Shared pdf.generate job runner.
//
// Renders the PDF for an enqueued `pdf.generate` job, uploads it to Supabase
// Storage at `pdf-renders/<jobId>.pdf`, and marks the job `status='done'` with
// the storage path stuffed into `payload.result_meta` (the download route reads
// it from there).
//
// Used by BOTH:
//   - the cron worker  (/api/cron/jobs-run) — the production path, claims a
//     batch and dispatches by kind, and
//   - the enqueue route (/api/pdf/generate) — the LOCAL-DEV path, which runs
//     the job inline because the Vercel cron never fires on localhost (W34-2:
//     jobs sat `queued` forever → the client's pollJob timed out after 60s).
//
// Throws on render/upload/update error; the caller decides retry vs fail.

import { getAdminClient } from '@/lib/api/admin'
import { renderPdf, isTemplateKey } from '@/lib/pdf/render'
import type { Locale } from '@/lib/pdf/base'
import type { TemplateOptions } from '@/lib/pdf/types'

export interface PdfJobPayload {
  template: string
  data: unknown
  locale?: Locale
  options?: TemplateOptions
  requested_by?: string
}

export async function runPdfGenerateJob(jobId: string, payload: PdfJobPayload): Promise<void> {
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
  const storagePath = `${jobId}.pdf`
  const upload = await admin.storage
    .from('pdf-renders')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
  if (upload.error) throw upload.error

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
    .eq('id', jobId)
  if (updateErr) throw updateErr
}
