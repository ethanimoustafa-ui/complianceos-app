// W49 — user-added audit-task categories, scoped per correspondence
// authority. Seeded sets live in SEED_TASK_CATEGORIES (client, bilingual);
// this store holds extensions fetched from /api/audit-task-categories and
// guarantees an add for one authority never appears under another.

import { create } from 'zustand'
import { api } from '@/lib/api-client'

export interface AuditTaskCategoryItem {
  id: string
  authority: string
  key: string
  label: string
  labelAr: string
}

interface ApiRow {
  id: string
  authority: string
  key: string
  label_en: string
  label_ar: string
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

const mapRow = (r: ApiRow): AuditTaskCategoryItem => ({
  id: r.id,
  authority: r.authority,
  key: r.key,
  label: r.label_en,
  labelAr: r.label_ar,
})

interface AuditTaskCategoryState {
  items: AuditTaskCategoryItem[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  fetchAll(): Promise<void>
  list(authority: string | undefined): AuditTaskCategoryItem[]
  /** Resolves to the SERVER id (callers persist it on tasks). */
  add(authority: string, label: string, labelAr?: string): Promise<string>
  update(id: string, patch: { label?: string; labelAr?: string }): Promise<void>
  remove(id: string): Promise<void>
}

export const useAuditTaskCategoryStore = create<AuditTaskCategoryState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await api.get<ApiRow[]>('/audit-task-categories')
      set({ items: rows.map(mapRow), isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch task categories', isLoading: false })
    }
  },

  list: (authority) => {
    if (!authority) return []
    const a = authority.toLowerCase()
    return get().items.filter((i) => i.authority === a)
  },

  add: async (authority, label, labelAr) => {
    const row = await api.post<ApiRow>('/audit-task-categories', {
      authority: authority.toLowerCase(),
      key: slugify(label) || `cat-${label.length}`,
      label_en: label,
      label_ar: labelAr ?? label,
    })
    const created = mapRow(row)
    set((s) => ({ items: [...s.items, created] }))
    return created.id
  },

  update: async (id, patch) => {
    const row = await api.patch<ApiRow>(`/audit-task-categories/${id}`, {
      ...(patch.label !== undefined ? { label_en: patch.label } : {}),
      ...(patch.labelAr !== undefined ? { label_ar: patch.labelAr } : {}),
    })
    const updated = mapRow(row)
    set((s) => ({ items: s.items.map((i) => (i.id === id ? updated : i)) }))
  },

  remove: async (id) => {
    await api.delete(`/audit-task-categories/${id}`)
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  },
}))
