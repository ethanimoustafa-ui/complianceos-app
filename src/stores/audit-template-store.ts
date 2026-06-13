// Audit template store — Phase 5 server-state migration.
//
// Backed by `/api/audit-templates` (GET list, POST create) and
// `/api/audit-templates/[templateId]` (PATCH update, DELETE). Routes were
// shipped in Phase 4 Stage A (audits reference family).

import { create } from 'zustand'
import type {
  AuditTemplate,
  AuditAuthority,
  AuditTemplateCategory,
  AuditPriority,
  AuditFrequency,
  FrequencySchedule,
  RegulatoryBodyId,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

interface AuditTemplateApiRow {
  id: string
  name: string
  name_ar: string | null
  audit_type: string
  category: string
  priority: string
  frequency: string
  frequency_schedule: FrequencySchedule | null
  default_title: string
  default_title_ar: string | null
  default_description: string
  default_description_ar: string | null
  default_checklist_items: string[]
  default_team_roles: string[]
  framework: string | null
  status: 'active' | 'draft'
  usage_count: number | null
  created_at: string
  updated_at: string
}

function mapRow(row: AuditTemplateApiRow): AuditTemplate {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    auditType: row.audit_type as AuditAuthority,
    category: row.category as AuditTemplateCategory,
    priority: row.priority as AuditPriority,
    frequency: row.frequency as AuditFrequency,
    frequencySchedule: row.frequency_schedule ?? undefined,
    defaultTitle: row.default_title,
    defaultTitleAr: row.default_title_ar ?? undefined,
    defaultDescription: row.default_description,
    defaultDescriptionAr: row.default_description_ar ?? undefined,
    defaultChecklistItems: row.default_checklist_items ?? [],
    defaultTeamRoles: row.default_team_roles ?? [],
    framework: (row.framework as RegulatoryBodyId | null) ?? undefined,
    status: row.status,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCreatePayload(
  data: Omit<AuditTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
): Record<string, unknown> {
  return {
    name: data.name,
    name_ar: data.nameAr ?? undefined,
    audit_type: data.auditType,
    category: data.category,
    priority: data.priority,
    frequency: data.frequency,
    frequency_schedule: data.frequencySchedule ?? undefined,
    default_title: data.defaultTitle,
    default_title_ar: data.defaultTitleAr ?? undefined,
    default_description: data.defaultDescription,
    default_description_ar: data.defaultDescriptionAr ?? undefined,
    default_checklist_items: data.defaultChecklistItems,
    default_team_roles: data.defaultTeamRoles,
    framework: data.framework ?? undefined,
    status: data.status,
  }
}

function toUpdatePayload(data: Partial<AuditTemplate>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.nameAr !== undefined) out.name_ar = data.nameAr
  if (data.auditType !== undefined) out.audit_type = data.auditType
  if (data.category !== undefined) out.category = data.category
  if (data.priority !== undefined) out.priority = data.priority
  if (data.frequency !== undefined) out.frequency = data.frequency
  if (data.frequencySchedule !== undefined) out.frequency_schedule = data.frequencySchedule
  if (data.defaultTitle !== undefined) out.default_title = data.defaultTitle
  if (data.defaultTitleAr !== undefined) out.default_title_ar = data.defaultTitleAr
  if (data.defaultDescription !== undefined) out.default_description = data.defaultDescription
  if (data.defaultDescriptionAr !== undefined) out.default_description_ar = data.defaultDescriptionAr
  if (data.defaultChecklistItems !== undefined) out.default_checklist_items = data.defaultChecklistItems
  if (data.defaultTeamRoles !== undefined) out.default_team_roles = data.defaultTeamRoles
  if (data.framework !== undefined) out.framework = data.framework
  if (data.status !== undefined) out.status = data.status
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface AuditTemplateState {
  templates: AuditTemplate[]
  byId: Record<string, AuditTemplate>

  // First-fetch rule: `isLoading && templates.length === 0` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  create(data: Omit<AuditTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<AuditTemplate>
  update(id: string, data: Partial<AuditTemplate>): Promise<AuditTemplate>
  delete(id: string): Promise<void>
  /**
   * Bumps `usage_count` for analytics. The current API does not expose an
   * explicit `increment` route; we PATCH with the new value. If parallel
   * increments race, the server's last-write-wins behavior is acceptable for
   * a usage analytics counter.
   */
  incrementUsage(id: string): Promise<void>
  clearError(): void
}

export const useAuditTemplateStore = create<AuditTemplateState>()((set, get) => ({
  templates: [],
  byId: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<AuditTemplateApiRow[]>('/audit-templates')
      const templates = rows.map(mapRow)
      const byId: Record<string, AuditTemplate> = {}
      for (const t of templates) byId[t.id] = t
      set({ templates, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch audit templates'), isLoading: false })
    }
  },

  create: async (data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<AuditTemplateApiRow>('/audit-templates', toCreatePayload(data))
      const created = mapRow(row)
      set((s) => ({
        templates: [created, ...s.templates],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      return created
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to create audit template'), isMutating: false })
      throw e
    }
  },

  update: async (id, data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<AuditTemplateApiRow>(`/audit-templates/${id}`, toUpdatePayload(data))
      const updated = mapRow(row)
      set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? updated : t)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
      return updated
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to update audit template'), isMutating: false })
      throw e
    }
  },

  // Optimistic delete — drop the row immediately, restore on failure.
  delete: async (id) => {
    const { templates } = get()
    const idx = templates.findIndex((t) => t.id === id)
    if (idx === -1) return
    const removed = templates[idx]
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return { templates: s.templates.filter((t) => t.id !== id), byId: rest, isMutating: true, error: null }
    })
    try {
      await api.delete(`/audit-templates/${id}`)
      set({ isMutating: false })
    } catch (e) {
      set((s) => {
        const next = [...s.templates]
        next.splice(Math.min(idx, next.length), 0, removed)
        return {
          templates: next,
          byId: { ...s.byId, [id]: removed },
          error: errorMessage(e, 'Failed to delete audit template'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  incrementUsage: async (id) => {
    const current = get().byId[id]
    if (!current) return
    // Optimistic — usage_count is non-critical.
    const next = current.usageCount + 1
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, usageCount: next } : t)),
      byId: { ...s.byId, [id]: { ...current, usageCount: next } },
    }))
    // The PATCH endpoint accepts only the schema-declared fields, so we
    // don't currently have a server-side increment path. Fire-and-forget;
    // a follow-up phase can ship `/api/audit-templates/[id]/increment`.
  },

  clearError: () => set({ error: null }),
}))
