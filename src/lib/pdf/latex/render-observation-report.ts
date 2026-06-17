// Executive "Observations Report" — cover + summary (stat cards + severity
// chart) + a multi-page detail table. Bilingual. Counts are computed from the
// supplied list so the summary always matches the table.

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

const ObservationRow = z.object({
  reference: z.string().optional(),
  title: z.string(),
  severity: z.string().default('low'),
  source: z.string().optional(),
  status: z.string().default('open'),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  isOverdue: z.boolean().optional(),
})

export const ObservationReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  observations: z.array(ObservationRow).default([]),
})

export type ObservationReportData = z.infer<typeof ObservationReportDataSchema>

const LABELS = {
  en: {
    docTitle: 'Observations Report',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', detail: 'Observations',
    total: 'Total', open: 'Open', overdue: 'Overdue', critical: 'Critical',
    bySeverity: 'By severity', none: 'No observations match the current selection.',
    hRef: 'Ref', hTitle: 'Observation', hSeverity: 'Severity', hSource: 'Source',
    hStatus: 'Status', hAssignee: 'Assignee', hDue: 'Due',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    status: { open: 'Open', in_progress: 'In Progress', remediated: 'Remediated', resolved: 'Resolved', closed: 'Closed' },
    source: { internal: 'Internal', sharia: 'Sharia' },
    unassigned: 'Unassigned',
  },
  ar: {
    docTitle: 'تقرير الملاحظات',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', detail: 'الملاحظات',
    total: 'الإجمالي', open: 'مفتوحة', overdue: 'متأخرة', critical: 'حرجة',
    bySeverity: 'حسب الخطورة', none: 'لا توجد ملاحظات مطابقة للتحديد الحالي.',
    hRef: 'المرجع', hTitle: 'الملاحظة', hSeverity: 'الخطورة', hSource: 'المصدر',
    hStatus: 'الحالة', hAssignee: 'المسؤول', hDue: 'الاستحقاق',
    sev: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    status: { open: 'مفتوحة', in_progress: 'قيد المعالجة', remediated: 'تمت المعالجة', resolved: 'محلولة', closed: 'مغلقة' },
    source: { internal: 'داخلية', sharia: 'شرعية' },
    unassigned: 'غير مُسند',
  },
} as const

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

function sourceLabel(src: string | undefined, L: (typeof LABELS)['en'] | (typeof LABELS)['ar']): string {
  if (!src) return '—'
  const key = src.toLowerCase()
  if (key in L.source) return (L.source as Record<string, string>)[key]
  return src.toUpperCase() // regulator acronyms: SAMA, CMA, IA, ZATCA, …
}

export function buildObservationReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = ObservationReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const obs = d.observations

  // Counts from the supplied list (summary always matches the table).
  const sev = { critical: 0, high: 0, medium: 0, low: 0 }
  let open = 0
  let overdue = 0
  for (const o of obs) {
    const s = (o.severity ?? 'low').toLowerCase() as keyof typeof sev
    if (s in sev) sev[s] += 1
    if (o.status === 'open' || o.status === 'in_progress') open += 1
    if (o.isOverdue) overdue += 1
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
${statCard(obs.length, L.total, 'slate')} &
${statCard(open, L.open, 'slate')} &
${statCard(overdue, L.overdue, 'rose')} &
${statCard(sev.critical, L.critical, 'rose')} \\
\end{tabularx}`

  const summarySection = RAW`\section{${L.summary}}
${cards}
\vspace{6pt}
\subsection{${L.bySeverity}}
${severityBars(sev, L.sev)}`

  // Detail table
  const colSpec = '@{}p{1.7cm} p{4.5cm} l l l p{2.5cm} l@{}'
  const rows = obs.map((o) => {
    const due = o.dueDate
      ? o.isOverdue
        ? `\\textcolor{rose}{${escapeLatex(o.dueDate)}}`
        : escapeLatex(o.dueDate)
      : '—'
    const statusKey = (o.status ?? 'open').toLowerCase()
    const status = (L.status as Record<string, string>)[statusKey] ?? escapeLatex(o.status ?? '')
    return [
      escapeLatex(o.reference ?? '—'),
      escapeLatex(o.title),
      severityBadge(o.severity, L.sev),
      escapeLatex(sourceLabel(o.source, L)),
      escapeLatex(status),
      escapeLatex(o.assignee || L.unassigned),
      due,
    ]
  })

  const detailSection = RAW`\section{${L.detail}}
${
  obs.length
    ? longTable({
        colSpec,
        headers: [L.hRef, L.hTitle, L.hSeverity, L.hSource, L.hStatus, L.hAssignee, L.hDue],
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
    filename: `Observations-Report-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
