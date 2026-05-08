import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { requirePermission } from '@/lib/rbac-store-gate'

// Calendar event type — id is opaque string. The four seeds match the legacy
// `CalendarEvent.type` literal union; widening that type to `string` is done
// in `src/types/index.ts` so user-added ids round-trip safely.
export interface CalendarEventType {
  id: string
  label: string
  labelAr: string
  isDefault?: boolean
}

interface CalendarEventTypeState {
  types: CalendarEventType[]
  add: (label: string, labelAr?: string) => string
  update: (id: string, patch: Partial<Omit<CalendarEventType, 'id'>>) => void
  remove: (id: string) => void
}

const seeds: CalendarEventType[] = [
  { id: 'meeting',    label: 'Meeting',    labelAr: 'اجتماع',  isDefault: true },
  { id: 'deadline',   label: 'Deadline',   labelAr: 'موعد نهائي', isDefault: true },
  { id: 'submission', label: 'Submission', labelAr: 'تقديم',   isDefault: true },
  { id: 'review',     label: 'Review',     labelAr: 'مراجعة',  isDefault: true },
]

const slugify = (s: string): string =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const useCalendarEventTypeStore = create<CalendarEventTypeState>()(
  persist(
    (set, get) => ({
      types: seeds,

      add: (label, labelAr) => {
        requirePermission('Configure Lists & Categories', { storeName: 'calendarEventType', actionName: 'add' })
        const baseId = slugify(label) || `event-type-${Date.now()}`
        const existingIds = new Set(get().types.map((t) => t.id))
        let id = baseId
        let n = 2
        while (existingIds.has(id)) id = `${baseId}-${n++}`
        set((s) => ({
          types: [...s.types, { id, label, labelAr: labelAr ?? label }],
        }))
        return id
      },

      update: (id, patch) => {
        requirePermission('Configure Lists & Categories', { storeName: 'calendarEventType', actionName: 'update', id })
        set((s) => ({
          types: s.types.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }))
      },

      remove: (id) => {
        requirePermission('Configure Lists & Categories', { storeName: 'calendarEventType', actionName: 'remove', id })
        set((s) => ({
          // Seeds are deletable — see SPRINT-FOLLOWUP-PLAN §2.3.
          types: s.types.filter((t) => t.id !== id),
        }))
      },
    }),
    {
      name: 'calendar-event-type-storage',
      version: 1,
      partialize: (s) => ({ types: s.types }),
    }
  )
)
