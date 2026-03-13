import { jsPDF } from 'jspdf'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'

type TranslationFn = (key: any, params?: Record<string, string>) => string

export function generateDashboardPdf(
  metrics: DashboardMetrics,
  view: string,
  t: TranslationFn,
) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  const addLine = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(text, 14, y)
    y += size * 0.5 + 2
  }

  const addSeparator = () => {
    doc.setDrawColor(200, 200, 200)
    doc.line(14, y, pageWidth - 14, y)
    y += 6
  }

  const addRow = (label: string, value: string | number) => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(label, 20, y)
    doc.setFont('helvetica', 'bold')
    doc.text(String(value), pageWidth - 40, y, { align: 'right' })
    y += 6
  }

  // Title
  addLine(t('dashboard.pdfTitle'), 18, true)
  y += 2
  addLine(t('dashboard.pdfGeneratedOn', { date: new Date().toLocaleDateString() }), 9)
  addLine(`View: ${view.charAt(0).toUpperCase() + view.slice(1)}`, 9)
  y += 4
  addSeparator()

  // Health Score
  addLine('Compliance Health', 14, true)
  y += 2
  addRow('Overall Score', `${Math.round(metrics.health.overall)}%`)
  addRow('Confidence', metrics.health.confidence)
  y += 2

  // Component Scores
  const components = metrics.health.components
  for (const [key, comp] of Object.entries(components)) {
    addRow(`  ${key}`, `${Math.round(comp.score)}% (w: ${comp.weight}%)`)
  }
  y += 4
  addSeparator()

  // Policies
  addLine('Policies', 14, true)
  y += 2
  addRow('Total', metrics.policies.total)
  addRow('Approved', metrics.policies.approved)
  addRow('Overdue', metrics.policies.overdue)
  addRow('Requires Review', metrics.policies.requiresReview)
  addRow('Draft', metrics.policies.draft)
  y += 4
  addSeparator()

  // Audits
  addLine('Audits', 14, true)
  y += 2
  addRow('Total', metrics.audits.total)
  addRow('Overdue', metrics.audits.overdueCount)
  addRow('Completed This Month', metrics.audits.completedThisMonth)
  y += 4
  addSeparator()

  // Observations
  addLine('Observations', 14, true)
  y += 2
  addRow('Total', metrics.observations.total)
  addRow('Open', metrics.observations.open)
  addRow('SAMA (Critical)', metrics.observations.bySource.sama.critical)
  addRow('Internal (Critical)', metrics.observations.bySource.internal.critical)
  addRow('Closed This Quarter', metrics.observations.closedThisQuarter)
  y += 4
  addSeparator()

  // Risks
  addLine('Risk Posture', 14, true)
  y += 2
  addRow('Open Risks', metrics.risks.open)
  addRow('Critical', metrics.risks.byLevel.critical)
  addRow('High', metrics.risks.byLevel.high)
  addRow('Medium', metrics.risks.byLevel.medium)
  addRow('Low', metrics.risks.byLevel.low)
  y += 4
  addSeparator()

  // SAMA Letters
  addLine('SAMA Letters', 14, true)
  y += 2
  addRow('Total', metrics.samaLetters.total)
  addRow('Overdue', metrics.samaLetters.overdueCount)
  addRow('Upcoming (30d)', metrics.samaLetters.upcoming30d)
  addRow('Completed This Month', metrics.samaLetters.completedThisMonth)
  y += 4
  addSeparator()

  // Training
  addLine('Training', 14, true)
  y += 2
  addRow('Overall Completion', `${metrics.training.overallCompletion}%`)
  addRow('Saudization Actual', `${metrics.training.saudization.actual}%`)
  addRow('Saudization Target', `${metrics.training.saudization.target}%`)
  y += 4

  // Top Deductions
  if (metrics.health.deductions.length > 0) {
    addSeparator()
    addLine('Top Deductions', 14, true)
    y += 2
    for (const d of metrics.health.deductions.slice(0, 5)) {
      addRow(`  [${d.severity}] ${d.description}`, `-${Math.abs(d.points).toFixed(1)}`)
    }
  }

  doc.save('ComplianceOS-Dashboard-Report.pdf')
}
