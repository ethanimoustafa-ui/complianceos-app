'use client'

import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // W37: allow any awaitable return (e.g. the policy-template store resolves a
  // success boolean) so the inline edit/delete spinners await the real request.
  onEdit?: (id: string, label: string, labelAr?: string) => void | Promise<unknown>
  onDelete?: (id: string) => void | Promise<unknown>
  // Per-row reset-to-default affordance. Used by Bucket-D label-override
  // surfaces (`mode="labels-only"`) where the canonical key never changes
  // but the label can be customized, then reset.
  onReset?: (id: string) => void
  // Predicate to decide whether to render the reset button for a row
  // (e.g. only show it when the row currently has an override).
  isReset?: (id: string) => boolean
  // W37: EXTERNAL add/edit triggers. When provided, the footer "+ Add" button
  // and the per-row pencil open a caller-owned modal (and CLOSE this dropdown)
  // instead of the built-in inline add/edit views. This fixes the case where an
  // in-dropdown affordance must launch a richer modal (e.g. approval tiers with
  // workflow steps) without leaving this z-9999 portal hovering over it.
  onAddClick?: () => void
  // May return a promise — while it resolves (e.g. fetching a tier's steps before
  // opening the editor) the per-row pencil shows a loading spinner.
  onEditClick?: (id: string) => void | Promise<unknown>
  // Custom label for the footer add button (defaults to the generic "Add Entry").
  addLabel?: string
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
  // L4: When `true`, opens the dropdown immediately on first render.
  // Used for inline-edit cells where clicking the trigger text switches to
  // this component — the user expects the dropdown to be open already.
  autoOpen?: boolean
  // P4 (W30): optional footer content rendered below the list and the Add
  // Entry button. Used for inline "Save as template" affordance in the
  // Policy/Audit create modal template pickers.
  footerSlot?: ReactNode
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
  onAddClick,
  onEditClick,
  addLabel,
  isRTL = false,
  className,
  disabled = false,
  bilingual = true,
  size = 'md',
  mode = 'default',
  locked = false,
  autoOpen = false,
  footerSlot,
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
  // B4: loading spinner while async onAdd/onEdit resolves.
  const [submitBusy, setSubmitBusy] = useState(false)
  // Misc-1 (W30): per-row spinner while async onDelete resolves. The row is
  // only removed after the server confirms (D1) — the store's delete awaits
  // the DELETE before mutating local state, so we just gate the UI on it.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // W37: per-row spinner while an async external EDIT (onEditClick) resolves.
  const [editClickingId, setEditClickingId] = useState<string | null>(null)
  // W37: snapshot of the row being deleted, so its spinner row stays visible
  // even when the store removes the item OPTIMISTICALLY (otherwise the trash
  // spinner would never paint — the row unmounts in the same render).
  const [deletingItem, setDeletingItem] = useState<EditableSelectItem | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // A2 z-index portal: position state for the portal-rendered dropdown.
  // The dropdown is rendered into document.body so it escapes any
  // `backdrop-filter` / `transform` stacking-context ancestor (W28-A2).
  const portalRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Caller may override the placeholder; otherwise use the localized default.
  const effectivePlaceholder = placeholder ?? t('editableSelect.selectPlaceholder')

  // L4 / W34-1: auto-open on first render when requested (inline-edit pattern).
  // useLayoutEffect (not useEffect) so `open` flips to true synchronously after
  // mount — before paint — eliminating the one-frame window where the trigger
  // is mounted but the listbox is still closed.
  useLayoutEffect(() => {
    if (autoOpen) setOpen(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A2 / P3 (W30): recalculate portal dropdown position whenever the dropdown
  // opens or the trigger rect changes. Uses `useLayoutEffect` so the position
  // is applied before the browser paints, avoiding a 1-frame jump.
  // P3: flip upward when insufficient space below the trigger so the dropdown
  // never gets clipped by the modal/viewport bottom edge.
  const DROPDOWN_MAX_HEIGHT = 332 // max-h-[320px] list + ~12px padding
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const flipUp = spaceBelow < DROPDOWN_MAX_HEIGHT && rect.top > DROPDOWN_MAX_HEIGHT
    // W38: position FIXED (viewport coords), not absolute. The app scrolls in
    // inner containers and modals lock body overflow, so `position:absolute`
    // offsets were measured against the full body box — the flip-up branch in
    // particular rendered the dropdown detached at the top of the screen.
    setDropdownStyle({
      position: 'fixed',
      ...(flipUp
        ? { bottom: viewportHeight - rect.top + 4, top: 'auto' }
        : { top: rect.bottom + 4, bottom: 'auto' }),
      left: rect.left,
      width: Math.max(rect.width, 224), // min-w-[14rem] = 224px
      zIndex: 9999,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    // W34-1: the interaction that OPENS this dropdown often originates outside
    // rootRef (an inline-edit trigger in the parent that swaps itself for this
    // component with autoOpen). That opening gesture's `mousedown` can reach
    // this just-registered handler and immediately close the listbox — the
    // "needs two clicks" bug. Ignore outside mousedowns for a short grace window
    // after open so the opening gesture can't self-close; genuine outside clicks
    // (well after open) still dismiss it.
    const openedAt = Date.now()
    const handler = (e: MouseEvent) => {
      if (Date.now() - openedAt < 250) return
      const target = e.target as Node
      // Close if the click is outside BOTH the trigger root AND the portal panel.
      const insideTrigger = rootRef.current?.contains(target) ?? false
      const insidePortal  = portalRef.current?.contains(target) ?? false
      if (!insideTrigger && !insidePortal) {
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
    if (!label || submitBusy) return
    const labelAr = draftLabelAr.trim() || undefined
    setSubmitBusy(true)
    try {
      if (view === 'add' && effectiveOnAdd) {
        const newId = await effectiveOnAdd(label, labelAr)
        if (typeof newId === 'string') onChange(newId)
      } else if (view === 'edit' && editingId && effectiveOnEdit) {
        await effectiveOnEdit(editingId, label, labelAr)
      }
    } finally {
      setSubmitBusy(false)
    }
    setView('list')
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }

  const handleDelete = async (id: string) => {
    if (!effectiveOnDelete || deletingId) return
    setDeletingId(id)
    // Snapshot so the spinner row survives an optimistic removal mid-request.
    setDeletingItem(items.find((i) => i.id === id) ?? null)
    try {
      await effectiveOnDelete(id)
      if (value === id) onChange('')
    } finally {
      setDeletingId(null)
      setDeletingItem(null)
    }
  }

  // W37: external EDIT trigger — keep the dropdown open with a per-row spinner
  // while the (possibly async) handler resolves, then close.
  const handleEditClick = async (id: string) => {
    if (!onEditClick || editClickingId) return
    setEditClickingId(id)
    try {
      await onEditClick(id)
    } finally {
      setEditClickingId(null)
      setOpen(false)
      setView('list')
    }
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
          'w-full flex items-center justify-between gap-2 px-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors text-start',
          padY,
          triggerText,
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer',
        )}
      >
        <span className={cn('min-w-0 truncate', selectedLabel ? 'text-slate-900' : 'text-slate-400')}>
          {selectedLabel ?? effectivePlaceholder}
        </span>
        <Icon icon="lucide:chevron-down" className="text-slate-400 text-sm shrink-0" />
      </button>

      {open && mounted && createPortal(
        <div
          ref={portalRef}
          style={dropdownStyle}
          // W38: role="listbox" — without it neither screen readers nor the
          // e2e specs can identify the portal-rendered dropdown panel.
          role="listbox"
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
          onWheel={(e) => e.stopPropagation()}
        >
          {view === 'list' && (
            <>
              <div className="max-h-[320px] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-3 py-3 text-xs text-slate-400 italic">{t('editableSelect.noOptions')}</div>
                )}
                {(deletingItem && !items.some((i) => i.id === deletingItem.id)
                  ? [...items, deletingItem]
                  : items
                ).map((item) => {
                  const isSelected = item.id === value
                  const isRowBusy = deletingId === item.id || editClickingId === item.id
                  const label = isRTL && item.labelAr ? item.labelAr : item.label
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        'group flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50',
                        isSelected && 'bg-emerald-50',
                        isRowBusy ? 'opacity-60 cursor-default' : 'cursor-pointer',
                      )}
                      onClick={() => {
                        if (isRowBusy) return
                        onChange(item.id)
                        setOpen(false)
                      }}
                    >
                      <span className={cn('truncate', isSelected ? 'text-emerald-700 font-bold' : 'text-slate-700')}>
                        {label}
                      </span>
                      <div className={cn('flex items-center gap-1 transition-opacity', isRowBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                        {(effectiveOnEdit || onEditClick) && (
                          <button
                            type="button"
                            disabled={isRowBusy}
                            aria-busy={editClickingId === item.id || undefined}
                            className="p-1 text-slate-400 hover:text-emerald-600 disabled:cursor-not-allowed"
                            title={t('editableSelect.edit')}
                            onClick={(e) => {
                              e.stopPropagation()
                              // External edit → spinner on the pencil while it loads,
                              // then open the caller's modal + close this dropdown.
                              if (onEditClick) void handleEditClick(item.id)
                              else startEdit(item)
                            }}
                          >
                            <Icon
                              icon={editClickingId === item.id ? 'lucide:loader-2' : 'lucide:pencil'}
                              className={cn('text-[11px]', editClickingId === item.id && 'animate-spin')}
                            />
                          </button>
                        )}
                        {effectiveOnDelete && !item.isDefault && (
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            aria-busy={deletingId === item.id || undefined}
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-60 disabled:cursor-not-allowed"
                            title={t('editableSelect.delete')}
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleDelete(item.id)
                            }}
                          >
                            <Icon
                              icon={deletingId === item.id ? 'lucide:loader-2' : 'lucide:trash-2'}
                              className={cn('text-[11px]', deletingId === item.id && 'animate-spin')}
                            />
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
              {onAddClick ? (
                // External add → open caller modal + close this dropdown (W37).
                <div className="border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { onAddClick(); setOpen(false); setView('list') }}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  >
                    <Icon icon="lucide:plus" className="text-sm" />
                    {addLabel ?? t('editableSelect.addNew')}
                  </button>
                </div>
              ) : effectiveOnAdd ? (
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
              ) : null}
              {footerSlot && (
                <div className="border-t border-slate-100">
                  {footerSlot}
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
                  disabled={!draftLabel.trim() || submitBusy}
                  aria-busy={submitBusy || undefined}
                  className="flex-1 px-2 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  {submitBusy && <Icon icon="lucide:loader-2" className="animate-spin text-sm" />}
                  {view === 'add' ? t('editableSelect.add') : t('editableSelect.save')}
                </button>
                <button
                  type="button"
                  disabled={submitBusy}
                  onClick={() => setView('list')}
                  className="px-2 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                >
                  {t('editableSelect.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
