// Wave-19.1 / Q8 — server-side bilingual renderer.
//
// Dual-store timeline / activity-log rows persist BOTH languages at write
// time (`text_en` + `text_ar`), mirroring the established
// `policy_activity_log` convention. Policy hand-writes inline pairs; Rules has
// 17+ message families with parameter interpolation, so we resolve a stable
// i18n key+params against the EXISTING `en.json` / `ar.json` dictionaries
// instead of duplicating every English/Arabic pair at every call site. The
// rendered output is identical to what Policy emits manually.
//
// The reader on the client picks `text_en` vs `text_ar` based on the current
// locale — no JSON parse, no regex.

import enDict from '@/i18n/dictionaries/en.json'
import arDict from '@/i18n/dictionaries/ar.json'

type Locale = 'en' | 'ar'

function getNested(obj: unknown, path: string): string {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return path // fall through to the bare key when missing
    }
  }
  return typeof current === 'string' ? current : path
}

function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`)
}

/**
 * Resolve a dotted i18n key against the requested locale's dictionary and
 * interpolate `{{param}}` placeholders. Falls back to the bare key when the
 * key is missing — same forgiving contract as the client `t()` helper.
 */
export function renderI18nKey(
  key: string,
  params: Record<string, string> = {},
  locale: Locale,
): string {
  const dict = locale === 'ar' ? arDict : enDict
  const value = getNested(dict, key)
  return interpolate(value, params)
}

/**
 * Render a single i18n key+params into BOTH languages for dual-store write.
 * Wave-19.1 / Q8 — pass the result straight into `insertCircularTimeline` /
 * `insertArticleTimeline`.
 *
 * Wave-19.4 / Item-3 — a param value may itself be a per-locale pair
 * (`{ en, ar }`); the corresponding language's value is interpolated into
 * each rendered string. Used for the version-history `{fields}` placeholder
 * where the field-label list itself must be translated per locale.
 */
type BilingualParam = string | { en: string; ar: string }

export function renderBilingual(
  key: string,
  params: Record<string, BilingualParam> = {},
): { text_en: string; text_ar: string } {
  const resolve = (locale: Locale): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(params)) {
      out[k] = typeof v === 'string' ? v : v[locale]
    }
    return out
  }
  return {
    text_en: renderI18nKey(key, resolve('en'), 'en'),
    text_ar: renderI18nKey(key, resolve('ar'), 'ar'),
  }
}
