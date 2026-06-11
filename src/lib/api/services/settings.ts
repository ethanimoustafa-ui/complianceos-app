// Settings service-layer helpers.
//
// Shared `select` strings, single-row assertions for the small lookup tables,
// and the dependent-row count helper used by department / business-unit /
// policy-category DELETE handlers to refuse deletes when the row is referenced.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- column lists ------------------------------------------------------------

export const FRAMEWORK_COLUMNS =
  'id, name_en, name_ar, description_en, description_ar, icon, icon_color, enabled, threshold, custom_threshold_value, alert_on_non_compliance, correspondence_based, weights, custom_field_values, departments, scale_labels, created_at, updated_at'

export const FRAMEWORK_CONFIG_COLUMNS =
  'framework_id, enabled, pinned, weight, threshold, department_id, created_at, updated_at'

export const FRAMEWORK_PIN_COLUMNS = 'framework_id, position'

export const DEPARTMENT_COLUMNS =
  'id, key, name_en, name_ar, email, is_default, created_at, updated_at'

export const BUSINESS_UNIT_COLUMNS =
  'id, key, name_en, name_ar, is_default, created_at, updated_at'

export const POLICY_CATEGORY_COLUMNS =
  'id, key, name_en, name_ar, is_default, created_at, updated_at'

export const SCALE_LABEL_COLUMNS = 'scale, key, lang, value'

export const COMPLIANCE_SETTINGS_COLUMNS =
  'id, weights, target_score, audit_retention_years, singleton, created_at, updated_at'

export const SAUDIZATION_COLUMNS =
  'id, singleton, target, actual, total_employees, saudi_employees, by_department, last_data_source, last_updated, created_at, updated_at'

// --- existence guards --------------------------------------------------------

export async function assertDepartmentExists(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string; is_default: boolean }> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, is_default')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; is_default: boolean }>()
  if (error) throw error
  if (!data) throw NotFound(`Department ${id} not found`)
  return data
}

export async function assertBusinessUnitExists(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string; is_default: boolean }> {
  const { data, error } = await supabase
    .from('business_units')
    .select('id, is_default')
    .eq('id', id)
    .maybeSingle<{ id: string; is_default: boolean }>()
  if (error) throw error
  if (!data) throw NotFound(`Business unit ${id} not found`)
  return data
}

export async function assertPolicyCategoryExists(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string; is_default: boolean }> {
  const { data, error } = await supabase
    .from('policy_categories')
    .select('id, is_default')
    .eq('id', id)
    .maybeSingle<{ id: string; is_default: boolean }>()
  if (error) throw error
  if (!data) throw NotFound(`Policy category ${id} not found`)
  return data
}

export async function assertFrameworkExists(
  supabase: SupabaseClient,
  id: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('frameworks')
    .select('id')
    .eq('id', id)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Framework ${id} not found`)
  return data.id
}

// --- dependent counts --------------------------------------------------------

/**
 * Count rows in `<table>` that reference a department by id.
 * Used to refuse DELETE on a department in use. Each query uses
 * `head: true` so we only get the count, no row payloads.
 */
export async function countDepartmentReferences(
  supabase: SupabaseClient,
  departmentId: string,
): Promise<{ total: number; byTable: Record<string, number> }> {
  // NOTE: only tables that ACTUALLY carry a department_id column are queried.
  // `observations.department` is `text` (stores a department `key`, not uuid)
  // so we can't direct-eq against a uuid here. `risks`, `policies`, `circulars`
  // do not have a department FK in the current schema. Adding those FKs is a
  // larger migration deferred to a future wave.
  const tables: Array<{ table: string; col: string }> = [
    { table: 'profiles', col: 'department_id' },
    { table: 'framework_config', col: 'department_id' },
    { table: 'compliance_evaluations', col: 'department_id' },
  ]
  const byTable: Record<string, number> = {}
  await Promise.all(
    tables.map(async ({ table, col }) => {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(col, departmentId)
      byTable[table] = count ?? 0
    }),
  )
  const total = Object.values(byTable).reduce((a, b) => a + b, 0)
  return { total, byTable }
}

export async function countBusinessUnitReferences(
  supabase: SupabaseClient,
  buId: string,
): Promise<{ total: number; byTable: Record<string, number> }> {
  const tables: Array<{ table: string; col: string }> = [
    { table: 'profiles', col: 'business_unit_id' },
  ]
  const byTable: Record<string, number> = {}
  await Promise.all(
    tables.map(async ({ table, col }) => {
      const { count } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(col, buId)
      byTable[table] = count ?? 0
    }),
  )
  const total = Object.values(byTable).reduce((a, b) => a + b, 0)
  return { total, byTable }
}

export async function countPolicyCategoryReferences(
  supabase: SupabaseClient,
  categoryId: string,
): Promise<{ total: number; byTable: Record<string, number> }> {
  // Policies may reference either a category id (uuid) or a category key (text).
  // We count the uuid-id case here; the key case is informational only and the
  // FK should be migrated to the id form by a later phase.
  const { count } = await supabase
    .from('policies')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
  return { total: count ?? 0, byTable: { policies: count ?? 0 } }
}
