// Resend email provider — raw fetch, no SDK dependency.
//
// Mirrors the LaTeX renderer client (src/lib/pdf/latex/client.ts): a tiny
// fetch wrapper instead of pulling in a package. Resend's REST contract:
//   POST https://api.resend.com/emails
//   Authorization: Bearer <RESEND_API_KEY>
//   { from, to[], subject, html, text?, reply_to?, cc?, bcc? } -> { id }
//
// `from` MUST use a domain verified in the Resend dashboard. For local
// testing without a domain, Resend's sandbox sender `onboarding@resend.dev`
// works but can only deliver to the account owner's own email address.

import type { EmailMessage, EmailProvider, EmailSendResult } from '../types'
import { EmailError } from '../types'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export function createResendProvider(apiKey: string): EmailProvider {
  return {
    name: 'resend',
    async send(msg: EmailMessage, from: string): Promise<EmailSendResult> {
      let res: Response
      try {
        res = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: Array.isArray(msg.to) ? msg.to : [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            reply_to: msg.replyTo,
            cc: msg.cc,
            bcc: msg.bcc,
          }),
        })
      } catch (e) {
        // Network/DNS failure — surface as retryable.
        throw new EmailError(
          `Resend request failed: ${e instanceof Error ? e.message : 'network error'}`,
        )
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          (body as { message?: string })?.message ?? `Resend API error: ${res.status}`
        throw new EmailError(message, res.status, body)
      }

      const json = (await res.json().catch(() => ({}))) as { id?: string }
      return { id: json.id ?? null, provider: 'resend' }
    },
  }
}
