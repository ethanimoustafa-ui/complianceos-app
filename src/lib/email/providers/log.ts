// Dev/no-op email provider.
//
// Used automatically when no real provider is configured (no RESEND_API_KEY),
// so local development and tests never fail on a missing key — the message is
// logged to the server console instead of sent. NEVER selected in production
// once RESEND_API_KEY (or EMAIL_PROVIDER) is set.

import type { EmailMessage, EmailProvider, EmailSendResult } from '../types'

export const logProvider: EmailProvider = {
  name: 'log',
  async send(msg: EmailMessage, from: string): Promise<EmailSendResult> {
    const to = Array.isArray(msg.to) ? msg.to.join(', ') : msg.to
    const preview = (msg.text ?? msg.html).replace(/\s+/g, ' ').slice(0, 300)
    console.log(
      [
        '',
        '┌─ [email:log] no provider configured — message NOT sent ─────────',
        `│ from:    ${from}`,
        `│ to:      ${to}`,
        `│ subject: ${msg.subject}`,
        `│ preview: ${preview}`,
        '└────────────────────────────────────────────────────────────────',
      ].join('\n'),
    )
    return { id: null, provider: 'log' }
  },
}
