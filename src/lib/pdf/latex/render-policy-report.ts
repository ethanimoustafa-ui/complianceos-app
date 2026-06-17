// Executive "Policy Register Report" — cover + summary (stat cards + status
// breakdown) + a multi-page policy register table. Bilingual.
//
// This is a GENERATED LIST REPORT for the regulatory-updates/policies page header.
// It is entirely distinct from any per-policy uploaded-source-PDF download button
// (which downloads the user-uploaded attachment bytes inside PolicyDetailsContent).

import { z } from 'zod'
import { escapeLatex } from './sanitize'
import {
  reportPreamble,
  coverPage,
  longTable,
  statCard,
  REPORT_ASSETS,
  type LatexLocale,
} from './report-base'

const RAW = String.raw

const PolicyRow = z.object({
  id: z.string().optional(),
  name: z.string(),
  category: z.string().optional(),
  status: z.string().default('draft'),
  version: z.string().optional(),
  owner: z.string().optional(),
  lastReviewDate: z.string().optional(),
  nextReviewDate: z.string().optional(),
  approvalTier: z.string().optional(),
  isExpired: z.boolean().optional(),
})

export const PolicyReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  policies: z.array(PolicyRow).default([]),
})

export type PolicyReportData = z.infer<typeof PolicyReportDataSchema>

const STATUS_COLOR: Record<string, string> = {
  approved: 'brandgreendark',
  draft: 'slate700',
  'under-review': 'amber',
  expired: 'rose',
  overdue: 'rose',
  'requires-review': 'amber',
  renewed: 'brandgreendark',
  archived: 'slate500',
}

const LABELS = {
  en: {
    docTitle: 'Policy Register',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', detail: 'Policy Register',
    total: 'Total Policies', approved: 'Approved', underReview: 'Under Review',
    expired: 'Expired', draft: 'Draft',
    none: 'No policies match the current selection.',
    hRef: 'Ref', hPolicy: 'Policy', hCategory: 'Category', hStatus: 'Status',
    hVersion: 'Version', hOwner: 'Owner', hNextReview: 'Next Review',
    status: {
      draft: 'Draft',
      'under-review': 'Under Review',
      approved: 'Approved',
      expired: 'Expired',
      overdue: 'Overdue',
      'requires-review': 'Requires Review',
      renewed: 'Renewed',
      archived: 'Archived',
    },
    unassigned: 'Unassigned',
  },
  ar: {
    docTitle: 'سجل السياسات',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', detail: 'سجل السياسات',
    total: 'إجمالي السياسات', approved: 'معتمدة', underReview: 'قيد المراجعة',
    expired: 'منتهية', draft: 'مسودة',
    none: 'لا توجد سياسات مطابقة للتحديد الحالي.',
    hRef: 'المرجع', hPolicy: 'السياسة', hCategory: 'الفئة', hStatus: 'الحالة',
    hVersion: 'الإصدار', hOwner: 'المسؤول', hNextReview: 'المراجعة القادمة',
    status: {
      draft: 'مسودة',
      'under-review': 'قيد المراجعة',
      approved: 'معتمدة',
      expired: 'منتهية',
      overdue: 'متأخرة',
      'requires-review': 'تستلزم مراجعة',
      renewed: 'مجددة',
      archived: 'مؤرشفة',
    },
    unassigned: 'غير مُسند',
  },
} as const

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

export function buildPolicyReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = PolicyReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const policies = d.policies

  let approved = 0
  let underReview = 0
  let expired = 0
  let draft = 0

  for (const p of policies) {
    const s = (p.status ?? 'draft').toLowerCase()
    if (s === 'approved' || s === 'renewed') approved += 1
    else if (s === 'under-review' || s === 'requires-review') underReview += 1
    else if (s === 'expired' || (p.isExpired && s !== 'archived' && s !== 'renewed')) expired += 1
    else if (s === 'draft') draft += 1
  }

  const cover = coverPage(
    {
      title: L.docTitle,
      subtitle: d.subtitle,
      rows: [
        { label: L.org, value: d.organization },
        { label: L.by, value: d.generatedBy || '—' },
        ...(d.subtitle ? [{ label: L.scope, value: d.subtitle }] : []),
        { label: L.date, value: d.date },
      ],
    },
    locale,
  )

  const cards = RAW`\noindent\begin{tabularx}{\textwidth}{*{5}{>{\centering\arraybackslash}X}}
${statCard(policies.length, L.total, 'slate')} &
${statCard(approved, L.approved, 'green')} &
${statCard(underReview, L.underReview, 'amber')} &
${statCard(draft, L.draft, 'slate')} &
${statCard(expired, L.expired, 'rose')} \\
\end{tabularx}`

  const summarySection = RAW`\section{${L.summary}}
${cards}`

  const colSpec = '@{}p{1.8cm} p{4.3cm} p{2.0cm} l l p{1.8cm} l@{}'
  const rows = policies.map((p) => {
    const statusKey = (p.status ?? 'draft').toLowerCase() as keyof typeof L.status
    const statusLabel = (L.status as Record<string, string>)[statusKey] ?? escapeLatex(p.status ?? '')
    const color = STATUS_COLOR[statusKey] ?? 'slate700'
    const status = `\\textbf{\\textcolor{${color}}{${escapeLatex(statusLabel)}}}`
    return [
      escapeLatex(p.id ?? '—'),
      escapeLatex(p.name),
      escapeLatex(p.category ?? '—'),
      status,
      escapeLatex(p.version ?? '—'),
      escapeLatex(p.owner || L.unassigned),
      p.nextReviewDate ? escapeLatex(p.nextReviewDate) : '—',
    ]
  })

  const detailSection = RAW`\section{${L.detail}}
${
  policies.length
    ? longTable({
        colSpec,
        headers: [L.hRef, L.hPolicy, L.hCategory, L.hStatus, L.hVersion, L.hOwner, L.hNextReview],
        rows,
      })
    : RAW`{\color{slate500} ${L.none}}`
}`

  const tex = RAW`${reportPreamble({ docTitle: L.docTitle, headerTitle: L.docTitle }, locale)}
\begin{document}
${cover}
${summarySection}

${detailSection}
\end{document}
`

  return {
    tex,
    assets: REPORT_ASSETS,
    filename: `Policy-Register-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
