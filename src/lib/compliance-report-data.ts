// Maps the dashboard's `DashboardMetrics` to the LaTeX compliance-report data
// contract. Lives client-side (the dashboard page has `metrics`, `t`, language).
// Type-only imports keep it out of the client's runtime weight.

import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'
import type { ComplianceReportData } from '@/lib/pdf/latex/render-compliance-report'

type Locale = 'en' | 'ar'
type TFn = (key: string, params?: Record<string, string>) => string

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

const CONFIDENCE_LABELS: Record<Locale, Record<string, string>> = {
  en: { high: 'High', moderate: 'Moderate', low: 'Low', insufficient: 'Insufficient data' },
  ar: { high: 'عالية', moderate: 'متوسطة', low: 'منخفضة', insufficient: 'بيانات غير كافية' },
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
  opts: { locale: Locale; t: TFn; date: string; period?: string },
): ComplianceReportData {
  const { locale, t, date } = opts
  const c = metrics.compliance
  const compLabels = COMPONENT_LABELS[locale]

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

  return {
    organization: ORG_NAME[locale],
    generatedBy: metrics.currentUser?.name ?? '',
    date,
    period: opts.period,
    overallScore: c.overall,
    change: c.change,
    confidence: CONFIDENCE_LABELS[locale][c.confidence] ?? c.confidence,
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
  }
}
