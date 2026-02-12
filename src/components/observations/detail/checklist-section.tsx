'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

export interface ChecklistSectionProps {
  items: ChecklistItem[]
  onAdd: (text: string) => void
  onEdit?: (itemId: string, newText: string) => void
  onRemove: (itemId: string) => void
  onToggle: (itemId: string, currentState: boolean) => void
  isRTL: boolean
  titleKey?: string
  completionKey?: string
  addPlaceholderKey?: string
  removeTooltipKey?: string
}

export const ChecklistSection = memo(function ChecklistSection({
  items,
  onAdd,
  onEdit,
  onRemove,
  onToggle,
  isRTL,
  titleKey,
  completionKey,
  addPlaceholderKey,
  removeTooltipKey,
}: ChecklistSectionProps) {
  const { t } = useTranslation()
  const [newItemText, setNewItemText] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  const completedTasks = items.filter((item) => item.completed).length
  const totalTasks = items.length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const handleAdd = () => {
    if (!newItemText.trim()) return
    onAdd(newItemText.trim())
    setNewItemText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
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
        {items.length > 0 ? (
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            {t((completionKey || 'observations.detail.complete') as Parameters<typeof t>[0], { percent: progressPercent })}
          </span>
        ) : null}
      </div>

      {/* Add new checklist item */}
      <div className={`flex items-center gap-2 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <input
          type="text"
          placeholder={t((addPlaceholderKey || 'observations.detail.addChecklistItem') as Parameters<typeof t>[0])}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${isRTL ? 'text-right' : ''}`}
        />
        <button
          onClick={handleAdd}
          disabled={!newItemText.trim()}
          className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Icon icon="lucide:plus" className="text-lg" />
        </button>
      </div>

      {/* Checklist items */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 border rounded-xl transition-all group ${isRTL ? 'flex-row-reverse' : ''} ${
                item.completed
                  ? 'border-emerald-100 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
              }`}
            >
              {editingItemId === item.id ? (
                /* Editing mode */
                <div className={`flex items-center gap-2 flex-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
                  <button
                    type="button"
                    onClick={() => onToggle(item.id, item.completed)}
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
                  {onEdit ? (
                    <button
                      onClick={() => handleStartEdit(item)}
                      className="p-1 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title={t('common.edit')}
                    >
                      <Icon icon="lucide:pencil" className="text-lg" />
                    </button>
                  ) : null}
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title={t((removeTooltipKey || 'observations.detail.removeItem') as Parameters<typeof t>[0])}
                  >
                    <Icon icon="lucide:x" className="text-lg" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
})
