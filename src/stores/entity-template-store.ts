// entity-template-store.ts — M2: Save as template / Select template for Rules.
// Fetches from /api/entity-templates?entity_type=circular and caches.
// Future waves extend to 'policy' | 'audit' by passing a different entity_type.

import { create } from 'zustand'
import { api } from '@/lib/api-client'

export interface EntityTemplate {
  id: string
  entity_type: string
  name: string
  name_ar?: string
  fields: Record<string, unknown>
  is_default: boolean
  created_at: string
}

interface EntityTemplateState {
  // templates keyed by entity_type
  byType: Record<string, EntityTemplate[]>
  isLoading: boolean
  error: string | null

  fetchByType: (entityType: string) => Promise<void>
  saveTemplate: (entityType: string, name: string, nameAr: string | undefined, fields: Record<string, unknown>) => Promise<EntityTemplate>
  deleteTemplate: (id: string, entityType: string) => Promise<void>
}

export const useEntityTemplateStore = create<EntityTemplateState>()((set, get) => ({
  byType: {},
  isLoading: false,
  error: null,

  fetchByType: async (entityType) => {
    set({ isLoading: true, error: null })
    try {
      const data = await api.get<EntityTemplate[]>('/entity-templates', { entity_type: entityType })
      set((s) => ({
        byType: { ...s.byType, [entityType]: data },
        isLoading: false,
      }))
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : 'Failed to fetch templates',
        isLoading: false,
      })
    }
  },

  saveTemplate: async (entityType, name, nameAr, fields) => {
    const created = await api.post<EntityTemplate>('/entity-templates', {
      entity_type: entityType,
      name,
      name_ar: nameAr ?? undefined,
      fields,
    })
    set((s) => ({
      byType: {
        ...s.byType,
        [entityType]: [...(s.byType[entityType] ?? []), created],
      },
    }))
    return created
  },

  deleteTemplate: async (id, entityType) => {
    await api.delete(`/entity-templates/${id}`)
    set((s) => ({
      byType: {
        ...s.byType,
        [entityType]: (s.byType[entityType] ?? []).filter((t) => t.id !== id),
      },
    }))
  },
}))
