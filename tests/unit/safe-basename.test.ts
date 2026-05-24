// W17-V3 (SEC-10): comprehensive sanitisation of user-supplied filenames.
// Each case isolates one attack vector and asserts the documented behaviour.

import { describe, it, expect } from 'vitest'
import { safeBasename } from '@/lib/api/sanitize'

describe('safeBasename — W17-V3 attack vectors', () => {
  it('POSIX traversal: ../../../etc/passwd.pdf → passwd.pdf', () => {
    expect(safeBasename('../../../etc/passwd.pdf')).toBe('passwd.pdf')
  })

  it('Windows traversal: ..\\..\\windows\\system32\\evil.exe → evil.exe', () => {
    expect(safeBasename('..\\..\\windows\\system32\\evil.exe')).toBe('evil.exe')
  })

  it('mixed POSIX + Windows separators', () => {
    expect(safeBasename('../foo\\bar/baz.txt')).toBe('baz.txt')
  })

  it('NUL byte: evil\\0.pdf → evil.pdf (NUL stripped, no truncation downstream)', () => {
    const withNul = 'evil' + String.fromCharCode(0) + '.pdf'
    const out = safeBasename(withNul)
    // No NUL anywhere.
    expect(out.includes(String.fromCharCode(0))).toBe(false)
    // The visible name survives.
    expect(out).toBe('evil.pdf')
  })

  it('ASCII control chars (\\x01\\x02): \\x01\\x02file.pdf → file.pdf', () => {
    const withControls = String.fromCharCode(1) + String.fromCharCode(2) + 'file.pdf'
    const out = safeBasename(withControls)
    expect(out).toBe('file.pdf')
    // Defensive: nothing in [0x00, 0x1f] or 0x7f remains.
    for (let i = 0; i < out.length; i++) {
      const cc = out.charCodeAt(i)
      expect(cc === 0x7f || (cc >= 0x00 && cc <= 0x1f)).toBe(false)
    }
  })

  it('DEL char (0x7f): file\\x7f.pdf → file.pdf', () => {
    const withDel = 'file' + String.fromCharCode(0x7f) + '.pdf'
    expect(safeBasename(withDel)).toBe('file.pdf')
  })

  it('URL-encoded traversal is NOT decoded — stored verbatim as the basename', () => {
    // Documented policy: do not decode. The literal string IS the basename.
    // No directory separator, no `..` collapse, the value comes through intact.
    expect(safeBasename('%2e%2e%2fpasswd.pdf')).toBe('%2e%2e%2fpasswd.pdf')
  })

  it('literal-dot ../file.pdf — collapses ../ to ./ and strips leading dot', () => {
    expect(safeBasename('../file.pdf')).toBe('file.pdf')
  })

  it('Unicode dot homoglyphs: ．．/file.pdf (FULLWIDTH FULL STOPs) → file.pdf', () => {
    expect(safeBasename('．．/file.pdf')).toBe('file.pdf')
  })

  it('Unicode separator homoglyph: ..／secret.pdf (FULLWIDTH SOLIDUS) → secret.pdf', () => {
    expect(safeBasename('..／secret.pdf')).toBe('secret.pdf')
  })

  it('combined homoglyph traversal: ．．／／etc／passwd.pdf → passwd.pdf', () => {
    const evil = '．．／／etc／passwd.pdf'
    expect(safeBasename(evil)).toBe('passwd.pdf')
  })

  it('very long name (>255 chars) truncates to ≤200, preserving extension', () => {
    const long = 'a'.repeat(500) + '.pdf'
    const out = safeBasename(long)
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.endsWith('.pdf')).toBe(true)
  })

  it('very long name with no extension also truncates', () => {
    const long = 'b'.repeat(500)
    const out = safeBasename(long)
    expect(out.length).toBeLessThanOrEqual(200)
  })

  it('empty string → sentinel', () => {
    expect(safeBasename('')).toBe('unnamed.bin')
  })

  it('whitespace-only → sentinel', () => {
    expect(safeBasename('     ')).toBe('unnamed.bin')
  })

  it('all-dots → sentinel (after collapse + leading-dot strip, nothing left)', () => {
    expect(safeBasename('....')).toBe('unnamed.bin')
  })

  it('passes through a normal filename unchanged', () => {
    expect(safeBasename('quarterly-report-Q3-2025.pdf')).toBe('quarterly-report-Q3-2025.pdf')
  })

  it('Arabic + spaces survive as-is', () => {
    expect(safeBasename('تقرير ربعي.pdf')).toBe('تقرير ربعي.pdf')
  })

  it('result is ALWAYS non-empty', () => {
    const inputs = ['', '   ', '....', '/', '\\', '../', '..\\..\\', String.fromCharCode(0)]
    for (const inp of inputs) {
      const out = safeBasename(inp)
      expect(out.length).toBeGreaterThan(0)
    }
  })
})
