// buildSamaLetterTex — assembles the xelatex source for a SAMA letter in either
// Arabic (RTL, default) or English (LTR), mirroring the app's letter layout.

import { describe, it, expect } from 'vitest'
import { buildSamaLetterTex } from '@/lib/pdf/latex/render-sama-letter'

const SAMPLE_AR = {
  reference: 'SAMA-NOB-2026-0001',
  hijriDate: '02/11/1446',
  gregorianDate: '30/04/2025',
  recipientName: 'إدارة الرقابة على المؤسسات المالية غير البنكية',
  recipientOrg: 'البنك المركزي السعودي (ساما)',
  recipientCity: 'الرياض، المملكة العربية السعودية',
  subject: 'القوائم المالية الربع سنوية – الربع الأول من العام 2025',
  bodyParagraphs: [
    'بالإشارة إلى المادة الثانية والسبعون من اللائحة التنفيذية لنظام مراقبة شركات التمويل.',
    'عليه، نرفق لسعادتكم نسخة من القوائم المالية الربع سنوية المدققة وتقرير مراجع الحسابات.',
  ],
  signerName: 'بول بيستر',
  signerTitle: 'الرئيس التنفيذي',
}

const SAMPLE_EN = {
  reference: 'SAMA-NOB-2026-0001',
  hijriDate: '02/11/1446',
  gregorianDate: '30/04/2025',
  recipientName: 'Banking Supervision Department',
  recipientOrg: 'Saudi Central Bank (SAMA)',
  recipientCity: 'Riyadh, Saudi Arabia',
  subject: 'Quarterly Financial Statements — Q1 2025',
  bodyParagraphs: [
    'With reference to Article 72 of the Implementing Regulation of the Finance Companies Control Law.',
    'Accordingly, we enclose a copy of the audited quarterly financial statements.',
  ],
  signerName: 'Paul Bester',
  signerTitle: 'Chief Executive Officer',
}

describe('buildSamaLetterTex — Arabic (default)', () => {
  it('emits an RTL xelatex/polyglossia document with the compact letterhead', () => {
    const { tex } = buildSamaLetterTex(SAMPLE_AR)
    expect(tex).toContain('\\documentclass[12pt,a4paper]{article}')
    expect(tex).toContain('\\setmainlanguage{arabic}')
    expect(tex).toContain('\\setmainfont{Amiri}')
    expect(tex).toContain('\\includegraphics[width=7.5cm]{letterhead.png}')
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
  })

  it('renders Arabic labels, LTR-protected reference/dates, and the closing', () => {
    const { tex } = buildSamaLetterTex(SAMPLE_AR)
    expect(tex).toContain('\\textenglish{SAMA-NOB-2026-0001}')
    expect(tex).toContain('\\textenglish{02/11/1446}')
    expect(tex).toContain('إلى:')
    expect(tex).toContain('السادة الكرام،')
    expect(tex).toContain('وتقبلوا خالص التحية والتقدير،،')
    expect(tex).toContain(SAMPLE_AR.recipientName)
    expect(tex).toContain(SAMPLE_AR.signerName)
  })

  it('includes the Arabic registration footer with LTR-protected numbers + the badge', () => {
    const { tex, assets } = buildSamaLetterTex(SAMPLE_AR)
    expect(tex).toContain('الشركة المتحدة للخدمات المالية')
    expect(tex).toContain('\\textenglish{+966138478888}')
    expect(tex).toContain('badge.png')
    expect(typeof assets['letterhead.png']).toBe('string')
    expect(typeof assets['badge.png']).toBe('string')
  })
})

describe('buildSamaLetterTex — English', () => {
  it('emits a plain LTR document (no polyglossia) with a Latin font', () => {
    const { tex } = buildSamaLetterTex(SAMPLE_EN, 'en')
    expect(tex).toContain('\\setmainfont{Latin Modern Roman}')
    expect(tex).not.toContain('\\setmainlanguage{arabic}')
    expect(tex).not.toContain('\\textenglish{') // LTR doc needs no protection
  })

  it('renders English labels, boilerplate, footer, and content', () => {
    const { tex } = buildSamaLetterTex(SAMPLE_EN, 'en')
    expect(tex).toContain('To:')
    expect(tex).toContain('Ref:')
    expect(tex).toContain('Subject:')
    expect(tex).toContain('Dear Sir/Madam,')
    expect(tex).toContain('Yours sincerely,')
    expect(tex).toContain('SAMA-NOB-2026-0001')
    expect(tex).toContain('United Company for Financial Services')
    expect(tex).toContain(SAMPLE_EN.recipientName)
    expect(tex).toContain(SAMPLE_EN.signerName)
  })
})

describe('buildSamaLetterTex — shared behavior', () => {
  it('produces a sanitized filename from the reference', () => {
    expect(buildSamaLetterTex(SAMPLE_AR).filename).toBe('Letter-SAMA-NOB-2026-0001.pdf')
  })

  it('places a signature line underneath the signer name + title', () => {
    const { tex } = buildSamaLetterTex(SAMPLE_EN, 'en')
    const nameIdx = tex.indexOf(SAMPLE_EN.signerName)
    const ruleIdx = tex.indexOf('\\rule{6cm}')
    expect(ruleIdx).toBeGreaterThan(-1) // a sign-here line exists
    expect(ruleIdx).toBeGreaterThan(nameIdx) // ...beneath the name/title
  })

  it('accepts a single-string body (split into paragraphs)', () => {
    const { tex } = buildSamaLetterTex({
      ...SAMPLE_AR,
      bodyParagraphs: undefined,
      body: 'الفقرة الأولى.\n\nالفقرة الثانية.',
    })
    expect(tex).toContain('الفقرة الأولى.')
    expect(tex).toContain('الفقرة الثانية.')
  })

  it('omits the recipient line when no recipient name is given', () => {
    const { tex } = buildSamaLetterTex({
      ...SAMPLE_AR,
      recipientName: undefined,
      recipientOrg: undefined,
      recipientCity: undefined,
    })
    expect(tex).not.toContain('إلى:')
  })

  it('neutralizes LaTeX injection in user fields', () => {
    const { tex } = buildSamaLetterTex({ ...SAMPLE_AR, subject: '\\input{/etc/passwd} & $bad$' })
    expect(tex).not.toContain('\\input{/etc/passwd}')
    expect(tex).toContain('\\textbackslash{}input')
    expect(tex).toContain('\\&')
  })

  it('throws on a payload missing required fields', () => {
    expect(() => buildSamaLetterTex({})).toThrow()
    expect(() => buildSamaLetterTex({ reference: 'x' })).toThrow()
  })
})
