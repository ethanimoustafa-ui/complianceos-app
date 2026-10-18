# Next step: migrate to GCP / Firebase (KSA data residency)

> Status: **planned, not started.** Today the app runs on **Vercel + Supabase** as a
> fast MVP. The real forcing function is **KSA data residency for SAMA compliance** —
> data must live in-Kingdom (**GCP Dammam, region `me-central2`**). Supabase has no
> KSA region, which is *why* we move. "Firebase" is shorthand for "GCP in Dammam".
>
> This is part of the planned engineer-led rebuild (the MVP is rapidly/vibe-coded),
> so treat it as a deliberate target, not a mid-MVP scramble.

## Honest difficulty: not "too hard", but a real port (weeks, not days)

It is **not** a lift-and-shift toggle, and it is **not** a from-scratch rewrite either —
*if* we pick the pragmatic path. The two heavy parts are **auth** and the **RLS-via-JWT**
plumbing; everything else is moderate.

## Current stack → GCP target

| Concern | Today (Vercel + Supabase) | Target (GCP / Dammam `me-central2`) | Effort |
|---|---|---|---|
| **Database** | Supabase Postgres — ~113 SQL migrations, heavy **RLS**, SECURITY DEFINER fns, SQL views (`get_escalation_candidates`), triggers | **Cloud SQL for PostgreSQL** (or AlloyDB) — keep schema + migrations almost as-is | **Medium** (port) |
| **AuthZ (RLS)** | Supabase auto-injects `auth.uid()` from the JWT into RLS | Replicate the RLS context: set the session user per request from the verified token | **High** — every data path touches this |
| **Auth** | Supabase Auth + JWT custom-claims hook (mig 028 bakes role+perms) | **Identity Platform** (GCP's Firebase Auth) + a blocking function for custom claims | **High** |
| **Storage** | Supabase Storage + SQL RLS policies (e.g. avatars own-folder) | **Cloud Storage (GCS)** + Storage rules / IAM (different rules language) | **Medium** |
| **Hosting / API** | Next.js 16 (App Router, SSR) + Route Handlers on Vercel | **Cloud Run** (closest serverless model) or Firebase App Hosting | **Medium** |
| **Cron / jobs** | Vercel Cron (`*/1` jobs-run, daily digest) + a `jobs` table worker | **Cloud Scheduler** → Cloud Run; jobs-table worker pattern unchanged | **Low** |
| **PDF render** | external Render container (xelatex) | already external → repoint, or move to Cloud Run | **Low** |
| **Email** | Resend (provider-agnostic `EmailProvider`) | keep Resend, or swap adapter | **Trivial** |

## Two database paths — pick one

1. **Cloud SQL / AlloyDB Postgres in `me-central2` — RECOMMENDED.** Keeps the relational
   model, all migrations, the scoring SQL, the escalation view. You only rebuild the
   **auth ↔ RLS** wiring (no more Supabase auto-`auth.uid()`) and Storage rules. This is
   the most code-preserving route.
2. **Firestore (NoSQL) — AVOID** unless the rebuild engineer wants a Firebase-native
   ground-up build. It discards RLS, joins, views, and the SQL scoring engine → a
   near-total backend rewrite.

## Rough effort
- Experienced engineer, path #1: **~2–6 weeks**, dominated by (a) Cloud SQL + RLS-context
  plumbing, (b) Supabase Auth → Identity Platform + the claims hook. Storage/hosting/cron
  are moderate; PDF/email are easy.
- Path #2 (Firestore): months — it's a rewrite.

## Keep-portable hygiene (do this now, cheaply, while still on Supabase)
- Email is already provider-agnostic — keep it that way. ✅
- Prefer plain SQL/Postgres features over Supabase-only cleverness where it's free to do so.
- Keep all data access behind the API route layer (already the case) so the client never
  talks to Supabase directly for *new* features — easier to swap the backend later.
  (Known exceptions today: `auth-store` profile read/write + the avatars upload talk to the
  Supabase client directly; fine for MVP, flag for the rebuild.)
- Keep secrets in env (`SUPABASE_*`, `RESEND_*`, `LATEX_RENDER_*`) — already done.

## Bottom line
Doable and not scary, but it's a **project**, not a switch — and it's mostly **auth + RLS**,
not the UI. Since an engineer-led rebuild is already on the cards, fold this in as the
target architecture (GCP Dammam, Cloud SQL Postgres, Identity Platform, GCS, Cloud Run)
rather than rebuilding twice.
