// Executive "Compliance Status Report" — a polished, print-ready report built
// from the dashboard's compliance score + KPI rollup. Cover page + sections +
// pgfplots charts (NOT a 1:1 mirror of the dashboard screen). Bilingual.
//
// Data is mapped from `DashboardMetrics` by the dashboard page before calling.
// Strings (component/framework/deduction text) arrive already localized by the
// caller; this builder only adds static section titles + table headers per locale.

import { z } from 'zod'
import { escapeLatex } from './sanitize'
import {
  reportPreamble,
  coverPage,
  scoreBar,
  xbarChart,
  severityBars,
  trendLineChart,
  REPORT_ASSETS,
  type LatexLocale,
} from './report-base'

const RAW = String.raw

const ScoredItem = z.object({ name: z.string(), score: z.number(), weight: z.number().optional() })
const Severity = z.object({ critical: z.number(), high: z.number(), medium: z.number(), low: z.number() })

export const ComplianceReportDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  period: z.string().optional(),

  overallScore: z.number(),
  change: z.number().optional(),
  confidence: z.string().optional(),

  components: z.array(ScoredItem).default([]),
  frameworks: z.array(ScoredItem).default([]),
  trend: z.array(z.object({ label: z.string(), actual: z.number(), target: z.number() })).default([]),

  kpis: z
    .object({
      audits: z.object({ total: z.number(), overdue: z.number(), upcoming: z.number() }).partial().optional(),
      observations: z.object({ total: z.number(), open: z.number(), overdue: z.number() }).partial().optional(),
      risks: z.object({ total: z.number(), open: z.number() }).partial().optional(),
      policies: z.object({ approved: z.number(), overdue: z.number(), requiresReview: z.number() }).partial().optional(),
      letters: z.object({ overdue: z.number(), upcoming: z.number() }).partial().optional(),
    })
    .optional(),

  observationsBySeverity: Severity.optional(),
  risksByLevel: Severity.optional(),

  deductions: z
    .array(z.object({ reason: z.string(), severity: z.string().optional(), points: z.number() }))
    .default([]),
})

export type ComplianceReportData = z.infer<typeof ComplianceReportDataSchema>

const LABELS = {
  en: {
    docTitle: 'Compliance Status Report',
    header: 'Compliance Status Report',
    org: 'Organization:',
    by: 'Prepared by:',
    period: 'Period:',
    date: 'Date:',
    health: 'Compliance Health',
    overallOf: '/100',
    confidence: 'Confidence',
    change: 'Change',
    components: 'Score Components',
    component: 'Component',
    score: 'Score',
    weight: 'Weight',
    trend: 'Score Trend',
    actual: 'Actual',
    target: 'Target',
    byFramework: 'Compliance by Framework',
    keyMetrics: 'Key Metrics',
    obsBySeverity: 'Open observations by severity',
    risksByLevel: 'Open risks by level',
    deductions: 'Score Deductions',
    reason: 'Reason',
    severity: 'Severity',
    points: 'Impact',
    none: 'No score deductions in this period.',
    critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
    overdueAudits: 'Overdue audits', openObs: 'Open observations', overdueObs: 'Overdue observations',
    openRisks: 'Open risks', overduePolicies: 'Overdue policies', overdueLetters: 'Overdue letters',
  },
  ar: {
    docTitle: 'تقرير حالة الامتثال',
    header: 'تقرير حالة الامتثال',
    org: 'المنشأة:',
    by: 'أعدّه:',
    period: 'الفترة:',
    date: 'التاريخ:',
    health: 'صحة الامتثال',
    overallOf: '/١٠٠',
    confidence: 'الثقة',
    change: 'التغير',
    components: 'مكونات النتيجة',
    component: 'المكوّن',
    score: 'النتيجة',
    weight: 'الوزن',
    trend: 'اتجاه النتيجة',
    actual: 'الفعلي',
    target: 'المستهدف',
    byFramework: 'الامتثال حسب الإطار',
    keyMetrics: 'المؤشرات الرئيسية',
    obsBySeverity: 'الملاحظات المفتوحة حسب الخطورة',
    risksByLevel: 'المخاطر المفتوحة حسب المستوى',
    deductions: 'أسباب خصم النقاط',
    reason: 'السبب',
    severity: 'الخطورة',
    points: 'الأثر',
    none: 'لا توجد خصومات في هذه الفترة.',
    critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة',
    overdueAudits: 'مراجعات متأخرة', openObs: 'ملاحظات مفتوحة', overdueObs: 'ملاحظات متأخرة',
    openRisks: 'مخاطر مفتوحة', overduePolicies: 'سياسات متأخرة', overdueLetters: 'خطابات متأخرة',
  },
} as const

const scoreColor = (v: number) => (v >= 80 ? 'brandgreendark' : v >= 60 ? 'amber' : 'rose')

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

export function buildComplianceReportTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = ComplianceReportDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const sevLabels = { critical: L.critical, high: L.high, medium: L.medium, low: L.low }

  const overall = Math.round(d.overallScore)
  const changeStr =
    d.change === undefined ? '—' : `${d.change > 0 ? '+' : ''}${d.change.toFixed(1)}`

  // Cover
  const cover = coverPage(
    {
      title: L.docTitle,
      subtitle: d.period,
      rows: [
        { label: L.org, value: d.organization },
        { label: L.by, value: d.generatedBy || '—' },
        ...(d.period ? [{ label: L.period, value: d.period }] : []),
        { label: L.date, value: d.date },
      ],
    },
    locale,
  )

  // §1 Compliance Health: big score + bar + components chart/table
  const componentsChart = d.components.length
    ? xbarChart(d.components.map((c) => ({ label: c.name, value: Math.round(c.score) })))
    : ''
  const componentsTable = d.components.length
    ? RAW`\begin{tabularx}{\textwidth}{@{}Xrr@{}}
\toprule
\rowcolor{slate50}\textbf{${L.component}} & \textbf{${L.score}} & \textbf{${L.weight}} \\
\midrule
${d.components
  .map(
    (c) =>
      `${escapeLatex(c.name)} & \\textbf{\\color{${scoreColor(c.score)}}${Math.round(c.score)}} & ${c.weight ?? '—'}\\% \\\\`,
  )
  .join('\n')}
\bottomrule
\end{tabularx}`
    : ''

  const healthSection = RAW`\section{${L.health}}
\noindent
\begin{minipage}[c]{0.28\textwidth}
{\fontsize{50}{50}\selectfont\bfseries\color{${scoreColor(overall)}} ${overall}}{\Large\color{slate500} ${L.overallOf}}
\end{minipage}%
\begin{minipage}[c]{0.70\textwidth}
${scoreBar(overall)}\\[8pt]
{\color{slate700} ${L.confidence}: \textbf{${escapeLatex(d.confidence ?? '—')}}\qquad ${L.change}: \textbf{${changeStr}}}
\end{minipage}

\subsection{${L.components}}
${componentsChart}
\vspace{4pt}
${componentsTable}`

  // §2 Trend
  const trendSection = d.trend.length
    ? RAW`\section{${L.trend}}
${trendLineChart(
  d.trend.map((t) => ({ label: t.label, actual: Math.round(t.actual), target: Math.round(t.target) })),
  { actual: L.actual, target: L.target },
)}`
    : ''

  // §3 By framework
  const frameworkSection = d.frameworks.length
    ? RAW`\section{${L.byFramework}}
${xbarChart(d.frameworks.map((f) => ({ label: f.name, value: Math.round(f.score) })))}`
    : ''

  // §4 Key metrics: KPI table + severity/level bars
  const kpiRows: Array<[string, number, string]> = []
  if (d.kpis?.audits?.overdue !== undefined) kpiRows.push([L.overdueAudits, d.kpis.audits.overdue, 'rose'])
  if (d.kpis?.observations?.open !== undefined) kpiRows.push([L.openObs, d.kpis.observations.open, 'slate900'])
  if (d.kpis?.observations?.overdue !== undefined) kpiRows.push([L.overdueObs, d.kpis.observations.overdue, 'rose'])
  if (d.kpis?.risks?.open !== undefined) kpiRows.push([L.openRisks, d.kpis.risks.open, 'slate900'])
  if (d.kpis?.policies?.overdue !== undefined) kpiRows.push([L.overduePolicies, d.kpis.policies.overdue, 'rose'])
  if (d.kpis?.letters?.overdue !== undefined) kpiRows.push([L.overdueLetters, d.kpis.letters.overdue, 'rose'])

  const kpiCards = kpiRows.length
    ? RAW`\noindent\begin{tabularx}{\textwidth}{*{3}{>{\centering\arraybackslash}X}}
${chunk(kpiRows, 3)
  .map(
    (group) =>
      group
        .map(
          ([cap, val, color]) =>
            `\\begin{minipage}[t]{\\linewidth}\\centering{\\fontsize{20}{22}\\selectfont\\bfseries\\color{${color}} ${val}}\\\\[2pt]{\\footnotesize\\color{slate500} ${escapeLatex(cap)}}\\end{minipage}`,
        )
        .join(' & ') + ' \\\\[10pt]',
  )
  .join('\n')}
\end{tabularx}`
    : ''

  const obsBars = d.observationsBySeverity
    ? RAW`\subsection{${L.obsBySeverity}}
${severityBars(d.observationsBySeverity, sevLabels)}`
    : ''
  const riskBars = d.risksByLevel
    ? RAW`\subsection{${L.risksByLevel}}
${severityBars(d.risksByLevel, sevLabels)}`
    : ''

  const kpiSection =
    kpiCards || obsBars || riskBars
      ? RAW`\section{${L.keyMetrics}}
${kpiCards}
${obsBars}
${riskBars}`
      : ''

  // §5 Deductions
  const deductionsSection = RAW`\section{${L.deductions}}
${
  d.deductions.length
    ? RAW`\begin{tabularx}{\textwidth}{@{}Xlr@{}}
\toprule
\rowcolor{slate50}\textbf{${L.reason}} & \textbf{${L.severity}} & \textbf{${L.points}} \\
\midrule
${d.deductions
  .map(
    (x) =>
      `${escapeLatex(x.reason)} & ${severityTag(x.severity, sevLabels)} & \\textbf{\\color{rose}${x.points}} \\\\`,
  )
  .join('\n')}
\bottomrule
\end{tabularx}`
    : RAW`{\color{slate500} ${L.none}}`
}`

  const tex = RAW`${reportPreamble({ docTitle: L.docTitle, headerTitle: L.header }, locale)}
\begin{document}
${cover}
${healthSection}

${trendSection}

${frameworkSection}

${kpiSection}

${deductionsSection}
\end{document}
`

  return {
    tex,
    assets: REPORT_ASSETS,
    filename: `Compliance-Report-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}

function severityTag(
  sev: string | undefined,
  labels: { critical: string; high: string; medium: string; low: string },
): string {
  const map: Record<string, [string, string]> = {
    critical: [labels.critical, 'rose'],
    high: [labels.high, 'rose'],
    medium: [labels.medium, 'amber'],
    low: [labels.low, 'brandgreendark'],
  }
  const [label, color] = map[(sev ?? '').toLowerCase()] ?? [sev ?? '—', 'slate700']
  return `\\textcolor{${color}}{${escapeLatex(label)}}`
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
