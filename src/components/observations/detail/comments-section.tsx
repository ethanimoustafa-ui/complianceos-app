'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { formatRelativeTime } from '@/lib/time-utils'
import { canEditComment, canDeleteComment } from '@/lib/permissions'
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
}

export const CommentsSection = memo(function CommentsSection({
  comments,
  user,
  onAdd,
  onEdit,
  onDelete,
  isRTL,
}: CommentsSectionProps) {
  const { t } = useTranslation()
  const [updateText, setUpdateText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')

  const handleSendComment = async () => {
    if (!updateText.trim() || !user) return

    setIsSubmitting(true)
    try {
      await onAdd(updateText.trim())
      setUpdateText('')
    } catch (error) {
      console.error('Failed to add comment:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return

    try {
      await onEdit(commentId, editingCommentText.trim())
      setEditingCommentId(null)
      setEditingCommentText('')
    } catch (error) {
      console.error('Failed to edit comment:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendComment()
    }
  }

  return (
    <section>
      <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-4`}>
        {t('observations.detail.updatesDiscussion')}
      </h3>
      <div className="space-y-4">
        {comments.map((comment) => {
          const formattedTime = comment.createdAt.includes('T') || comment.createdAt.includes('-')
            ? formatRelativeTime(comment.createdAt, t)
            : comment.createdAt

          const canEdit = canEditComment(user, comment.authorId)
          const canDelete = canDeleteComment(user, comment.authorId)
          const isEditing = editingCommentId === comment.id

          return (
            <div key={comment.id} className={`flex gap-3 group`}>
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author.avatar}`}
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
                  {(canEdit || canDelete) && !isEditing ? (
                    <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                      {canEdit ? (
                        <button
                          onClick={() => {
                            setEditingCommentId(comment.id)
                            setEditingCommentText(comment.text)
                          }}
                          className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                          title={t('common.edit')}
                        >
                          <Icon icon="lucide:pencil" className="text-sm" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          onClick={() => onDelete(comment.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          title={t('common.delete')}
                        >
                          <Icon icon="lucide:trash-2" className="text-sm" />
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
                    />
                    <div className={`flex gap-2 mt-2`}>
                      <button
                        onClick={() => handleEditComment(comment.id)}
                        disabled={!editingCommentText.trim()}
                        className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => {
                          setEditingCommentId(null)
                          setEditingCommentText('')
                        }}
                        className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-800"
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
        })}
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
            className={`absolute right-3 bottom-10 text-emerald-600 hover:text-emerald-700 transition-colors disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer`}
          >
            {isSubmitting ? (
              <Icon icon="lucide:loader-2" className="animate-spin" />
            ) : (
              <Icon icon="lucide:send-horizontal" className={isRTL ? 'rotate-180' : ''} />
            )}
          </button>
        </div>
      </div>
    </section>
  )
})
