// Maps the dashboard's `DashboardMetrics` to the LaTeX compliance-report data
// contract. Lives client-side (the dashboard page has `metrics`, `t`, language).
// Type-only imports keep it out of the client's runtime weight.

import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'
import type { ComplianceReportData } from '@/lib/pdf/latex/render-compliance-report'

type Locale = 'en' | 'ar'
type TFn = (key: string, params?: Record<string, string>) => string

/** Which hero mode was active when the export was triggered. */
export type ComplianceReportMode = 'business' | 'department'

const COMPONENT_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    auditCompletion: 'Audit Completion',
    observationClosure: 'Observation Closure',
    riskPosture: 'Risk Posture',
    policyCurrency: 'Policy Currency',
    trainingCompletion: 'Training Completion',
  },
  ar: {
    auditCompletion: 'إنجاز المراجعات',
    observationClosure: 'إغلاق الملاحظات',
    riskPosture: 'وضع المخاطر',
    policyCurrency: 'حداثة السياسات',
    trainingCompletion: 'إنجاز التدريب',
  },
}

const ORG_NAME: Record<Locale, string> = {
  en: 'United Company for Financial Services',
  ar: 'الشركة المتحدة للخدمات المالية',
}

function frameworkLabel(id: string, metrics: DashboardMetrics): string {
  const f =
    metrics.frameworks.enabled.find((x) => x.id === id) ??
    metrics.frameworks.pinned.find((x) => x.id === id)
  return f?.name ?? id.toUpperCase()
}

export function toComplianceReportData(
  metrics: DashboardMetrics,
  opts: { locale: Locale; t: TFn; date: string; period?: string; mode?: ComplianceReportMode },
): ComplianceReportData {
  const { locale, t, date } = opts
  const mode = opts.mode ?? 'business'
  const c = metrics.compliance
  const compLabels = COMPONENT_LABELS[locale]

  // The "Compliance Health" hero score in the report matches whatever the
  // dashboard hero was showing when the export was triggered:
  // - 'business' → businessComplianceScore (evaluation-based, per-dept)
  // - 'department' → departmentHealthScore (7-component execution score)
  const overallScore = mode === 'business'
    ? metrics.health.businessComplianceScore
    : metrics.departmentHealthScore

  const components = Object.entries(c.components ?? {}).map(([key, v]) => ({
    name: compLabels[key] ?? key,
    score: v.score,
    weight: v.weight,
  }))

  const frameworks = Object.entries(c.frameworks ?? {}).map(([id, f]) => ({
    name: frameworkLabel(id, metrics),
    score: f.overall,
  }))

  const trend = (c.trend ?? []).map((p) => ({ label: p.month, actual: p.actual, target: p.target }))

  const deductions = (c.deductions ?? []).map((d) => ({
    reason: (d.descriptionKey ? t(d.descriptionKey, d.descriptionParams) : '') || d.description,
    severity: d.severity,
    points: d.points,
  }))

  const obs = metrics.observations
  const sev = (k: 'critical' | 'high' | 'medium' | 'low') =>
    (obs.bySource.sama[k] ?? 0) + (obs.bySource.internal[k] ?? 0) + (obs.bySource.sharia[k] ?? 0)

  // The subtitle line in the PDF notes which metric the hero score represents.
  const scoreModeLabel = mode === 'business'
    ? (locale === 'ar' ? 'صحة الامتثال التجاري' : 'Overall Business Compliance')
    : (locale === 'ar' ? 'صحة قسم الامتثال' : 'Compliance Department Health')

  return {
    organization: ORG_NAME[locale],
    generatedBy: metrics.currentUser?.name ?? '',
    date,
    period: opts.period,
    overallScore,
    // Pass the score-mode label through the `confidence` slot so the report's
    // "Confidence" row in the hero section shows the metric label instead.
    // The confidence field is optional/display-only in the template.
    confidence: scoreModeLabel,
    change: undefined, // change% is compliance-engine-based; don't show for business score
    components,
    frameworks,
    trend,
    kpis: {
      audits: {
        total: metrics.audits.total,
        overdue: metrics.audits.overdueCount,
        upcoming: metrics.audits.upcoming30dCount,
      },
      observations: { total: obs.total, open: obs.open, overdue: obs.overdueCount },
      risks: { total: metrics.risks.total, open: metrics.risks.open },
      policies: {
        approved: metrics.policies.approved,
        overdue: metrics.policies.overdue,
        requiresReview: metrics.policies.requiresReview,
      },
      letters: { overdue: metrics.samaLetters.overdueCount, upcoming: metrics.samaLetters.upcoming30d },
    },
    observationsBySeverity: { critical: sev('critical'), high: sev('high'), medium: sev('medium'), low: sev('low') },
    risksByLevel: metrics.risks.byLevel,
    deductions,
    // The dashboard compliance report has no findings table.
    findings: [],
  }
}
