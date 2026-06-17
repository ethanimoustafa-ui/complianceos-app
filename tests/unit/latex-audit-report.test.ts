// buildAuditReportTex — executive audits report (cover + summary + register
// table), English or Arabic.

import { describe, it, expect } from 'vitest'
import { buildAuditReportTex } from '@/lib/pdf/latex/render-audit-report'

const SAMPLE = {
  organization: 'United Company for Financial Services',
  generatedBy: 'Paul Bester',
  date: '30 April 2025',
  subtitle: '3 audits',
  audits: [
    { id: 'A-01', name: 'Annual AML program review', type: 'internal', priority: 'critical', status: 'overdue', owner: 'Khalid Nasser', dueDate: '2025-03-20', progress: 40 },
    { id: 'A-02', name: 'IT general controls audit', type: 'sama', priority: 'high', status: 'in_progress', owner: '', dueDate: '2025-06-20', progress: 65 },
    { id: 'A-03', name: 'PDPL compliance audit', type: 'zatca', priority: 'low', status: 'completed', owner: 'Mona Idris', dueDate: '2025-02-20', progress: 100 },
  ],
}

describe('buildAuditReportTex — English', () => {
  it('emits cover + summary + a longtable register', () => {
    const { tex } = buildAuditReportTex(SAMPLE, 'en')
    expect(tex).toContain('\\usepackage{longtable}')
    expect(tex).toContain('Audits Report')
    expect(tex).toContain('\\section{Summary}')
    expect(tex).toContain('\\section{Audit Register}')
    expect(tex).toContain('\\begin{longtable}')
    expect(tex).toContain('A-01')
    expect(tex).toContain('Annual AML program review')
  })

  it('maps type/priority/status, flags overdue, and shows progress', () => {
    const { tex } = buildAuditReportTex(SAMPLE, 'en')
    expect(tex).toContain('\\textbf{\\textcolor{rose}{Critical}}') // priority badge
    expect(tex).toContain('SAMA') // regulator type acronym
    expect(tex).toContain('Internal') // type label
    expect(tex).toContain('\\textcolor{rose}{Overdue}') // overdue status in red
    expect(tex).toContain('Unassigned')
    expect(tex).toContain('65\\%') // progress
  })

  it('ships the letterhead + badge assets', () => {
    const { assets } = buildAuditReportTex(SAMPLE, 'en')
    expect(typeof assets['letterhead.png']).toBe('string')
    expect(typeof assets['badge.png']).toBe('string')
  })
})

describe('buildAuditReportTex — Arabic & edge cases', () => {
  it('emits RTL polyglossia + Arabic labels', () => {
    const { tex } = buildAuditReportTex(SAMPLE, 'ar')
    expect(tex).toContain('\\setmainlanguage{arabic}')
    expect(tex).toContain('تقرير المراجعات')
  })

  it('renders an empty-state message when there are no audits', () => {
    const { tex } = buildAuditReportTex({ date: '2025-04-30', audits: [] }, 'en')
    expect(tex).not.toContain('\\begin{longtable}')
    expect(tex).toContain('No audits')
  })

  it('throws when required fields are missing', () => {
    expect(() => buildAuditReportTex({})).toThrow()
  })
})
