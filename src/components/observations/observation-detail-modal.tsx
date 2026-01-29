'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Observation, severityConfig } from './observation-types'
import { useObservationStore } from '@/stores/observation-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTranslation } from '@/i18n'
import { formatRelativeTime, formatLocalizedDateShort } from '@/lib/time-utils'
import type { ObservationTimelineEntry } from '@/types'

interface ObservationDetailModalProps {
  observation: Observation | null
  isOpen: boolean
  onClose: () => void
  onChecklistToggle?: (observationId: string, checklistItemId: string, completed: boolean) => void
}

// Local checklist item type
interface LocalChecklistItem {
  id: string
  text: string
  completed: boolean
}

// Local comment type
interface LocalComment {
  id: string
  author: { name: string; avatar: string }
  text: string
  createdAt: string
}

export function ObservationDetailModal({
  observation,
  isOpen,
  onClose,
  onChecklistToggle,
}: ObservationDetailModalProps) {
  const { t, isRTL } = useTranslation()
  const [updateText, setUpdateText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newChecklistItem, setNewChecklistItem] = useState('')

  // Local state for checklist and comments - synced from prop, updated locally
  const [localChecklist, setLocalChecklist] = useState<LocalChecklistItem[]>([])
  const [localComments, setLocalComments] = useState<LocalComment[]>([])

  const { addComment, addChecklistItem, removeChecklistItem } = useObservationStore()
  const user = useAuthStore((state) => state.user)

  // Sync checklist and comments from observation prop when modal opens or observation changes
  useEffect(() => {
    if (observation && isOpen) {
      setLocalChecklist(observation.checklist || [])
      setLocalComments(
        observation.updates?.map((u) => ({
          id: u.id,
          author: u.author,
          text: u.text,
          createdAt: u.createdAt,
        })) || []
      )
    }
  }, [observation?.id, isOpen])

  const handleAddChecklistItem = async () => {
    if (!newChecklistItem.trim() || !observation) return
    const newItem: LocalChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistItem.trim(),
      completed: false,
    }
    // Update local state immediately for instant UI feedback
    setLocalChecklist((prev) => [...prev, newItem])
    // Also update store (for persistence when backend is connected) - pass user for timeline
    await addChecklistItem(observation.id, newChecklistItem.trim(), user || undefined)
    setNewChecklistItem('')
  }

  const handleRemoveChecklistItem = async (itemId: string) => {
    if (!observation) return
    // Find item text for timeline description
    const item = localChecklist.find(i => i.id === itemId)
    // Update local state immediately for instant UI feedback
    setLocalChecklist((prev) => prev.filter((item) => item.id !== itemId))
    // Also update store (for persistence when backend is connected) - pass user for timeline
    await removeChecklistItem(observation.id, itemId, item?.text, user || undefined)
  }

  const handleChecklistKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddChecklistItem()
    }
  }

  const handleSendComment = async () => {
    if (!updateText.trim() || !observation || !user) return

    setIsSubmitting(true)
    try {
      const newComment: LocalComment = {
        id: crypto.randomUUID(),
        author: { name: user.name, avatar: user.avatar || user.name },
        text: updateText.trim(),
        createdAt: t('observations.detail.justNow'),
      }
      // Update local state immediately for instant UI feedback
      setLocalComments((prev) => [...prev, newComment])
      // Also update store (for persistence when backend is connected)
      await addComment(observation.id, updateText.trim(), user)
      setUpdateText('')
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendComment()
    }
  }

  const handleChecklistItemToggle = (itemId: string, currentState: boolean) => {
    // Update local state immediately for instant UI feedback
    setLocalChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, completed: !currentState } : item
      )
    )
    // Also call the prop callback if provided
    if (observation && onChecklistToggle) {
      onChecklistToggle(observation.id, itemId, !currentState)
    }
  }

  if (!observation) return null

  const severity = severityConfig[observation.severity]
  const completedTasks = localChecklist.filter((item) => item.completed).length
  const totalTasks = localChecklist.length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className={`flex flex-col lg:flex-row h-[80vh] -m-6 ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
        {/* Main Section */}
        <div className="flex-1 p-8 overflow-y-auto hide-scrollbar bg-white">
          <div className={`flex items-center gap-3 mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400"
            >
              <Icon icon={'lucide:arrow-left'} className="text-xl" />
            </button>
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                {observation.title}
              </h2>
              {observation.subTitle && (
                <p className="text-sm text-slate-500 mt-1">{observation.subTitle}</p>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {/* Finding Overview */}
            <section>
              <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-3`}>
                {t('observations.detail.findingOverview')}
              </h3>
              <p className={`text-sm text-slate-600 leading-relaxed`}>
                {observation.description}
              </p>
            </section>

            {/* Remediation Checklist */}
            <section>
              <div className={`flex items-center justify-between mb-4`}>
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">
                  {t('observations.detail.remediationChecklist')}
                </h3>
                {localChecklist.length > 0 && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {t('observations.detail.complete', { percent: progressPercent })}
                  </span>
                )}
              </div>

              {/* Add new checklist item */}
              <div className={`flex items-center gap-2 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input
                  type="text"
                  placeholder={t('observations.detail.addChecklistItem')}
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={handleChecklistKeyDown}
                  className={`flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${isRTL ? 'text-right' : ''}`}
                />
                <button
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistItem.trim()}
                  className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Icon icon="lucide:plus" className="text-lg" />
                </button>
              </div>

              {/* Checklist items */}
              {localChecklist.length > 0 && (
                <div className="space-y-3">
                  {localChecklist.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded-xl transition-all group ${isRTL ? 'flex-row-reverse' : ''} ${
                        item.completed
                          ? 'border-emerald-100 bg-emerald-50/30'
                          : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleChecklistItemToggle(item.id, item.completed)}
                        className={`flex items-center gap-3 flex-1 cursor-pointer ${isRTL ? 'text-right' : 'text-left'}`}
                      >
                        {item.completed ? (
                          <Icon
                            icon="lucide:check-circle-2"
                            className="text-emerald-500 text-xl shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 border-2 border-slate-300 rounded-full shrink-0 hover:border-emerald-400 transition-colors" />
                        )}
                        <span className={`text-sm font-medium ${item.completed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                          {item.text}
                        </span>
                      </button>
                      <button
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title={t('observations.detail.removeItem')}
                      >
                        <Icon icon="lucide:x" className="text-lg" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Updates & Discussion */}
            <section>
              <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-4`}>
                {t('observations.detail.updatesDiscussion')}
              </h3>
              <div className="space-y-4">
                {localComments.map((comment) => {
                  // Format the comment time - use formatRelativeTime if it looks like an ISO date
                  const formattedTime = comment.createdAt.includes('T') || comment.createdAt.includes('-')
                    ? formatRelativeTime(comment.createdAt, t)
                    : comment.createdAt

                  return (
                    <div key={comment.id} className={`flex gap-3`}>
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author.avatar}`}
                        className="w-8 h-8 rounded-full shrink-0"
                        alt={comment.author.name}
                      />
                      <div className={`bg-slate-50 p-4 rounded-2xl flex-1 'rounded-tl-none`}>
                        <p className={`text-xs font-bold text-slate-900 ${isRTL ? 'flex items-center gap-2' : ''}`}>
                          {comment.author.name}{' '}
                          <span className={`font-normal text-slate-400 ml-2`}>
                            {formattedTime}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600 mt-1">{comment.text}</p>
                      </div>
                    </div>
                  )
                })}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder={t('observations.detail.writeUpdate')}
                    value={updateText}
                    onChange={(e) => setUpdateText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSubmitting}
                    className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 'pr-12`}
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={!updateText.trim() || isSubmitting}
                    className={`absolute right-3 text-emerald-600 hover:text-emerald-700 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer`}
                  >
                    {isSubmitting ? (
                      <Icon icon="lucide:loader-2" className="animate-spin" />
                    ) : (
                      <Icon icon={isRTL ? 'lucide:send-horizontal' : 'lucide:send-horizontal'} className={isRTL ? 'rotate-180' : ''} />
                    )}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className={`w-full lg:w-80 bg-slate-50 border-t lg:border-t-0 ${isRTL ? 'lg:border-r lg:border-l-0' : 'lg:border-l'} border-slate-200 p-8 space-y-8 shrink-0 overflow-y-auto hide-scrollbar`}>
          {/* Severity */}
          <div>
            <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4 ${isRTL ? 'text-center' : ''}`}>
              {t('observations.detail.severityLabel')}
            </h4>
            <span
              className={`px-4 py-2 ${
                observation.severity === 'critical'
                  ? 'bg-rose-500'
                  : observation.severity === 'high'
                  ? 'bg-orange-500'
                  : observation.severity === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-slate-500'
              } text-white text-xs font-black rounded-lg uppercase block text-center`}
            >
              {t(`observations.severityOptions.${observation.severity}`)}
            </span>
          </div>

          {/* Deadline Countdown */}
          <div>
            <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 ${isRTL ? 'text-center' : ''}`}>
              {t('observations.detail.deadlineCountdown')}
            </h4>
            <div className={`flex items-center gap-2 text-rose-600 font-bold mb-2 justify-center`}>
              <Icon icon="lucide:alarm-clock" />
              <span>{t('observations.detail.daysRemaining', { days: '04' })}</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full">
              <div className={`h-full bg-rose-500 rounded-full ${isRTL ? 'ml-auto' : ''}`} style={{ width: '85%' }} />
            </div>
          </div>

          {/* Assigned Team */}
          {(() => {
            // Get assignees from assignees array, team array, or single assignee
            const displayAssignees = observation.assignees && observation.assignees.length > 0
              ? observation.assignees
              : observation.team && observation.team.length > 0
                ? observation.team
                : observation.assignee
                  ? [observation.assignee]
                  : []

            return displayAssignees.length > 0 && (
              <div>
                <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
                  {t('observations.detail.assignedTeam')}
                </h4>
                <div className="space-y-3">
                  {displayAssignees.map((member, index) => (
                    <div key={`assignee-${index}-${member.name}`} className={`flex items-center gap-3`}>
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                        className="w-8 h-8 rounded-full"
                        alt={member.name}
                      />
                      <div className={`text-[10px] ${isRTL ? 'text-right' : ''}`}>
                        <p className="font-bold text-slate-900">{member.name}</p>
                        <p className="text-slate-500 uppercase font-black">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Related Documents */}
          {observation.documents && observation.documents.length > 0 && (
            <div>
              <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
                {t('observations.detail.relatedDocuments')}
              </h4>
              <div className="space-y-2">
                {observation.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href="#"
                    className={`flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 transition-all`}
                  >
                    <Icon
                      icon={doc.type === 'pdf' ? 'lucide:file-text' : 'lucide:image'}
                      className={doc.type === 'pdf' ? 'text-emerald-500' : 'text-blue-500'}
                    />
                    <span className={`text-[10px] font-bold text-slate-700 truncate`}>
                      {doc.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          {observation.timeline && observation.timeline.length > 0 && (
            <div>
              <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
                {t('observations.detail.activityTimeline')}
              </h4>
              <div className={`space-y-3 ${isRTL ? 'border-r-2 mr-1 pr-4' : 'border-l-2 ml-1 pl-4'} border-slate-200`}>
                {observation.timeline.map((event, index) => {
                  // Format the timeline date - use dateKey translation or format the date
                  const formattedDate = event.dateKey
                    ? t(`observations.detail.${event.dateKey}` as 'observations.detail.today')
                    : formatLocalizedDateShort(event.date, isRTL)

                  // Format the timeline description - prefer translation key, then Arabic, then English
                  const formattedDescription = event.descriptionKey
                    ? t(event.descriptionKey as 'observations.detail.timeline.checklistAdded', event.descriptionParams as Record<string, string>)
                    : (isRTL && event.descriptionAr) ? event.descriptionAr : event.description

                  return (
                    <div
                      key={event.id}
                      className={`relative hover:bg-slate-50 rounded-lg p-2 transition-colors ${isRTL ? '-mr-2' : '-ml-2'}`}
                    >
                      {/* Timeline dot - centered ON the border line */}
                      <div
                        className={`absolute ${isRTL ? '-right-[14px]' : '-left-[14px]'} top-3 w-2.5 h-2.5 rounded-full border-2 border-slate-50 ${
                          index === 0 ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                        {event.userAvatar && (
                          <div className="relative group">
                            <img
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${event.userAvatar}`}
                              className="w-4 h-4 rounded-full cursor-pointer hover:ring-2 hover:ring-emerald-300 transition-all"
                              alt={event.userName || 'User'}
                            />
                            {/* User Tooltip */}
                            <div className={`absolute left-0 bottom-full mb-2 hidden group-hover:block z-10`}>
                              <div className={`bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg `}>
                                <p className="font-bold">{event.userName}</p>
                                {event.userRole && <p className="text-slate-300">{event.userRole}</p>}
                                {event.userDepartment && <p className="text-slate-400 text-[10px]">{event.userDepartment}</p>}
                              </div>
                              {/* Tooltip arrow */}
                              <div className={`absolute left-1 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900`} />
                            </div>
                          </div>
                        )}
                        <p className={`text-[10px] font-black text-slate-400`}>
                          {formattedDate}
                          {event.userName && (
                            <span className={`text-emerald-600 normal-case 'ml-1'}`}> {t('observations.detail.by')} {event.userName}</span>
                          )}
                        </p>
                      </div>
                      <p className={`text-xs font-medium text-slate-700 mt-1`}>
                        {formattedDescription}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
