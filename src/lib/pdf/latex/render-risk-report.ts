// Executive "Risk Register" — cover + summary + a 5×5 likelihood×impact heat map
// (band-coloured cells with a per-cell risk count) + a detail table. Bilingual.
//
// Risk bands (matches the app's risk matrix / @react-pdf risk template):
//   score>15 critical · >9 high · >4 medium · else low   (score = likelihood×impact)

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

const RiskRow = z.object({
  id: z.string().optional(),
  name: z.string(),
  category: z.string().optional(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  score: z.number().optional(),
  owner: z.string().optional(),
  status: z.string().default('open'),
})

export const RiskRegisterDataSchema = z.object({
  organization: z.string().default('الشركة المتحدة للخدمات المالية'),
  generatedBy: z.string().default(''),
  date: z.string(),
  subtitle: z.string().optional(),
  risks: z.array(RiskRow).default([]),
})

export type RiskRegisterData = z.infer<typeof RiskRegisterDataSchema>

const LABELS = {
  en: {
    docTitle: 'Risk Register',
    org: 'Organization:', by: 'Prepared by:', date: 'Date:', scope: 'Scope:',
    summary: 'Summary', heatmap: 'Risk Heat Map', register: 'Risk Register',
    total: 'Total Risks', critical: 'Critical', high: 'High', active: 'Active',
    likelihood: 'Likelihood', impact: 'Impact',
    none: 'No risks match the current selection.',
    hRef: 'Ref', hRisk: 'Risk', hCategory: 'Category', hL: 'L', hI: 'I', hScore: 'Score', hOwner: 'Owner', hStatus: 'Status',
    level: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    status: { open: 'Open', identified: 'Open', mitigating: 'Mitigating', accepted: 'Accepted', closed: 'Closed', resolved: 'Closed' },
    unowned: 'Unassigned',
  },
  ar: {
    docTitle: 'سجل المخاطر',
    org: 'المنشأة:', by: 'أعدّه:', date: 'التاريخ:', scope: 'النطاق:',
    summary: 'ملخص', heatmap: 'خريطة المخاطر الحرارية', register: 'سجل المخاطر',
    total: 'إجمالي المخاطر', critical: 'حرجة', high: 'عالية', active: 'نشطة',
    likelihood: 'الاحتمالية', impact: 'الأثر',
    none: 'لا توجد مخاطر مطابقة للتحديد الحالي.',
    hRef: 'المرجع', hRisk: 'الخطر', hCategory: 'الفئة', hL: 'ح', hI: 'أ', hScore: 'النتيجة', hOwner: 'المالك', hStatus: 'الحالة',
    level: { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' },
    status: { open: 'مفتوحة', identified: 'مفتوحة', mitigating: 'قيد المعالجة', accepted: 'مقبولة', closed: 'مغلقة', resolved: 'مغلقة' },
    unowned: 'غير مُسند',
  },
} as const

type LevelKey = 'critical' | 'high' | 'medium' | 'low'
const bandKey = (score: number): LevelKey =>
  score > 15 ? 'critical' : score > 9 ? 'high' : score > 4 ? 'medium' : 'low'
const CELL_FILL: Record<LevelKey, string> = {
  critical: 'rose!75',
  high: 'amber!72',
  medium: 'blue!42',
  low: 'brandgreen!55',
}
const SCORE_TEXT: Record<LevelKey, string> = {
  critical: 'rose',
  high: 'amber',
  medium: 'blue',
  low: 'brandgreendark',
}

export interface BuiltTex {
  tex: string
  assets: Record<string, string>
  filename: string
}

function clamp(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)))
}

/** 5×5 heat map: band-coloured cells, score in empty cells, count badge where risks sit. */
function riskHeatMap(risks: RiskRegisterData['risks'], L: (typeof LABELS)['en'] | (typeof LABELS)['ar']): string {
  const counts: Record<string, number> = {}
  for (const r of risks) {
    const k = `${clamp(r.likelihood)},${clamp(r.impact)}`
    counts[k] = (counts[k] ?? 0) + 1
  }
  const parts: string[] = []
  for (let l = 1; l <= 5; l++) {
    for (let i = 1; i <= 5; i++) {
      const x = l - 1
      const y = i - 1
      const score = l * i
      const fill = CELL_FILL[bandKey(score)]
      const cx = (x + 0.5).toFixed(1)
      const cy = (y + 0.5).toFixed(1)
      parts.push(`\\fill[${fill}] (${x},${y}) rectangle (${x + 1},${y + 1});`)
      parts.push(`\\draw[white,line width=1.2pt] (${x},${y}) rectangle (${x + 1},${y + 1});`)
      const n = counts[`${l},${i}`] ?? 0
      if (n > 0) {
        parts.push(`\\fill[slate900] (${cx},${cy}) circle (0.32);`)
        parts.push(`\\node[white,font=\\footnotesize\\bfseries] at (${cx},${cy}) {${n}};`)
      } else {
        parts.push(`\\node[font=\\scriptsize,color=slate700] at (${cx},${cy}) {${score}};`)
      }
    }
  }
  for (let k = 1; k <= 5; k++) {
    parts.push(`\\node[below,font=\\scriptsize,color=slate700] at (${k - 0.5},0) {${k}};`)
    parts.push(`\\node[left,font=\\scriptsize,color=slate700] at (0,${k - 0.5}) {${k}};`)
  }
  parts.push(`\\node[below,font=\\small\\bfseries,color=slate700] at (2.5,-0.6) {${escapeLatex(L.likelihood)}};`)
  parts.push(`\\node[rotate=90,above,font=\\small\\bfseries,color=slate700] at (-0.6,2.5) {${escapeLatex(L.impact)}};`)
  return RAW`\begin{center}\begin{tikzpicture}[x=1.35cm,y=1.35cm]
${parts.join('\n')}
\end{tikzpicture}\end{center}`
}

export function buildRiskRegisterTex(input: unknown, locale: LatexLocale = 'en'): BuiltTex {
  const d = RiskRegisterDataSchema.parse(input)
  const isEn = locale === 'en'
  const L = isEn ? LABELS.en : LABELS.ar
  const risks = d.risks

  const level = { critical: 0, high: 0, medium: 0, low: 0 }
  let active = 0
  for (const r of risks) {
    const score = r.score ?? r.likelihood * r.impact
    level[bandKey(score)] += 1
    const s = (r.status ?? '').toLowerCase()
    if (s === 'open' || s === 'identified' || s === 'mitigating') active += 1
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
${statCard(risks.length, L.total, 'slate')} &
${statCard(level.critical, L.critical, 'rose')} &
${statCard(level.high, L.high, 'amber')} &
${statCard(active, L.active, 'slate')} \\
\end{tabularx}`

  const summarySection = RAW`\section{${L.summary}}
${cards}`

  const heatSection = RAW`\section{${L.heatmap}}
${riskHeatMap(risks, L)}`

  const colSpec = '@{}p{1.1cm} p{4.3cm} p{2.3cm} c c c p{2.7cm} l@{}'
  const rows = risks.map((r) => {
    const score = r.score ?? r.likelihood * r.impact
    const statusKey = (r.status ?? 'open').toLowerCase()
    const status = (L.status as Record<string, string>)[statusKey] ?? escapeLatex(r.status ?? '')
    return [
      escapeLatex(r.id ?? '—'),
      escapeLatex(r.name),
      escapeLatex(r.category ?? '—'),
      String(r.likelihood),
      String(r.impact),
      `\\textbf{\\textcolor{${SCORE_TEXT[bandKey(score)]}}{${score}}}`,
      escapeLatex(r.owner || L.unowned),
      escapeLatex(status),
    ]
  })

  const registerSection = RAW`\section{${L.register}}
${
  risks.length
    ? longTable({
        colSpec,
        headers: [L.hRef, L.hRisk, L.hCategory, L.hL, L.hI, L.hScore, L.hOwner, L.hStatus],
        rows,
      })
    : RAW`{\color{slate500} ${L.none}}`
}`

  const tex = RAW`${reportPreamble({ docTitle: L.docTitle, headerTitle: L.docTitle }, locale)}
\begin{document}
${cover}
${summarySection}

${heatSection}

${registerSection}
\end{document}
`

  return {
    tex,
    assets: REPORT_ASSETS,
    filename: `Risk-Register-${d.date.replace(/[^\w-]+/g, '-')}.pdf`,
  }
}
