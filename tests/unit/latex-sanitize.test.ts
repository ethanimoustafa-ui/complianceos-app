// Security gate for the LaTeX PDF pipeline. The escape step is the only thing
// standing between user-entered letter text and arbitrary LaTeX execution, so
// these cases pin both correctness (text renders literally) and safety (no
// control sequence can survive).

import { describe, it, expect } from 'vitest'
import { escapeLatex, sanitizeData, containsRawTexCommand } from '@/lib/pdf/latex/sanitize'

describe('escapeLatex — special characters', () => {
  it('escapes each LaTeX special character', () => {
    expect(escapeLatex('100%')).toBe('100\\%')
    expect(escapeLatex('a & b')).toBe('a \\& b')
    expect(escapeLatex('a_b')).toBe('a\\_b')
    expect(escapeLatex('#1')).toBe('\\#1')
    expect(escapeLatex('$5')).toBe('\\$5')
    expect(escapeLatex('{x}')).toBe('\\{x\\}')
    expect(escapeLatex('~')).toBe('\\textasciitilde{}')
    expect(escapeLatex('^')).toBe('\\textasciicircum{}')
  })

  it('maps a lone backslash to \\textbackslash{} (single pass, braces NOT re-escaped)', () => {
    // The classic ordering bug would turn the introduced {} into \{\}.
    expect(escapeLatex('\\')).toBe('\\textbackslash{}')
  })

  it('does not re-process introduced backslashes (\\& stays \\textbackslash{}\\&)', () => {
    // Input is literally: backslash, ampersand.
    expect(escapeLatex('\\&')).toBe('\\textbackslash{}\\&')
  })

  it('empty / falsy input → empty string', () => {
    expect(escapeLatex('')).toBe('')
  })
})

describe('escapeLatex — injection neutralization', () => {
  it('neutralizes \\input{...} so no live command survives', () => {
    const out = escapeLatex('\\input{/etc/passwd}')
    expect(out).not.toContain('\\input{')
    expect(out).toContain('\\textbackslash{}input')
    expect(containsRawTexCommand(out)).toBe(false)
  })

  it('neutralizes \\write18 shell-escape', () => {
    const out = escapeLatex('\\write18{rm -rf /}')
    expect(out).not.toContain('\\write18')
    expect(containsRawTexCommand(out)).toBe(false)
  })

  it('neutralizes \\def / \\newcommand redefinition attempts', () => {
    expect(containsRawTexCommand(escapeLatex('\\def\\x{bad}'))).toBe(false)
    expect(containsRawTexCommand(escapeLatex('\\newcommand{\\x}{bad}'))).toBe(false)
  })
})

describe('escapeLatex — non-ASCII passthrough', () => {
  it('leaves Arabic text untouched', () => {
    const ar = 'السلام عليكم ورحمة الله وبركاته'
    expect(escapeLatex(ar)).toBe(ar)
  })

  it('escapes only the specials inside otherwise-Arabic text', () => {
    expect(escapeLatex('الربع 50% من 2025')).toBe('الربع 50\\% من 2025')
  })
})

describe('sanitizeData — recursive', () => {
  it('escapes strings nested in objects and arrays', () => {
    const out = sanitizeData({
      subject: '100% done',
      items: ['a&b', { note: 'x_y' }],
      count: 3,
      flag: true,
    })
    expect(out).toEqual({
      subject: '100\\% done',
      items: ['a\\&b', { note: 'x\\_y' }],
      count: 3,
      flag: true,
    })
  })
})

describe('containsRawTexCommand', () => {
  it('flags raw dangerous primitives', () => {
    expect(containsRawTexCommand('hello \\input{x}')).toBe(true)
    expect(containsRawTexCommand('\\write18{x}')).toBe(true)
  })
  it('does not flag ordinary text', () => {
    expect(containsRawTexCommand('a normal subject line')).toBe(false)
    expect(containsRawTexCommand('الموضوع: القوائم المالية')).toBe(false)
  })
})
