// Zod schemas for the team / profiles / roles resource family.

import { z } from 'zod'

const Uuid = z.string().uuid()
const RoleKey = z.enum(['viewer', 'auditor', 'compliance_officer', 'org_admin'])
const Status = z.enum(['active', 'inactive', 'pending'])
const Lang = z.enum(['en', 'ar'])

// ---------- invite ------------------------------------------------------------

export const InviteMemberSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200),
  role_key: RoleKey,
  department_id: Uuid.optional(),
  phone: z.string().max(50).optional(),
  permissions: z.array(z.string().min(1)).optional(),
})
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>

// ---------- update profile / role / status -----------------------------------

export const UpdateMemberSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  department_id: Uuid.nullable().optional(),
  role: RoleKey.optional(),
  status: Status.optional(),
  workload: z.number().int().min(0).max(100).optional(),
  preferred_language: Lang.optional(),
  nationality: z.string().max(100).optional(),
  avatar_seed: z.string().max(200).optional(),
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>

export const ListMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  role: RoleKey.optional(),
  status: Status.optional(),
  department_id: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>

// ---------- permissions overrides --------------------------------------------

export const SetPermissionsSchema = z.object({
  // Map of permission_key -> granted (true/false). Sent as a bulk replacement
  // of the user's custom overrides for the listed keys.
  permissions: z.record(z.string().min(1), z.boolean()),
})
export type SetPermissionsInput = z.infer<typeof SetPermissionsSchema>

// ---------- user activity logs -----------------------------------------------

export const ListUserLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  user_id: Uuid.optional(),
  action: z.string().max(100).optional(),
  module: z.string().max(100).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})
export type ListUserLogsQuery = z.infer<typeof ListUserLogsQuerySchema>
