// Executive "Training Compliance Report" — cover + summary (stat cards +
// department breakdown) + a multi-page employee training table. Bilingual.
//
// Data is mapped from the training store's `employees` + `overviewStats` by the
// training page before calling downloadPdf. Each employee row contains their
// name, department, overall progress, and course count.

import { z } from 'zod'
import { escapeLatex } from './sanitize'
import {
  reportPreamble,
  coverPage,
  xbarChart,
  longTable,
  statCard,
  REPORT_ASSETS,
  type LatexLocale,
} from './report-base'

const RAW = String.raw

const EmployeeRow = z.object({
  name: z.string(),
  email: z.string().optional(),
  department: z.string().optional(),
  overallProgress: z.number().default(0),
  totalCourses: z.number().default(0),
  completedCourses: z.number().default(0),
  overdueCourses: z.number().default(0),
  isSaudi: z.boolean().optional(),
})

const DeptRow = z.object({
  name: z.string(),
  progress: z.number(),
  employees: z.number(),
  completed: z.number(),
  overdue: z.number(),
})

export const TrainingReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  overallCompletion: z.number().optional(),
  employees: z.array(EmployeeRow).default([]),
  departments: z.array(DeptRow).default([]),
})

export type TrainingReportData = z.infer<typeof TrainingReportDataSchema>

const LABELS = {
  en: {
    docTitle: 'Training Compliance Report',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', deptSection: 'By Department', detail: 'Employee Training Status',
    totalEmployees: 'Employees', overallCompletion: 'Overall Completion',
    overdueCourses: 'Overdue', fullCompliance: 'Fully Compliant',
    none: 'No employee records match the current selection.',
    hName: 'Employee', hDept: 'Department', hProgress: 'Progress',
    hCompleted: 'Completed', hOverdue: 'Overdue', hTotal: 'Total',
    status: {
      completed: 'Completed', 'in-progress': 'In Progress', overdue: 'Overdue', 'not-started': 'Not Started',
    },
  },
  ar: {
    docTitle: 'تقرير الامتثال التدريبي',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', deptSection: 'حسب الإدارة', detail: 'حالة التدريب للموظفين',
    totalEmployees: 'الموظفون', overallCompletion: 'الإتمام الكلي',
    overdueCourses: 'المتأخرة', fullCompliance: 'مكتملون بالكامل',
    none: 'لا توجد سجلات موظفين مطابقة للتحديد الحالي.',
    hName: 'الموظف', hDept: 'الإدارة', hProgress: 'التقدم',
    hCompleted: 'مكتملة', hOverdue: 'متأخرة', hTotal: 'الإجمالي',
    status: {
      completed: 'مكتملة', 'in-progress': 'جارية', overdue: 'متأخرة', 'not-started': 'لم تبدأ',
    },
  },
} as const

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

export function buildTrainingReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = TrainingReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const employees = d.employees

  const totalOverdue = employees.reduce((s, e) => s + (e.overdueCourses ?? 0), 0)
  const fullCompliant = employees.filter((e) => e.overallProgress >= 100).length
  const overallPct = d.overallCompletion ?? (
    employees.length > 0
      ? Math.round(employees.reduce((s, e) => s + (e.overallProgress ?? 0), 0) / employees.length)
      : 0
  )

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
${statCard(employees.length, L.totalEmployees, 'slate')} &
${statCard(`${overallPct}%`, L.overallCompletion, overallPct >= 80 ? 'green' : overallPct >= 60 ? 'amber' : 'rose')} &
${statCard(totalOverdue, L.overdueCourses, totalOverdue > 0 ? 'rose' : 'green')} &
${statCard(fullCompliant, L.fullCompliance, 'green')} \\
\end{tabularx}`

  // Department bar chart — only when departments are provided.
  const deptChart =
    d.departments.length > 0
      ? RAW`\subsection{${L.deptSection}}
${xbarChart(
  d.departments.map((dep) => ({ label: dep.name, value: Math.round(dep.progress) })),
  { max: 100 },
)}`
      : ''

  const summarySection = RAW`\section{${L.summary}}
${cards}
${deptChart}`

  const colSpec = '@{}p{3.2cm} p{2.8cm} c c c c@{}'
  const rows = employees.map((e) => {
    const pct = Math.round(e.overallProgress ?? 0)
    const progressText =
      pct >= 100
        ? `\\textbf{\\textcolor{brandgreendark}{${pct}\\%}}`
        : pct < 50
          ? `\\textcolor{rose}{${pct}\\%}`
          : `${pct}\\%`
    const overdueText =
      (e.overdueCourses ?? 0) > 0
        ? `\\textcolor{rose}{${e.overdueCourses}}`
        : String(e.overdueCourses ?? 0)
    return [
      escapeLatex(e.name),
      escapeLatex(e.department ?? '—'),
      progressText,
      String(e.completedCourses ?? 0),
      overdueText,
      String(e.totalCourses ?? 0),
    ]
  })

  const detailSection = RAW`\section{${L.detail}}
${
  employees.length
    ? longTable({
        colSpec,
        headers: [L.hName, L.hDept, L.hProgress, L.hCompleted, L.hOverdue, L.hTotal],
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
    filename: `Training-Compliance-Report-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
