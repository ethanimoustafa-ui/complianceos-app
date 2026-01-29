import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Notification } from '@/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  delete: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Mock data for now - will be replaced with API response
          const mockNotifications: Notification[] = []

          set({
            notifications: mockNotifications,
            unreadCount: mockNotifications.filter((n) => !n.read).length,
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch notifications',
            isLoading: false,
          })
        }
      },

      markAsRead: async (id: string) => {
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 200))

          set((state) => {
            const updated = state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            )
            return {
              notifications: updated,
              unreadCount: updated.filter((n) => !n.read).length,
            }
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to mark as read',
          })
        }
      },

      markAllAsRead: async () => {
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 300))

          set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to mark all as read',
          })
        }
      },

      delete: async (id: string) => {
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 200))

          set((state) => {
            const updated = state.notifications.filter((n) => n.id !== id)
            return {
              notifications: updated,
              unreadCount: updated.filter((n) => !n.read).length,
            }
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete notification',
          })
        }
      },

      clearAll: async () => {
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 300))

          set({ notifications: [], unreadCount: 0 })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to clear notifications',
          })
        }
      },

      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: crypto.randomUUID(),
          read: false,
          createdAt: new Date().toISOString(),
        }

        set((state) => ({
          notifications: [newNotification, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
      },
    }),
    {
      name: 'notification-storage',
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
    }
  )
)
