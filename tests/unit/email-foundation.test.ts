// Email foundation tests.
//
// Pins the security-critical bits (HTML-escaping of user content so a letter
// title can't inject markup into an email), the bilingual layout (RTL for ar),
// template rendering, env-driven provider resolution, and the Resend adapter's
// request shape + error handling. No real emails are ever sent — the Resend
// provider's fetch is stubbed and the default path is the log provider.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { escapeHtml, htmlToText, renderEmailLayout } from '@/lib/email/layout'
import { renderNotificationEmail, renderTestEmail } from '@/lib/email/templates/notification'
import { getEmailConfig, isEmailConfigured, sendEmail } from '@/lib/email/send'
import { createResendProvider } from '@/lib/email/providers/resend'

// ---- env isolation ---------------------------------------------------------
const ENV_KEYS = ['RESEND_API_KEY', 'EMAIL_PROVIDER', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'EMAIL_OVERRIDE_TO'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('escapeHtml', () => {
  it('escapes every HTML metacharacter', () => {
    expect(escapeHtml('<script>alert("x&y")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;',
    )
  })
  it('coerces null/undefined to empty', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('htmlToText', () => {
  it('strips tags, keeps link hrefs, collapses blocks to newlines', () => {
    const text = htmlToText('<h1>Title</h1><p>Hello <a href="https://x.test">link</a></p>')
    expect(text).toContain('Title')
    expect(text).toContain('Hello link (https://x.test)')
    expect(text).not.toContain('<')
  })
})

describe('renderEmailLayout', () => {
  it('LTR + brand header by default', () => {
    const html = renderEmailLayout({ bodyHtml: '<p>hi</p>' })
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('#60B848') // brand green
    expect(html).toContain('ComplianceOS')
  })
  it('RTL for Arabic', () => {
    const html = renderEmailLayout({ locale: 'ar', bodyHtml: '<p>مرحبا</p>' })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="ar"')
  })
})

describe('renderNotificationEmail', () => {
  it('produces subject/html/text with greeting + CTA', () => {
    const r = renderNotificationEmail({
      subject: 'Overdue task',
      body: ['You have an overdue item.', 'Please act now.'],
      cta: { label: 'Open task', url: 'https://app.test/x' },
      recipientName: 'Sara',
    })
    expect(r.subject).toBe('Overdue task')
    expect(r.html).toContain('Open task')
    expect(r.html).toContain('https://app.test/x')
    expect(r.text).toContain('You have an overdue item.')
    expect(r.text).toContain('Hi Sara,')
  })

  it('escapes HTML injected via body/title (no raw markup survives)', () => {
    const r = renderNotificationEmail({
      subject: 'x',
      title: '<img src=x onerror=alert(1)>',
      body: '<b>bold</b>',
    })
    expect(r.html).not.toContain('<img src=x onerror')
    expect(r.html).not.toContain('<b>bold</b>')
    expect(r.html).toContain('&lt;img')
  })

  it('renderTestEmail localizes subject', () => {
    expect(renderTestEmail('en').subject).toContain('Email test')
    expect(renderTestEmail('ar').subject).toContain('اختبار')
  })
})

describe('provider resolution', () => {
  it('falls back to the log provider when nothing is configured', () => {
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_PROVIDER
    expect(getEmailConfig().provider.name).toBe('log')
    expect(isEmailConfigured()).toBe(false)
  })
  it('uses Resend when RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test_123'
    delete process.env.EMAIL_PROVIDER
    expect(getEmailConfig().provider.name).toBe('resend')
    expect(isEmailConfigured()).toBe(true)
  })
  it('EMAIL_PROVIDER=log forces the log provider even with a key', () => {
    process.env.RESEND_API_KEY = 're_test_123'
    process.env.EMAIL_PROVIDER = 'log'
    expect(getEmailConfig().provider.name).toBe('log')
  })
  it('EMAIL_PROVIDER=resend without a key throws (fail fast)', () => {
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_PROVIDER = 'resend'
    expect(() => getEmailConfig()).toThrow(/RESEND_API_KEY/)
  })
})

describe('createResendProvider', () => {
  it('POSTs to the Resend API with auth + normalized recipients, returns id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'msg_123' }) })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createResendProvider('re_key').send(
      { to: 'a@b.test', subject: 'Hi', html: '<p>x</p>' },
      'From <from@x.test>',
    )

    expect(res).toEqual({ id: 'msg_123', provider: 'resend' })
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((opts.headers as Record<string, string>).authorization).toBe('Bearer re_key')
    const body = JSON.parse(opts.body as string)
    expect(body.to).toEqual(['a@b.test']) // string normalized to array
    expect(body.from).toBe('From <from@x.test>')
  })

  it('throws with the provider message on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: 'The from domain is not verified' }),
      }),
    )
    await expect(
      createResendProvider('re_key').send({ to: 'a@b.test', subject: 'x', html: '<p>x</p>' }, 'f@x.test'),
    ).rejects.toThrow('domain is not verified')
  })
})

describe('sendEmail (log provider)', () => {
  it('derives a plaintext part and returns a log result', async () => {
    delete process.env.RESEND_API_KEY
    process.env.EMAIL_PROVIDER = 'log'
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await sendEmail({ to: 'me@x.test', subject: 'Hi', html: '<p>Hello <b>world</b></p>' })

    expect(res.provider).toBe('log')
    expect(res.id).toBeNull()
    expect(spy).toHaveBeenCalled()
  })
})

describe('sendEmail — EMAIL_OVERRIDE_TO (sandbox redirect)', () => {
  it('redirects all mail to the override address, leaving the subject untouched', async () => {
    process.env.RESEND_API_KEY = 're_test'
    delete process.env.EMAIL_PROVIDER
    process.env.EMAIL_FROM = 'From <from@x.test>'
    process.env.EMAIL_OVERRIDE_TO = 'me@gmail.test'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm1' }) })
    vi.stubGlobal('fetch', fetchMock)

    await sendEmail({ to: 'officer@complianceos.local', subject: 'Your digest', html: '<p>x</p>' })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.to).toEqual(['me@gmail.test'])
    expect(body.subject).toBe('Your digest') // no prefix mangling
  })
})
