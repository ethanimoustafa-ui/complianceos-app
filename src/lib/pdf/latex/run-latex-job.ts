// Shared `pdf.latex` job runner.
//
// Mirrors `runPdfGenerateJob` (src/lib/pdf/run-job.ts) but renders via the
// external xelatex service instead of @react-pdf/renderer. Builds the .tex,
// compiles it remotely, uploads the PDF to Supabase Storage at
// `pdf-renders/<jobId>.pdf`, and marks the job `done` with the storage path in
// `payload.result_meta` — the SAME bucket + key + shape as the React-PDF path,
// so `/api/pdf/download/[jobId]` needs ZERO changes.
//
// Used by BOTH the cron worker (/api/cron/jobs-run, production) and the
// /api/pdf/generate dev-inline path (Vercel cron never fires on localhost).
//
// Throws on build/compile/upload/update error; the caller decides retry vs fail.

import { getAdminClient } from '@/lib/api/admin'
import { buildSamaLetterTex } from './render-sama-letter'
import { buildComplianceReportTex } from './render-compliance-report'
import { buildObservationReportTex } from './render-observation-report'
import { buildRiskRegisterTex } from './render-risk-report'
import { buildAuditReportTex } from './render-audit-report'
import type { LatexLocale } from './report-base'
import { compileLatex } from './client'

export interface LatexJobPayload {
  template: string
  data: unknown
  locale?: LatexLocale
  options?: Record<string, unknown>
  requested_by?: string
}

interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

// Registry of LaTeX template builders, keyed by template id. Each builder
// validates its own `data` (Zod) and applies its own default locale.
const BUILDERS: Record<string, (data: unknown, locale?: LatexLocale) => BuiltTex> = {
  'sama-letter': (data, locale) => buildSamaLetterTex(data, locale),
  'compliance-report': (data, locale) => buildComplianceReportTex(data, locale),
  'observation-list': (data, locale) => buildObservationReportTex(data, locale),
  'risk-register': (data, locale) => buildRiskRegisterTex(data, locale),
  'audit-report': (data, locale) => buildAuditReportTex(data, locale),
}

export async function runLatexGenerateJob(jobId: string, payload: LatexJobPayload): Promise<void> {
  const build = BUILDERS[payload?.template]
  if (!build) {
    throw new Error(`pdf.latex: unsupported template '${payload?.template}'`)
  }

  const { tex, assets, filename } = build(payload.data, payload.locale)
  const buffer = await compileLatex({ tex, assets })

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
