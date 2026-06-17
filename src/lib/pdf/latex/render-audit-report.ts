// Executive "Audits Report" — cover + summary (stat cards + priority chart) +
// a multi-page audit register table. Bilingual. Built from the audits reports
// list (audit metadata: type, priority, status, owner, due, progress); the app
// has no separate audit-"findings" entity, so this is a register, not a
// per-finding report. Counts are computed from the supplied list.

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

const AuditRow = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  priority: z.string().default('medium'),
  status: z.string().default('pending'),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  progress: z.number().optional(),
})

export const AuditReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  audits: z.array(AuditRow).default([]),
})

export type AuditReportData = z.infer<typeof AuditReportDataSchema>

const LABELS = {
  en: {
    docTitle: 'Audits Report',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', detail: 'Audit Register',
    total: 'Total Audits', overdue: 'Overdue', inProgress: 'In Progress', completed: 'Completed',
    byPriority: 'By priority', none: 'No audits match the current selection.',
    hRef: 'Ref', hAudit: 'Audit', hType: 'Type', hPriority: 'Priority', hStatus: 'Status', hOwner: 'Owner', hDue: 'Due', hProgress: 'Progress',
    sev: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    status: { pending: 'Pending', in_progress: 'In Progress', in_review: 'In Review', completed: 'Completed', overdue: 'Overdue' },
    type: { internal: 'Internal' },
    unassigned: 'Unassigned',
  },
  ar: {
    docTitle: 'تقرير المراجعات',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', detail: 'سجل المراجعات',
    total: 'إجمالي المراجعات', overdue: 'متأخرة', inProgress: 'قيد التنفيذ', completed: 'مكتملة',
    byPriority: 'حسب الأولوية', none: 'لا توجد مراجعات مطابقة للتحديد الحالي.',
    hRef: 'المرجع', hAudit: 'المراجعة', hType: 'النوع', hPriority: 'الأولوية', hStatus: 'الحالة', hOwner: 'المسؤول', hDue: 'الاستحقاق', hProgress: 'التقدم',
    sev: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    status: { pending: 'معلقة', in_progress: 'قيد التنفيذ', in_review: 'قيد المراجعة', completed: 'مكتملة', overdue: 'متأخرة' },
    type: { internal: 'داخلية' },
    unassigned: 'غير مُسند',
  },
} as const

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

function typeLabel(type: string | undefined, L: (typeof LABELS)['en'] | (typeof LABELS)['ar']): string {
  if (!type) return '—'
  const key = type.toLowerCase()
  if (key in L.type) return (L.type as Record<string, string>)[key]
  return type.toUpperCase() // regulator acronyms: SAMA, CMA, …
}

export function buildAuditReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = AuditReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const audits = d.audits

  const prio = { critical: 0, high: 0, medium: 0, low: 0 }
  let overdue = 0
  let inProgress = 0
  let completed = 0
  for (const a of audits) {
    const p = (a.priority ?? 'medium').toLowerCase() as keyof typeof prio
    if (p in prio) prio[p] += 1
    if (a.status === 'overdue') overdue += 1
    else if (a.status === 'in_progress') inProgress += 1
    else if (a.status === 'completed') completed += 1
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
${statCard(audits.length, L.total, 'slate')} &
${statCard(overdue, L.overdue, 'rose')} &
${statCard(inProgress, L.inProgress, 'slate')} &
${statCard(completed, L.completed, 'green')} \\
\end{tabularx}`

  const summarySection = RAW`\section{${L.summary}}
${cards}
\vspace{6pt}
\subsection{${L.byPriority}}
${severityBars(prio, L.sev)}`

  const colSpec = '@{}p{1.0cm} p{4.1cm} l l l p{2.5cm} l c@{}'
  const rows = audits.map((a) => {
    const statusKey = (a.status ?? 'pending').toLowerCase()
    const statusLabel = (L.status as Record<string, string>)[statusKey] ?? escapeLatex(a.status ?? '')
    const status =
      a.status === 'overdue' ? `\\textcolor{rose}{${escapeLatex(statusLabel)}}` : escapeLatex(statusLabel)
    return [
      escapeLatex(a.id ?? '—'),
      escapeLatex(a.name),
      escapeLatex(typeLabel(a.type, L)),
      severityBadge(a.priority, L.sev),
      status,
      escapeLatex(a.owner || L.unassigned),
      a.dueDate ? escapeLatex(a.dueDate) : '—',
      a.progress !== undefined ? `${Math.round(a.progress)}\\%` : '—',
    ]
  })

  const detailSection = RAW`\section{${L.detail}}
${
  audits.length
    ? longTable({
        colSpec,
        headers: [L.hRef, L.hAudit, L.hType, L.hPriority, L.hStatus, L.hOwner, L.hDue, L.hProgress],
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
    filename: `Audits-Report-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
