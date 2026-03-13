'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time-utils'
import { useMessageStore } from '@/stores/message-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'

type View = 'threads' | 'detail' | 'compose' | 'members'

interface MessagePanelProps {
  isOpen: boolean
  onClose: () => void
}

interface SelectedRecipient {
  id: string
  name: string
}

export function MessagePanel({ isOpen, onClose }: MessagePanelProps) {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const { threads, messages, sendMessage, createThread, markThreadAsRead, deleteThread, kickMember, promoteAdmin, demoteAdmin, updateThreadAvatar } = useMessageStore()
  const teamMembers = useTeamStore(s => s.members)

  const [view, setView] = useState<View>('threads')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
  const [memberToKick, setMemberToKick] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Compose state — multi-recipient
  const [composeRecipients, setComposeRecipients] = useState<SelectedRecipient[]>([])
  const [composeGroupName, setComposeGroupName] = useState('')
  const [composeMessage, setComposeMessage] = useState('')
  const [recipientSearch, setRecipientSearch] = useState('')
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false)

  const activeThread = activeThreadId ? threads.find(th => th.id === activeThreadId) : null
  const threadMessages = activeThreadId ? messages.filter(m => m.threadId === activeThreadId) : []

  const isCurrentUserAdmin = activeThread
    ? activeThread.admins.includes(user?.id ?? '')
    : false

  const filteredMembers = useMemo(() => {
    const selectedIds = new Set(composeRecipients.map(r => r.id))
    const base = teamMembers.filter(m => m.id !== user?.id && m.status === 'active' && !selectedIds.has(m.id))
    if (!recipientSearch) return base
    const q = recipientSearch.toLowerCase()
    return base.filter(m =>
      m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q)
    )
  }, [teamMembers, recipientSearch, user?.id, composeRecipients])

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (view === 'members') { setView('detail'); setMemberToKick(null) }
      else if (view === 'detail') { setView('threads'); setActiveThreadId(null) }
      else if (view === 'compose') { resetCompose() }
      else { onClose() }
    }
  }, [onClose, view])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages.length])

  useEffect(() => {
    if (!isOpen) { resetCompose(); setView('threads'); setActiveThreadId(null) }
  }, [isOpen])

  const resetCompose = () => {
    setView('threads')
    setComposeRecipients([])
    setComposeGroupName('')
    setComposeMessage('')
    setRecipientSearch('')
    setShowRecipientDropdown(false)
  }

  const openThread = (threadId: string) => {
    setActiveThreadId(threadId)
    setView('detail')
    markThreadAsRead(threadId)
  }

  const handleSend = () => {
    if (!draft.trim() || !activeThreadId || !user) return
    sendMessage(activeThreadId, draft.trim(), user.id, user.name)
    setDraft('')
  }

  const handleComposeSend = () => {
    if (composeRecipients.length === 0 || !composeMessage.trim() || !user) return
    const names = composeRecipients.map(r => r.name)
    const ids = composeRecipients.map(r => r.id)
    const threadId = createThread(names, ids, composeMessage.trim(), user.id, user.name)
    // If group name was provided, update the thread subject
    if (composeGroupName.trim() && composeRecipients.length > 1) {
      const store = useMessageStore.getState()
      const thread = store.threads.find(t => t.id === threadId)
      if (thread) {
        useMessageStore.setState(state => ({
          threads: state.threads.map(t => t.id === threadId ? { ...t, subject: composeGroupName.trim() } : t)
        }))
      }
    }
    resetCompose()
    setActiveThreadId(threadId)
    setView('detail')
  }

  const addRecipient = (member: { id: string; name: string }) => {
    setComposeRecipients(prev => [...prev, { id: member.id, name: member.name }])
    setRecipientSearch('')
    setShowRecipientDropdown(false)
  }

  const removeRecipient = (id: string) => {
    setComposeRecipients(prev => prev.filter(r => r.id !== id))
  }

  const handleAvatarUpload = () => {
    if (!activeThread || !isCurrentUserAdmin) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateThreadAvatar(activeThread.id, reader.result)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0)

  // Thread avatar helper
  const ThreadAvatar = ({ thread, size = 'md' }: { thread: typeof threads[0]; size?: 'sm' | 'md' }) => {
    const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
    if (thread.avatarUrl) {
      return <img src={thread.avatarUrl} alt="" className={cn(dim, 'rounded-full object-cover shrink-0')} />
    }
    if (thread.isGroup) {
      return (
        <div className={cn(dim, 'rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold shrink-0')}>
          <Icon icon="lucide:users" className={size === 'sm' ? 'text-xs' : 'text-sm'} />
        </div>
      )
    }
    return (
      <div className={cn(dim, 'rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold shrink-0')}>
        {thread.participants[0]?.charAt(0) || '?'}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="ms-auto relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            {(view === 'detail' || view === 'compose' || view === 'members') && (
              <button
                onClick={() => {
                  if (view === 'compose') resetCompose()
                  else if (view === 'members') { setView('detail'); setMemberToKick(null) }
                  else { setView('threads'); setActiveThreadId(null) }
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon icon="lucide:arrow-left" className="text-xl" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {view === 'compose'
                  ? t('sidebar.newMessage')
                  : view === 'members'
                    ? t('sidebar.members')
                    : activeThread
                      ? (activeThread.subject || activeThread.participants.join(', '))
                      : t('sidebar.messages')}
              </h2>
              {view === 'threads' && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {totalUnread > 0 ? `${totalUnread} ${t('sidebar.unread')}` : t('sidebar.noMessages')}
                </p>
              )}
              {activeThread && view === 'detail' && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {activeThread.isGroup ? t('sidebar.groupChat') : t('sidebar.directMessage')} &middot; {activeThread.participants.length} {t('sidebar.members').toLowerCase()}
                </p>
              )}
              {activeThread && view === 'members' && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {activeThread.participants.length} {t('sidebar.members').toLowerCase()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'detail' && activeThread?.isGroup && (
              <button
                onClick={() => setView('members')}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                title={t('sidebar.members')}
              >
                <Icon icon="lucide:users" className="text-lg" />
              </button>
            )}
            {view === 'threads' && (
              <button
                onClick={() => setView('compose')}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                title={t('sidebar.newMessage')}
              >
                <Icon icon="lucide:square-pen" className="text-xl" />
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>
        </div>

        {/* ── COMPOSE VIEW ── */}
        {view === 'compose' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Recipients (multi-select) */}
            <div className="px-6 py-4 border-b border-slate-100 relative">
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">{t('sidebar.addRecipients')}</label>
              {/* Selected chips */}
              {composeRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {composeRecipients.map(r => (
                    <span key={r.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                      {r.name}
                      <button onClick={() => removeRecipient(r.id)} className="hover:text-emerald-900 cursor-pointer">
                        <Icon icon="lucide:x" className="text-[10px]" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Search input */}
              <input
                type="text"
                value={recipientSearch}
                onChange={(e) => { setRecipientSearch(e.target.value); setShowRecipientDropdown(true) }}
                onFocus={() => setShowRecipientDropdown(true)}
                placeholder={composeRecipients.length > 0 ? t('sidebar.addRecipients') : t('sidebar.selectRecipient')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {showRecipientDropdown && (
                <div className="absolute start-6 end-6 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                  {filteredMembers.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">{t('common.noResults')}</p>
                  ) : (
                    filteredMembers.map(member => (
                      <button
                        key={member.id}
                        onClick={() => addRecipient(member)}
                        className="w-full text-start px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3 cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{member.name}</p>
                          <p className="text-[10px] text-slate-400">{member.department} &middot; {member.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Group name (optional, shown when 2+ recipients) */}
            {composeRecipients.length > 1 && (
              <div className="px-6 py-3 border-b border-slate-100">
                <input
                  type="text"
                  value={composeGroupName}
                  onChange={(e) => setComposeGroupName(e.target.value)}
                  placeholder={t('sidebar.groupName')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Message body */}
            <div className="flex-1 px-6 py-4">
              <textarea
                value={composeMessage}
                onChange={(e) => setComposeMessage(e.target.value)}
                placeholder={t('sidebar.writeMessage')}
                className="w-full h-full min-h-[120px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Send */}
            <div className="px-6 py-4 border-t border-slate-200">
              <button
                onClick={handleComposeSend}
                disabled={composeRecipients.length === 0 || !composeMessage.trim()}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Icon icon="lucide:send" className="text-lg" />
                {t('sidebar.startConversation')}
              </button>
            </div>
          </div>
        )}

        {/* ── THREAD LIST VIEW ── */}
        {view === 'threads' && (
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Icon icon="lucide:message-square" className="text-4xl mb-3" />
                <p className="text-sm font-medium">{t('sidebar.noMessages')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {threads.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      'group relative w-full text-start p-4 hover:bg-slate-50 transition-colors',
                      thread.unreadCount > 0 && 'bg-emerald-50/40'
                    )}
                  >
                    {threadToDelete === thread.id ? (
                      <div className="flex items-center justify-between gap-3 py-2">
                        <p className="text-sm text-slate-600">{t('sidebar.deleteThreadConfirm')}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => { deleteThread(thread.id); setThreadToDelete(null) }}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                          >
                            {t('sidebar.deleteThread')}
                          </button>
                          <button
                            onClick={() => setThreadToDelete(null)}
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => openThread(thread.id)}
                          className="w-full text-start cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <ThreadAvatar thread={thread} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className={cn('text-sm truncate', thread.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
                                    {thread.subject || thread.participants.join(', ')}
                                  </p>
                                  {thread.isGroup && (
                                    <Icon icon="lucide:users" className="text-[10px] text-slate-400 shrink-0" />
                                  )}
                                </div>
                                {thread.unreadCount > 0 && (
                                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                    {thread.unreadCount}
                                  </span>
                                )}
                              </div>
                              {thread.isGroup && (
                                <p className="text-xs text-slate-500 mt-0.5">{thread.participants.join(', ')}</p>
                              )}
                              {!thread.isGroup && (
                                <p className="text-xs text-slate-500 mt-0.5">{thread.participants[0]}</p>
                              )}
                              <p className="text-xs text-slate-400 mt-1 truncate">{thread.lastMessage}</p>
                              <p className="text-[10px] text-slate-400 mt-1">{formatRelativeTime(thread.lastMessageAt, t)}</p>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setThreadToDelete(thread.id) }}
                          className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title={t('sidebar.deleteThread')}
                        >
                          <Icon icon="lucide:trash-2" className="text-base" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MEMBERS VIEW (Group admin panel) ── */}
        {view === 'members' && activeThread && (
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {/* Group avatar section */}
            {activeThread.isGroup && isCurrentUserAdmin && (
              <div className="px-6 py-5 border-b border-slate-100 flex flex-col items-center gap-3">
                <button onClick={handleAvatarUpload} className="relative group cursor-pointer">
                  {activeThread.avatarUrl ? (
                    <img src={activeThread.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                      <Icon icon="lucide:users" className="text-2xl text-violet-500" />
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon icon="lucide:camera" className="text-white text-lg" />
                  </div>
                </button>
                <p className="text-xs text-slate-500">{t('sidebar.changeGroupAvatar')}</p>
              </div>
            )}

            {/* Member list */}
            <div className="divide-y divide-slate-100">
              {/* Show current user first */}
              <div className="px-6 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold shrink-0">
                  {user?.name.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{user?.name} <span className="text-slate-400 font-normal">(you)</span></p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {activeThread.createdBy === user?.id && (
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{t('sidebar.creator')}</span>
                    )}
                    {activeThread.admins.includes(user?.id ?? '') && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{t('sidebar.admin')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Other participants */}
              {activeThread.participantIds.map((memberId, idx) => {
                const memberName = activeThread.participants[idx]
                const isMemberAdmin = activeThread.admins.includes(memberId)
                const isCreator = activeThread.createdBy === memberId
                return (
                  <div key={memberId} className="px-6 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                      {memberName?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{memberName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isCreator && (
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{t('sidebar.creator')}</span>
                        )}
                        {isMemberAdmin && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{t('sidebar.admin')}</span>
                        )}
                      </div>
                    </div>

                    {/* Admin actions */}
                    {isCurrentUserAdmin && activeThread.isGroup && (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Promote / Demote admin */}
                        {!isCreator && (
                          <button
                            onClick={() => isMemberAdmin ? demoteAdmin(activeThread.id, memberId) : promoteAdmin(activeThread.id, memberId)}
                            className={cn(
                              'p-1.5 rounded-lg text-xs transition-colors cursor-pointer',
                              isMemberAdmin
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-slate-400 hover:bg-slate-100 hover:text-amber-600'
                            )}
                            title={isMemberAdmin ? t('sidebar.demoteAdmin') : t('sidebar.promoteAdmin')}
                          >
                            <Icon icon={isMemberAdmin ? 'lucide:shield-off' : 'lucide:shield'} className="text-base" />
                          </button>
                        )}
                        {/* Kick */}
                        {!isCreator && (
                          <>
                            {memberToKick === memberId ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { kickMember(activeThread.id, memberId); setMemberToKick(null) }}
                                  className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded cursor-pointer hover:bg-red-700"
                                >
                                  {t('sidebar.kickMember')}
                                </button>
                                <button
                                  onClick={() => setMemberToKick(null)}
                                  className="px-2 py-1 bg-slate-200 text-slate-600 text-[10px] font-bold rounded cursor-pointer hover:bg-slate-300"
                                >
                                  {t('common.cancel')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setMemberToKick(memberId)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title={t('sidebar.kickMember')}
                              >
                                <Icon icon="lucide:user-minus" className="text-base" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── THREAD DETAIL VIEW ── */}
        {view === 'detail' && (
          <>
            <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
              {threadMessages.map((msg) => {
                const isMe = msg.senderId === user?.id
                return (
                  <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      isMe
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-slate-100 text-slate-900 rounded-bl-md'
                    )}>
                      {!isMe && (
                        <p className="text-xs font-bold text-emerald-600 mb-1">{msg.senderName}</p>
                      )}
                      <p className="text-sm">{msg.content}</p>
                      <p className={cn('text-[10px] mt-1', isMe ? 'text-emerald-200' : 'text-slate-400')}>
                        {formatRelativeTime(msg.createdAt, t)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-slate-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('sidebar.typeMessage')}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim()}
                  className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:send" className="text-lg" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
