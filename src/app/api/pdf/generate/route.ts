// POST /api/pdf/generate
//
// Enqueues a `pdf.generate` job and returns `{ jobId }`. Per
// BACKEND-API-MAP §13.2 PDF generation is ALWAYS async on Vercel free
// tier — the body shape would otherwise time-out a long-running compile.
//
// Frontend polls `GET /api/jobs/[jobId]` until status='done', then
// downloads via `GET /api/pdf/download/[jobId]`.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { TEMPLATE_KEYS } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TemplateKeySchema = z.enum(TEMPLATE_KEYS as [string, ...string[]])

const GeneratePdfBodySchema = z.object({
  template: TemplateKeySchema,
  // Validated server-side inside `renderPdf` against the template's schema.
  data: z.unknown(),
  locale: z.enum(['en', 'ar']).default('en'),
  options: z
    .object({
      orientation: z.enum(['portrait', 'landscape']).optional(),
      includeCharts: z.boolean().optional(),
      includeSummary: z.boolean().optional(),
      watermark: z.string().max(40).optional(),
      filenameHint: z.string().max(200).optional(),
    })
    .partial()
    .optional(),
})

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser()
    const body = await parseJson(req, GeneratePdfBodySchema)

    // Enqueue a pdf.generate job. The cron worker picks it up, calls
    // renderPdf, uploads to Storage, and marks status='done'.
    const payload = {
      template: body.template,
      data: body.data,
      locale: body.locale,
      options: body.options ?? {},
      requested_by: user.id,
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({ kind: 'pdf.generate', payload })
      .select('id')
      .single<{ id: string }>()

    if (error || !job) throw error ?? new Error('failed to enqueue pdf job')

    return ok({ jobId: job.id }, { status: 202 })
  } catch (e) {
    return handle(e)
  }
}
