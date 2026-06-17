// buildObservationReportTex — executive observations report (cover + summary +
// multi-page detail table), English or Arabic.

import { describe, it, expect } from 'vitest'
import { buildObservationReportTex } from '@/lib/pdf/latex/render-observation-report'

const SAMPLE = {
  organization: 'United Company for Financial Services',
  generatedBy: 'Paul Bester',
  date: '30 April 2025',
  subtitle: 'All sources · 3 observations',
  observations: [
    { reference: 'OBS-001', title: 'Incomplete AML thresholds', severity: 'critical', source: 'sama', status: 'open', assignee: 'Sara Al-Otaibi', dueDate: '2025-05-15', isOverdue: true },
    { reference: 'OBS-002', title: 'Outdated BCP', severity: 'medium', source: 'internal', status: 'in_progress', assignee: '', dueDate: '2025-06-15', isOverdue: false },
    { reference: 'OBS-003', title: 'Vendor risk overdue', severity: 'low', source: 'cma', status: 'resolved', assignee: 'Mona Idris', dueDate: '2025-07-15', isOverdue: false },
  ],
}

describe('buildObservationReportTex — English', () => {
  it('emits cover + summary + a longtable detail section', () => {
    const { tex } = buildObservationReportTex(SAMPLE, 'en')
    expect(tex).toContain('\\usepackage{longtable}')
    expect(tex).toContain('Observations Report') // cover title
    expect(tex).toContain('\\section{Summary}')
    expect(tex).toContain('\\section{Observations}')
    expect(tex).toContain('\\begin{longtable}')
    expect(tex).toContain('OBS-001')
    expect(tex).toContain('Incomplete AML thresholds')
  })

  it('colours severities, maps source/status labels, and flags overdue dates', () => {
    const { tex } = buildObservationReportTex(SAMPLE, 'en')
    expect(tex).toContain('\\textcolor{rose}{Critical}') // severity badge
    expect(tex).toContain('SAMA') // regulator acronym
    expect(tex).toContain('Internal') // source label
    expect(tex).toContain('In Progress') // status label
    expect(tex).toContain('Unassigned') // empty assignee fallback
    expect(tex).toContain('\\textcolor{rose}{2025-05-15}') // overdue due date
  })

  it('ships the letterhead + badge assets', () => {
    const { assets } = buildObservationReportTex(SAMPLE, 'en')
    expect(typeof assets['letterhead.png']).toBe('string')
    expect(typeof assets['badge.png']).toBe('string')
  })
})

describe('buildObservationReportTex — Arabic & edge cases', () => {
  it('emits RTL polyglossia + Arabic labels', () => {
    const { tex } = buildObservationReportTex(SAMPLE, 'ar')
    expect(tex).toContain('\\setmainlanguage{arabic}')
    expect(tex).toContain('تقرير الملاحظات')
    expect(tex).toContain('ملخص') // Summary
  })

  it('renders an empty-state message when there are no observations', () => {
    const { tex } = buildObservationReportTex({ date: '2025-04-30', observations: [] }, 'en')
    expect(tex).not.toContain('\\begin{longtable}')
    expect(tex).toContain('No observations')
  })

  it('throws when required fields are missing', () => {
    expect(() => buildObservationReportTex({})).toThrow()
  })
})
