// Message store — Phase 5 server-state migration.
//
// Server-state backed: every thread / message / participant action goes
// through `/api/messages/threads/*`. Local state mirrors the API responses
// so the UI stays snappy between fetches.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && threads.length === 0` (first-fetch).
//
// LEGACY SHAPE: the existing `MessageThread` interface carries
// `participants: string[]` (names) AND `participantIds: string[]` (user ids).
// The API only returns ids; we surface names by joining against
// `useTeamStore.byId` at map time, falling back to the id when no profile is
// loaded yet. Refetching `useTeamStore.fetchAll()` populates the names.
//
// COMPAT SHIM: legacy `sendMessage` / `createThread` / `markThreadAsRead`
// were synchronous. Pages consume the returned thread id immediately. We
// keep that sync signature: optimistic local mutation + fire-and-forget API
// call. Errors surface via `error` on the store and the local row reconciles
// on success.

import { create } from 'zustand'
import type { MessageThread, Message } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'
import { useTeamStore } from '@/stores/team-store'

// ---------- API row shapes --------------------------------------------------

interface MessageThreadApiRow {
  id: string
  subject: string | null
  is_group: boolean
  avatar_url: string | null
  created_by: string
  last_message: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
  unread_count?: number
  is_admin?: boolean
}

interface MessageApiRow {
  id: string
  thread_id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
}

function nameFor(userId: string): string {
  // Best-effort name lookup against the team-store cache.
  const m = useTeamStore.getState().byId[userId]
  return m?.name || userId
}

function mapThreadRow(
  row: MessageThreadApiRow,
  previous?: MessageThread,
  participantIds?: string[],
  adminIds?: string[],
): MessageThread {
  const ids = participantIds ?? previous?.participantIds ?? []
  return {
    id: row.id,
    participants: ids.map(nameFor),
    participantIds: ids,
    subject: row.subject ?? undefined,
    lastMessage: row.last_message ?? '',
    lastMessageAt: row.last_message_at ?? row.updated_at ?? row.created_at,
    unreadCount: row.unread_count ?? previous?.unreadCount ?? 0,
    isGroup: row.is_group,
    avatarUrl: row.avatar_url ?? undefined,
    createdBy: row.created_by,
    admins: adminIds ?? previous?.admins ?? [],
  }
}

function mapMessageRow(row: MessageApiRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: nameFor(row.sender_id),
    content: row.content,
    createdAt: row.created_at,
    read: row.read,
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

/** Total unread across the user's threads — drives the sidebar badge. */
function sumUnread(threads: MessageThread[]): number {
  return threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
}

// ---------- store -----------------------------------------------------------

interface MessageState {
  threads: MessageThread[]
  messages: Message[]
  /**
   * Authoritative unread-badge total. Kept in sync with `threads` everywhere a
   * thread's unread changes, AND refreshable on its own via `fetchUnreadCount`
   * (the cheap poll path) without loading the full thread list. The sidebar
   * reads this rather than reducing `threads`, so the badge stays correct even
   * when only the count was polled.
   */
  unreadCount: number
  isLoading: boolean
  isLoadingMessages: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  /**
   * Lightweight unread-badge hydration. Fetches ONLY the thread list (no
   * per-thread detail loop) and merges unread_count / last-message into the
   * existing threads, preserving any participant ids already loaded by
   * `fetchAll`. Called by the LookupHydrator on mount + poll so the sidebar
   * badge populates without opening the panel — `fetchAll`'s N+1 detail loop is
   * too heavy to run blindly for every user on every page load.
   */
  fetchThreadSummaries: () => Promise<void>
  /**
   * Lightweight unread-badge refresh. Hits `/api/messages/unread-count` (a sum
   * over the user's participant rows — tiny payload, no per-thread N+1) and
   * updates only `unreadCount`. The LookupHydrator polls this so the badge
   * stays fresh without re-pulling the full `pageSize=100` thread list.
   */
  fetchUnreadCount: () => Promise<void>
  fetchMessages: (threadId: string) => Promise<void>
  sendMessage: (threadId: string, content: string, senderId: string, senderName: string) => void
  createThread: (
    participantNames: string[],
    participantIds: string[],
    firstMessage: string,
    senderId: string,
    senderName: string,
    avatarUrl?: string,
    groupName?: string,
    onReconciled?: (realId: string) => void,
  ) => string
  markThreadAsRead: (threadId: string) => void
  deleteThread: (threadId: string) => void
  kickMember: (threadId: string, memberId: string) => void
  promoteAdmin: (threadId: string, memberId: string) => void
  demoteAdmin: (threadId: string, memberId: string) => void
  addMembersToThread: (threadId: string, newNames: string[], newIds: string[]) => void
  updateThreadSubject: (threadId: string, subject: string) => void
  updateThreadAvatar: (threadId: string, avatarUrl: string) => void
  getThread: (threadId: string) => MessageThread | undefined
  getMessages: (threadId: string) => Message[]
  clearError: () => void
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  threads: [],
  messages: [],
  unreadCount: 0,
  isLoading: false,
  isLoadingMessages: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      // The list endpoint now embeds `participants` (user_id + is_admin) per
      // thread, so we map member lists directly from each row — no per-thread
      // detail fetch (the old N+1 that fired 1 + N requests per panel open).
      const result = await api.get<{
        items: (MessageThreadApiRow & { participants?: { user_id: string; is_admin: boolean }[] })[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/messages/threads', { pageSize: 100 })

      const previousByThread = new Map(get().threads.map((t) => [t.id, t]))
      const threads = result.items.map((row) => {
        const parts = row.participants ?? []
        const participantIds = parts.map((p) => p.user_id)
        const adminIds = parts.filter((p) => p.is_admin).map((p) => p.user_id)
        // Pass undefined (not []) when absent so mapThreadRow carries forward
        // any ids already loaded for this thread.
        return mapThreadRow(
          row,
          previousByThread.get(row.id),
          participantIds.length ? participantIds : undefined,
          adminIds.length ? adminIds : undefined,
        )
      })

      set({ threads, unreadCount: sumUnread(threads), isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch threads'), isLoading: false })
    }
  },

  fetchThreadSummaries: async () => {
    // List-only: the badge only needs `unread_count`, which is already on each
    // list row. `mapThreadRow(row, previous)` carries forward participant/admin
    // ids from any prior full fetch, so a background poll never strips an open
    // panel's member list. Does NOT toggle `isLoading` — silent background sync.
    try {
      const result = await api.get<{ items: MessageThreadApiRow[] }>('/messages/threads', { pageSize: 100 })
      const previousByThread = new Map(get().threads.map((t) => [t.id, t]))
      const threads = result.items.map((row) => mapThreadRow(row, previousByThread.get(row.id)))
      set({ threads, unreadCount: sumUnread(threads), lastFetched: Date.now() })
    } catch {
      // Badge hydration is best-effort — swallow so a transient failure never
      // surfaces an error on a page the user didn't explicitly open Messages on.
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await api.get<{ count: number }>('/messages/unread-count')
      set({ unreadCount: count })
    } catch {
      // Best-effort badge refresh — swallow transient failures.
    }
  },

  fetchMessages: async (threadId) => {
    set({ isLoadingMessages: true })
    try {
      const result = await api.get<{
        items: MessageApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>(`/messages/threads/${threadId}/messages`, { pageSize: 100 })
      const fetched = result.items.map(mapMessageRow)
      set((s) => ({
        // Replace this thread's messages, keep other threads' messages intact.
        messages: [...s.messages.filter((m) => m.threadId !== threadId), ...fetched],
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch messages') })
    } finally {
      set({ isLoadingMessages: false })
    }
  },

  sendMessage: (threadId, content, senderId, senderName) => {
    const newMsg: Message = {
      id: `local-${crypto.randomUUID()}`,
      threadId,
      senderId,
      senderName,
      content,
      createdAt: new Date().toISOString(),
      read: true,
    }
    set((state) => ({
      messages: [...state.messages, newMsg],
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, lastMessage: content, lastMessageAt: newMsg.createdAt } : t,
      ),
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const row = await api.post<MessageApiRow>(`/messages/threads/${threadId}/messages`, { content })
        const persisted = mapMessageRow(row)
        // Preserve the displayable senderName the caller gave us when the
        // team-store cache hasn't loaded yet.
        if (!persisted.senderName || persisted.senderName === persisted.senderId) {
          persisted.senderName = senderName
        }
        set((s) => ({
          messages: s.messages.map((m) => (m.id === newMsg.id ? persisted : m)),
          isMutating: false,
        }))
      } catch (e) {
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== newMsg.id),
          error: errorMessage(e, 'Failed to send message'),
          isMutating: false,
        }))
      }
    })()
  },

  createThread: (participantNames, participantIds, firstMessage, senderId, senderName, avatarUrl, groupName, onReconciled) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const isGroup = participantIds.length > 1
    // Keep `participants` aligned with `participantIds` AND include the creator,
    // matching the shape `fetchAll` produces. Misaligning them (ids incl self,
    // names excl self) shifts every member row by one → wrong creator/admin
    // badges on the wrong person and a phantom "?" trailing member.
    const allIds = [senderId, ...participantIds]
    const allNames = [senderName, ...participantNames]
    const newThread: MessageThread = {
      id: tempId,
      participants: allNames,
      participantIds: allIds,
      isGroup,
      avatarUrl,
      subject: groupName,
      createdBy: senderId,
      admins: [senderId],
      lastMessage: firstMessage,
      lastMessageAt: now,
      unreadCount: 0,
    }
    const newMsg: Message = {
      id: `local-${crypto.randomUUID()}`,
      threadId: tempId,
      senderId,
      senderName,
      content: firstMessage,
      createdAt: now,
      read: true,
    }
    set((s) => ({
      threads: [newThread, ...s.threads],
      messages: [...s.messages, newMsg],
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const row = await api.post<MessageThreadApiRow>('/messages/threads', {
          participant_ids: participantIds,
          name: groupName,
          is_group: isGroup,
          avatar_url: avatarUrl,
          initial_message: firstMessage,
        })
        const persisted = mapThreadRow(row, newThread, allIds, [senderId])
        // Keep the caller-supplied display names, aligned with allIds (incl self).
        persisted.participants = allNames
        set((s) => ({
          threads: s.threads.map((t) => (t.id === tempId ? persisted : t)),
          messages: s.messages.map((m) =>
            m.threadId === tempId ? { ...m, threadId: persisted.id } : m,
          ),
          isMutating: false,
        }))
        // The thread id just changed tempId → real uuid; let the caller follow it
        // (the panel's activeThreadId would otherwise point at the dead temp id,
        // hiding the just-created thread's messages until it's reopened).
        onReconciled?.(persisted.id)
      } catch (e) {
        set((s) => ({
          threads: s.threads.filter((t) => t.id !== tempId),
          messages: s.messages.filter((m) => m.threadId !== tempId),
          error: errorMessage(e, 'Failed to create thread'),
          isMutating: false,
        }))
      }
    })()
    return tempId
  },

  markThreadAsRead: (threadId) => {
    set((state) => {
      const threads = state.threads.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
      return {
        messages: state.messages.map((m) => (m.threadId === threadId ? { ...m, read: true } : m)),
        threads,
        unreadCount: sumUnread(threads),
      }
    })
    // No dedicated endpoint for per-thread read flag yet; the server tracks
    // unread_count on the participant row but the route to flip it isn't
    // exposed. Local-only patch keeps the UI responsive; the next fetchAll
    // will reconcile.
  },

  deleteThread: (threadId) => {
    const existing = get().threads.find((t) => t.id === threadId)
    const existingMessages = get().messages.filter((m) => m.threadId === threadId)
    set((state) => {
      const threads = state.threads.filter((t) => t.id !== threadId)
      return {
        threads,
        unreadCount: sumUnread(threads),
        messages: state.messages.filter((m) => m.threadId !== threadId),
        isMutating: true,
        error: null,
      }
    })
    if (threadId.startsWith('local-')) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/messages/threads/${threadId}`)
        set({ isMutating: false })
      } catch (e) {
        // Roll back.
        set((s) => {
          const threads = existing ? [existing, ...s.threads] : s.threads
          return {
            threads,
            unreadCount: sumUnread(threads),
            messages: [...s.messages, ...existingMessages],
            error: errorMessage(e, 'Failed to delete thread'),
            isMutating: false,
          }
        })
      }
    })()
  },

  kickMember: (threadId, memberId) => {
    set((state) => ({
      threads: state.threads.map((t) => {
        if (t.id !== threadId) return t
        const idx = t.participantIds.indexOf(memberId)
        if (idx === -1) return t
        const newParticipants = [...t.participants]
        newParticipants.splice(idx, 1)
        const newParticipantIds = t.participantIds.filter((id) => id !== memberId)
        const newAdmins = t.admins.filter((id) => id !== memberId)
        return {
          ...t,
          participants: newParticipants,
          participantIds: newParticipantIds,
          admins: newAdmins,
          isGroup: newParticipantIds.length > 1,
        }
      }),
      isMutating: true,
      error: null,
    }))
    if (threadId.startsWith('local-')) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.delete(`/messages/threads/${threadId}/participants/${memberId}`)
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to remove participant'), isMutating: false })
      }
    })()
  },

  promoteAdmin: (threadId, memberId) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId && !t.admins.includes(memberId) ? { ...t, admins: [...t.admins, memberId] } : t,
      ),
    }))
    if (threadId.startsWith('local-')) return
    void (async () => {
      try {
        await api.post(`/messages/threads/${threadId}/admins/${memberId}/promote`)
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to promote admin') })
      }
    })()
  },

  demoteAdmin: (threadId, memberId) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId && t.createdBy !== memberId
          ? { ...t, admins: t.admins.filter((id) => id !== memberId) }
          : t,
      ),
    }))
    if (threadId.startsWith('local-')) return
    void (async () => {
      try {
        await api.post(`/messages/threads/${threadId}/admins/${memberId}/demote`)
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to demote admin') })
      }
    })()
  },

  addMembersToThread: (threadId, newNames, newIds) => {
    set((state) => ({
      threads: state.threads.map((t) => {
        if (t.id !== threadId) return t
        const updatedParticipants = [...t.participants, ...newNames]
        const updatedIds = [...t.participantIds, ...newIds]
        return {
          ...t,
          participants: updatedParticipants,
          participantIds: updatedIds,
          isGroup: updatedIds.length > 1,
        }
      }),
      isMutating: true,
      error: null,
    }))
    if (threadId.startsWith('local-') || newIds.length === 0) {
      set({ isMutating: false })
      return
    }
    void (async () => {
      try {
        await api.post(`/messages/threads/${threadId}/participants`, { user_ids: newIds })
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to add participants'), isMutating: false })
      }
    })()
  },

  updateThreadSubject: (threadId, subject) => {
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, subject } : t)),
    }))
    if (threadId.startsWith('local-')) return
    void (async () => {
      try {
        await api.patch(`/messages/threads/${threadId}`, { name: subject })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update thread') })
      }
    })()
  },

  updateThreadAvatar: (threadId, avatarUrl) => {
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, avatarUrl } : t)),
    }))
    if (threadId.startsWith('local-')) return
    void (async () => {
      try {
        await api.patch(`/messages/threads/${threadId}`, { avatar_url: avatarUrl })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update thread avatar') })
      }
    })()
  },

  getThread: (threadId) => get().threads.find((t) => t.id === threadId),
  getMessages: (threadId) => get().messages.filter((m) => m.threadId === threadId),
  clearError: () => set({ error: null }),
}))
