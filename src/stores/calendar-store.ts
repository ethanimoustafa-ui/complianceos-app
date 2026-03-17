import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CalendarEvent } from '@/types'

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

interface CalendarFiltersState {
  type?: CalendarEvent['type'][]
  dateRange?: { from: string; to: string }
}

interface CalendarState {
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  selectedDate: Date
  view: CalendarView
  filters: CalendarFiltersState
  isLoading: boolean
  error: string | null

  // Actions (synchronous)
  fetchAll: () => void
  fetchById: (id: string) => CalendarEvent | null
  createEvent: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => CalendarEvent
  updateEvent: (id: string, data: Partial<CalendarEvent>) => CalendarEvent | null
  deleteEvent: (id: string) => void
  setSelectedEvent: (event: CalendarEvent | null) => void
  setSelectedDate: (date: Date) => void
  setView: (view: CalendarView) => void
  setFilters: (filters: CalendarFiltersState) => void
  clearFilters: () => void
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: [],
      selectedEvent: null,
      selectedDate: new Date(),
      view: 'month',
      filters: {},
      isLoading: false,
      error: null,

      fetchAll: () => {
        // TODO: Replace with actual API call
      },

      fetchById: (id) => {
        // TODO: Replace with actual API call
        return get().events.find(e => e.id === id) ?? null
      },

      createEvent: (data) => {
        // TODO: Replace with actual API call
        const newEvent: CalendarEvent = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({ events: [...state.events, newEvent] }))
        return newEvent
      },

      updateEvent: (id, data) => {
        // TODO: Replace with actual API call
        let updatedEvent: CalendarEvent | null = null
        set((state) => ({
          events: state.events.map((e) => {
            if (e.id === id) {
              updatedEvent = { ...e, ...data, updatedAt: new Date().toISOString() }
              return updatedEvent
            }
            return e
          }),
          selectedEvent:
            state.selectedEvent?.id === id
              ? { ...state.selectedEvent, ...data, updatedAt: new Date().toISOString() }
              : state.selectedEvent,
        }))
        return updatedEvent
      },

      deleteEvent: (id) => {
        // TODO: Replace with actual API call
        set((state) => ({
          events: state.events.filter((e) => e.id !== id),
          selectedEvent: state.selectedEvent?.id === id ? null : state.selectedEvent,
        }))
      },

      setSelectedEvent: (event) => set({ selectedEvent: event }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      setView: (view) => set({ view }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
    }),
    {
      name: 'calendar-store',
      version: 2,
      partialize: (state) => ({
        events: state.events,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { events?: any[] }
        if (version < 2) {
          const AGENCY_TO_FW: Record<string, string[]> = {
            SAMA: ['sama'],
            CMA: ['cma'],
            ZATCA: ['zatca'],
            MISA: ['misa'],
            SAFIU: ['safiu'],
            NCA: ['nca-ecc'],
            IA: [],
          }
          return {
            ...state,
            events: (state.events ?? []).map((e: any) => ({
              ...e,
              frameworkIds: e.frameworkIds ?? (e.agency ? (AGENCY_TO_FW[e.agency] ?? []) : []),
              severity: e.severity ?? undefined,
            })),
          }
        }
        return persistedState
      },
    }
  )
)
