// Team / profiles service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const PROFILE_LIST_COLUMNS =
  'id, email, name, role, department_id, phone, avatar_seed, workload, nationality, status, joined_at, last_login, preferred_language, created_at, updated_at'

export const PROFILE_DETAIL_COLUMNS = PROFILE_LIST_COLUMNS

export async function assertProfileExists(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Member ${userId} not found`)
}

export interface TeamMemberDetail {
  id: string
  email: string | null
  name: string | null
  role: string | null
  department_id: string | null
  phone: string | null
  avatar_seed: string | null
  workload: number | null
  nationality: string | null
  status: string | null
  joined_at: string | null
  last_login: string | null
  preferred_language: 'en' | 'ar' | null
  created_at: string
  updated_at: string
  roles: string[]
  permissions: string[]
  user_permissions: Array<{ permission_key: string; granted: boolean }>
  recent_activity: Array<{
    id: string
    action: string
    module: string
    details: string | null
    created_at: string
  }>
}

export async function getMemberDetail(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamMemberDetail> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(PROFILE_DETAIL_COLUMNS)
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle<Omit<TeamMemberDetail, 'roles' | 'permissions' | 'user_permissions' | 'recent_activity'>>()
  if (error) throw error
  if (!profile) throw NotFound(`Member ${userId} not found`)

  const [{ data: roles }, { data: userPerms }, { data: recent }] = await Promise.all([
    supabase.from('user_roles').select('role_key').eq('user_id', userId),
    supabase
      .from('user_permissions')
      .select('permission_key, granted')
      .eq('user_id', userId),
    supabase
      .from('user_activity_logs')
      .select('id, action, module, details, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const roleKeys = new Set<string>()
  for (const r of (roles ?? []) as Array<{ role_key: string }>) roleKeys.add(r.role_key)
  if (profile.role) roleKeys.add(profile.role)

  const permSet = new Set<string>()
  if (roleKeys.size > 0) {
    const { data: rolePerms } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .in('role_key', Array.from(roleKeys))
    for (const rp of (rolePerms ?? []) as Array<{ permission_key: string }>)
      permSet.add(rp.permission_key)
  }
  for (const up of (userPerms ?? []) as Array<{ permission_key: string; granted: boolean }>) {
    if (up.granted) permSet.add(up.permission_key)
    else permSet.delete(up.permission_key)
  }

  return {
    ...profile,
    roles: Array.from(roleKeys),
    permissions: Array.from(permSet),
    user_permissions: (userPerms ?? []) as Array<{ permission_key: string; granted: boolean }>,
    recent_activity:
      (recent ?? []) as Array<{
        id: string
        action: string
        module: string
        details: string | null
        created_at: string
      }>,
  }
}

export async function getEffectivePermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const detail = await getMemberDetail(supabase, userId)
  return detail.permissions
}
