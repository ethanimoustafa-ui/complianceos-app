// LaTeX input sanitization — the security gate for the LaTeX PDF pipeline.
//
// Every user-supplied string MUST pass through `escapeLatex` before it is
// interpolated into a `.tex` document. Without it, a value such as
// `\input{/etc/passwd}` or `\write18{rm -rf /}` would be injected as live LaTeX
// and executed by the compiler (`\write18` is shell-escape). Escaping the ten
// LaTeX special characters renders all user text literally AND structurally
// neutralizes command injection — once every backslash becomes
// `\textbackslash{}`, no control sequence (`\input`, `\def`, …) can form.
//
// Implementation note: we escape in a SINGLE regex pass with a callback. This is
// the only correct ordering — a naive sequence of `.replace()` calls would
// re-process the backslashes it just introduced (e.g. turning `\&` into
// `\textbackslash{}&`), corrupting the output. A single pass maps each ORIGINAL
// character exactly once; replacement text is never re-scanned.
//
// Arabic (and all other non-ASCII) code points are untouched — xelatex reads
// UTF-8 natively, so the Arabic letter body passes through verbatim.

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

const LATEX_SPECIAL_RE = /[\\&%$#_{}~^]/g

/** Escape the ten LaTeX special characters so `input` renders literally. */
export function escapeLatex(input: string): string {
  if (!input) return ''
  return input.replace(LATEX_SPECIAL_RE, (ch) => LATEX_ESCAPES[ch])
}

/**
 * Recursively escape every string in a data structure (objects, arrays, nested).
 * Non-strings pass through unchanged. Use this to sanitize a whole template
 * payload in one call when convenient; individual fields can also be escaped
 * with `escapeLatex` at interpolation sites.
 */
export function sanitizeData<T>(value: T): T {
  if (typeof value === 'string') return escapeLatex(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => sanitizeData(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeData(v)
    }
    return out as T
  }
  return value
}

/**
 * Defense-in-depth detector. After `escapeLatex` no raw control sequence can
 * survive, so this should never fire on escaped input — it exists to assert that
 * invariant in tests and to flag any value that reached the compiler unescaped.
 */
export function containsRawTexCommand(input: string): boolean {
  // No trailing \b: `\write18` has no word boundary before the stream number.
  // Safe because escaped output never leaves a backslash directly before these
  // keywords (every `\` becomes `\textbackslash{}`).
  return /\\(input|include|write|read|def|newcommand|catcode|csname|openin|openout|loop|repeat)/.test(
    input,
  )
}
