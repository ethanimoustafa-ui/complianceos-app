'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { EditableSelect } from '@/components/ui/editable-select'
import { formatLocalizedDate } from '@/lib/format/format-date'
import type { PolicyTemplate, PolicyCategory, PolicyApprovalTier, AuditFrequency, FrequencySchedule } from '@/types'

type SortCol = 'name' | 'category' | 'updatedAt' | 'usageCount'

const POLICY_CATEGORIES: PolicyCategory[] = ['compliance', 'it', 'operations', 'risk', 'hr', 'finance']
const APPROVAL_TIERS: PolicyApprovalTier[] = ['board', 'management', 'sharia', 'agm']

// Day-of-month must be a whole number in 1–28 (valid in February). Floors the
// input and rejects NaN/decimals/exponents so e.g. "2.5" can't slip through.
function clampDayOfMonth(raw: string): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.min(28, Math.max(1, n)) : 1
}

export function PolicyTemplatesSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const { templates, create, update, delete: deleteTemplate } = usePolicyTemplateStore()
  const isLoading = usePolicyTemplateStore((s) => s.isLoading)
  const fetchTemplates = usePolicyTemplateStore((s) => s.fetchAll)
  // Primary surface for policy templates now (configurables hub) — self-hydrate.
  useEffect(() => { void fetchTemplates() }, [fetchTemplates])

  const CATEGORY_LABELS: Record<PolicyCategory, string> = {
    compliance: t('policies.categoryCompliance'),
    it: t('policies.categoryIt'),
    operations: t('policies.categoryOperations'),
    risk: t('policies.categoryRisk'),
    hr: t('policies.categoryHr'),
    finance: t('policies.categoryFinance'),
  }

  const TIER_LABELS: Record<PolicyApprovalTier, string> = {
    board: t('policies.tierBoard'),
    management: t('policies.tierManagement'),
    managerial: t('policies.tierManagerial'),
    sharia: t('policies.tierSharia'),
    agm: t('policies.tierAgm'),
    audit_committee: t('policies.tierAuditCommittee'),
    other: t('policies.tierOther'),
  }

  const FREQ_LABELS: Record<AuditFrequency, string> = {
    monthly: t('settings.freqMonthly'),
    quarterly: t('settings.freqQuarterly'),
    semi_annual: t('settings.freqSemiAnnual'),
    annual: t('settings.freqAnnual'),
    ad_hoc: t('settings.freqAdHoc'),
  }

  const [sort, setSort] = useState<SortState<SortCol>>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  // Row-level delete (owner: templates couldn't be deleted without opening the
  // editor). delete() is optimistic, so the row vanishes instantly on confirm.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)
  const pendingDeleteTemplate = pendingDeleteId ? templates.find((t) => t.id === pendingDeleteId) : null

  async function confirmRowDelete() {
    if (!pendingDeleteId) return
    setRowDeleting(true)
    try {
      await deleteTemplate(pendingDeleteId)
    } finally {
      setRowDeleting(false)
      setPendingDeleteId(null)
    }
  }

  const sorted = useMemo(() => {
    const list = [...templates]
    if (!sort) return list
    return list.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const col = sort.col
      if (col === 'name') return dir * a.name.localeCompare(b.name)
      if (col === 'category') return dir * a.category.localeCompare(b.category)
      if (col === 'updatedAt') return dir * a.updatedAt.localeCompare(b.updatedAt)
      if (col === 'usageCount') return dir * (a.usageCount - b.usageCount)
      return 0
    })
  }, [templates, sort])

  function handleSort(col: SortCol) {
    setSort((prev) => {
      if (prev?.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col, dir: 'asc' }
    })
  }

  const editTemplate = editId ? templates.find((t) => t.id === editId) : null

  return (
    <section className={embedded ? '' : 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}>
      <div className={embedded ? 'flex items-center justify-end pb-4' : 'p-8 border-b border-slate-100 flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.policyTemplates')}</h2>
            <p className="text-sm text-slate-500">{t('settings.standardizePolicies')}</p>
          </div>
        )}
        <Gate perm="Manage Policy Templates">
          <Button variant="dark" onClick={() => setIsCreateOpen(true)}>
            <Icon icon="lucide:plus" />
            {t('settings.newTemplate')}
          </Button>
        </Gate>
      </div>
      {isLoading && templates.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={6} /></div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <SortHeader label={t('settings.templateNameCol')} column="name" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <SortHeader label={t('settings.categoryCol')} column="category" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('settings.approvalTier')}
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('settings.reviewFrequency')}
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <SortHeader label={t('settings.lastModifiedCol')} column="updatedAt" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <SortHeader label={t('settings.usageCol')} column="usageCount" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-end">
                {t('settings.actionsCol')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-8 py-12 text-center text-xs text-slate-400 italic">
                  {t('listsAndCategories.empty')}
                </td>
              </tr>
            )}
            {sorted.map((tmpl) => (
              <tr key={tmpl.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <Icon icon="lucide:file-text" className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-700">{isRTL ? (tmpl.nameAr || tmpl.name) : tmpl.name}</span>
                  </div>
                </td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500 capitalize">{CATEGORY_LABELS[tmpl.category] ?? tmpl.category}</td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500 capitalize">{TIER_LABELS[tmpl.approvalTier] ?? tmpl.approvalTier}</td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500">{tmpl.frequency ? FREQ_LABELS[tmpl.frequency] : '—'}</td>
                <td className="px-8 py-4 text-xs text-slate-500">{formatLocalizedDate(tmpl.updatedAt, isRTL ? 'ar' : 'en')}</td>
                <td className="px-8 py-4">
                  <span className="text-xs font-bold text-slate-600">{tmpl.usageCount}</span>
                </td>
                <td className="px-8 py-4 text-end">
                  <Gate perm="Manage Policy Templates">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setEditId(tmpl.id)}
                        className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer p-1.5 rounded-md hover:bg-emerald-50"
                        aria-label={t('common.edit')}
                      >
                        <Icon icon="lucide:edit-3" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(tmpl.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1.5 rounded-md hover:bg-rose-50"
                        aria-label={t('settings.deleteTemplate')}
                      >
                        <Icon icon="lucide:trash-2" />
                      </button>
                    </div>
                  </Gate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Create Modal — create() is optimistic (returns synchronously), so the
          modal closes immediately on save. */}
      <PolicyTemplateFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={(data) => { create(data); return true }}
        t={t}
        isRTL={isRTL}
      />

      {/* Edit Modal — onSave/onDelete are awaitable + return a success flag; the
          modal shows an in-flight spinner and only closes once the server
          confirms (W37: was fire-and-forget, so Delete looked like it "did
          nothing" and a server failure silently rolled the row back). */}
      {editTemplate && (
        <PolicyTemplateFormModal
          isOpen={!!editId}
          onClose={() => setEditId(null)}
          template={editTemplate}
          onSave={(data) => update(editTemplate.id, data)}
          onDelete={() => deleteTemplate(editTemplate.id)}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* Row-level delete confirmation. */}
      <Modal
        isOpen={pendingDeleteId !== null}
        onClose={() => !rowDeleting && setPendingDeleteId(null)}
        title={t('listsAndCategories.deleteTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('listsAndCategories.deleteConfirmSimple', { label: pendingDeleteTemplate?.name ?? '' })}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPendingDeleteId(null)} disabled={rowDeleting}>{t('common.cancel')}</Button>
            <LoadingButton variant="danger" loading={rowDeleting} loadingLabel={t('common.deleting')} onClick={() => void confirmRowDelete()}>
              {t('listsAndCategories.deleteConfirmAction')}
            </LoadingButton>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function PolicyTemplateFormModal({
  isOpen,
  onClose,
  template,
  onSave,
  onDelete,
  t,
  isRTL,
}: {
  isOpen: boolean
  onClose: () => void
  template?: PolicyTemplate
  // W37: return a success flag (sync or async) so the modal can await the
  // server, show a spinner, and only close on confirmed success.
  onSave: (data: any) => boolean | Promise<boolean>
  onDelete?: () => boolean | Promise<boolean>
  t: (key: any) => string
  isRTL: boolean
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [nameAr, setNameAr] = useState(template?.nameAr ?? '')
  const [category, setCategory] = useState<PolicyCategory>(template?.category ?? 'compliance')
  const [approvalTier, setApprovalTier] = useState<PolicyApprovalTier>(template?.approvalTier ?? 'management')
  const [frequency, setFrequency] = useState<AuditFrequency>(template?.frequency ?? 'annual')
  const [dayOfMonth, setDayOfMonth] = useState(template?.frequencySchedule?.dayOfMonth ?? 1)
  const [monthInQuarter, setMonthInQuarter] = useState<1 | 2 | 3>(template?.frequencySchedule?.monthInQuarter ?? 1)
  const [monthOfYear, setMonthOfYear] = useState(template?.frequencySchedule?.monthOfYear ?? 1)
  const [adhocDate, setAdhocDate] = useState(template?.frequencySchedule?.adhocDate ?? '')
  const [description, setDescription] = useState(template?.defaultDescription ?? '')
  const [descriptionAr, setDescriptionAr] = useState(template?.defaultDescriptionAr ?? '')
  const [status] = useState<'active' | 'draft'>(template?.status ?? 'active')
  // W37: in-flight + failure state so Save/Delete show a spinner and only close
  // on confirmed success; a server failure keeps the modal open and surfaces why.
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // W37: capture the failure message into LOCAL state at the moment an action
  // fails (rather than subscribing to the live store error) so a stale error
  // from an unrelated template op can never leak into this modal instance.
  const [actionError, setActionError] = useState<string | null>(null)
  const busy = isSaving || isDeleting

  function buildSchedule(): FrequencySchedule | undefined {
    if (frequency === 'ad_hoc') return adhocDate ? { adhocDate } : undefined
    if (frequency === 'monthly') return { dayOfMonth }
    if (frequency === 'quarterly') return { monthInQuarter, dayOfMonth }
    if (frequency === 'semi_annual') return { monthOfYear: Math.min(monthOfYear, 6), dayOfMonth }
    if (frequency === 'annual') return { monthOfYear, dayOfMonth }
    return undefined
  }

  async function handleSave() {
    if (!name.trim() || busy) return
    setActionError(null)
    setIsSaving(true)
    try {
      const ok = await onSave({
        name,
        nameAr: nameAr || undefined,
        category,
        approvalTier,
        frequency,
        frequencySchedule: buildSchedule(),
        defaultDescription: description,
        defaultDescriptionAr: descriptionAr || undefined,
        defaultWorkflowSteps: template?.defaultWorkflowSteps ?? [],
        versionPattern: template?.versionPattern ?? 'v{major}.{minor}',
        framework: template?.framework,
        status,
      })
      // The store sets `error` (errorMessage) before resolving false; surface it.
      if (ok) onClose()
      else setActionError(usePolicyTemplateStore.getState().error)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete || busy) return
    setActionError(null)
    setIsDeleting(true)
    try {
      const ok = await onDelete()
      // The store sets `error` (errorMessage) before resolving false; surface it.
      if (ok) onClose()
      else setActionError(usePolicyTemplateStore.getState().error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? t('settings.editTemplate') : t('settings.createNewTemplate')}
      subtitle={template ? template.name : t('settings.standardizePolicies')}
      size="md"
    >
      <div className="space-y-4">
        <Input label={t('settings.nameEnglish')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} />
        <Input label={t('settings.nameArabic')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} dir="rtl" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <EditableSelect
              locked
              value={category}
              onChange={(id) => setCategory(id as PolicyCategory)}
              items={POLICY_CATEGORIES.map((c) => ({
                id: c,
                label:
                  c === 'compliance' ? t('policies.categoryCompliance') :
                  c === 'it' ? t('policies.categoryIt') :
                  c === 'operations' ? t('policies.categoryOperations') :
                  c === 'risk' ? t('policies.categoryRisk') :
                  c === 'hr' ? t('policies.categoryHr') :
                  t('policies.categoryFinance'),
              }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.approvalTier')}</label>
            <EditableSelect
              locked
              value={approvalTier}
              onChange={(id) => setApprovalTier(id as PolicyApprovalTier)}
              items={APPROVAL_TIERS.map((tier) => ({
                id: tier,
                label:
                  tier === 'board' ? t('policies.tierBoard') :
                  tier === 'management' ? t('policies.tierManagement') :
                  tier === 'sharia' ? t('policies.tierSharia') :
                  t('policies.tierAgm'),
              }))}
            />
          </div>
        </div>
        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.reviewFrequency')}</label>
          <EditableSelect
            locked
            value={frequency}
            onChange={(id) => setFrequency(id as AuditFrequency)}
            items={[
              { id: 'monthly', label: t('settings.freqMonthly') },
              { id: 'quarterly', label: t('settings.freqQuarterly') },
              { id: 'semi_annual', label: t('settings.freqSemiAnnual') },
              { id: 'annual', label: t('settings.freqAnnual') },
              { id: 'ad_hoc', label: t('settings.freqAdHoc') },
            ]}
          />
        </div>
        {/* Frequency Schedule Picker */}
        {frequency === 'ad_hoc' && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-2">
            <label className="block text-xs font-medium text-slate-500">{t('settings.adhocDateLabel')}</label>
            <input
              type="date"
              value={adhocDate}
              onChange={(e) => setAdhocDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-[11px] text-slate-400">{t('settings.adhocDateHint')}</p>
          </div>
        )}
        {frequency !== 'ad_hoc' && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-medium text-slate-500">{t('settings.frequencyScheduleHint')}</p>
            <div className="flex gap-3 flex-wrap">
              {frequency === 'quarterly' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.monthInQuarter')}</label>
                  <EditableSelect
                    locked
                    value={String(monthInQuarter)}
                    onChange={(id) => setMonthInQuarter(Number(id) as 1 | 2 | 3)}
                    items={[
                      { id: '1', label: t('settings.firstMonth') },
                      { id: '2', label: t('settings.secondMonth') },
                      { id: '3', label: t('settings.thirdMonth') },
                    ]}
                  />
                </div>
              )}
              {(frequency === 'semi_annual' || frequency === 'annual') && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.selectMonth')}</label>
                  <EditableSelect
                    locked
                    value={String(monthOfYear)}
                    onChange={(id) => setMonthOfYear(Number(id))}
                    items={Array.from({ length: frequency === 'semi_annual' ? 6 : 12 }, (_, i) => ({
                      id: String(i + 1),
                      label: new Date(2026, i, 1).toLocaleString(isRTL ? 'ar' : 'en', { month: 'long' }),
                    }))}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.dayOfMonth')}</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  step={1}
                  inputMode="numeric"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(clampDayOfMonth(e.target.value))}
                  onKeyDown={(e) => { if (['.', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault() }}
                  className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.descriptionEnglish')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.describePurposeScope')}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.descriptionArabic')}</label>
          <textarea
            rows={3}
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            placeholder={t('settings.describePurposeScope')}
            dir="rtl"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />
        </div>
        {!name.trim() && (
          <p className="text-xs text-rose-600 text-end">
            Missing required: {t('settings.nameEnglish')}
          </p>
        )}
        {actionError && (
          <p className="text-xs text-rose-600 text-end">{actionError}</p>
        )}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          {onDelete && (
            <Gate perm="Manage Policy Templates">
              <button
                onClick={() => void handleDelete()}
                disabled={busy}
                aria-busy={isDeleting || undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting && <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />}
                {isDeleting ? t('common.deleting') : t('settings.deleteTemplate')}
              </button>
            </Gate>
          )}
          <LoadingButton
            variant="primary"
            className="flex-1"
            loading={isSaving}
            loadingLabel={t('common.saving')}
            disabled={!name.trim() || busy}
            onClick={() => void handleSave()}
          >
            {t('common.saveChanges')}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
