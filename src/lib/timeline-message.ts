// Wave-19.4 / Item-3 — the `{k,p}` JSON pattern is now FULLY retired across
// the platform. Both timeline rows (migration 056, Wave-19.1) and version-
// history rows (migration 057, this wave) are dual-store: writers persist
// `text_en` + `text_ar` at write time via `renderBilingual`, and readers
// pick the column matching the current locale.
//
// All of the legacy helpers (`timelineMessage`, `parseTimelineMessage`,
// `renderTimelineMessage`, `fieldKeyList`, `renderFieldLabelsInText`,
// `parseLegacyTimelineMessage`) have been DELETED. Only `renderFieldLabel`
// survives — it translates a single stored field-label key on the structured
// per-field diff (`field_changes` jsonb), which never went through `{k,p}`.

// Loose `t` signature — compatible with the app's `useTranslation().t`.
type Translate = (key: any, params?: any) => string

/**
 * Render a structured field-change `field` label. The label is stored as a
 * bare i18n key (e.g. `regulatoryUpdates.timelineField.description`,
 * `policies.field.owner`) so it can be translated at display time. Legacy
 * English labels render unchanged.
 *
 * Recognises both the Rules `regulatoryUpdates.timelineField.*` namespace
 * and the Policy `policies.field.*` namespace — both resolve through the
 * same `t()` call.
 */
const FIELD_LABEL_KEY_PREFIXES = [
  'regulatoryUpdates.timelineField.',
  'policies.field.',
]

export function renderFieldLabel(
  field: string | null | undefined,
  t: Translate,
): string {
  if (!field) return ''
  if (FIELD_LABEL_KEY_PREFIXES.some((p) => field.startsWith(p))) {
    return t(field)
  }
  return field
}
