import { create } from 'zustand'
import type { CalendarEvent, CalendarFilters } from '@/types'

type CalendarView = 'month' | 'week' | 'day' | 'agenda'

interface CalendarState {
  events: CalendarEvent[]
  selectedEvent: CalendarEvent | null
  selectedDate: Date
  view: CalendarView
  filters: CalendarFilters
  isLoading: boolean
  error: string | null

  // Actions
  fetchEvents: (startDate?: string, endDate?: string) => Promise<void>
  fetchById: (id: string) => Promise<CalendarEvent | null>
  createEvent: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<CalendarEvent>
  updateEvent: (id: string, data: Partial<CalendarEvent>) => Promise<CalendarEvent>
  deleteEvent: (id: string) => Promise<void>
  setSelectedEvent: (event: CalendarEvent | null) => void
  setSelectedDate: (date: Date) => void
  setView: (view: CalendarView) => void
  setFilters: (filters: CalendarFilters) => void
  clearFilters: () => void
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  selectedEvent: null,
  selectedDate: new Date(),
  view: 'month',
  filters: {},
  isLoading: false,
  error: null,

  fetchEvents: async (startDate?: string, endDate?: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      console.log('Fetching events:', { startDate, endDate })
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Mock data for now - will be replaced with API response
      const mockEvents: CalendarEvent[] = []

      set({ events: mockEvents, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch events',
        isLoading: false,
      })
    }
  },

  fetchById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 300))

      const event = get().events.find((e) => e.id === id) || null
      set({ selectedEvent: event, isLoading: false })
      return event
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch event',
        isLoading: false,
      })
      return null
    }
  },

  createEvent: async (data) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      const newEvent: CalendarEvent = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      set((state) => ({
        events: [...state.events, newEvent],
        isLoading: false,
      }))

      return newEvent
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create event',
        isLoading: false,
      })
      throw error
    }
  },

  updateEvent: async (id: string, data: Partial<CalendarEvent>) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

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
        isLoading: false,
      }))

      if (!updatedEvent) {
        throw new Error('Event not found')
      }

      return updatedEvent
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update event',
        isLoading: false,
      })
      throw error
    }
  },

  deleteEvent: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
        selectedEvent: state.selectedEvent?.id === id ? null : state.selectedEvent,
        isLoading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete event',
        isLoading: false,
      })
      throw error
    }
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setView: (view) => set({ view }),
  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
}))
