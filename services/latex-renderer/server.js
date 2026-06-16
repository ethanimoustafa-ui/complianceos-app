// ComplianceOS LaTeX renderer — a tiny, brand-agnostic `tex -> pdf` service.
//
// One route: POST /render  { tex: string, assets?: { [file]: base64 }, passes? }
//   -> writes tex + assets to a temp dir, runs xelatex `passes` times, returns
//      application/pdf. On failure returns 500 { error, message, log }.
//
// This is the ONLY place a TeX distribution runs. Deploy it to Cloud Run / Render
// (see README). The Next.js app POSTs here from its cron worker. Templating and
// LaTeX-escaping happen in the app (src/lib/pdf/latex) — this service never sees
// user data except as an already-assembled, already-escaped .tex string.
//
// Auth: shared secret. If RENDER_SECRET is set, callers must send a matching
// `x-render-secret` header. (Set it in production.)

const express = require('express')
const { execFile } = require('node:child_process')
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const app = express()
app.use(express.json({ limit: '20mb' }))

const PORT = process.env.PORT || 8080
const SECRET = process.env.RENDER_SECRET || ''
const PASS_TIMEOUT_MS = Number(process.env.PASS_TIMEOUT_MS || 60000)

app.get('/healthz', (_req, res) => res.json({ ok: true }))

/** Run xelatex once; resolves even on non-zero exit (we judge success by the PDF). */
function runXelatex(dir) {
  return new Promise((resolve) => {
    execFile(
      'xelatex',
      ['-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', 'report.tex'],
      { cwd: dir, timeout: PASS_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ err, stdout, stderr }),
    )
  })
}

async function readLogTail(dir) {
  try {
    const log = await readFile(path.join(dir, 'report.log'), 'utf8')
    return log.slice(-4000)
  } catch {
    return ''
  }
}

app.post('/render', async (req, res) => {
  if (SECRET && req.get('x-render-secret') !== SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { tex, assets, passes } = req.body || {}
  if (typeof tex !== 'string' || tex.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'missing `tex`' })
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'cos-latex-'))
  try {
    await writeFile(path.join(dir, 'report.tex'), tex, 'utf8')

    if (assets && typeof assets === 'object') {
      for (const [name, b64] of Object.entries(assets)) {
        // basename() defuses path traversal (e.g. "../../etc/x").
        const safe = path.basename(String(name))
        if (!safe || safe === '.' || safe === '..') continue
        await writeFile(path.join(dir, safe), Buffer.from(String(b64), 'base64'))
      }
    }

    const n = Math.min(Math.max(parseInt(passes, 10) || 2, 1), 3)
    let last
    for (let i = 0; i < n; i++) last = await runXelatex(dir)

    let pdf
    try {
      pdf = await readFile(path.join(dir, 'report.pdf'))
    } catch {
      pdf = null
    }

    if (!pdf || pdf.length === 0) {
      return res.status(500).json({
        error: 'COMPILATION_FAILED',
        message: (last && last.err && last.err.message) || 'xelatex produced no PDF',
        log: await readLogTail(dir),
      })
    }

    res.setHeader('content-type', 'application/pdf')
    res.setHeader('content-length', String(pdf.length))
    return res.send(pdf)
  } catch (e) {
    return res.status(500).json({
      error: 'RENDER_ERROR',
      message: e instanceof Error ? e.message : 'unknown error',
      log: await readLogTail(dir),
    })
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[latex-renderer] listening on :${PORT}`)
})
