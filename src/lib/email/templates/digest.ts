// Daily digest email — the ONE email a user receives per day (if opted in and
// they have items needing attention). Lists their overdue + due-soon checklist
// items, grouped, with deep links. Bilingual (en/ar, RTL via the layout).

import type { EmailLocale } from '../types'
import {
  renderEmailLayout,
  emailHeading,
  emailButton,
  htmlToText,
  escapeHtml,
  appUrl,
  EMAIL_BRAND,
} from '../layout'

export interface DigestItem {
  /** Item or parent title. */
  title: string
  /** Days to deadline; negative = overdue. */
  daysOut: number
  /** App-relative deep link to the parent entity. */
  route: string
  /**
   * Name of the person the item is assigned to. Only set (and only shown) for
   * the manager/department digest, where the recipient is overseeing other
   * people's work; the personal officer digest leaves this undefined.
   */
  owner?: string
}

/**
 * `self`  — personal worklist (officer/auditor): "deadlines assigned to you".
 * `department` — manager oversight: every at-risk/overdue item across the
 * recipient's department, with each item's owner shown.
 */
export type DigestScope = 'self' | 'department'

export interface DigestInput {
  locale: EmailLocale
  recipientName?: string
  overdue: DigestItem[]
  upcoming: DigestItem[]
  /** Defaults to `self` (the personal digest). */
  scope?: DigestScope
  /** Department display name, used in the department-scope intro when provided. */
  departmentName?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const STRINGS = {
  en: {
    subject: (n: number) => `Your compliance digest — ${n} item${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`,
    title: 'Items needing your attention',
    greeting: (n?: string) => (n ? `Hi ${n},` : 'Hello,'),
    intro: 'Here is your daily summary of deadlines assigned to you.',
    // Manager / department oversight digest.
    subjectDept: (n: number) => `Department compliance digest — ${n} item${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention`,
    titleDept: 'Items across your department needing attention',
    introDept: (dept?: string) =>
      dept
        ? `Here is the daily oversight summary for the ${dept} department — every overdue or at-risk item assigned to your team.`
        : 'Here is the daily oversight summary for your department — every overdue or at-risk item assigned to your team.',
    ownedBy: (name: string) => `assigned to ${name}`,
    overdue: 'Overdue',
    upcoming: 'Due soon',
    cta: 'Open ComplianceOS',
    overdueBy: (n: number) => `${n} day${n === 1 ? '' : 's'} overdue`,
    dueIn: (n: number) => (n === 0 ? 'due today' : `due in ${n} day${n === 1 ? '' : 's'}`),
  },
  ar: {
    subject: (n: number) => `ملخصك اليومي للالتزام — ${n} بند بحاجة إلى انتباه`,
    title: 'بنود بحاجة إلى انتباهك',
    greeting: (n?: string) => (n ? `مرحباً ${n}،` : 'مرحباً،'),
    intro: 'هذا ملخصك اليومي بالمواعيد النهائية المسندة إليك.',
    // Manager / department oversight digest.
    subjectDept: (n: number) => `ملخص التزام القسم — ${n} بند بحاجة إلى انتباه`,
    titleDept: 'بنود في قسمك بحاجة إلى انتباه',
    introDept: (dept?: string) =>
      dept
        ? `هذا ملخص الإشراف اليومي لقسم ${dept} — كل بند متأخر أو معرّض للخطر مسند إلى فريقك.`
        : 'هذا ملخص الإشراف اليومي لقسمك — كل بند متأخر أو معرّض للخطر مسند إلى فريقك.',
    ownedBy: (name: string) => `مسند إلى ${name}`,
    overdue: 'متأخرة',
    upcoming: 'قريبة الاستحقاق',
    cta: 'فتح ComplianceOS',
    overdueBy: (n: number) => `متأخر ${n} يوم`,
    dueIn: (n: number) => (n === 0 ? 'مستحق اليوم' : `خلال ${n} يوم`),
  },
} as const

function section(locale: EmailLocale, heading: string, items: DigestItem[], accent: string): string {
  if (items.length === 0) return ''
  const base = appUrl()
  const s = STRINGS[locale]
  const rows = items
    .map((it) => {
      const label = it.daysOut < 0 ? s.overdueBy(Math.abs(it.daysOut)) : s.dueIn(it.daysOut)
      // In the department digest each item carries its owner so the manager
      // sees whose work is at risk; the personal digest leaves `owner` unset.
      const owner = it.owner
        ? ` <span style="color:${EMAIL_BRAND.muted};">· ${escapeHtml(s.ownedBy(it.owner))}</span>`
        : ''
      return `<li style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${EMAIL_BRAND.text};">
        <a href="${escapeHtml(base + it.route)}" style="color:${EMAIL_BRAND.text};font-weight:700;text-decoration:none;">${escapeHtml(it.title)}</a>
        <span style="color:${EMAIL_BRAND.muted};"> — ${escapeHtml(label)}</span>${owner}
      </li>`
    })
    .join('')
  return `
    <p style="margin:18px 0 8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${accent};">${escapeHtml(
      heading,
    )} (${items.length})</p>
    <ul style="margin:0;padding-inline-start:18px;">${rows}</ul>`
}

export function renderDigestEmail(input: DigestInput): RenderedEmail {
  const s = STRINGS[input.locale]
  const count = input.overdue.length + input.upcoming.length
  const dept = input.scope === 'department'

  const subject = dept ? s.subjectDept(count) : s.subject(count)
  const title = dept ? s.titleDept : s.title
  const intro = dept ? s.introDept(input.departmentName) : s.intro

  const body = [
    emailHeading(title),
    `<p style="margin:0 0 4px;font-size:15px;color:${EMAIL_BRAND.text};">${escapeHtml(s.greeting(input.recipientName))}</p>`,
    `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.text};">${escapeHtml(intro)}</p>`,
    section(input.locale, s.overdue, input.overdue, '#e11d48'),
    section(input.locale, s.upcoming, input.upcoming, EMAIL_BRAND.greenDark),
    `<div style="margin-top:20px;">${emailButton(s.cta, appUrl(), input.locale)}</div>`,
  ].join('\n')

  const html = renderEmailLayout({
    locale: input.locale,
    previewText: subject,
    bodyHtml: body,
  })

  return { subject, html, text: htmlToText(html) }
}
