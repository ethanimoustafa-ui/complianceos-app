# Email subsystem

Provider-agnostic transactional/notification email for ComplianceOS. Built on the
same `jobs` queue + cron worker as the PDF pipeline, so sending is **async and
retried** — nothing blocks a request on an SMTP round-trip.

```
caller ──enqueueEmail()──▶ jobs(kind='email.send') ──cron /api/cron/jobs-run──▶
   runEmailSendJob() ──▶ sendEmail() ──▶ EmailProvider (Resend | log)
```

## Files

| File | Role |
|------|------|
| `types.ts` | `EmailMessage`, `EmailProvider`, `EmailError` |
| `layout.ts` | Bilingual (en/ar, RTL) HTML shell + `escapeHtml`/`htmlToText`/button helpers |
| `templates/notification.ts` | Generic notification template (+ `test` template) |
| `providers/resend.ts` | Resend adapter (raw `fetch`, no SDK) |
| `providers/log.ts` | Dev fallback — logs instead of sending when no key is set |
| `send.ts` | `sendEmail()` — resolves provider from env, fills `from`/text |
| `run-email-job.ts` | `email.send` job runner (wired into the cron dispatcher) |
| `enqueue.ts` | `enqueueEmail()` — insert job, dedup, local-dev inline send |

## Environment

Add to `.env.local` (dev) and the Vercel project env (prod). **None are committed.**

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `RESEND_API_KEY` | to actually send | — | From the Resend dashboard. Absent → log provider (no send). |
| `EMAIL_FROM` | recommended | `ComplianceOS <onboarding@resend.dev>` | Must use a **verified domain** in prod. |
| `EMAIL_PROVIDER` | no | auto | Force `resend` or `log`. |
| `EMAIL_REPLY_TO` | no | — | Default Reply-To. |
| `EMAIL_OVERRIDE_TO` | no | — | **Sandbox/testing:** redirect ALL mail to this one address (the intended recipient is kept in the job's `result_meta`). Leave UNSET in production. |
| `EMAIL_APP_NAME` | no | `ComplianceOS` | Brand shown in header/footer. |
| `EMAIL_APP_URL` | no | `NEXT_PUBLIC_APP_URL` or `http://localhost:3000` | Base URL for CTA links. |

### Local testing without a domain
Resend's sandbox sender `onboarding@resend.dev` only delivers to the **Resend
account owner's own email**, and the app's recipients (seed `@complianceos.local`
users) aren't real mailboxes. So set an override to funnel everything to your inbox:

```
RESEND_API_KEY=re_xxx
EMAIL_OVERRIDE_TO=you@gmail.com   # must be your Resend account's email
# EMAIL_FROM defaults to onboarding@resend.dev — no need to set it before a domain
```
Every email (digest, test) then arrives at that address; the intended recipient
is recorded in the job's `result_meta` (not in the subject).
`POST /api/email/test` (admin/manager) sends a test. With **no** key set, the
call just logs to the server console (`provider_configured: false`) — verifiable
offline.

### Production
Verify a domain in Resend (DNS: SPF + DKIM), then set
`EMAIL_FROM="ComplianceOS <alerts@yourdomain.sa>"`. Swapping providers later =
one new file under `providers/` + a branch in `send.ts`; nothing else changes.

## Sending

```ts
import { enqueueEmail } from '@/lib/email/enqueue'

// From a Route Handler (caller's RLS-scoped client) or cron (admin client):
await enqueueEmail(supabase, {
  to: 'officer@example.sa',
  template: 'notification',
  locale: 'ar',
  data: {
    subject: 'مهمة متأخرة',
    body: ['لديك بند متأخر في قائمة التحقق.'],
    cta: { url: 'https://app/observations/123' },
  },
  idempotencyKey: 'overdue:checklist:123:7d', // optional — dedups re-sends
  scheduledFor: someFutureDate,               // optional — tiered reminders
})
```

`idempotencyKey` leans on the table's `unique(kind, idempotency_key)` constraint
so the same reminder is never queued twice. `scheduledFor` defers delivery (the
worker only claims jobs whose `scheduled_for <= now()`).
