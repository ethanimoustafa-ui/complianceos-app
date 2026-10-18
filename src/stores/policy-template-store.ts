// Policy templates store — Phase 5 server-state migration.
//
// Lookup-style resource: GET /api/policy-templates returns the active set; we
// keep an in-memory `templates` array plus a `byId` lookup. Mutations preserve
// the legacy `create / update / delete / incrementUsage` shape so the
// settings page and the "create policy from template" flow don't break.
//
// SKELETON-LOADING NOTE: consumer pages should render a skeleton when
// `isLoading && templates.length === 0` (first-fetch).

import { create } from 'zustand'
import type { PolicyTemplate, PolicyCategory, PolicyApprovalTier, RegulatoryBodyId, AuditFrequency, FrequencySchedule } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { requirePermission } from '@/lib/rbac/rbac-store-gate'

// ---------- API row shape ----------------------------------------------------

interface PolicyTemplateApiRow {
  id: string
  name: string
  name_ar: string | null
  category: string
  approval_tier: string
  frequency: string | null
  frequency_schedule: unknown
  default_description: string
  default_description_ar: string | null
  default_workflow_steps: unknown
  version_pattern: string
  framework: string | null
  status: 'active' | 'archived' | 'draft'
  usage_count: number
  created_at: string
  updated_at: string
}

function mapRow(row: PolicyTemplateApiRow): PolicyTemplate {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    category: row.category as PolicyCategory,
    approvalTier: row.approval_tier as PolicyApprovalTier,
    frequency: (row.frequency as AuditFrequency | null) ?? undefined,
    frequencySchedule: (row.frequency_schedule as FrequencySchedule | undefined) ?? undefined,
    defaultDescription: row.default_description,
    defaultDescriptionAr: row.default_description_ar ?? undefined,
    defaultWorkflowSteps: (row.default_workflow_steps as PolicyTemplate['defaultWorkflowSteps']) ?? [],
    versionPattern: row.version_pattern,
    framework: (row.framework as RegulatoryBodyId | null) ?? undefined,
    status: row.status === 'archived' ? 'draft' : (row.status as PolicyTemplate['status']),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: row.usage_count,
  }
}

function toCreatePayload(data: Omit<PolicyTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Record<string, unknown> {
  return {
    name: data.name,
    name_ar: data.nameAr ?? undefined,
    category: data.category,
    approval_tier: data.approvalTier,
    frequency: data.frequency ?? undefined,
    frequency_schedule: data.frequencySchedule ?? undefined,
    default_description: data.defaultDescription,
    default_description_ar: data.defaultDescriptionAr ?? undefined,
    default_workflow_steps: data.defaultWorkflowSteps ?? [],
    version_pattern: data.versionPattern ?? 'v{major}.{minor}',
    framework: data.framework ?? undefined,
    status: data.status === 'draft' ? 'active' : data.status,
  }
}

function toUpdatePayload(data: Partial<PolicyTemplate>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.nameAr !== undefined) out.name_ar = data.nameAr
  if (data.category !== undefined) out.category = data.category
  if (data.approvalTier !== undefined) out.approval_tier = data.approvalTier
  if (data.frequency !== undefined) out.frequency = data.frequency
  if (data.frequencySchedule !== undefined) out.frequency_schedule = data.frequencySchedule
  if (data.defaultDescription !== undefined) out.default_description = data.defaultDescription
  if (data.defaultDescriptionAr !== undefined) out.default_description_ar = data.defaultDescriptionAr
  if (data.defaultWorkflowSteps !== undefined) out.default_workflow_steps = data.defaultWorkflowSteps
  if (data.versionPattern !== undefined) out.version_pattern = data.versionPattern
  if (data.framework !== undefined) out.framework = data.framework
  if (data.status !== undefined) out.status = data.status === 'draft' ? 'active' : data.status
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store -----------------------------------------------------------

interface PolicyTemplateState {
  templates: PolicyTemplate[]
  byId: Record<string, PolicyTemplate>
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  /**
   * Legacy signature: returns the locally-optimistic template immediately. The
   * POST runs in background; on success the row is replaced with the persisted
   * version. On failure the optimistic row is removed and `error` is set.
   */
  create: (data: Omit<PolicyTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => PolicyTemplate
  // W37: update/delete are awaitable + resolve to a success boolean so the
  // Settings modal can show an in-flight spinner and only close on confirmed
  // success (a server failure now surfaces instead of silently rolling back).
  update: (id: string, data: Partial<PolicyTemplate>) => Promise<boolean>
  delete: (id: string) => Promise<boolean>
  incrementUsage: (id: string) => void
  clearError: () => void
}

export const usePolicyTemplateStore = create<PolicyTemplateState>()((set, get) => ({
  // First-fetch detector: `isLoading && templates.length === 0` → render skeleton.
  templates: [],
  byId: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<PolicyTemplateApiRow[]>('/policy-templates')
      const templates = rows.map(mapRow)
      const byId: Record<string, PolicyTemplate> = {}
      for (const t of templates) byId[t.id] = t
      set({ templates, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch policy templates'), isLoading: false })
    }
  },

  create: (data) => {
    requirePermission('Manage Policy Templates', { storeName: 'policyTemplate', actionName: 'create' })
    const tempId = `pt-temp-${Date.now()}`
    const now = new Date().toISOString().split('T')[0]
    const optimistic: PolicyTemplate = {
      ...data,
      id: tempId,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    }
    set((s) => ({
      templates: [optimistic, ...s.templates],
      byId: { ...s.byId, [tempId]: optimistic },
      isMutating: true,
      error: null,
    }))

    void (async () => {
      try {
        const row = await api.post<PolicyTemplateApiRow>('/policy-templates', toCreatePayload(data))
        const created = mapRow(row)
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            templates: s.templates.map((t) => (t.id === tempId ? created : t)),
            byId: { ...rest, [created.id]: created },
            isMutating: false,
          }
        })
      } catch (e) {
        set((s) => {
          const { [tempId]: _drop, ...rest } = s.byId
          return {
            templates: s.templates.filter((t) => t.id !== tempId),
            byId: rest,
            error: errorMessage(e, 'Failed to create policy template'),
            isMutating: false,
          }
        })
      }
    })()

    return optimistic
  },

  update: async (id, data) => {
    requirePermission('Manage Policy Templates', { storeName: 'policyTemplate', actionName: 'update', id })
    const previous = get().byId[id]
    if (!previous) return false
    const optimistic: PolicyTemplate = {
      ...previous,
      ...data,
      updatedAt: new Date().toISOString().split('T')[0],
    }
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? optimistic : t)),
      byId: { ...s.byId, [id]: optimistic },
      isMutating: true,
      error: null,
    }))

    // Temp-id rows (still pending create) skip the PATCH.
    if (id.startsWith('pt-temp-')) {
      set({ isMutating: false })
      return true
    }

    try {
      const row = await api.patch<PolicyTemplateApiRow>(`/policy-templates/${id}`, toUpdatePayload(data))
      const updated = mapRow(row)
      set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? updated : t)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
      return true
    } catch (e) {
      // Roll back to `previous` on failure.
      set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? previous : t)),
        byId: { ...s.byId, [id]: previous },
        error: errorMessage(e, 'Failed to update policy template'),
        isMutating: false,
      }))
      return false
    }
  },

  delete: async (id) => {
    requirePermission('Manage Policy Templates', { storeName: 'policyTemplate', actionName: 'delete', id })
    const previous = get().byId[id]
    if (!previous) return false
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return {
        templates: s.templates.filter((t) => t.id !== id),
        byId: rest,
        isMutating: true,
        error: null,
      }
    })

    if (id.startsWith('pt-temp-')) {
      set({ isMutating: false })
      return true
    }

    try {
      await api.delete(`/policy-templates/${id}`)
      set({ isMutating: false })
      return true
    } catch (e) {
      // Roll back: re-insert at the original position. Simplest is push to
      // the head — UI sort logic will re-order.
      set((s) => ({
        templates: [previous, ...s.templates],
        byId: { ...s.byId, [id]: previous },
        error: errorMessage(e, 'Failed to delete policy template'),
        isMutating: false,
      }))
      return false
    }
  },

  // No dedicated /usage endpoint — increment locally so the UI counter ticks
  // up while the policy-create flow records the choice; a future PATCH or
  // server-side trigger should persist the usage_count column.
  // TODO(Phase 6): wire a real POST /policy-templates/[id]/usage endpoint.
  incrementUsage: (id) =>
    set((s) => {
      const previous = s.byId[id]
      if (!previous) return s
      const updated: PolicyTemplate = { ...previous, usageCount: previous.usageCount + 1 }
      return {
        templates: s.templates.map((t) => (t.id === id ? updated : t)),
        byId: { ...s.byId, [id]: updated },
      }
    }),

  clearError: () => set({ error: null }),
}))
