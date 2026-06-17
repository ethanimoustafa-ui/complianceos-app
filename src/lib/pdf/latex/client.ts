// Client for the external LaTeX renderer microservice.
//
// POSTs a `.tex` document + brand assets to the containerized xelatex compiler
// (`LATEX_RENDER_URL`) and returns the PDF bytes. The container is the ONLY
// place xelatex runs — a Vercel function can't host a TeX distribution (see
// .planning/13-pdf-pipeline.md). Auth via a shared secret header, mirroring the
// cron worker's `CRON_SECRET` posture.

export interface CompileLatexInput {
  tex: string
  /** filename -> base64 PNG, written into the compile dir by the renderer. */
  assets?: Record<string, string>
  /** Compile passes (>=2 so `\pageref{LastPage}` resolves). Default 2. */
  passes?: number
}

export async function compileLatex({ tex, assets, passes }: CompileLatexInput): Promise<Buffer> {
  const base = process.env.LATEX_RENDER_URL
  if (!base) {
    throw new Error(
      '[pdf/latex] LATEX_RENDER_URL is not set — the LaTeX renderer service is unavailable. ' +
        'Deploy services/latex-renderer and set LATEX_RENDER_URL (+ LATEX_RENDER_SECRET).',
    )
  }
  const secret = process.env.LATEX_RENDER_SECRET
  const url = `${base.replace(/\/+$/, '')}/render`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-render-secret': secret } : {}),
    },
    body: JSON.stringify({ tex, assets: assets ?? {}, passes: passes ?? 2 }),
  })

  if (!res.ok) {
    let detail = `status ${res.status}`
    try {
      const body = await res.json()
      detail = body?.message || body?.error || detail
      if (body?.log) detail += `\n--- compile log (tail) ---\n${String(body.log).slice(-2000)}`
    } catch {
      // non-JSON error body — keep the status line
    }
    throw new Error(`[pdf/latex] render failed: ${detail}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
