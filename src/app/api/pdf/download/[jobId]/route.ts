// GET /api/pdf/download/[jobId]
//
// Streams a previously-rendered PDF back to the caller. Verifies the job
// exists, is done, and (per BACKEND-API-MAP §13.2 / single-tenant MVP)
// the caller is authenticated. The worker uploaded the rendered file to
// the `pdf-renders` bucket at key `<jobId>.pdf`.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle, NotFound, ApiError } from '@/lib/api/errors'
import { JobIdParam } from '@/lib/api/schemas/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jobId: string }> }

interface PdfJobResult {
  storage_path?: string
  filename?: string
  template?: string
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { jobId } = await params
    const parsed = JobIdParam.safeParse(jobId)
    if (!parsed.success) throw NotFound(`Job ${jobId} not found`)

    const { supabase, user } = await requireUser()

    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, kind, status, payload, error')
      .eq('id', parsed.data)
      .maybeSingle()
    if (error) throw error
    if (!job) throw NotFound(`Job ${jobId} not found`)

    const j = job as {
      id: string
      kind: string
      status: string
      payload: Record<string, unknown>
      error: string | null
    }

    if (j.kind !== 'pdf.generate' && j.kind !== 'pdf.latex') {
      throw NotFound(`Job ${jobId} is not a PDF job`)
    }
    if (j.status === 'failed' || j.status === 'dead') {
      throw new ApiError('internal', 500, j.error ?? 'PDF render failed')
    }
    if (j.status !== 'done') {
      throw new ApiError('conflict', 409, `Job not ready (status=${j.status})`)
    }

    // Ownership: MVP is single-tenant + authenticated-readable bucket,
    // but we still enforce that anonymous callers cannot pull arbitrary
    // PDFs. The cron worker stamps `payload.requested_by` on insert.
    const requestedBy = (j.payload as { requested_by?: string } | null)?.requested_by
    if (requestedBy && requestedBy !== user.id) {
      // Allow audit-viewers to read org-wide reports.
      // Permission check is loaded by requireUser; we just need access here.
      // For MVP we permit all authenticated reads (matches bucket policy),
      // but log who pulled what. A full check belongs in Phase 8 audit work.
      console.info(
        `[pdf/download] user ${user.id} reading job ${j.id} owned by ${requestedBy}`,
      )
    }

    const result = (j.payload as { result_meta?: PdfJobResult } | null)?.result_meta ?? {}
    // The cron worker writes result_meta into payload on completion;
    // legacy callers may have placed the result alongside payload.
    const storagePath = result.storage_path ?? `${j.id}.pdf`
    const filename = result.filename ?? `${j.id}.pdf`

    const { data: file, error: dlErr } = await supabase.storage
      .from('pdf-renders')
      .download(storagePath)
    if (dlErr || !file) throw NotFound(`Rendered PDF for job ${j.id} not found in storage`)

    const arrayBuf = await file.arrayBuffer()
    return new NextResponse(arrayBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return handle(e)
  }
}
