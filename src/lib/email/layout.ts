// Bilingual (en/ar) HTML email shell + small rendering helpers.
//
// Email clients are stuck in ~2005: no external CSS, flaky flexbox, no JS.
// So everything here is table-based with INLINE styles, max-width 600px, and
// a plaintext fallback derived from the HTML. Arabic renders RTL.

import type { EmailLocale } from './types'

// Brand palette — matches the LaTeX/PDF pipeline so email + documents look
// like one product. Brand green is the same `#60B848` used on letterheads.
export const EMAIL_BRAND = {
  green: '#60B848',
  greenDark: '#4e9a3c',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  pageBg: '#f1f5f9',
  cardBg: '#ffffff',
} as const

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,Arial,'Helvetica Neue',sans-serif"

export function appName(): string {
  return process.env.EMAIL_APP_NAME?.trim() || 'ComplianceOS'
}

export function appUrl(): string {
  return (
    process.env.EMAIL_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'
  )
}

/** Escape text for safe interpolation into HTML. */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Crude HTML→text for the plaintext alternative part. Not a full parser —
 * just enough to give text-only clients a readable body: block tags become
 * newlines, links keep their href, tags are stripped, entities decoded.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
}

/** A bulletproof, table-based CTA button. */
export function emailButton(label: string, url: string, locale: EmailLocale = 'en'): string {
  const align = locale === 'ar' ? 'right' : 'left'
  return `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin:8px 0;">
    <tr>
      <td style="border-radius:10px;background:${EMAIL_BRAND.green};">
        <a href="${escapeHtml(url)}" target="_blank"
           style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`
}

/** A heading + paragraphs block, locale-aware alignment. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:800;color:${EMAIL_BRAND.text};">${escapeHtml(
    text,
  )}</h1>`
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.text};">${escapeHtml(
    text,
  )}</p>`
}

const FOOTER_STRINGS: Record<EmailLocale, { automated: string; manage: string }> = {
  en: {
    automated: 'This is an automated message from',
    manage: 'Manage your notification preferences',
  },
  ar: {
    automated: 'هذه رسالة آلية من',
    manage: 'إدارة تفضيلات الإشعارات',
  },
}

export interface EmailLayoutInput {
  locale?: EmailLocale
  /** Inbox preview snippet (hidden in the body). */
  previewText?: string
  /** Pre-rendered inner HTML (use emailHeading/emailParagraph/emailButton). */
  bodyHtml: string
  /** Optional extra line above the standard footer. */
  footerNote?: string
}

/** Wrap inner body HTML in the full branded, responsive, RTL-aware document. */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const locale: EmailLocale = input.locale ?? 'en'
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = locale === 'ar' ? 'right' : 'left'
  const strings = FOOTER_STRINGS[locale]
  const name = appName()
  const prefsUrl = `${appUrl()}/settings`

  const preview = input.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        input.previewText,
      )}</div>`
    : ''

  const footerNote = input.footerNote
    ? `<p style="margin:0 0 8px;">${escapeHtml(input.footerNote)}</p>`
    : ''

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.pageBg};">
${preview}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_BRAND.pageBg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:${EMAIL_BRAND.cardBg};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${EMAIL_BRAND.green};padding:20px 28px;" dir="${dir}" align="${align}">
            <span style="font-family:${FONT_STACK};font-size:18px;font-weight:800;letter-spacing:0.2px;color:#ffffff;">${escapeHtml(
              name,
            )}</span>
          </td>
        </tr>
        <tr>
          <td dir="${dir}" align="${align}" style="padding:28px;font-family:${FONT_STACK};direction:${dir};text-align:${align};">
            ${input.bodyHtml}
          </td>
        </tr>
        <tr>
          <td dir="${dir}" align="${align}" style="padding:18px 28px;border-top:1px solid ${EMAIL_BRAND.border};font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${EMAIL_BRAND.muted};direction:${dir};text-align:${align};">
            ${footerNote}
            <p style="margin:0 0 4px;">${escapeHtml(strings.automated)} <strong>${escapeHtml(
              name,
            )}</strong>.</p>
            <p style="margin:0;"><a href="${escapeHtml(
              prefsUrl,
            )}" style="color:${EMAIL_BRAND.muted};text-decoration:underline;">${escapeHtml(
              strings.manage,
            )}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
