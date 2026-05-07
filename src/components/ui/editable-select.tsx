'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

export interface EditableSelectItem {
  id: string
  label: string
  labelAr?: string
  isDefault?: boolean
}

interface EditableSelectProps {
  value: string | null
  onChange: (id: string) => void
  items: EditableSelectItem[]
  placeholder?: string
  // When provided, exposes inline +Add / Edit / Delete affordances.
  onAdd?: (label: string, labelAr?: string) => string | void
  onEdit?: (id: string, label: string, labelAr?: string) => void
  onDelete?: (id: string) => void
  isRTL?: boolean
  className?: string
  disabled?: boolean
  // Whether to show the Arabic field in the add/edit popover. If false, only English label is collected.
  bilingual?: boolean
  size?: 'sm' | 'md'
}

export function EditableSelect({
  value,
  onChange,
  items,
  placeholder = 'Select...',
  onAdd,
  onEdit,
  onDelete,
  isRTL = false,
  className,
  disabled = false,
  bilingual = true,
  size = 'md',
}: EditableSelectProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftLabelAr, setDraftLabelAr] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMode('list')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = items.find((i) => i.id === value)
  const selectedLabel = selected ? (isRTL && selected.labelAr ? selected.labelAr : selected.label) : null

  const startAdd = () => {
    setMode('add')
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }

  const startEdit = (item: EditableSelectItem) => {
    setMode('edit')
    setEditingId(item.id)
    setDraftLabel(item.label)
    setDraftLabelAr(item.labelAr ?? '')
  }

  const submitDraft = () => {
    const label = draftLabel.trim()
    if (!label) return
    const labelAr = draftLabelAr.trim() || undefined
    if (mode === 'add' && onAdd) {
      const newId = onAdd(label, labelAr)
      if (typeof newId === 'string') onChange(newId)
    } else if (mode === 'edit' && editingId && onEdit) {
      onEdit(editingId, label, labelAr)
    }
    setMode('list')
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }

  const handleDelete = (id: string) => {
    if (!onDelete) return
    onDelete(id)
    if (value === id) onChange('')
  }

  const padY = size === 'sm' ? 'py-1.5' : 'py-2'
  const triggerText = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between px-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors text-start',
          padY,
          triggerText,
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer',
        )}
      >
        <span className={selectedLabel ? 'text-slate-900' : 'text-slate-400'}>
          {selectedLabel ?? placeholder}
        </span>
        <Icon icon="lucide:chevron-down" className="text-slate-400 text-sm shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[14rem] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {mode === 'list' && (
            <>
              <div className="max-h-64 overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-3 text-xs text-slate-400 italic">No options</div>
                )}
                {items.map((item) => {
                  const isSelected = item.id === value
                  const label = isRTL && item.labelAr ? item.labelAr : item.label
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'group flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer',
                        isSelected && 'bg-emerald-50',
                      )}
                      onClick={() => {
                        onChange(item.id)
                        setOpen(false)
                      }}
                    >
                      <span className={cn('truncate', isSelected ? 'text-emerald-700 font-bold' : 'text-slate-700')}>
                        {label}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onEdit && (
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-emerald-600"
                            title="Edit"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(item)
                            }}
                          >
                            <Icon icon="lucide:pencil" className="text-[11px]" />
                          </button>
                        )}
                        {onDelete && !item.isDefault && (
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(item.id)
                            }}
                          >
                            <Icon icon="lucide:trash-2" className="text-[11px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {onAdd && (
                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={startAdd}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    <Icon icon="lucide:plus" className="text-sm" />
                    Add new
                  </button>
                </div>
              )}
            </>
          )}

          {(mode === 'add' || mode === 'edit') && (
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {mode === 'add' ? 'New entry' : 'Edit entry'}
              </p>
              <input
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitDraft()
                  if (e.key === 'Escape') setMode('list')
                }}
                placeholder="Name"
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              {bilingual && (
                <input
                  value={draftLabelAr}
                  onChange={(e) => setDraftLabelAr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitDraft()
                    if (e.key === 'Escape') setMode('list')
                  }}
                  placeholder="Arabic name (optional)"
                  dir="rtl"
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitDraft}
                  disabled={!draftLabel.trim()}
                  className="flex-1 px-2 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {mode === 'add' ? 'Add' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="px-2 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
