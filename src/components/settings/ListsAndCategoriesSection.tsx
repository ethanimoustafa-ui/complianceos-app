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

import { useState, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { EditableSelect } from '@/components/ui/editable-select'

// ── Stores actually used to count usage ──────────────────────────────────────
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useAuditStore } from '@/stores/audit-store'
import { useRiskStore } from '@/stores/risk-store'

// ── My stores ────────────────────────────────────────────────────────────────
import { useFrameworkSubCategoryStore } from '@/stores/framework-sub-category-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useSAMALetterTypeStore } from '@/stores/sama-letter-type-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { useTrainingCategoryStore } from '@/stores/training-category-store'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { useRiskCategoryStore } from '@/stores/risk-category-store'

// ── Defensive imports for Agent D's stores (may not exist yet) ───────────────
// We import lazily via require-style guards so a missing store hides its section
// without breaking the page.
let useBusinessUnitStore: any = null
let useCalendarEventTypeStore: any = null
let useCorrespondenceTypeStore: any = null
try { useBusinessUnitStore = require('@/stores/business-unit-store').useBusinessUnitStore } catch {}
try { useCalendarEventTypeStore = require('@/stores/calendar-event-type-store').useCalendarEventTypeStore } catch {}
try { useCorrespondenceTypeStore = require('@/stores/correspondence-type-store').useCorrespondenceTypeStore } catch {}

// ── Generic shape every editable-list section consumes ───────────────────────

interface ListItem {
  id: string
  label: string
  labelAr?: string
  isDefault?: boolean
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
  onAdd: (label: string, labelAr?: string) => string | void
  onEdit: (id: string, label: string, labelAr?: string) => void
  onDelete: (id: string) => void
  onResetSection?: () => void
  isRTL: boolean
  t: (key: TranslationKey, params?: Record<string, string>) => string
}

function ListSection({
  title, description, items, countUsage, getReferenceCount,
  onAdd, onEdit, onDelete, onResetSection, isRTL, t,
}: ListSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftLabelAr, setDraftLabelAr] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string; refs: number } | null>(null)

  const startEdit = (item: ListItem) => {
    setEditingId(item.id)
    setDraftLabel(item.label)
    setDraftLabelAr(item.labelAr ?? '')
    setAdding(false)
  }
  const startAdd = () => {
    setAdding(true)
    setEditingId(null)
    setDraftLabel('')
    setDraftLabelAr('')
  }
  const cancel = () => {
    setEditingId(null)
    setAdding(false)
    setDraftLabel('')
    setDraftLabelAr('')
  }
  const save = () => {
    const label = draftLabel.trim()
    if (!label) return
    const labelAr = draftLabelAr.trim() || undefined
    if (editingId) onEdit(editingId, label, labelAr)
    else if (adding) onAdd(label, labelAr)
    cancel()
  }

  const requestDelete = (item: ListItem) => {
    const counter = getReferenceCount ?? countUsage
    let refs = 0
    try { refs = counter(item.id) } catch { refs = 0 }
    setPendingDelete({ id: item.id, label: item.label, refs })
  }

  const confirmDelete = () => {
    if (pendingDelete) onDelete(pendingDelete.id)
    setPendingDelete(null)
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
          <Button size="sm" variant="primary" onClick={startAdd}>
            <Icon icon="lucide:plus" className="text-sm" />
            {t('listsAndCategories.addEntry')}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.labelEn')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.labelAr')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.flag')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('listsAndCategories.usage')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">{t('listsAndCategories.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && !adding && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-slate-400 italic text-xs">
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
                      <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                    ) : (
                      <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-2">
                        {item.label}
                        {item.isDefault && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 tracking-wide">
                            {t('listsAndCategories.seedBadge')}
                          </span>
                        )}
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
                    {item.isDefault ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {t('listsAndCategories.seedBadge')}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {t('listsAndCategories.customBadge')}
                      </span>
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
                          <button onClick={save} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer" title={t('editableSelect.save')}>
                            <Icon icon="lucide:check" className="text-sm" />
                          </button>
                          <button onClick={cancel} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer" title={t('editableSelect.cancel')}>
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
                <td className="px-6 py-3"><Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder={t('editableSelect.name')} autoFocus /></td>
                <td className="px-6 py-3"><Input value={draftLabelAr} onChange={(e) => setDraftLabelAr(e.target.value)} placeholder={t('editableSelect.arabicNameOptional')} dir="rtl" /></td>
                <td className="px-6 py-3"><span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{t('listsAndCategories.customBadge')}</span></td>
                <td className="px-6 py-3"><span className="text-xs text-slate-400">0</span></td>
                <td className="px-6 py-3">
                  <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                    <button onClick={save} disabled={!draftLabel.trim()} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer disabled:opacity-40">
                      <Icon icon="lucide:check" className="text-sm" />
                    </button>
                    <button onClick={cancel} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer">
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
  const letters = useSAMALetterStore((s) => s.letters)

  const [openFrameworkId, setOpenFrameworkId] = useState<string | null>(null)

  const enabledFrameworks = useMemo(
    () => frameworkConfig.frameworks.filter((f) => f.enabled),
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
              onAdd={(label, labelAr) => {
                const created = subCategoryStore.add(openFrameworkId, label, labelAr)
                setHighlight(created.id)
                return created.id
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
  const letterType = useSAMALetterTypeStore()
  const policyCat = usePolicyCategoryStore()
  const trainingCat = useTrainingCategoryStore()
  const auditCat = useAuditCategoryStore()
  const riskCat = useRiskCategoryStore()

  // ── Counter sources
  const letters = useSAMALetterStore((s) => s.letters)
  const correspondence = useCorrespondenceStore((s) => s.correspondence)
  const calendarEvents = useCalendarStore((s) => s.events)
  const advisory = useAdvisoryStore((s) => s.advisoryRequests)
  const policies = usePolicyStore((s) => s.policies)
  const trainingCourses = useTrainingStore((s) => s.courses)
  const audits = useAuditStore((s) => s.audits)
  const risks = useRiskStore((s) => s.risks)

  // ── Defensive: each Agent D store may or may not exist. Hooks are called
  // unconditionally; if the import is null we use an empty fallback.
  const businessUnits = useBusinessUnitStore ? useBusinessUnitStore() : null
  const calendarEventType = useCalendarEventTypeStore ? useCalendarEventTypeStore() : null
  const correspondenceType = useCorrespondenceTypeStore ? useCorrespondenceTypeStore() : null

  // ── Counters ─────────────────────────────────────────────────────────────
  const countLetterType = useCallback((id: string) =>
    letters.filter((l) => l.type === id).length, [letters])
  const countCorrespondenceType = useCallback((id: string) =>
    correspondence.filter((c) => c.type === id).length, [correspondence])
  const countCalendarEventType = useCallback((id: string) =>
    calendarEvents.filter((e) => e.type === id).length, [calendarEvents])
  const countAdvisoryBU = useCallback((id: string) =>
    advisory.filter((a) => a.businessUnit === id).length, [advisory])
  const countPolicyCategory = useCallback((id: string) =>
    policies.filter((p) => p.category === id).length, [policies])
  const countTrainingCategory = useCallback((id: string) =>
    trainingCourses.filter((c) => c.category === id).length, [trainingCourses])
  const countAuditCategory = useCallback((id: string) =>
    audits.filter((a) => a.category === id).length, [audits])
  const countRiskCategory = useCallback((id: string) =>
    risks.filter((r) => r.category === id).length, [risks])

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-900 font-display">
          {t('listsAndCategories.title')}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {t('listsAndCategories.subtitle')}
        </p>
      </div>
      <div className="p-6 space-y-6 bg-slate-50">

        {/* SAMA letter type */}
        <ListSection
          title={t('listsAndCategories.sectionLetterType')}
          description={t('listsAndCategories.sectionLetterTypeDesc')}
          items={letterType.types}
          countUsage={countLetterType}
          onAdd={letterType.add}
          onEdit={(id, label, labelAr) => letterType.update(id, { label, labelAr })}
          onDelete={letterType.remove}
          isRTL={isRTL}
          t={t}
        />

        {/* Per-framework sub-categories — one launcher button per enabled
            framework, opening a modal with the EditableSelect for that
            framework's sub-category list. Replaces the inline SAMA-only
            ListSection per round-3 §5. */}
        <FrameworkSubCategoryLauncher
          isRTL={isRTL}
          t={t}
        />


        {/* Correspondence type (Agent D) */}
        {correspondenceType && (
          <ListSection
            title={t('listsAndCategories.sectionCorrespondenceType')}
            items={correspondenceType.types}
            countUsage={countCorrespondenceType}
            onAdd={correspondenceType.add}
            onEdit={(id, label, labelAr) => correspondenceType.update(id, { label, labelAr })}
            onDelete={correspondenceType.remove}
            isRTL={isRTL}
            t={t}
          />
        )}

        {/* Calendar event type (Agent D) */}
        {calendarEventType && (
          <ListSection
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

        {/* Advisory business unit (Agent D) */}
        {businessUnits && (
          <ListSection
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

        {/* Onboarding industry/region/headcount sections removed per Round 3 §2.2.
            Their stores remain on disk for future RBAC work. */}

        {/* Policy / Training / Audit / Risk categories (mine) */}
        <ListSection
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
        <ListSection
          title={t('listsAndCategories.sectionTrainingCategory')}
          description={t('listsAndCategories.sectionTrainingCategoryDesc')}
          items={trainingCat.categories}
          countUsage={countTrainingCategory}
          onAdd={trainingCat.add}
          onEdit={(id, label, labelAr) => trainingCat.update(id, { label, labelAr })}
          onDelete={trainingCat.remove}
          onResetSection={trainingCat.resetToDefaults}
          isRTL={isRTL}
          t={t}
        />
        <ListSection
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
        <ListSection
          title={t('listsAndCategories.sectionRiskCategory')}
          description={t('listsAndCategories.sectionRiskCategoryDesc')}
          items={riskCat.categories}
          countUsage={countRiskCategory}
          onAdd={riskCat.add}
          onEdit={(id, label, labelAr) => riskCat.update(id, { label, labelAr })}
          onDelete={riskCat.remove}
          onResetSection={riskCat.resetToDefaults}
          isRTL={isRTL}
          t={t}
        />
      </div>
    </section>
  )
}
