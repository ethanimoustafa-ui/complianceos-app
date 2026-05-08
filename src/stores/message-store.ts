import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MessageThread, Message } from '@/types'

function hoursAgo(h: number): string {
  const d = new Date(); d.setHours(d.getHours() - h); return d.toISOString()
}
function daysAgo(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString()
}

const SEED_MESSAGES: Message[] = [
  // Thread 1: Compliance Team Discussion
  { id: 'msg-1', threadId: 'thread-1', senderId: 'user-sarah', senderName: 'Sarah Al-Rashid', content: 'Has anyone reviewed the new SAMA circular on AML procedures? We need to assess impact by Friday.', createdAt: daysAgo(1), read: true },
  { id: 'msg-2', threadId: 'thread-1', senderId: 'user-ahmed', senderName: 'Ahmed Hassan', content: 'I started the gap analysis. Looks like we need updates to 3 existing policies.', createdAt: hoursAgo(8), read: true },
  { id: 'msg-3', threadId: 'thread-1', senderId: 'user-sarah', senderName: 'Sarah Al-Rashid', content: 'Good progress. Can you share the draft by tomorrow morning?', createdAt: hoursAgo(2), read: false },
  // Thread 2: Audit Follow-up
  { id: 'msg-4', threadId: 'thread-2', senderId: 'user-omar', senderName: 'Omar Khalid', content: 'The IT audit remediation items need status updates. Can you check with the teams?', createdAt: daysAgo(2), read: true },
  { id: 'msg-5', threadId: 'thread-2', senderId: 'admin', senderName: 'Test User', content: 'I will follow up with IT and Operations today.', createdAt: daysAgo(1), read: true },
  { id: 'msg-6', threadId: 'thread-2', senderId: 'user-omar', senderName: 'Omar Khalid', content: 'Thanks. The SAMA deadline is March 20th, so we need everything wrapped up by the 18th.', createdAt: hoursAgo(5), read: false },
  // Thread 3: Policy Review
  { id: 'msg-7', threadId: 'thread-3', senderId: 'user-fatima', senderName: 'Fatima Nasser', content: 'The Data Privacy Policy draft is ready for your review. I have attached the redline version.', createdAt: daysAgo(3), read: true },
  { id: 'msg-8', threadId: 'thread-3', senderId: 'admin', senderName: 'Test User', content: 'Reviewed — minor edits on section 4.2. Otherwise looks great.', createdAt: daysAgo(2), read: true },
]

const SEED_THREADS: MessageThread[] = [
  { id: 'thread-1', participants: ['Sarah Al-Rashid', 'Ahmed Hassan'], participantIds: ['user-sarah', 'user-ahmed'], subject: 'SAMA AML Circular Review', lastMessage: 'Can you share the draft by tomorrow morning?', lastMessageAt: hoursAgo(2), unreadCount: 1, isGroup: true, createdBy: 'admin', admins: ['admin'] },
  { id: 'thread-2', participants: ['Omar Khalid'], participantIds: ['user-omar'], subject: 'IT Audit Remediation Follow-up', lastMessage: 'Thanks. The SAMA deadline is March 20th...', lastMessageAt: hoursAgo(5), unreadCount: 1, isGroup: false, createdBy: 'admin', admins: ['admin'] },
  { id: 'thread-3', participants: ['Fatima Nasser'], participantIds: ['user-fatima'], subject: 'Data Privacy Policy Review', lastMessage: 'Reviewed — minor edits on section 4.2.', lastMessageAt: daysAgo(2), unreadCount: 0, isGroup: false, createdBy: 'admin', admins: ['admin'] },
]

interface MessageState {
  threads: MessageThread[]
  messages: Message[]
  fetchAll: () => void
  sendMessage: (threadId: string, content: string, senderId: string, senderName: string) => void
  createThread: (participantNames: string[], participantIds: string[], firstMessage: string, senderId: string, senderName: string, avatarUrl?: string) => string
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
}

export const useMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      threads: SEED_THREADS,
      messages: SEED_MESSAGES,

      fetchAll: () => {
        // TODO: Replace with actual API call
      },

      sendMessage: (threadId, content, senderId, senderName) => {
        // TODO: Replace with actual API call
        const newMsg: Message = {
          id: crypto.randomUUID(),
          threadId,
          senderId,
          senderName,
          content,
          createdAt: new Date().toISOString(),
          read: true,
        }
        set((state) => ({
          messages: [...state.messages, newMsg],
          threads: state.threads.map(t =>
            t.id === threadId
              ? { ...t, lastMessage: content, lastMessageAt: newMsg.createdAt }
              : t
          ),
        }))
      },

      createThread: (participantNames, participantIds, firstMessage, senderId, senderName, avatarUrl) => {
        // TODO: Replace with actual API call
        const threadId = crypto.randomUUID()
        const now = new Date().toISOString()
        const isGroup = participantNames.length > 1
        const newThread: MessageThread = {
          id: threadId,
          participants: participantNames,
          participantIds,
          isGroup,
          avatarUrl,
          createdBy: senderId,
          admins: [senderId],
          lastMessage: firstMessage,
          lastMessageAt: now,
          unreadCount: 0,
        }
        const newMsg: Message = {
          id: crypto.randomUUID(),
          threadId,
          senderId,
          senderName,
          content: firstMessage,
          createdAt: now,
          read: true,
        }
        set((state) => ({
          threads: [newThread, ...state.threads],
          messages: [...state.messages, newMsg],
        }))
        return threadId
      },

      markThreadAsRead: (threadId) => {
        // TODO: Replace with actual API call
        set((state) => ({
          messages: state.messages.map(m =>
            m.threadId === threadId ? { ...m, read: true } : m
          ),
          threads: state.threads.map(t =>
            t.id === threadId ? { ...t, unreadCount: 0 } : t
          ),
        }))
      },

      deleteThread: (threadId) => {
        // TODO: Replace with actual API call
        set((state) => ({
          threads: state.threads.filter(t => t.id !== threadId),
          messages: state.messages.filter(m => m.threadId !== threadId),
        }))
      },

      kickMember: (threadId, memberId) => {
        // TODO: Replace with actual API call
        set((state) => ({
          threads: state.threads.map(t => {
            if (t.id !== threadId) return t
            const idx = t.participantIds.indexOf(memberId)
            if (idx === -1) return t
            const newParticipants = [...t.participants]
            newParticipants.splice(idx, 1)
            const newParticipantIds = t.participantIds.filter(id => id !== memberId)
            const newAdmins = t.admins.filter(id => id !== memberId)
            return {
              ...t,
              participants: newParticipants,
              participantIds: newParticipantIds,
              admins: newAdmins,
              isGroup: newParticipantIds.length > 1,
            }
          }),
        }))
      },

      promoteAdmin: (threadId, memberId) => {
        set((state) => ({
          threads: state.threads.map(t =>
            t.id === threadId && !t.admins.includes(memberId)
              ? { ...t, admins: [...t.admins, memberId] }
              : t
          ),
        }))
      },

      demoteAdmin: (threadId, memberId) => {
        set((state) => ({
          threads: state.threads.map(t =>
            t.id === threadId && t.createdBy !== memberId
              ? { ...t, admins: t.admins.filter(id => id !== memberId) }
              : t
          ),
        }))
      },

      addMembersToThread: (threadId, newNames, newIds) => {
        // TODO: Replace with actual API call
        set((state) => ({
          threads: state.threads.map(t => {
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
        }))
      },

      updateThreadSubject: (threadId, subject) => {
        set((state) => ({
          threads: state.threads.map(t =>
            t.id === threadId ? { ...t, subject } : t
          ),
        }))
      },

      updateThreadAvatar: (threadId, avatarUrl) => {
        set((state) => ({
          threads: state.threads.map(t =>
            t.id === threadId ? { ...t, avatarUrl } : t
          ),
        }))
      },

      getThread: (threadId) => get().threads.find(t => t.id === threadId),
      getMessages: (threadId) => get().messages.filter(m => m.threadId === threadId),
    }),
    {
      name: 'message-storage',
      version: 3,
      migrate: (persistedState, fromVersion) => {
        // v2→v3 (RBAC-009): rewrite legacy `'current-user'` ids to `'admin'` so
        // thread ownership / message authorship lines up with the new auth-store
        // user id. Anything else in localStorage is preserved.
        const state = (persistedState ?? {}) as { threads?: MessageThread[]; messages?: Message[] }
        if (fromVersion < 2) {
          return { threads: SEED_THREADS, messages: SEED_MESSAGES }
        }
        if (fromVersion < 3) {
          const rewriteId = (id: string) => (id === 'current-user' ? 'admin' : id)
          return {
            threads: (state.threads ?? []).map((t) => ({
              ...t,
              createdBy: rewriteId(t.createdBy),
              admins: (t.admins ?? []).map(rewriteId),
            })),
            messages: (state.messages ?? []).map((m) => ({
              ...m,
              senderId: rewriteId(m.senderId),
            })),
          }
        }
        return state
      },
      partialize: (state) => ({
        threads: state.threads,
        messages: state.messages,
      }),
    }
  )
)
