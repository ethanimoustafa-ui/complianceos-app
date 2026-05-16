'use client'

// Client-side helpers for resolving bilingual lookup rows.
//
// Server-side lookup endpoints already add a derived `name` field via
// `localizeMany()` in `@/lib/api/i18n`, so most components can read `row.name`
// directly. These helpers exist for two cases that bypass that path:
//
//   1. Rows constructed client-side (e.g. optimistic creates before the GET
//      refresh lands).
//   2. Rows fetched ad-hoc from a Supabase RPC or non-localized endpoint.
//
// Fallback rule matches `localizeName()` on the server: if the active side is
// empty, fall back to the other side rather than show an empty label.

import { useLanguageStore, type Language } from '@/stores/language-store'

interface BilingualRow {
  name_en?: string | null
  name_ar?: string | null
}

function pick(row: BilingualRow, lang: Language): string {
  const en = row.name_en?.trim() ?? ''
  const ar = row.name_ar?.trim() ?? ''
  if (lang === 'ar') return ar || en
  return en || ar
}

/** Reactive selector: re-renders when the active language flips. */
export function useLocalizedName<T extends BilingualRow>(row: T | null | undefined): string {
  const language = useLanguageStore((s) => s.language)
  if (!row) return ''
  return pick(row, language)
}

/**
 * Bulk variant — accepts a precomputed locale so it can be called outside
 * React (e.g. in a `useMemo` selector or a non-component utility). Returns
 * each row with a derived `name` field.
 */
export function localizeArray<T extends BilingualRow>(
  rows: readonly T[],
  lang: Language,
): Array<T & { name: string }> {
  return rows.map((r) => ({ ...r, name: pick(r, lang) }))
}
