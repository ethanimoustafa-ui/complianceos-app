// Notification store — Phase 5 server-state migration.
//
// Server-state backed: every read/write hits `/api/notifications/*`. The
// per-user notification list is the source of truth on the server; local
// state is just an in-memory mirror.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && notifications.length === 0` (first-fetch).
//
// LEGACY SHIM: `syncGeneratedNotifications` previously merged engine-generated
// notifications with persisted ones. Phase 5 makes the server the source of
// truth — the action is now a no-op kept for `useNotificationEngine` so it
// keeps compiling until that hook is retired in a later phase.

import { create } from 'zustand'
import type { AppNotification } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

// ---------- API row shape ---------------------------------------------------

interface NotificationApiRow {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  source_type: string | null
  route: string | null
  entity_id: string | null
  dedupe_key: string | null
  read: boolean
  created_at: string
}

function mapRow(row: NotificationApiRow): AppNotification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    sourceType: (row.source_type ?? undefined) as AppNotification['sourceType'],
    route: row.route ?? undefined,
    read: row.read,
    entityId: row.entity_id ?? undefined,
    dedupeKey: row.dedupe_key ?? undefined,
    createdAt: row.created_at,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchNotifications: () => Promise<void>
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  clearAll: () => void
  /** @deprecated Server is source of truth — kept as no-op until the notification engine is retired. */
  syncGeneratedNotifications: (generated: AppNotification[]) => void
  clearError: () => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchNotifications: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: NotificationApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/notifications', { pageSize: 100 })
      const notifications = result.items.map(mapRow)
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch notifications'), isLoading: false })
    }
  },

  addNotification: (notification) => {
    // Optimistic insert; the API only accepts a `user_id` so callers should
    // hit POST /api/notifications directly when they have a target user.
    // Local-only entries (no `user_id`) just live in memory until the next
    // fetch overwrites them.
    const optimistic: AppNotification = {
      ...notification,
      id: `local-${crypto.randomUUID()}`,
      read: false,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      notifications: [optimistic, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
  },

  markAsRead: (id) => {
    // Optimistic patch.
    set((state) => {
      const updated = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
        isMutating: true,
        error: null,
      }
    })
    if (id.startsWith('local-')) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.post(`/notifications/${id}/mark-read`)
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to mark notification read'), isMutating: false })
      }
    })()
  },

  markAllAsRead: () => {
    const previous = get().notifications
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        await api.post('/notifications/mark-all-read')
        set({ isMutating: false })
      } catch (e) {
        // Roll back.
        set({
          notifications: previous,
          unreadCount: previous.filter((n) => !n.read).length,
          error: errorMessage(e, 'Failed to mark all read'),
          isMutating: false,
        })
      }
    })()
  },

  deleteNotification: (id) => {
    const previous = get().notifications
    set((state) => {
      const updated = state.notifications.filter((n) => n.id !== id)
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
        isMutating: true,
        error: null,
      }
    })
    if (id.startsWith('local-')) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/notifications/${id}`)
        set({ isMutating: false })
      } catch (e) {
        set({
          notifications: previous,
          unreadCount: previous.filter((n) => !n.read).length,
          error: errorMessage(e, 'Failed to delete notification'),
          isMutating: false,
        })
      }
    })()
  },

  clearAll: () => {
    const previous = get().notifications
    set({ notifications: [], unreadCount: 0, isMutating: true, error: null })
    // No bulk-delete endpoint exists; issue parallel DELETEs for the
    // server-known rows. Local rows just disappear.
    const serverIds = previous.filter((n) => !n.id.startsWith('local-')).map((n) => n.id)
    void (async () => {
      try {
        await Promise.all(serverIds.map((id) => api.delete(`/notifications/${id}`)))
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to clear notifications'), isMutating: false })
      }
    })()
  },

  // Phase 5 — server is the source of truth. The notification engine still
  // calls this; we ignore the payload so the engine becomes a no-op until it
  // is retired in a later phase.
  syncGeneratedNotifications: (_generated) => {
    // Intentionally empty.
  },

  clearError: () => set({ error: null }),
}))
