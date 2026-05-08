import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// SAMA letter type — opaque string id keyed against the (now widened)
// `SAMALetterType` type. Default seeds match the legacy union values so
// existing letters and templates with `non-objection|inquiry|submission|notification`
// keep matching.
export interface SAMALetterTypeItem {
  id: string
  label: string // EN
  labelAr: string
  isDefault?: boolean
}

interface SAMALetterTypeState {
  types: SAMALetterTypeItem[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<SAMALetterTypeItem, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: SAMALetterTypeItem[] = [
  { id: 'non-objection', label: 'Non-Objection', labelAr: 'عدم ممانعة',  isDefault: true },
  { id: 'inquiry',       label: 'Inquiry',       labelAr: 'استفسار',     isDefault: true },
  { id: 'submission',    label: 'Submission',    labelAr: 'تقديم',       isDefault: true },
  { id: 'notification',  label: 'Notification',  labelAr: 'إشعار',       isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useSAMALetterTypeStore = create<SAMALetterTypeState>()(
  persist(
    (set, get) => ({
      types: seeds,

      add: (label, labelAr) => {
        const baseId = slugify(label) || `type-${Date.now()}`
        const existingIds = new Set(get().types.map((t) => t.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          types: [
            ...s.types,
            { id, label, labelAr: labelAr ?? label },
          ],
        }))
        return id
      },

      update: (id, patch) =>
        set((s) => ({
          types: s.types.map((t) =>
            t.id === id ? { ...t, ...patch } : t
          ),
        })),

      remove: (id) =>
        set((s) => ({
          // Default seeds cannot be deleted to avoid orphaning persisted letters and templates.
          types: s.types.filter((t) => t.isDefault || t.id !== id),
        })),
    }),
    {
      name: 'sama-letter-type-storage',
      version: 1,
      // Ensure freshly-installed seeds always include the four defaults
      // even if an older persisted state is missing one (e.g., after manual edits).
      migrate: (persisted: unknown) => {
        const state = (persisted as { types?: SAMALetterTypeItem[] } | undefined) ?? {}
        const existing = state.types ?? []
        const seenIds = new Set(existing.map((t) => t.id))
        const merged = [...existing]
        for (const seed of seeds) {
          if (!seenIds.has(seed.id)) merged.push(seed)
        }
        return { ...state, types: merged }
      },
    },
  ),
)
