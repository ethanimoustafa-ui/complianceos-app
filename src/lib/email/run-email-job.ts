// Shared `email.send` job runner.
//
// Mirrors `runLatexGenerateJob` (src/lib/pdf/latex/run-latex-job.ts): resolve
// the message (either pre-rendered in the payload, or rendered now from a
// registered template), send it via the configured provider, then mark the
// job `done` with the provider message id in `payload.result_meta`.
//
// Used by BOTH the cron worker (/api/cron/jobs-run, production) and the
// local-dev inline path in `enqueueEmail` (Vercel cron never fires on
// localhost). Throws on render/send/update error; the caller decides retry.

import { getAdminClient } from '@/lib/api/admin'
import type { EmailLocale, EmailMessage } from './types'
import { sendEmail } from './send'
import { renderNotificationEmail, renderTestEmail, type RenderedEmail } from './templates/notification'

export interface EmailJobPayload {
  to: string | string[]
  // Option A — fully pre-rendered message:
  subject?: string
  html?: string
  text?: string
  // Option B — render from a registered template at send time:
  template?: string
  locale?: EmailLocale
  data?: Record<string, unknown>
  // Common:
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  requested_by?: string
}

// Registry of email template renderers, keyed by template id. Each takes the
// job payload's `data` (its own typed input) + locale and returns the message.
const TEMPLATES: Record<
  string,
  (data: Record<string, unknown>, locale: EmailLocale) => RenderedEmail
> = {
  notification: (data, locale) =>
    renderNotificationEmail({
      locale,
      subject: String(data.subject ?? ''),
      title: data.title as string | undefined,
      recipientName: data.recipientName as string | undefined,
      body: (data.body as string | string[]) ?? '',
      cta: data.cta as { label?: string; url: string } | undefined,
      footerNote: data.footerNote as string | undefined,
      previewText: data.previewText as string | undefined,
    }),
  test: (data, locale) => renderTestEmail(locale, data.recipientName as string | undefined),
}

function resolveMessage(payload: EmailJobPayload): EmailMessage {
  if (!payload?.to || (Array.isArray(payload.to) && payload.to.length === 0)) {
    throw new Error('email.send: missing recipient (`to`)')
  }

  let subject = payload.subject
  let html = payload.html
  let text = payload.text

  if (!html || !subject) {
    if (!payload.template) {
      throw new Error('email.send: payload needs either {subject,html} or {template}')
    }
    const render = TEMPLATES[payload.template]
    if (!render) throw new Error(`email.send: unsupported template '${payload.template}'`)
    const rendered = render(payload.data ?? {}, payload.locale ?? 'en')
    subject = rendered.subject
    html = rendered.html
    text = rendered.text
  }

  return {
    to: payload.to,
    subject: subject!,
    html: html!,
    text,
    replyTo: payload.replyTo,
    cc: payload.cc,
    bcc: payload.bcc,
  }
}

export async function runEmailSendJob(jobId: string, payload: EmailJobPayload): Promise<void> {
  const message = resolveMessage(payload)
  const result = await sendEmail(message)

  const admin = getAdminClient()
  const updatedPayload = {
    ...payload,
    result_meta: {
      provider: result.provider,
      message_id: result.id,
      to: payload.to,
      sent_at: new Date().toISOString(),
    },
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
