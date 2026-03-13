import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppNotification } from '@/types'

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  clearAll: () => void
  syncGeneratedNotifications: (generated: AppNotification[]) => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (notification) => {
        const newNotif: AppNotification = {
          ...notification,
          id: crypto.randomUUID(),
          read: false,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({
          notifications: [newNotif, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
      },

      markAsRead: (id) => {
        set((state) => {
          const updated = state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
          )
          return { notifications: updated, unreadCount: updated.filter(n => !n.read).length }
        })
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
          unreadCount: 0,
        }))
      },

      deleteNotification: (id) => {
        set((state) => {
          const updated = state.notifications.filter(n => n.id !== id)
          return { notifications: updated, unreadCount: updated.filter(n => !n.read).length }
        })
      },

      clearAll: () => {
        set({ notifications: [], unreadCount: 0 })
      },

      syncGeneratedNotifications: (generated) => {
        set((state) => {
          const existingByKey = new Map<string, AppNotification>()
          for (const n of state.notifications) {
            if (n.dedupeKey) existingByKey.set(n.dedupeKey, n)
          }

          // Keep manually-added notifications (no dedupeKey)
          const manualNotifs = state.notifications.filter(n => !n.dedupeKey)

          // Merge: for each generated notification, preserve read state if it existed
          const merged = generated.map(g => {
            const existing = g.dedupeKey ? existingByKey.get(g.dedupeKey) : undefined
            if (existing) {
              return { ...g, id: existing.id, read: existing.read }
            }
            return g
          })

          const all = [...manualNotifs, ...merged]
          return {
            notifications: all,
            unreadCount: all.filter(n => !n.read).length,
          }
        })
      },
    }),
    {
      name: 'notification-storage',
      version: 3,
      migrate: () => ({
        notifications: [],
        unreadCount: 0,
      }),
      partialize: (state) => ({
        notifications: state.notifications,
        unreadCount: state.unreadCount,
      }),
    }
  )
)
