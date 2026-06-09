'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { InlineDeadlinePicker } from '@/components/ui/inline-deadline-picker'

interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  deadline?: string
}

export interface ChecklistSectionProps {
  items: ChecklistItem[]
  onAdd: (text: string) => void
  onEdit?: (itemId: string, newText: string) => void
  onRemove: (itemId: string) => void
  onToggle: (itemId: string, currentState: boolean) => void
  // Optional — when provided, items show an inline deadline picker.
  onSetDeadline?: (itemId: string, deadline: string | undefined) => void
  parentDeadline?: string
  isRTL: boolean
  titleKey?: string
  completionKey?: string
  addPlaceholderKey?: string
  removeTooltipKey?: string
  /** O4: when true the add-input, edit, and remove controls are hidden. */
  readOnly?: boolean
}

export const ChecklistSection = memo(function ChecklistSection({
  items,
  onAdd,
  onEdit,
  onRemove,
  onToggle,
  onSetDeadline,
  parentDeadline,
  isRTL,
  titleKey,
  completionKey,
  addPlaceholderKey,
  removeTooltipKey,
  readOnly = false,
}: ChecklistSectionProps) {
  const { t } = useTranslation()
  const [newItemText, setNewItemText] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  // W27.3-β: spinner while async onAdd completes
  const [isAdding, setIsAdding] = useState(false)
  // O4: per-item in-flight state so the spinner shows on the specific item
  // being toggled / removed, not globally.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const handleToggle = async (itemId: string, currentState: boolean) => {
    if (togglingIds.has(itemId)) return
    setTogglingIds((s) => new Set(s).add(itemId))
    try {
      await (onToggle as (id: string, s: boolean) => Promise<void> | void)(itemId, currentState)
    } finally {
      setTogglingIds((s) => {
        const n = new Set(s)
        n.delete(itemId)
        return n
      })
    }
  }

  const handleRemove = async (itemId: string) => {
    if (removingIds.has(itemId)) return
    setRemovingIds((s) => new Set(s).add(itemId))
    try {
      await (onRemove as (id: string) => Promise<void> | void)(itemId)
    } finally {
      setRemovingIds((s) => {
        const n = new Set(s)
        n.delete(itemId)
        return n
      })
    }
  }

  const completedTasks = items.filter((item) => item.completed).length
  const totalTasks = items.length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const handleAdd = async () => {
    if (!newItemText.trim() || isAdding) return
    const text = newItemText.trim()
    setNewItemText('')
    setIsAdding(true)
    try {
      await (onAdd as (text: string) => Promise<void> | void)(text)
    } finally {
      setIsAdding(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleAdd()
    }
  }

  const handleStartEdit = (item: ChecklistItem) => {
    setEditingItemId(item.id)
    setEditingText(item.text)
  }

  const handleSaveEdit = () => {
    if (!editingItemId || !editingText.trim()) return
    onEdit?.(editingItemId, editingText.trim())
    setEditingItemId(null)
    setEditingText('')
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
    setEditingText('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <section>
      <div className={`flex items-center justify-between mb-4`}>
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">
          {t((titleKey || 'observations.detail.remediationChecklist') as Parameters<typeof t>[0])}
        </h3>
        {/* Progress % is hidden once the observation is closed (read-only). */}
        {!readOnly && items.length > 0 ? (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            {t((completionKey || 'observations.detail.complete') as Parameters<typeof t>[0], { percent: progressPercent })}
          </span>
        ) : null}
      </div>

      {/* Add new checklist item — hidden in read-only (closed) mode (O4) */}
      {!readOnly && (
        <div className={`flex items-center gap-2 mb-4`}>
          <input
            type="text"
            placeholder={t((addPlaceholderKey || 'observations.detail.addChecklistItem') as Parameters<typeof t>[0])}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAdding}
            className={`flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${isRTL ? 'text-right' : ''}`}
          />
          <button
            onClick={() => void handleAdd()}
            disabled={!newItemText.trim() || isAdding}
            aria-busy={isAdding || undefined}
            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Icon icon={isAdding ? 'lucide:loader-2' : 'lucide:plus'} className={`text-lg${isAdding ? ' animate-spin' : ''}`} />
          </button>
        </div>
      )}

      {/* Checklist items */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 border rounded-xl transition-all group ${
                item.completed
                  ? 'border-emerald-100 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
              }`}
            >
              {!readOnly && editingItemId === item.id ? (
                /* Editing mode */
                <div className={`flex items-center gap-2 flex-1`}>
                  <input
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    autoFocus
                    className={`flex-1 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                    title={t('common.save')}
                  >
                    <Icon icon="lucide:check" className="text-lg" />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title={t('common.cancel')}
                  >
                    <Icon icon="lucide:x" className="text-lg" />
                  </button>
                </div>
              ) : (
                /* Display mode */
                <>
                  {readOnly ? (
                    /* Closed: static, non-interactive indicator — no checkable circle. */
                    <div className={`flex items-center gap-3 flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                      <Icon
                        icon={item.completed ? 'lucide:check-circle-2' : 'lucide:circle'}
                        className={`text-xl shrink-0 ${item.completed ? 'text-emerald-500' : 'text-slate-300'}`}
                      />
                      <span className={`text-sm font-medium ${item.completed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                        {item.text}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleToggle(item.id, item.completed)}
                      disabled={togglingIds.has(item.id)}
                      aria-busy={togglingIds.has(item.id) || undefined}
                      className={`flex items-center gap-3 flex-1 cursor-pointer disabled:cursor-not-allowed ${isRTL ? 'text-right' : 'text-left'}`}
                    >
                      {togglingIds.has(item.id) ? (
                        <Icon
                          icon="lucide:loader-2"
                          className="text-emerald-500 text-xl shrink-0 animate-spin"
                        />
                      ) : item.completed ? (
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
                  )}
                  {onSetDeadline ? (
                    <InlineDeadlinePicker
                      value={item.deadline}
                      parentDeadline={parentDeadline}
                      onChange={(next) => {
                        onSetDeadline(item.id, next)
                      }}
                    />
                  ) : null}
                  {/* Edit/remove hidden in read-only (closed) mode (O4) */}
                  {!readOnly && onEdit ? (
                    <button
                      onClick={() => handleStartEdit(item)}
                      className="p-1 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title={t('common.edit')}
                    >
                      <Icon icon="lucide:pencil" className="text-lg" />
                    </button>
                  ) : null}
                  {!readOnly && (
                    <button
                      onClick={() => void handleRemove(item.id)}
                      disabled={removingIds.has(item.id)}
                      aria-busy={removingIds.has(item.id) || undefined}
                      className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-100"
                      title={t((removeTooltipKey || 'observations.detail.removeItem') as Parameters<typeof t>[0])}
                    >
                      <Icon
                        icon={removingIds.has(item.id) ? 'lucide:loader-2' : 'lucide:x'}
                        className={`text-lg${removingIds.has(item.id) ? ' animate-spin' : ''}`}
                      />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
})
