// Generic notification email template (bilingual).
//
// The workhorse template that Phase 2 (notification → email mirroring) and the
// alert/escalation phases compose on top of. Produces { subject, html, text }
// from structured, locale-aware input. All interpolated values are escaped by
// the layout helpers, so callers may pass raw user strings safely.

import type { EmailLocale } from '../types'
import {
  renderEmailLayout,
  emailHeading,
  emailParagraph,
  emailButton,
  htmlToText,
  appName,
} from '../layout'

const STRINGS: Record<EmailLocale, { defaultCta: string; greeting: (n?: string) => string }> = {
  en: {
    defaultCta: 'Open in ComplianceOS',
    greeting: (n) => (n ? `Hi ${n},` : 'Hello,'),
  },
  ar: {
    defaultCta: 'فتح في ComplianceOS',
    greeting: (n) => (n ? `مرحباً ${n}،` : 'مرحباً،'),
  },
}

export interface NotificationEmailInput {
  locale?: EmailLocale
  /** Email subject line. Required — keep it short and specific. */
  subject: string
  /** Big heading inside the card (defaults to `subject`). */
  title?: string
  /** Recipient's display name for the greeting. Optional. */
  recipientName?: string
  /** One or more body paragraphs. */
  body: string | string[]
  /** Optional call-to-action button. */
  cta?: { label?: string; url: string }
  /** Optional muted line above the footer (e.g. severity / due date). */
  footerNote?: string
  /** Inbox preview snippet; defaults to the first body line. */
  previewText?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const locale: EmailLocale = input.locale ?? 'en'
  const s = STRINGS[locale]
  const bodyLines = Array.isArray(input.body) ? input.body : [input.body]

  const parts: string[] = []
  parts.push(emailHeading(input.title ?? input.subject))
  if (input.recipientName) parts.push(emailParagraph(s.greeting(input.recipientName)))
  for (const line of bodyLines) parts.push(emailParagraph(line))
  if (input.cta) {
    parts.push(emailButton(input.cta.label ?? s.defaultCta, input.cta.url, locale))
  }

  const html = renderEmailLayout({
    locale,
    previewText: input.previewText ?? bodyLines[0],
    bodyHtml: parts.join('\n'),
    footerNote: input.footerNote,
  })

  return {
    subject: input.subject,
    html,
    text: htmlToText(html),
  }
}

/** Tiny self-test email used by the `/api/email/test` route. */
export function renderTestEmail(locale: EmailLocale = 'en', recipientName?: string): RenderedEmail {
  const copy =
    locale === 'ar'
      ? {
          subject: `اختبار البريد — ${appName()}`,
          title: 'تم ضبط البريد الإلكتروني بنجاح',
          body: [
            'هذه رسالة اختبار للتأكد من أن نظام إرسال البريد يعمل بشكل صحيح.',
            'إذا وصلتك هذه الرسالة، فإن المزوّد والنطاق مهيّآن بشكل سليم.',
          ],
        }
      : {
          subject: `Email test — ${appName()}`,
          title: 'Email is configured correctly',
          body: [
            'This is a test message confirming the email delivery pipeline works.',
            'If you received this, your provider and sending domain are set up correctly.',
          ],
        }
  return renderNotificationEmail({ locale, recipientName, ...copy })
}
