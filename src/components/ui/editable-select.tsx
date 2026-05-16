'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

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
  onAdd?: (label: string, labelAr?: string) => string | void | Promise<string | void>
  onEdit?: (id: string, label: string, labelAr?: string) => void
  onDelete?: (id: string) => void
  // Per-row reset-to-default affordance. Used by Bucket-D label-override
  // surfaces (`mode="labels-only"`) where the canonical key never changes
  // but the label can be customized, then reset.
  onReset?: (id: string) => void
  // Predicate to decide whether to render the reset button for a row
  // (e.g. only show it when the row currently has an override).
  isReset?: (id: string) => boolean
  isRTL?: boolean
  className?: string
  disabled?: boolean
  // Whether to show the Arabic field in the add/edit popover. If false, only English label is collected.
  bilingual?: boolean
  size?: 'sm' | 'md'
  // Behaviour preset. `'labels-only'` hides Add and Delete affordances even
  // if the corresponding callbacks are provided; only Edit + Reset are shown.
  mode?: 'default' | 'labels-only'
  // When `true`, hides every CRUD affordance (no Add Entry button, no
  // pencil/trash/reset row icons) and disables inline rename / commit-on-blur.
  // Used for calculation-bound enums per round-3 §2.1 / §3 — see JSDoc above.
  // `locked` wins over `mode` and over any onAdd/onEdit/onDelete/onReset
  // callbacks the caller passes.
  locked?: boolean
}

/**
 * `EditableSelect` — shared dropdown component used across the app for
 * both configurable and calculation-bound enum pickers.
 *
 * Three operating modes:
 *
 * 1. **full-edit (default)** — `mode="default"`, `locked=false`. When the
 *    matching callback is passed, renders Add Entry button, per-row pencil
 *    (rename), per-row trash (delete) and per-row reset affordances. Used
 *    for configurable lists like departments, categories, business units.
 *
 * 2. **labels-only (legacy)** — `mode="labels-only"`. Hides Add and Delete
 *    affordances even when `onAdd` / `onDelete` are passed; keeps Edit +
 *    Reset for label-override surfaces (Bucket-D). Pre-existing behaviour;
 *    kept for backwards compatibility with consumers that haven't migrated.
 *
 * 3. **locked (new — round-3 §2.1 / §3)** — `locked=true`. Hides every
 *    CRUD affordance (Add button, pencil, trash, reset) and disables inline
 *    rename / commit-on-blur. Used for calculation-bound enums (likelihood,
 *    impact, severity, status, priority, …) where the value drives a score
 *    and must not be user-editable. Trigger button + dropdown options are
 *    visually identical to the full-edit variant — same paddings, chevron,
 *    hover state, selected state, colors. `locked` wins over `mode` and
 *    over any onAdd/onEdit/onDelete/onReset callbacks the caller passes.
 */
export function EditableSelect({
  value,
  onChange,
  items,
  placeholder,
  onAdd,
  onEdit,
  onDelete,
  onReset,
  isReset,
  isRTL = false,
  className,
  disabled = false,
  bilingual = true,
  size = 'md',
  mode = 'default',
  locked = false,
}: EditableSelectProps) {
  const labelsOnly = mode === 'labels-only'
  // `locked` is the strongest gate — it suppresses every CRUD affordance
  // regardless of `mode` or which callbacks were passed in. It also
  // disables the inline rename flow (the add/edit panel is never opened).
  const effectiveOnAdd = locked ? undefined : labelsOnly ? undefined : onAdd
  const effectiveOnEdit = locked ? undefined : onEdit
  const effectiveOnDelete = locked ? undefined : labelsOnly ? undefined : onDelete
  const effectiveOnReset = locked ? undefined : onReset
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'add' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftLabelAr, setDraftLabelAr] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Caller may override the placeholder; otherwise use the localized default.
  const effectivePlaceholder = placeholder ?? t('editableSelect.selectPlaceholder')

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setView('list')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = items.find((i) => i.id === value)
  const selectedLabel = selected ? (isRTL && selected.labelAr ? selected.labelAr : selected.label) : null

  const startAdd = () => {
    setView('add')
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }

  const startEdit = (item: EditableSelectItem) => {
    setView('edit')
    setEditingId(item.id)
    setDraftLabel(item.label)
    setDraftLabelAr(item.labelAr ?? '')
  }

  const submitDraft = async () => {
    const label = draftLabel.trim()
    if (!label) return
    const labelAr = draftLabelAr.trim() || undefined
    if (view === 'add' && effectiveOnAdd) {
      const newId = await effectiveOnAdd(label, labelAr)
      if (typeof newId === 'string') onChange(newId)
    } else if (view === 'edit' && editingId && effectiveOnEdit) {
      effectiveOnEdit(editingId, label, labelAr)
    }
    setView('list')
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }

  const handleDelete = (id: string) => {
    if (!effectiveOnDelete) return
    effectiveOnDelete(id)
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
          {selectedLabel ?? effectivePlaceholder}
        </span>
        <Icon icon="lucide:chevron-down" className="text-slate-400 text-sm shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[14rem] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          {view === 'list' && (
            <>
              <div className="max-h-64 overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-3 text-xs text-slate-400 italic">{t('editableSelect.noOptions')}</div>
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
                        {effectiveOnEdit && (
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-emerald-600"
                            title={t('editableSelect.edit')}
                            onClick={(e) => {
                              e.stopPropagation()
                              startEdit(item)
                            }}
                          >
                            <Icon icon="lucide:pencil" className="text-[11px]" />
                          </button>
                        )}
                        {effectiveOnDelete && !item.isDefault && (
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title={t('editableSelect.delete')}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(item.id)
                            }}
                          >
                            <Icon icon="lucide:trash-2" className="text-[11px]" />
                          </button>
                        )}
                        {effectiveOnReset && (!isReset || isReset(item.id)) && (
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-amber-600"
                            title={t('editableSelect.reset')}
                            onClick={(e) => {
                              e.stopPropagation()
                              effectiveOnReset(item.id)
                            }}
                          >
                            <Icon icon="lucide:rotate-ccw" className="text-[11px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {effectiveOnAdd && (
                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={startAdd}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    <Icon icon="lucide:plus" className="text-sm" />
                    {t('editableSelect.addNew')}
                  </button>
                </div>
              )}
            </>
          )}

          {(view === 'add' || view === 'edit') && (
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {view === 'add' ? t('editableSelect.newEntry') : t('editableSelect.editEntry')}
              </p>
              <input
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitDraft()
                  if (e.key === 'Escape') setView('list')
                }}
                placeholder={t('editableSelect.name')}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              {bilingual && (
                <input
                  value={draftLabelAr}
                  onChange={(e) => setDraftLabelAr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitDraft()
                    if (e.key === 'Escape') setView('list')
                  }}
                  placeholder={t('editableSelect.arabicNameOptional')}
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
                  {view === 'add' ? t('editableSelect.add') : t('editableSelect.save')}
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="px-2 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                >
                  {t('editableSelect.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
