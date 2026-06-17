'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { pushToast } from '@/stores/toast-store'
import { formatTimelineDate } from '@/lib/format-date'
import { canEditComment, canDeleteComment } from '@/lib/permissions'
import { dicebearAvatar } from '@/lib/avatar'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import type { User } from '@/types'

interface Comment {
  id: string
  authorId: string
  author: { name: string; avatar: string }
  text: string
  createdAt: string
  isEdited?: boolean
  editedAt?: string
}

export interface CommentsSectionProps {
  comments: Comment[]
  user: User | null
  onAdd: (content: string) => Promise<void>
  onEdit: (commentId: string, newText: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
  isRTL: boolean
  /** Render skeleton rows when the detail GET hasn't resolved yet. */
  isLoaded?: boolean
  /** O4: when true the add-textarea and edit/delete controls are hidden. */
  readOnly?: boolean
}

export const CommentsSection = memo(function CommentsSection({
  comments,
  user,
  onAdd,
  onEdit,
  onDelete,
  isRTL,
  isLoaded = true,
  readOnly = false,
}: CommentsSectionProps) {
  const { t } = useTranslation()
  const [updateText, setUpdateText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  const handleSendComment = async () => {
    if (!updateText.trim() || !user) return

    setIsSubmitting(true)
    try {
      await onAdd(updateText.trim())
      setUpdateText('')
    } catch (error) {
      console.error('Failed to add comment:', error)
      pushToast({ key: 'errors.obsModals.addComment' }, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return
    setSavingEditId(commentId)
    try {
      await onEdit(commentId, editingCommentText.trim())
      setEditingCommentId(null)
      setEditingCommentText('')
    } catch (error) {
      console.error('Failed to edit comment:', error)
      pushToast({ key: 'errors.obsModals.editComment' }, 'error')
    } finally {
      setSavingEditId(null)
    }
  }

  const handleDelete = async (commentId: string) => {
    setDeletingCommentId(commentId)
    try {
      await onDelete(commentId)
    } catch (error) {
      console.error('Failed to delete comment:', error)
      pushToast({ key: 'errors.obsModals.deleteComment' }, 'error')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendComment()
    }
  }

  const sortedComments = [...comments].sort((a, b) => {
    const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bd - ad
  })

  return (
    <section>
      <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-4`}>
        {t('observations.detail.updatesDiscussion')}
      </h3>
      <div className="space-y-4">
        {!isLoaded ? (
          <div className="space-y-3" data-testid="observation-comments-skeleton" aria-busy="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="w-8 h-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2 bg-slate-50 p-4 rounded-2xl">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedComments.length === 0 ? (
          <p className="text-xs text-slate-400 italic">{t('auditDetail.noComments')}</p>
        ) : (
          sortedComments.map((comment) => {
            const formattedTime = formatTimelineDate(comment.createdAt, isRTL) || comment.createdAt

            const canEdit = canEditComment(user, comment.authorId)
            const canDelete = canDeleteComment(user, comment.authorId)
            const isEditing = editingCommentId === comment.id
            const isSavingEdit = savingEditId === comment.id
            const isDeleting = deletingCommentId === comment.id

            return (
              <div key={comment.id} className={`flex gap-3 group`}>
                <img
                  src={dicebearAvatar(comment.author.avatar)}
                  className="w-8 h-8 rounded-full shrink-0"
                  alt={comment.author.name}
                />
                <div className={`bg-slate-50 p-4 rounded-2xl flex-1 relative`}>
                  <div className={`flex items-center justify-between`}>
                    <p className={`text-xs font-bold text-slate-900 gap-1`}>
                      {comment.author.name}{' '}
                      <span className={`font-normal text-slate-400 ml-2`}>
                        {formattedTime}
                      </span>
                      {comment.isEdited ? (
                        <span className={`font-normal text-slate-400 ml-2 italic`}>
                          ({t('observations.detail.edited')})
                        </span>
                      ) : null}
                    </p>
                    {/* Edit/delete hidden in read-only (closed) mode (O4) */}
                    {!readOnly && (canEdit || canDelete) && !isEditing ? (
                      <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                        {canEdit ? (
                          <button
                            onClick={() => {
                              setEditingCommentId(comment.id)
                              setEditingCommentText(comment.text)
                            }}
                            className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                            title={t('common.edit')}
                            disabled={isDeleting}
                          >
                            <Icon icon="lucide:pencil" className="text-sm" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                            title={t('common.delete')}
                            disabled={isDeleting}
                            aria-busy={isDeleting || undefined}
                          >
                            <Icon
                              icon={isDeleting ? 'lucide:loader-2' : 'lucide:trash-2'}
                              className={`text-sm ${isDeleting ? 'animate-spin' : ''}`}
                            />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="mt-2">
                      <textarea
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        rows={2}
                        disabled={isSavingEdit}
                      />
                      <div className={`flex gap-2 mt-2`}>
                        <LoadingButton
                          variant="primary"
                          loading={isSavingEdit}
                          onClick={() => handleEditComment(comment.id)}
                          disabled={!editingCommentText.trim()}
                          className="h-7 px-3 text-xs"
                        >
                          {t('common.save')}
                        </LoadingButton>
                        <button
                          onClick={() => {
                            setEditingCommentId(null)
                            setEditingCommentText('')
                          }}
                          disabled={isSavingEdit}
                          className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 mt-1 break-words [overflow-wrap:anywhere]">{comment.text}</p>
                  )}
                </div>
              </div>
            )
          })
        )}
        {/* Add-comment textarea hidden in read-only (closed) mode (O4) */}
        {!readOnly && (
          <div className="relative">
            <textarea
              placeholder={t('observations.detail.writeUpdate')}
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              rows={2}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 resize-none ${isRTL ? 'pr-4' : 'pr-12'}`}
            />
            <button
              onClick={handleSendComment}
              disabled={!updateText.trim() || isSubmitting}
              aria-busy={isSubmitting || undefined}
              className={`absolute right-3 bottom-10 text-emerald-600 hover:text-emerald-700 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer`}
            >
              {isSubmitting ? (
                <Icon icon="lucide:loader-2" className="animate-spin" />
              ) : (
                <Icon icon="lucide:send-horizontal" className={isRTL ? 'rotate-180' : ''} />
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  )
})
