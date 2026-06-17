// Provider-agnostic email types.
//
// The whole email subsystem is built around `EmailProvider` so the concrete
// sender (Resend today, M365/SMTP/Postmark tomorrow) is a swappable adapter.
// Nothing above `send.ts` imports a provider directly.

export type EmailLocale = 'en' | 'ar'

/** A ready-to-send message. `text` is auto-derived from `html` if omitted. */
export interface EmailMessage {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
  /** Optional analytics/trace tags (provider support varies). */
  tags?: Record<string, string>
}

export interface EmailSendResult {
  /** Provider message id, or `null` for the dev log provider. */
  id: string | null
  provider: string
}

/** A concrete sender. `from` is injected by `send.ts` from env config. */
export interface EmailProvider {
  readonly name: string
  send(msg: EmailMessage, from: string): Promise<EmailSendResult>
}

export class EmailError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'EmailError'
  }
}
