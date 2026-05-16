// Audit-log action formatter.
//
// The `audit_logs` table stores canonical action keys like
// `observation.checklist.create` or `letter.attachment.upload`. The UI must
// render those as human-readable phrases ("Added checklist item",
// "أضاف عنصر قائمة مرجعية").
//
// This module exposes one function — `formatAuditAction(action, metadata, t)`
// — that looks up `auditLog.action.<key>` in the i18n dictionary and falls back
// to a humanised version of the raw key (`observation.checklist.create` →
// "Observation checklist create") so unknown actions are still readable.
//
// Wave 2 / Agent D — fixes the bug where raw action keys leaked into the
// "User Logs" and "Detailed Reports" tables.

import type { TranslationKey } from '@/i18n'

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string

/**
 * Humanise a snake-or-dot action key. Used as a graceful fallback when no
 * i18n entry exists for the action: `observation.checklist.create` →
 * "Observation checklist create".
 */
function humanise(action: string): string {
  if (!action) return ''
  const flat = action.replace(/[._]/g, ' ')
  return flat.charAt(0).toUpperCase() + flat.slice(1).toLowerCase()
}

/**
 * Translate an audit-log action key to a localized human phrase.
 *
 * Lookup order:
 *   1. `auditLog.action.<action>` if present in the dictionary.
 *   2. The humanised raw key as a last-resort fallback.
 *
 * Always returns a non-empty, non-key-shaped string — never the raw
 * `observation.checklist.create` form.
 */
export function formatAuditAction(
  action: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
  t: Translator,
): string {
  if (!action) return ''

  // Prefer an explicit metadata.description (some routes set this directly).
  if (metadata && typeof metadata === 'object') {
    const desc = (metadata as Record<string, unknown>).description
    if (typeof desc === 'string' && desc.length > 0) return desc
  }

  const i18nKey = `auditLog.action.${action}` as TranslationKey
  const translated = t(i18nKey)
  // `t()` returns the key itself when lookup fails.
  if (translated !== i18nKey) return translated

  return humanise(action)
}
