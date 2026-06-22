'use client'

// "Lists & Categories" — bulk management surface for every editable dropdown
// store the app exposes. Each section is a table with EN/AR labels, default
// badge, usage count, and edit/delete affordances. New rows can be added
// inline. Sections silently hide if their store import fails (defensive coding
// per §2.6) so this file is forward-compatible with stores that haven't
// shipped yet.
//
// Round 3 §2.2/§2.3:
// - Onboarding (industry/region/headcount) sections removed from the UI.
// - Seed deletion no longer disabled — the trash button now opens an
//   orphan-confirm modal that warns when records reference the entry.
//   `isDefault` survives as a display-only "SEED" badge.

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { EditableSelect } from '@/components/ui/editable-select'
import { CATEGORY_COLOR_TOKENS, CATEGORY_COLOR_TOKEN_KEYS } from '@/lib/category-config'

// Curated icon choices for the risk-category appearance picker (Iconify ids).
const RISK_ICON_CHOICES = [
  'lucide:settings', 'lucide:dollar-sign', 'lucide:shield', 'lucide:target', 'lucide:users',
  'lucide:alert-triangle', 'lucide:server', 'lucide:scale', 'lucide:lock', 'lucide:trending-up',
  'lucide:file-text', 'lucide:globe', 'lucide:briefcase', 'lucide:activity', 'lucide:flag', 'lucide:gavel',
]

// ── Stores actually used to count usage ──────────────────────────────────────
import { Gate } from '@/components/auth/gate'
import { pushToast } from '@/stores/toast-store'
import { useLetterStore } from '@/stores/letter-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useAuditStore } from '@/stores/audit-store'
import { useRiskStore } from '@/stores/risk-store'

// ── My stores ────────────────────────────────────────────────────────────────
import { useFrameworkSubCategoryStore } from '@/stores/framework-sub-category-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { useTrainingCategoryStore } from '@/stores/training-category-store'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { useRiskCategoryStore } from '@/stores/risk-category-store'

// ── Defensive imports for Agent D's stores (may not exist yet) ───────────────
// We import lazily via require-style guards so a missing store hides its section
// without breaking the page.
//
// Round-3 follow-up: Correspondence Type is intentionally NOT exposed here.
// Whether a framework supports correspondence is tracked on the framework
// itself (`useFrameworkConfigStore.frameworks[].correspondenceBased`); a
// separate Correspondence Type list would duplicate that signal.
let useBusinessUnitStore: any = null
let useCalendarEventTypeStore: any = null
try { useBusinessUnitStore = require('@/stores/business-unit-store').useBusinessUnitStore } catch {}
try { useCalendarEventTypeStore = require('@/stores/calendar-event-type-store').useCalendarEventTypeStore } catch {}

// ── Folded-in managers (Configurables hub) ───────────────────────────────────
// These used to be standalone Settings sections. They now open from the
// Configurables hub as modals, rendered `embedded` so they drop their own card
// chrome + header (the modal supplies the title).
import { AuditTemplatesSection } from '@/components/settings/AuditTemplatesSection'
import { PolicyTemplatesSection } from '@/components/settings/PolicyTemplatesSection'
// Owner: the "Letter Type" configurable now lists the actual letter TEMPLATES.
import { LetterTemplatesSection } from '@/components/settings/LetterTemplatesSection'
// Owner: the "Training Category" entry manages the actual training COURSES.
import { TrainingCoursesLauncher } from '@/components/settings/TrainingCoursesSection'
import { ApprovalTiersSection } from '@/components/settings/ApprovalTiersSection'
import { DepartmentsSection } from '@/components/settings/DepartmentsSection'

// ── Generic shape every editable-list section consumes ───────────────────────

interface ListItem {
  id: string
  label: string
  labelAr?: string
  isDefault?: boolean
  /** Appearance (risk categories) — color token + Iconify id. */
  color?: string
  icon?: string
}

/** Optional appearance payload for sections that support color/icon. */
interface Appearance {
  color?: string
  icon?: string
}

interface ListSectionProps {
  title: string
  description?: string
  items: ListItem[]
  countUsage: (id: string) => number
  /**
   * Reference count used by the orphan-confirm modal. Defaults to `countUsage`
   * if omitted; pass a separate counter when the in-table "In Use" number is
   * cheaper to compute than the full cross-store reference scan.
   */
  getReferenceCount?: (id: string) => number
  onAdd: (label: string, labelAr?: string, appearance?: Appearance) => string | void | Promise<string | void>
  onEdit: (id: string, label: string, labelAr?: string, appearance?: Appearance) => void
  onDelete: (id: string) => void
  /** When true, the add/edit rows expose a color + icon picker (risk categories). */
  supportsAppearance?: boolean
  onResetSection?: () => void
  /** When set, the "Add" button calls this instead of the inline add-row —
   *  used by Letter Type to open the full letter-template create modal (its
   *  "inherent function" is a template, not a bare label). */
  onAddClick?: () => void
  /** Optional override for the Add button copy (e.g. "New Letter Template"). */
  addLabel?: string
  isRTL: boolean
  t: (key: TranslationKey, params?: Record<string, string>) => string
}

function ListSection({
  title, description, items, countUsage, getReferenceCount,
  onAdd, onEdit, onDelete, onResetSection, onAddClick, addLabel, isRTL, t, supportsAppearance,
}: ListSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftLabelAr, setDraftLabelAr] = useState('')
  const [draftColor, setDraftColor] = useState('')
  const [draftIcon, setDraftIcon] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; refs: number } | null>(null)

  const startEdit = (item: ListItem) => {
    setEditingId(item.id)
    setDraftLabel(item.label)
    setDraftLabelAr(item.labelAr ?? '')
    setDraftColor(item.color ?? '')
    setDraftIcon(item.icon ?? '')
    setAdding(false)
  }
  const startAdd = () => {
    setAdding(true)
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
    setDraftColor('')
    setDraftIcon('')
  }
  const cancel = () => {
    setEditingId(null)
    setAdding(false)
    setDraftLabel('')
    setDraftLabelAr('')
    setDraftColor('')
    setDraftIcon('')
  }
  const save = async () => {
    const label = draftLabel.trim()
    if (!label || saving) return
    const labelAr = draftLabelAr.trim() || undefined
    const appearance: Appearance | undefined = supportsAppearance
      ? { color: draftColor || undefined, icon: draftIcon || undefined }
      : undefined
    setSaving(true)
    try {
      // Await so the confirm icon shows a spinner across the real request
      // (add/edit hit the server) before the row commits and the editor closes.
      if (editingId) await onEdit(editingId, label, labelAr, appearance)
      else if (adding) await onAdd(label, labelAr, appearance)
      cancel()
    } finally {
      setSaving(false)
    }
  }

  // Compact color-swatch + icon-grid picker, shown in the add/edit rows when the
  // section supports appearance (risk categories).
  const appearancePicker = supportsAppearance ? (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_COLOR_TOKEN_KEYS.map((tok) => (
          <button
            key={tok}
            type="button"
            title={tok}
            onClick={() => setDraftColor(tok)}
            className={`w-5 h-5 rounded-full cursor-pointer ${CATEGORY_COLOR_TOKENS[tok].dot} ${draftColor === tok ? 'ring-2 ring-offset-1 ring-slate-900' : ''}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {RISK_ICON_CHOICES.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setDraftIcon(ic)}
            className={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer ${draftIcon === ic ? 'bg-emerald-100 ring-1 ring-emerald-500' : 'hover:bg-slate-100'}`}
          >
            <Icon icon={ic} className="text-sm text-slate-600" />
          </button>
        ))}
      </div>
    </div>
  ) : null

  const requestDelete = (item: ListItem) => {
    const counter = getReferenceCount ?? countUsage
    let refs = 0
    try { refs = counter(item.id) } catch { refs = 0 }
    setPendingDelete({ id: item.id, label: item.label, refs })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { id, label } = pendingDelete
    setPendingDelete(null)
    // Surface a failure instead of silently rolling the row back (e.g. trying
    // to delete a server-guarded default returns without removing it).
    Promise.resolve(onDelete(id)).catch(() => {
      pushToast(t('listsAndCategories.deleteFailed' as TranslationKey, { label }), 'error')
    })
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {onResetSection && (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-rose-600 px-2 py-1 rounded-md hover:bg-rose-50 cursor-pointer flex items-center gap-1"
              title={t('listsAndCategories.resetToDefaults')}
            >
              <Icon icon="lucide:rotate-ccw" className="text-xs" />
              {t('listsAndCategories.resetToDefaults')}
            </button>
          )}
          <Button size="sm" variant="primary" onClick={onAddClick ?? startAdd}>
            <Icon icon="lucide:plus" className="text-sm" />
            {addLabel ?? t('listsAndCategories.addEntry')}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.labelEn')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.labelAr')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.usage')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">{t('listsAndCategories.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && !adding && (
              <tr>
                <td colSpan={4} className="px-6 py-6 text-center text-slate-400 italic text-xs">
                  {t('listsAndCategories.empty')}
                </td>
              </tr>
            )}
            {items.map((item) => {
              const isEditing = editingId === item.id
              const usage = countUsage(item.id)
              return (
                <tr key={item.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3">
                    {isEditing ? (
                      <>
                        <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                        {appearancePicker}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        {supportsAppearance && (
                          <span className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center text-xs ${item.color && CATEGORY_COLOR_TOKENS[item.color] ? CATEGORY_COLOR_TOKENS[item.color].pill : 'bg-slate-100 text-slate-500'}`}>
                            <Icon icon={item.icon ?? 'lucide:tag'} />
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-800">{item.label}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {isEditing ? (
                      <Input value={draftLabelAr} onChange={(e) => setDraftLabelAr(e.target.value)} dir="rtl" />
                    ) : (
                      <span className="text-xs text-slate-600">{item.labelAr ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`text-xs font-bold ${usage > 0 ? 'text-slate-700' : 'text-slate-400'}`}>
                      {usage}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      {isEditing ? (
                        <>
                          <button onClick={() => void save()} disabled={saving} aria-busy={saving || undefined} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer disabled:opacity-50" title={t('editableSelect.save')}>
                            <Icon icon={saving ? 'lucide:loader-2' : 'lucide:check'} className={`text-sm ${saving ? 'animate-spin' : ''}`} />
                          </button>
                          <button onClick={cancel} disabled={saving} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer disabled:opacity-50" title={t('editableSelect.cancel')}>
                            <Icon icon="lucide:x" className="text-sm" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-emerald-600 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer" title={t('editableSelect.edit')}>
                            <Icon icon="lucide:pencil" className="text-sm" />
                          </button>
                          <button
                            onClick={() => requestDelete(item)}
                            className="p-1.5 rounded-md cursor-pointer text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title={t('editableSelect.delete')}
                          >
                            <Icon icon="lucide:trash-2" className="text-sm" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {adding && (
              <tr className="bg-emerald-50/40">
                <td className="px-6 py-3">
                  <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder={t('editableSelect.name')} autoFocus />
                  {appearancePicker}
                </td>
                <td className="px-6 py-3"><Input value={draftLabelAr} onChange={(e) => setDraftLabelAr(e.target.value)} placeholder={t('editableSelect.arabicNameOptional')} dir="rtl" /></td>
                <td className="px-6 py-3"><span className="text-xs text-slate-400">0</span></td>
                <td className="px-6 py-3">
                  <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                    <button onClick={() => void save()} disabled={!draftLabel.trim() || saving} aria-busy={saving || undefined} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer disabled:opacity-40">
                      <Icon icon={saving ? 'lucide:loader-2' : 'lucide:check'} className={`text-sm ${saving ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={cancel} disabled={saving} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer disabled:opacity-50">
                      <Icon icon="lucide:x" className="text-sm" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={confirmReset} onClose={() => setConfirmReset(false)} title={t('listsAndCategories.resetTitle')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('listsAndCategories.resetConfirm')}</p>
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">{t('listsAndCategories.resetWarning')}</p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => { onResetSection?.(); setConfirmReset(false) }}>
              {t('listsAndCategories.resetToDefaults')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('listsAndCategories.deleteTitle')}
        size="sm"
      >
        <div className="space-y-4">
          {pendingDelete && pendingDelete.refs > 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              {t('listsAndCategories.deleteConfirmOrphan', { count: String(pendingDelete.refs) })}
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              {pendingDelete
                ? t('listsAndCategories.deleteConfirmSimple', { label: pendingDelete.label })
                : ''}
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t('listsAndCategories.deleteConfirmAction')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

// ── Generic launcher button + modal wrapper for any ListSection ─────────────
//
// Round-3 follow-up: the original page rendered every ListSection inline, so
// the page scrolled forever. Now each list is summoned via a compact button
// (label + count badge) that opens a modal hosting the full ListSection. The
// underlying CRUD UX is unchanged — only the entry point.

interface ListSectionLauncherProps extends ListSectionProps {
  /** Inline button copy — usually the section title. */
  buttonLabel?: string
}

function ListSectionLauncher(props: ListSectionLauncherProps) {
  const { buttonLabel, title, items } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Icon icon="lucide:list" className="text-sm" />
        {buttonLabel ?? title}
        <span className="text-[10px] font-bold text-slate-400 ms-1">
          ({items.length})
        </span>
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size="lg">
        <ListSection {...props} />
      </Modal>
    </>
  )
}

// ── Generic launcher for a folded-in manager section ─────────────────────────
//
// Same "button → modal" entry point as ListSectionLauncher, but hosts an
// arbitrary manager (templates / departments / approval tiers) rendered
// `embedded`. Children only mount when the modal is open (Modal returns null
// while closed), so the heavy section's stores aren't subscribed until needed.
function SectionLauncher({
  icon,
  label,
  title,
  size = 'xl',
  children,
}: {
  icon: string
  label: string
  title: string
  size?: 'md' | 'lg' | 'xl' | '2xl'
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Icon icon={icon} className="text-sm" />
        {label}
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size={size}>
        {open ? children : null}
      </Modal>
    </>
  )
}

// ── Per-framework sub-category launcher ─────────────────────────────────────
//
// Round-3 §5: sub-categories are scoped per framework. The Settings UI exposes
// one "Configure {framework} Sub-Categories" button per *enabled* framework.
// Clicking opens a modal hosting an `EditableSelect` (full-edit mode) bound to
// that framework's slice of `useFrameworkSubCategoryStore`.

interface FrameworkSubCategoryLauncherProps {
  isRTL: boolean
  t: (key: TranslationKey, params?: Record<string, string>) => string
}

function FrameworkSubCategoryLauncher({ isRTL, t }: FrameworkSubCategoryLauncherProps) {
  const frameworkConfig = useFrameworkConfigStore()
  const subCategoryStore = useFrameworkSubCategoryStore()
  const letters = useLetterStore((s) => s.letters)

  const [openFrameworkId, setOpenFrameworkId] = useState<string | null>(null)

  const enabledFrameworks = useMemo(
    // Only correspondence-based frameworks carry sub-categories — a
    // non-correspondence framework has no letters, so a sub-category list is
    // meaningless for it (owner request).
    () => frameworkConfig.frameworks.filter((f) => f.enabled && f.correspondenceBased),
    [frameworkConfig.frameworks],
  )

  const openFramework = useMemo(
    () => enabledFrameworks.find((f) => f.id === openFrameworkId) ?? null,
    [enabledFrameworks, openFrameworkId],
  )

  // EditableSelect needs a single selected `value` — not meaningful for the
  // bulk-edit modal, so we keep a local highlight that defaults to the first
  // entry (or null for empty lists).
  const items = useMemo(
    () => (openFrameworkId ? subCategoryStore.list(openFrameworkId) : []),
    [openFrameworkId, subCategoryStore],
  )
  const [highlight, setHighlight] = useState<string | null>(null)

  // Count usage of a given sub-category id across letters. Letters reference
  // the id only (no framework discriminator), so this is global by design.
  const countUsage = useCallback(
    (id: string) => letters.filter((l) => l.subCategory === id).length,
    [letters],
  )

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">
          {t('listsAndCategories.subCategoriesTitle')}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {t('listsAndCategories.subCategoriesDescription')}
        </p>
      </div>
      <div className="p-6">
        {enabledFrameworks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            {t('listsAndCategories.noEnabledFrameworks')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {enabledFrameworks.map((fw) => {
              const count = subCategoryStore.list(fw.id).length
              return (
                <Button
                  key={fw.id}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpenFrameworkId(fw.id)
                    const first = subCategoryStore.list(fw.id)[0]
                    setHighlight(first?.id ?? null)
                  }}
                >
                  <Icon icon="lucide:settings-2" className="text-sm" />
                  {t('listsAndCategories.configureSubCategoriesFor', { framework: fw.name })}
                  <span className="text-[10px] font-bold text-slate-400 ms-1">
                    ({count})
                  </span>
                </Button>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={openFrameworkId !== null}
        onClose={() => setOpenFrameworkId(null)}
        title={
          openFramework
            ? t('listsAndCategories.subCategoryModalTitle', { framework: openFramework.name })
            : ''
        }
        size="md"
      >
        {openFrameworkId && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              {t('listsAndCategories.subCategoriesDescription')}
            </p>
            <EditableSelect
              value={highlight}
              onChange={(id) => setHighlight(id)}
              items={items.map((sc) => ({
                id: sc.id,
                label: sc.label,
                labelAr: sc.labelAr,
                isDefault: sc.isDefault,
              }))}
              placeholder={t('listsAndCategories.subCategoriesTitle')}
              onAdd={async (label, labelAr) => {
                try {
                  const created = await subCategoryStore.add(openFrameworkId, label, labelAr)
                  setHighlight(created.id)
                  return created.id
                } catch (err) {
                  console.error('Failed to add sub-category', err)
                  pushToast({ key: 'errors.settings.subCategoryAddFailed' }, 'error')
                  return undefined
                }
              }}
              onEdit={(id, label, labelAr) =>
                subCategoryStore.update(id, { label, labelAr: labelAr ?? label })
              }
              onDelete={(id) => {
                subCategoryStore.remove(id)
                if (highlight === id) setHighlight(null)
              }}
              isRTL={isRTL}
            />
            {/* Per-row usage hint — surfaces orphan-protection context for the
                currently highlighted entry. */}
            {highlight && (
              <p className="text-[11px] text-slate-500">
                {t('listsAndCategories.usage')}: <span className="font-bold text-slate-700">{countUsage(highlight)}</span>
              </p>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setOpenFrameworkId(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ListsAndCategoriesSection() {
  const { t, isRTL } = useTranslation()

  // ── My stores
  const policyCat = usePolicyCategoryStore()
  const trainingCat = useTrainingCategoryStore()
  const auditCat = useAuditCategoryStore()
  const riskCat = useRiskCategoryStore()

  // ── Counter sources
  const calendarEvents = useCalendarStore((s) => s.events)
  const advisory = useAdvisoryStore((s) => s.advisoryRequests)
  const policies = usePolicyStore((s) => s.policies)
  const audits = useAuditStore((s) => s.audits)
  const risks = useRiskStore((s) => s.risks)

  // ── Defensive: each Agent D store may or may not exist. Hooks are called
  // unconditionally; if the import is null we use an empty fallback.
  const businessUnits = useBusinessUnitStore ? useBusinessUnitStore() : null
  const calendarEventType = useCalendarEventTypeStore ? useCalendarEventTypeStore() : null

  // Hydrate EVERY lookup store this hub lists, so items created here (or
  // elsewhere) survive a reload. Critically this includes the SEEDED stores
  // (policy/risk categories): they're baked with default seeds and start
  // "non-empty", so I previously skipped them — but without fetchAll they only
  // ever show the seeds, and a successfully-POSTed new row vanished on reload
  // (owner: "create doesn't really work"). fetchAll merges server rows + any
  // missing seeds, so created rows now appear.
  const fetchTrainingCat = trainingCat.fetchAll
  const fetchAuditCat = auditCat.fetchAll
  const fetchPolicyCat = policyCat.fetchAll
  const fetchRiskCat = riskCat.fetchAll
  const fetchSubCategories = useFrameworkSubCategoryStore((s) => s.fetchAll)
  const fetchBusinessUnits = businessUnits?.fetchAll
  useEffect(() => {
    void fetchTrainingCat?.()
    void fetchAuditCat?.()
    void fetchPolicyCat?.()
    void fetchRiskCat?.()
    void fetchSubCategories?.()
    void fetchBusinessUnits?.()
  }, [fetchTrainingCat, fetchAuditCat, fetchPolicyCat, fetchRiskCat, fetchSubCategories, fetchBusinessUnits])

  // ── Counters ─────────────────────────────────────────────────────────────
  const countCalendarEventType = useCallback((id: string) =>
    calendarEvents.filter((e) => e.type === id).length, [calendarEvents])
  const countAdvisoryBU = useCallback((id: string) =>
    advisory.filter((a) => a.businessUnit === id).length, [advisory])
  const countPolicyCategory = useCallback((id: string) =>
    policies.filter((p) => p.category === id).length, [policies])
  const countAuditCategory = useCallback((id: string) =>
    audits.filter((a) => a.category === id).length, [audits])
  const countRiskCategory = useCallback((id: string) =>
    risks.filter((r) => r.category === id).length, [risks])

  return (
    <Gate perm="Configure Lists & Categories">
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 font-display">
          {t('configurables.title')}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {t('configurables.subtitle')}
        </p>
      </div>
      <div className="p-6 space-y-6 bg-slate-50">
        {/* Every configurable is one click + modal away, so the Settings page
            no longer scrolls forever. Grouped: listing categories, then
            sub-categories, templates, and structure (departments / tiers). */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            {t('configurables.listingCategories')}
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {t('configurables.listingCategoriesDesc')}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Letter templates live in the Templates group now (owner: the
                "Letter Type" entry lists the actual letter templates). */}
            {calendarEventType && (
              <ListSectionLauncher
                title={t('listsAndCategories.sectionCalendarEventType')}
                items={calendarEventType.types}
                countUsage={countCalendarEventType}
                onAdd={calendarEventType.add}
                onEdit={(id, label, labelAr) => calendarEventType.update(id, { label, labelAr })}
                onDelete={calendarEventType.remove}
                isRTL={isRTL}
                t={t}
              />
            )}
            {businessUnits && (
              <ListSectionLauncher
                title={t('listsAndCategories.sectionBusinessUnit')}
                items={businessUnits.units}
                countUsage={countAdvisoryBU}
                onAdd={businessUnits.add}
                onEdit={(id, label, labelAr) => businessUnits.update(id, { label, labelAr })}
                onDelete={businessUnits.remove}
                isRTL={isRTL}
                t={t}
              />
            )}
            <ListSectionLauncher
              title={t('listsAndCategories.sectionPolicyCategory')}
              description={t('listsAndCategories.sectionPolicyCategoryDesc')}
              items={policyCat.categories}
              countUsage={countPolicyCategory}
              onAdd={policyCat.add}
              onEdit={(id, label, labelAr) => policyCat.update(id, { label, labelAr })}
              onDelete={policyCat.remove}
              onResetSection={policyCat.resetToDefaults}
              isRTL={isRTL}
              t={t}
            />
            {/* Training: the full course manager (name/due date/description/
                category), not just category labels (categories stay editable
                inline in its add form). */}
            <TrainingCoursesLauncher />
            <ListSectionLauncher
              title={t('listsAndCategories.sectionAuditCategory')}
              description={t('listsAndCategories.sectionAuditCategoryDesc')}
              items={auditCat.categories}
              countUsage={countAuditCategory}
              onAdd={auditCat.add}
              onEdit={(id, label, labelAr) => auditCat.update(id, { label, labelAr })}
              onDelete={auditCat.remove}
              onResetSection={auditCat.resetToDefaults}
              isRTL={isRTL}
              t={t}
            />
            <ListSectionLauncher
              title={t('listsAndCategories.sectionRiskCategory')}
              description={t('listsAndCategories.sectionRiskCategoryDesc')}
              items={riskCat.categories}
              countUsage={countRiskCategory}
              supportsAppearance
              onAdd={(label, labelAr, appearance) => riskCat.add(label, labelAr, appearance)}
              onEdit={(id, label, labelAr, appearance) =>
                riskCat.update(id, { label, labelAr, color: appearance?.color, icon: appearance?.icon })}
              onDelete={riskCat.remove}
              onResetSection={riskCat.resetToDefaults}
              isRTL={isRTL}
              t={t}
            />
            {/* Folded in alongside the simple lists: departments + the policy
                approval tiers. (Observation Sources was removed — those options
                are already derived from correspondence-based frameworks, so a
                separate configurable just duplicated that signal.) */}
            <SectionLauncher
              icon="lucide:building-2"
              label={t('settings.departments.title' as TranslationKey)}
              title={t('settings.departments.title' as TranslationKey)}
              size="lg"
            >
              <DepartmentsSection embedded />
            </SectionLauncher>
            <SectionLauncher
              icon="lucide:layers"
              label={t('settings.enumValues.title')}
              title={t('settings.enumValues.title')}
              size="lg"
            >
              <ApprovalTiersSection embedded />
            </SectionLauncher>
          </div>
        </div>

        {/* Per-framework sub-categories keep their own section since each
            enabled framework gets a dedicated button. */}
        <FrameworkSubCategoryLauncher
          isRTL={isRTL}
          t={t}
        />

        {/* Templates — audit + policy template managers, folded in from their
            former standalone Settings sections. */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            {t('configurables.templates')}
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {t('configurables.templatesDesc')}
          </p>
          <div className="flex flex-wrap gap-2">
            <SectionLauncher
              icon="lucide:clipboard-check"
              label={t('settings.auditTemplates')}
              title={t('settings.auditTemplates')}
              size="2xl"
            >
              <AuditTemplatesSection embedded />
            </SectionLauncher>
            <SectionLauncher
              icon="lucide:file-text"
              label={t('settings.policyTemplates')}
              title={t('settings.policyTemplates')}
              size="2xl"
            >
              <PolicyTemplatesSection embedded />
            </SectionLauncher>
            <SectionLauncher
              icon="lucide:mail"
              label={t('settings.letterTemplates' as TranslationKey)}
              title={t('settings.letterTemplates' as TranslationKey)}
              size="2xl"
            >
              <LetterTemplatesSection embedded />
            </SectionLauncher>
          </div>
        </div>

      </div>
    </section>

    </Gate>
  )
}
