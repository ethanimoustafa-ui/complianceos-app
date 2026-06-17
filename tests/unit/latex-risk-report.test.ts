// buildRiskRegisterTex — executive risk register (cover + summary + 5×5 heat
// map + detail table), English or Arabic.

import { describe, it, expect } from 'vitest'
import { buildRiskRegisterTex } from '@/lib/pdf/latex/render-risk-report'

const SAMPLE = {
  organization: 'United Company for Financial Services',
  generatedBy: 'Paul Bester',
  date: '30 April 2025',
  subtitle: '3 risks',
  risks: [
    { id: 'R-01', name: 'Core banking single point of failure', category: 'Operational', likelihood: 4, impact: 5, score: 20, owner: 'Khalid Nasser', status: 'open' },
    { id: 'R-02', name: 'AML alert backlog', category: 'Compliance', likelihood: 3, impact: 3, score: 9, owner: 'Mona Idris', status: 'mitigating' },
    { id: 'R-03', name: 'Vendor without DPA', category: 'Cyber', likelihood: 1, impact: 2, score: 2, owner: '', status: 'closed' },
  ],
}

describe('buildRiskRegisterTex — English', () => {
  it('emits cover + summary + heat map + register table', () => {
    const { tex } = buildRiskRegisterTex(SAMPLE, 'en')
    expect(tex).toContain('\\usepackage{pgfplots}')
    expect(tex).toContain('Risk Register') // cover title / section
    expect(tex).toContain('\\section{Summary}')
    expect(tex).toContain('\\section{Risk Heat Map}')
    expect(tex).toContain('\\begin{tikzpicture}') // heat map
    expect(tex).toContain('\\begin{longtable}') // detail table
    expect(tex).toContain('R-01')
    expect(tex).toContain('Core banking single point of failure')
  })

  it('colours the heat-map cells by band and the score by band', () => {
    const { tex } = buildRiskRegisterTex(SAMPLE, 'en')
    expect(tex).toContain('rose!75') // critical cell fill
    expect(tex).toContain('brandgreen!55') // low cell fill
    expect(tex).toContain('\\textcolor{rose}{20}') // critical score in the table
  })

  it('ships the letterhead + badge assets', () => {
    const { assets } = buildRiskRegisterTex(SAMPLE, 'en')
    expect(typeof assets['letterhead.png']).toBe('string')
    expect(typeof assets['badge.png']).toBe('string')
  })
})

describe('buildRiskRegisterTex — Arabic & edge cases', () => {
  it('emits RTL polyglossia + Arabic labels', () => {
    const { tex } = buildRiskRegisterTex(SAMPLE, 'ar')
    expect(tex).toContain('\\setmainlanguage{arabic}')
    expect(tex).toContain('سجل المخاطر')
  })

  it('renders the heat map even with no risks (scores, no count badges)', () => {
    const { tex } = buildRiskRegisterTex({ date: '2025-04-30', risks: [] }, 'en')
    expect(tex).toContain('\\begin{tikzpicture}')
    expect(tex).not.toContain('\\begin{longtable}')
    expect(tex).toContain('No risks')
  })

  it('throws when required fields are missing', () => {
    expect(() => buildRiskRegisterTex({})).toThrow()
  })
})
