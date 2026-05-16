// Server-side i18n resolve helpers.
//
// Lookup tables store every label as a bilingual pair (`name_en` + `name_ar`,
// per BACKEND-API-MAP §11). Route handlers call `localizeMany()` to derive a
// `name` field per request locale so clients don't have to branch on language.
//
// Locale source priority (caller-provided):
//   1. explicit `?locale=` / `?lang=` query param,
//   2. `Accept-Language` header (first `en` or `ar` match),
//   3. fallback to `'en'`.
//
// Fallback inside `localizeName()` itself: if the requested side is empty,
// fall back to the other side rather than emitting an empty string. This
// matches the §11 policy of "bilingual where the scope demands both" — a row
// missing one side is a data bug, but the API stays robust.

import type { NextRequest } from 'next/server'

export type Locale = 'en' | 'ar'

interface BilingualRow {
  name_en?: string | null
  name_ar?: string | null
}

/** Resolve a single bilingual row to a display `name` for the active locale. */
export function localizeName<T extends BilingualRow>(row: T, locale: Locale): string {
  const en = row.name_en?.trim() ?? ''
  const ar = row.name_ar?.trim() ?? ''
  if (locale === 'ar') return ar || en
  return en || ar
}

/**
 * Add a derived `name` field to every row in a list. Non-mutating — returns
 * a new array. Use in GET list handlers right before `ok(data)`.
 */
export function localizeMany<T extends BilingualRow>(
  rows: readonly T[],
  locale: Locale,
): Array<T & { name: string }> {
  return rows.map((r) => ({ ...r, name: localizeName(r, locale) }))
}

/** Pull the locale from `?locale=` / `?lang=` or `Accept-Language`; default `en`. */
export function resolveLocale(req: NextRequest | Request): Locale {
  // Query param wins.
  const url = 'nextUrl' in req ? req.nextUrl : new URL((req as Request).url)
  const q = url.searchParams.get('locale') ?? url.searchParams.get('lang')
  if (q === 'ar' || q === 'en') return q

  // Then Accept-Language. We honor only the first language token we recognize.
  const header = req.headers.get('accept-language') ?? ''
  for (const token of header.split(',')) {
    const lang = token.trim().toLowerCase().split(/[;-]/)[0]
    if (lang === 'ar' || lang === 'en') return lang
  }
  return 'en'
}
