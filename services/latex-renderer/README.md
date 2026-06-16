# ComplianceOS LaTeX renderer

A tiny, **brand-agnostic** `tex → pdf` microservice. It is the only place a TeX
distribution runs — a Vercel function can't host one (xelatex + Arabic fonts is
hundreds of MB and Vercel can't run a custom Docker image). The Next.js app
assembles and LaTeX-escapes the `.tex` in `src/lib/pdf/latex/`, then POSTs it
here from its cron worker.

## API

```
POST /render
  headers: x-render-secret: <RENDER_SECRET>   (required if RENDER_SECRET is set)
  body:    { "tex": "<string>", "assets": { "logo.png": "<base64>" }, "passes": 2 }
  200:     application/pdf  (binary)
  4xx/5xx: { "error", "message", "log" }       (log = tail of report.log)

GET /healthz -> { ok: true }
```

`assets` are decoded into the compile dir (e.g. `logo.png`, `badge.png`) so the
template's `\includegraphics{logo.png}` resolves. Fonts (Amiri) are baked into
the image, not sent per request.

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8080` | listen port |
| `RENDER_SECRET` | _(unset)_ | shared secret; must equal the app's `LATEX_RENDER_SECRET` |
| `PASS_TIMEOUT_MS` | `60000` | per-xelatex-pass timeout |

## Run locally (Docker)

```bash
cd services/latex-renderer
docker build -t cos-latex .
docker run --rm -p 8080:8080 -e RENDER_SECRET=dev-secret cos-latex

# smoke test — a minimal Arabic doc:
curl -sS -X POST http://localhost:8080/render \
  -H 'content-type: application/json' \
  -H 'x-render-secret: dev-secret' \
  -d '{"tex":"\\documentclass{article}\\usepackage{fontspec}\\usepackage{polyglossia}\\setmainlanguage{arabic}\\setmainfont{Amiri}\\begin{document}السلام عليكم\\end{document}"}' \
  -o out.pdf && echo "wrote out.pdf"
```

Then point the app at it: in `.env.local` set
`LATEX_RENDER_URL=http://localhost:8080` and `LATEX_RENDER_SECRET=dev-secret`,
and trigger an export from the letters page (the dev-inline path renders the job
immediately).

## Deploy — Google Cloud Run (free tier, scales to zero)

```bash
gcloud run deploy cos-latex-renderer \
  --source services/latex-renderer \
  --region me-central2 \
  --no-allow-unauthenticated \
  --min-instances 0 \
  --memory 1Gi \
  --set-env-vars RENDER_SECRET=$(openssl rand -hex 24)
```

Then set the printed service URL as `LATEX_RENDER_URL` (and the same secret as
`LATEX_RENDER_SECRET`) in Vercel project env. Use `--no-allow-unauthenticated`
plus the shared secret, or front it with IAM — do not expose `/render` openly.

> `me-central2` (Dammam) keeps rendering in-Kingdom for SAMA data residency. Any
> region works functionally; pick the residency that fits.

## Deploy — Render (free tier)

New **Web Service** → Docker → root `services/latex-renderer`. Set `RENDER_SECRET`.
The free tier spins down when idle (~30–60 s cold start) — fine, because the app
renders PDFs asynchronously via its job queue.

## Regenerating brand assets

The app inlines the Tasheel logo + GPTW badge as base64 in
`src/lib/pdf/latex/assets.ts` (so they ship in the Vercel bundle). To refresh
them from `letter-assets/`, re-run the generator documented at the top of that
file.

## Adding templates / packages

Templating lives in the app, so new templates need **no change here** unless they
use a LaTeX package not yet installed. If a compile fails with `File xyz.sty not
found`, add the providing `texlive-*` package to the `Dockerfile` (or switch the
base to `texlive-full`).
