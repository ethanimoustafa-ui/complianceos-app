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
import { buildCircularReportTex } from './render-circular-report'
import { buildPolicyReportTex } from './render-policy-report'
import { buildTrainingReportTex } from './render-training-report'
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
  'circular-report': (data, locale) => buildCircularReportTex(data, locale),
  'policy-report': (data, locale) => buildPolicyReportTex(data, locale),
  'training-compliance-report': (data, locale) => buildTrainingReportTex(data, locale),
}

/**
 * Resolve an uploaded signature image (https URL from the `letter_signatures`
 * bucket, or a data: URI) to a base64 asset for the renderer. Validates PNG/JPEG
 * magic bytes + a size cap; returns null on any failure so the caller skips the
 * image gracefully (the .tex won't reference a missing file).
 */
async function resolveSignatureAsset(url: string): Promise<{ name: string; b64: string } | null> {
  try {
    let bytes: Buffer
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      if (comma < 0) return null
      bytes = Buffer.from(url.slice(comma + 1), 'base64')
    } else {
      const res = await fetch(url)
      if (!res.ok) return null
      bytes = Buffer.from(await res.arrayBuffer())
    }
    if (bytes.length < 8 || bytes.length > 6 * 1024 * 1024) return null
    const isPng =
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if (!isPng && !isJpg) return null
    return { name: isPng ? 'signature.png' : 'signature.jpg', b64: bytes.toString('base64') }
  } catch {
    return null
  }
}

export async function runLatexGenerateJob(jobId: string, payload: LatexJobPayload): Promise<void> {
  const build = BUILDERS[payload?.template]
  if (!build) {
    throw new Error(`pdf.latex: unsupported template '${payload?.template}'`)
  }

  // Resolve an uploaded signature image (sama-letter) to a base64 asset. If it
  // can't be fetched/decoded, drop the field so the builder doesn't reference a
  // missing file.
  let data: unknown = payload.data
  let signatureAsset: { name: string; b64: string } | null = null
  const sigUrl = (payload.data as { signatureImageUrl?: string } | null)?.signatureImageUrl
  if (payload.template === 'sama-letter' && typeof sigUrl === 'string' && sigUrl.trim()) {
    signatureAsset = await resolveSignatureAsset(sigUrl.trim())
    if (!signatureAsset) {
      data = { ...(payload.data as Record<string, unknown>), signatureImageUrl: undefined }
    }
  }

  const { tex, assets, filename } = build(data, payload.locale)
  if (signatureAsset) assets[signatureAsset.name] = signatureAsset.b64

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
