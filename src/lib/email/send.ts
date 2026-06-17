// `sendEmail()` — the single entry point everything above the provider layer
// uses. Resolves the configured provider from env, fills in the `from`/reply-to
// and a plaintext fallback, then delegates.
//
// Env:
//   RESEND_API_KEY   — if set (and EMAIL_PROVIDER !== 'log'), use Resend.
//   EMAIL_PROVIDER   — force a provider: 'resend' | 'log'. Optional.
//   EMAIL_FROM       — sender, e.g. "ComplianceOS <alerts@yourdomain.sa>".
//                      Defaults to Resend's sandbox sender for local testing.
//   EMAIL_REPLY_TO   — optional default Reply-To.
//
// With NO provider configured it falls back to the log provider, so dev and
// CI never throw on a missing key.

import type { EmailMessage, EmailProvider, EmailSendResult } from './types'
import { logProvider } from './providers/log'
import { createResendProvider } from './providers/resend'
import { htmlToText } from './layout'

export interface EmailConfig {
  provider: EmailProvider
  from: string
  replyTo?: string
}

const DEFAULT_FROM = 'ComplianceOS <onboarding@resend.dev>'

/** Resolve provider + sender from the environment (read fresh each call). */
export function getEmailConfig(): EmailConfig {
  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase()
  const resendKey = process.env.RESEND_API_KEY?.trim()

  let provider: EmailProvider
  if (explicit === 'log') {
    provider = logProvider
  } else if (explicit === 'resend' || (resendKey && explicit !== 'none')) {
    if (!resendKey) {
      throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set')
    }
    provider = createResendProvider(resendKey)
  } else {
    provider = logProvider
  }

  return { provider, from, replyTo }
}

/** True when a real (non-log) provider is configured. */
export function isEmailConfigured(): boolean {
  return getEmailConfig().provider.name !== 'log'
}

/** Send one message. Throws on provider error (caller/job runner handles retry). */
export async function sendEmail(msg: EmailMessage): Promise<EmailSendResult> {
  const { provider, from, replyTo } = getEmailConfig()

  // Sandbox safety net: when EMAIL_OVERRIDE_TO is set, every message is
  // redirected to that single address. Lets you verify delivery BEFORE a sending
  // domain is verified — Resend's sandbox sender (onboarding@resend.dev) only
  // delivers to the Resend account owner's own address. The intended recipient
  // is preserved in the job's result_meta. Leave UNSET in production.
  const override = process.env.EMAIL_OVERRIDE_TO?.trim()

  const finalMsg: EmailMessage = {
    ...msg,
    to: override || msg.to,
    cc: override ? undefined : msg.cc,
    bcc: override ? undefined : msg.bcc,
    replyTo: msg.replyTo ?? replyTo,
    text: msg.text ?? htmlToText(msg.html),
  }
  return provider.send(finalMsg, from)
}
