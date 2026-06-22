// buildComplianceReportTex — executive compliance report (cover + sections +
// pgfplots charts), English or Arabic.

import { describe, it, expect } from 'vitest'
import { buildComplianceReportTex } from '@/lib/pdf/latex/render-compliance-report'

const SAMPLE = {
  organization: 'United Company for Financial Services',
  generatedBy: 'Paul Bester',
  date: '30 April 2025',
  period: 'Last 12 months',
  overallScore: 78,
  change: 4.2,
  confidence: 'High',
  components: [
    { name: 'Audit Completion', score: 82, weight: 25 },
    { name: 'Risk Posture', score: 88, weight: 20 },
  ],
  frameworks: [
    { name: 'SAMA', score: 80 },
    { name: 'CMA', score: 72 },
  ],
  trend: [
    { label: 'Sep', actual: 76, target: 85 },
    { label: 'Oct', actual: 78, target: 85 },
  ],
  kpis: {
    audits: { total: 12, overdue: 2, upcoming: 3 },
    observations: { total: 40, open: 14, overdue: 5 },
  },
  observationsBySeverity: { critical: 2, high: 5, medium: 4, low: 3 },
  risksByLevel: { critical: 1, high: 3, medium: 3, low: 2 },
  deductions: [{ reason: '2 critical observations open', severity: 'critical', points: -16 }],
}

describe('buildComplianceReportTex — English', () => {
  it('emits a cover + sections + charts', () => {
    const { tex } = buildComplianceReportTex(SAMPLE, 'en')
    expect(tex).toContain('\\documentclass')
    expect(tex).toContain('\\usepackage{pgfplots}')
    expect(tex).toContain('Compliance Status Report') // cover title
    expect(tex).toContain('\\section{Compliance Health}')
    expect(tex).toContain('\\section{Score Trend}')
    expect(tex).toContain('\\section{Key Metrics}')
    expect(tex).toContain('\\section{Score Deductions}')
    expect(tex).toContain('78') // overall score
    expect(tex).toContain('Audit Completion')
    expect(tex).toContain('SAMA')
    expect(tex).toContain('2 critical observations open')
    expect(tex).toContain('\\begin{axis}') // at least one pgfplots chart
    // Bar charts cap visible ticks/gridlines at 100 (0–100 scale, no 110 tick).
    expect(tex).toContain('xtick={0,10,20,30,40,50,60,70,80,90,100}')
  })

  it('ships the letterhead + badge assets', () => {
    const { assets } = buildComplianceReportTex(SAMPLE, 'en')
    expect(typeof assets['letterhead.png']).toBe('string')
    expect(typeof assets['badge.png']).toBe('string')
  })
})

describe('buildComplianceReportTex — Arabic', () => {
  it('emits RTL polyglossia + Arabic section titles', () => {
    const { tex } = buildComplianceReportTex(SAMPLE, 'ar')
    expect(tex).toContain('\\setmainlanguage{arabic}')
    expect(tex).toContain('صحة الامتثال') // Compliance Health
    expect(tex).toContain('تقرير حالة الامتثال') // doc title
  })
})

describe('buildComplianceReportTex — validation', () => {
  it('throws when required fields are missing', () => {
    expect(() => buildComplianceReportTex({})).toThrow()
    expect(() => buildComplianceReportTex({ date: 'x' })).toThrow() // missing overallScore
  })

  it('renders a minimal payload (no optional sections)', () => {
    const { tex } = buildComplianceReportTex({ date: '2025-04-30', overallScore: 50 }, 'en')
    expect(tex).toContain('\\section{Compliance Health}')
    expect(tex).toContain('50')
  })
})
