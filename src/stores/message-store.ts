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

interface ParticipantApiRow {
  thread_id: string
  user_id: string
  is_admin: boolean
  unread_count: number
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

// ---------- store -----------------------------------------------------------

interface MessageState {
  threads: MessageThread[]
  messages: Message[]
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
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
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<{
        items: MessageThreadApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/messages/threads', { pageSize: 100 })

      // Hydrate participant ids + admin ids per thread via detail fetches.
      const previousByThread = new Map(get().threads.map((t) => [t.id, t]))
      const threads: MessageThread[] = []
      for (const row of result.items) {
        try {
          const detail = await api.get<MessageThreadApiRow & { participants: ParticipantApiRow[] }>(
            `/messages/threads/${row.id}`,
          )
          const participantIds = detail.participants.map((p) => p.user_id)
          const adminIds = detail.participants.filter((p) => p.is_admin).map((p) => p.user_id)
          threads.push(mapThreadRow(row, previousByThread.get(row.id), participantIds, adminIds))
        } catch {
          // If detail fetch fails, fall back to the list row alone.
          threads.push(mapThreadRow(row, previousByThread.get(row.id)))
        }
      }

      set({ threads, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch threads'), isLoading: false })
    }
  },

  fetchMessages: async (threadId) => {
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

  createThread: (participantNames, participantIds, firstMessage, senderId, senderName, avatarUrl, groupName) => {
    const tempId = `local-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const isGroup = participantIds.length > 1
    const newThread: MessageThread = {
      id: tempId,
      participants: participantNames,
      participantIds,
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
        const persisted = mapThreadRow(
          row,
          newThread,
          Array.from(new Set([senderId, ...participantIds])),
          [senderId],
        )
        // Preserve display names the caller supplied.
        persisted.participants = participantNames
        set((s) => ({
          threads: s.threads.map((t) => (t.id === tempId ? persisted : t)),
          messages: s.messages.map((m) =>
            m.threadId === tempId ? { ...m, threadId: persisted.id } : m,
          ),
          isMutating: false,
        }))
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
    set((state) => ({
      messages: state.messages.map((m) => (m.threadId === threadId ? { ...m, read: true } : m)),
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t)),
    }))
    // No dedicated endpoint for per-thread read flag yet; the server tracks
    // unread_count on the participant row but the route to flip it isn't
    // exposed. Local-only patch keeps the UI responsive; the next fetchAll
    // will reconcile.
  },

  deleteThread: (threadId) => {
    const existing = get().threads.find((t) => t.id === threadId)
    const existingMessages = get().messages.filter((m) => m.threadId === threadId)
    set((state) => ({
      threads: state.threads.filter((t) => t.id !== threadId),
      messages: state.messages.filter((m) => m.threadId !== threadId),
      isMutating: true,
      error: null,
    }))
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
        set((s) => ({
          threads: existing ? [existing, ...s.threads] : s.threads,
          messages: [...s.messages, ...existingMessages],
          error: errorMessage(e, 'Failed to delete thread'),
          isMutating: false,
        }))
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
