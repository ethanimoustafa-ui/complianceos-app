// Service helpers for `enum_value_definitions` (Wave-19.7).
//
// First consumer: `domain='policy.approval_tier'`. The `key` is the stored
// raw value (e.g. 'tier_1') and `name_en` / `name_ar` are the labels the
// Policy Create/Edit modal dropdown renders. The raw `policies.approval_tier`
// column stays open (Q5 Wave-19 decision); this table is the source of truth
// for what the dropdown shows.

import type { SupabaseClient } from '@supabase/supabase-js'

export const ENUM_VALUE_COLUMNS =
  'id, domain, key, name_en, name_ar, sort_order, is_default, created_at, updated_at'

export interface EnumValueRow {
  id: string
  domain: string
  key: string
  name_en: string
  name_ar: string
  sort_order: number
  is_default: boolean
  created_at: string
  updated_at: string
}

/**
 * Count rows that currently reference an enum value's `key` so the DELETE
 * route can refuse to drop a key that's in use. First domain wired:
 * `policy.approval_tier` ↔ `policies.approval_tier`. Add a new branch when
 * additional domains gain enum-driven dropdowns.
 *
 * Returns `null` for unknown domains — the route reads `null` as "we don't
 * track referents for this domain, deletion is unrestricted".
 */
export async function countEnumValueReferents(
  supabase: SupabaseClient,
  domain: string,
  key: string,
): Promise<number | null> {
  if (domain === 'policy.approval_tier') {
    const { count, error } = await supabase
      .from('policies')
      .select('id', { count: 'exact', head: true })
      .eq('approval_tier', key)
      .is('deleted_at', null)
    if (error) throw error
    return count ?? 0
  }
  return null
}
