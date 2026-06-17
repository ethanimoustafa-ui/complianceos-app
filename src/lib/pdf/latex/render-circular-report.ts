// Executive "Circulars / Regulatory Rules Report" — cover + summary (stat
// cards + priority chart) + a multi-page circular register table. Bilingual.
//
// This is a GENERATED LIST REPORT for the regulatory-updates/rules page header.
// It is entirely distinct from the per-circular "download source PDF" button
// (which downloads the user-uploaded pdfUrl file in CircularDetailsContent).

import { z } from 'zod'
import { escapeLatex } from './sanitize'
import {
  reportPreamble,
  coverPage,
  severityBars,
  severityBadge,
  longTable,
  statCard,
  REPORT_ASSETS,
  type LatexLocale,
} from './report-base'

const RAW = String.raw

const CircularRow = z.object({
  reference: z.string().optional(),
  title: z.string(),
  authority: z.string().optional(),
  priority: z.string().default('medium'),
  status: z.string().default('pending'),
  progress: z.number().optional(),
  issuanceDate: z.string().optional(),
  dueDate: z.string().optional(),
  departments: z.array(z.string()).optional(),
  isOverdue: z.boolean().optional(),
})

export const CircularReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  circulars: z.array(CircularRow).default([]),
})

export type CircularReportData = z.infer<typeof CircularReportDataSchema>

const LABELS = {
  en: {
    docTitle: 'Regulatory Circulars Report',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', detail: 'Circular Register',
    total: 'Total Circulars', overdue: 'Overdue', inProgress: 'In Progress', completed: 'Completed',
    byPriority: 'By priority',
    none: 'No circulars match the current selection.',
    hRef: 'Ref', hTitle: 'Circular', hAuthority: 'Authority', hPriority: 'Priority',
    hStatus: 'Status', hProgress: 'Progress', hDue: 'Due',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    status: {
      pending: 'Pending',
      'in-progress': 'In Progress',
      completed: 'Completed',
      overdue: 'Overdue',
    },
  },
  ar: {
    docTitle: 'تقرير التعاميم التنظيمية',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', detail: 'سجل التعاميم',
    total: 'إجمالي التعاميم', overdue: 'متأخرة', inProgress: 'قيد التنفيذ', completed: 'مكتملة',
    byPriority: 'حسب الأولوية',
    none: 'لا توجد تعاميم مطابقة للتحديد الحالي.',
    hRef: 'المرجع', hTitle: 'التعميم', hAuthority: 'الجهة', hPriority: 'الأولوية',
    hStatus: 'الحالة', hProgress: 'التقدم', hDue: 'الاستحقاق',
    sev: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    status: {
      pending: 'معلق',
      'in-progress': 'قيد التنفيذ',
      completed: 'مكتمل',
      overdue: 'متأخر',
    },
  },
} as const

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

export function buildCircularReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = CircularReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const circulars = d.circulars

  const prio = { critical: 0, high: 0, medium: 0, low: 0 }
  let overdue = 0
  let inProgress = 0
  let completed = 0

  for (const c of circulars) {
    const p = (c.priority ?? 'medium').toLowerCase() as keyof typeof prio
    if (p in prio) prio[p] += 1
    if (c.status === 'overdue' || c.isOverdue) overdue += 1
    else if (c.status === 'in-progress') inProgress += 1
    else if (c.status === 'completed') completed += 1
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

  const cards = RAW`\noindent\begin{tabularx}{\textwidth}{*{4}{>{\centering\arraybackslash}X}}
${statCard(circulars.length, L.total, 'slate')} &
${statCard(overdue, L.overdue, 'rose')} &
${statCard(inProgress, L.inProgress, 'slate')} &
${statCard(completed, L.completed, 'green')} \\
\end{tabularx}`

  const summarySection = RAW`\section{${L.summary}}
${cards}
\vspace{6pt}
\subsection{${L.byPriority}}
${severityBars(prio, L.sev)}`

  const colSpec = '@{}p{2.0cm} p{4.5cm} l l l c l@{}'
  const rows = circulars.map((c) => {
    const statusKey = (c.status ?? 'pending').toLowerCase() as keyof typeof L.status
    const statusLabel = (L.status as Record<string, string>)[statusKey] ?? escapeLatex(c.status ?? '')
    const status =
      c.status === 'overdue' || c.isOverdue
        ? `\\textcolor{rose}{${escapeLatex(statusLabel)}}`
        : escapeLatex(statusLabel)
    return [
      escapeLatex(c.reference ?? '—'),
      escapeLatex(c.title),
      escapeLatex((c.authority ?? '—').toUpperCase()),
      severityBadge(c.priority, L.sev),
      status,
      c.progress !== undefined ? `${Math.round(c.progress)}\\%` : '—',
      c.dueDate ? escapeLatex(c.dueDate) : '—',
    ]
  })

  const detailSection = RAW`\section{${L.detail}}
${
  circulars.length
    ? longTable({
        colSpec,
        headers: [L.hRef, L.hTitle, L.hAuthority, L.hPriority, L.hStatus, L.hProgress, L.hDue],
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
    filename: `Circulars-Report-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
