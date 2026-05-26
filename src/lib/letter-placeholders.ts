import type {
  PlaceholderDef,
  PlaceholderRefKind,
  PlaceholderRefValue,
  PlaceholderValue,
} from '@/types'

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g

// Extract the unique placeholder tokens that appear in a body/subject string.
export function extractPlaceholderTokens(text: string | undefined): string[] {
  if (!text) return []
  const found = new Set<string>()
  let m: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
    found.add(m[1])
  }
  return [...found]
}

// Reconcile a template's placeholderDefs with the tokens that appear in its
// body/subject text. Adds defs for new tokens (default type 'date') and keeps
// any author-edited types/refKinds intact. Any legacy def with the obsolete
// `type: 'text'` is auto-upgraded to `type: 'date'` (key + label preserved).
export function reconcilePlaceholderDefs(
  defs: PlaceholderDef[] | undefined,
  body: string | undefined,
  subject: string | undefined,
): PlaceholderDef[] {
  const tokens = new Set([
    ...extractPlaceholderTokens(body),
    ...extractPlaceholderTokens(subject),
  ])
  const byKey = new Map(
    (defs ?? []).map((d) => {
      // L7b: Legacy 'text' and 'textarea' kinds no longer exist in the schema
      // (PlaceholderDef.type is 'date' | 'reference'). Promote both to 'date'
      // on read so seeded templates with old placeholder types don't cause
      // Zod validation failures when a letter is created from them.
      const legacyType = (d as { type?: string }).type
      const next: PlaceholderDef =
        legacyType === 'text' || legacyType === 'textarea' ? { ...d, type: 'date' } : d
      return [d.key, next]
    }),
  )
  const out: PlaceholderDef[] = []
  for (const tok of tokens) {
    const existing = byKey.get(tok)
    if (existing) {
      out.push(existing)
    } else {
      out.push({ key: tok, label: humanizeToken(tok), type: 'date' })
    }
  }
  return out
}

function humanizeToken(token: string): string {
  return token
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Render a body/subject template by substituting placeholder values.
export function renderTemplate(
  text: string,
  values: Record<string, PlaceholderValue | undefined>,
): string {
  return text.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const v = values[key]
    if (!v) return `[${key}]`
    if (v.type === 'reference') return formatRef(v.value)
    return v.value
  })
}

export function formatRef(ref: PlaceholderRefValue): string {
  // The spec wants both the reference ID and the title visible so officers
  // don't have to look up reference numbers.
  return `${ref.reference} — ${ref.title}`
}

// Validate that every placeholder def has a value.
export function placeholderValuesComplete(
  defs: PlaceholderDef[] | undefined,
  values: Record<string, PlaceholderValue | undefined>,
): { complete: boolean; missing: string[] } {
  if (!defs || defs.length === 0) return { complete: true, missing: [] }
  const missing: string[] = []
  for (const def of defs) {
    const v = values[def.key]
    if (!v) missing.push(def.key)
    else if (def.type === 'reference') {
      if (!v || v.type !== 'reference' || !v.value?.id) missing.push(def.key)
    } else {
      if (!v || v.type !== def.type || !v.value) missing.push(def.key)
    }
  }
  return { complete: missing.length === 0, missing }
}

// Auto-promote any {{token}} typed by the user inside body/subject into the
// placeholderDefs array. Keeps existing defs (so user-edited types are
// preserved); appends a default `text` def for any newly-found token.
// Use this on save inside the draft-edit surface after the user may have
// typed `{{my_ref}}` directly into the editor.
export function autoPromoteTypedTokens(
  body: string | undefined,
  subject: string | undefined,
  currentDefs: PlaceholderDef[] | undefined,
): PlaceholderDef[] {
  return reconcilePlaceholderDefs(currentDefs, body, subject)
}

// English fallbacks. Components should prefer `refKindLabel(kind, t)` so
// Arabic/locale-aware strings come through `t('placeholderPicker.refKind*')`.
export const REF_KIND_LABELS: Record<PlaceholderRefKind, string> = {
  observation: 'Observation',
  audit:       'Audit',
  letter:      'Letter',
  rule:        'Rule / Circular',
  policy:      'Policy',
}

// Resolves a localized label for a reference kind. Pass the `t` translator
// from `useTranslation()` to get Arabic strings when language is `ar`. The
// `t` parameter is loosely typed (`unknown`) so we can accept the strongly
// typed translator without forcing callers into a contravariant cast.
export function refKindLabel(
  kind: PlaceholderRefKind,
  t?: unknown,
): string {
  const REF_KIND_KEYS: Record<PlaceholderRefKind, string> = {
    observation: 'placeholderPicker.refKindObservation',
    audit:       'placeholderPicker.refKindAudit',
    letter:      'placeholderPicker.refKindLetter',
    rule:        'placeholderPicker.refKindRule',
    policy:      'placeholderPicker.refKindPolicy',
  }
  if (typeof t !== 'function') return REF_KIND_LABELS[kind]
  const fn = t as (key: string) => string
  const localized = fn(REF_KIND_KEYS[kind])
  return localized && localized !== REF_KIND_KEYS[kind]
    ? localized
    : REF_KIND_LABELS[kind]
}
