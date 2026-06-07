// Wave-19 / Q1 — Server-side ref_code generator (Policy + future entities).
//
// Algorithm:
//   1. SLUG: strip non-alpha (`[^A-Za-z]`) from `name`, uppercase, take the
//      first 3 chars. Right-pad with `X` if fewer than 3 alpha chars exist
//      after stripping (e.g. "Q1" → "QXX", "" → "XXX", "AB" → "ABX").
//   2. YEAR: UTC year of `now()`.
//   3. SEQ: max existing `(slug, year)` sequence + 1, padded to 4 digits.
//   4. FORMAT: `{SLUG}-{YYYY}-{NNNN}` (e.g. `INF-2026-0001`).
//
// The helper is GENERIC — any entity table that wants a Policy-style ref_code
// can call `insertWithRefCode(...)`. It is deliberately NOT used by Rules
// (Circulars), which has its own authority-based reference format
// (`SAMA-CIR-YYYY-NNNN`) — see `nextCircularReference` in
// `services/circulars.ts`. The boundary: Circulars use authority slug + 'CIR'
// + sequence; everything else (Policies, Observations, Letters, future
// Settings-defined entity types) uses this generic name-derived slug + year +
// sequence. Future entities added via Settings → Frameworks/Entities should
// route through `insertWithRefCode` so the convention stays uniform.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Take a free-text name and produce a 3-char uppercase ALPHA slug.
 *
 *   "Information Security Policy" → "INF"
 *   "Risk Management"             → "RIS"
 *   "5G Network"                  → "GNE"
 *   "Q1"                          → "QXX"
 *   "AB-12 Policy"                → "ABP"
 *   ""                            → "XXX"
 */
export function refCodeSlug(name: string): string {
  const alpha = (name ?? '').replace(/[^A-Za-z]/g, '').toUpperCase()
  if (alpha.length >= 3) return alpha.slice(0, 3)
  return (alpha + 'XXX').slice(0, 3)
}

/**
 * Compute the next `{slug}-{year}-{NNNN}` ref_code for a given table+column.
 * Uses `SELECT max(ref_code) WHERE ref_code LIKE ${slug}-${year}-%` — races
 * under concurrent POSTs. Callers MUST wrap in a retry-on-unique-violation
 * loop (use `insertWithRefCode` for the canonical pattern).
 */
export async function nextEntityRefCode(
  supabase: SupabaseClient,
  table: string,
  refCodeColumn: string,
  slug: string,
  year: number,
): Promise<string> {
  const prefix = `${slug}-${year}-`
  const { data, error } = await supabase
    .from(table)
    .select(refCodeColumn)
    .ilike(refCodeColumn, `${prefix}%`)
    .order(refCodeColumn, { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, string>>()
  if (error) throw error
  let next = 1
  const existing = data?.[refCodeColumn]
  if (existing) {
    const tail = existing.slice(prefix.length)
    const n = Number(tail)
    if (Number.isFinite(n) && n >= 1) next = n + 1
  }
  return `${prefix}${String(next).padStart(4, '0')}`
}

/**
 * Insert a row with a server-generated ref_code, retrying on UNIQUE-violation
 * (Postgres 23505) up to `maxAttempts` times. Each retry recomputes
 * `nextEntityRefCode` (so concurrent peers desynchronise after jittered
 * backoff) and tries again. Mirrors the circular-create POST retry-loop in
 * `src/app/api/circulars/route.ts`.
 *
 * Returns the inserted row (selected via `selectColumns`, default `'*'`).
 * Throws the last database error if all attempts fail.
 */
export async function insertWithRefCode<T>(opts: {
  supabase: SupabaseClient
  table: string
  refCodeColumn?: string
  slugSource: string
  /**
   * Fixed slug override. When provided, the ref_code uses this constant prefix
   * instead of deriving the first 3 letters from `slugSource` — e.g. Policies
   * pass `'POL'` → `POL-2026-0001` rather than `INF-2026-0001`.
   */
  slug?: string
  insertPayload: Record<string, unknown>
  selectColumns?: string
  maxAttempts?: number
  now?: Date
}): Promise<T> {
  const {
    supabase,
    table,
    refCodeColumn = 'ref_code',
    slugSource,
    slug: slugOverride,
    insertPayload,
    selectColumns = '*',
    maxAttempts = 8,
    now = new Date(),
  } = opts

  const slug = slugOverride ?? refCodeSlug(slugSource)
  const year = now.getUTCFullYear()

  let inserted: T | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Jittered backoff so concurrent peers re-read `max` at different times.
      await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 50)))
    }
    const refCode = await nextEntityRefCode(supabase, table, refCodeColumn, slug, year)
    const { data, error } = await supabase
      .from(table)
      .insert({ ...insertPayload, [refCodeColumn]: refCode })
      .select(selectColumns)
      .single()
    if (!error && data) {
      inserted = data as T
      break
    }
    lastError = error
    // 23505 = unique_violation — retry on collision; otherwise give up.
    if (error && (error as { code?: string }).code !== '23505') break
  }
  if (!inserted) throw lastError ?? new Error('Insert returned no row')
  return inserted
}
