'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { useTranslation } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import type { PolicyTemplate, PolicyCategory, PolicyApprovalTier, AuditFrequency, FrequencySchedule } from '@/types'

type SortCol = 'name' | 'category' | 'updatedAt' | 'usageCount'

const POLICY_CATEGORIES: PolicyCategory[] = ['compliance', 'it', 'operations', 'risk', 'hr', 'finance']
const APPROVAL_TIERS: PolicyApprovalTier[] = ['board', 'management', 'sharia', 'agm']

const FREQ_LABELS: Record<AuditFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  annual: 'Annual',
  ad_hoc: 'Ad-Hoc',
}

export function PolicyTemplatesSection() {
  const { t } = useTranslation()
  const { templates, create, update, delete: deleteTemplate } = usePolicyTemplateStore()
  const [sort, setSort] = useState<SortState<SortCol>>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

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
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.policyTemplates')}</h2>
          <p className="text-sm text-slate-500">{t('settings.standardizePolicies')}</p>
        </div>
        <RoleGuard adminOnly hidden>
          <Button variant="dark" onClick={() => setIsCreateOpen(true)}>
            <Icon icon="lucide:plus" />
            {t('settings.newTemplate')}
          </Button>
        </RoleGuard>
      </div>
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
            {sorted.map((tmpl) => (
              <tr key={tmpl.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <Icon icon="lucide:file-text" className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-700">{tmpl.name}</span>
                  </div>
                </td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500 capitalize">{tmpl.category}</td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500 capitalize">{tmpl.approvalTier}</td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500">{tmpl.frequency ? FREQ_LABELS[tmpl.frequency] : '—'}</td>
                <td className="px-8 py-4 text-xs text-slate-500">{tmpl.updatedAt}</td>
                <td className="px-8 py-4">
                  <span className="text-xs font-bold text-slate-600">{tmpl.usageCount}</span>
                </td>
                <td className="px-8 py-4 text-end">
                  <RoleGuard editOnly hidden>
                    <button
                      onClick={() => setEditId(tmpl.id)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:edit-3" />
                    </button>
                  </RoleGuard>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <PolicyTemplateFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={(data) => { create(data); setIsCreateOpen(false) }}
        t={t}
      />

      {/* Edit Modal */}
      {editTemplate && (
        <PolicyTemplateFormModal
          isOpen={!!editId}
          onClose={() => setEditId(null)}
          template={editTemplate}
          onSave={(data) => { update(editTemplate.id, data); setEditId(null) }}
          onDelete={() => { deleteTemplate(editTemplate.id); setEditId(null) }}
          t={t}
        />
      )}
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
}: {
  isOpen: boolean
  onClose: () => void
  template?: PolicyTemplate
  onSave: (data: any) => void
  onDelete?: () => void
  t: (key: any) => string
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [category, setCategory] = useState<PolicyCategory>(template?.category ?? 'compliance')
  const [approvalTier, setApprovalTier] = useState<PolicyApprovalTier>(template?.approvalTier ?? 'management')
  const [frequency, setFrequency] = useState<AuditFrequency>(template?.frequency ?? 'annual')
  const [dayOfMonth, setDayOfMonth] = useState(template?.frequencySchedule?.dayOfMonth ?? 1)
  const [monthInQuarter, setMonthInQuarter] = useState<1 | 2 | 3>(template?.frequencySchedule?.monthInQuarter ?? 1)
  const [monthOfYear, setMonthOfYear] = useState(template?.frequencySchedule?.monthOfYear ?? 1)
  const [adhocDate, setAdhocDate] = useState(template?.frequencySchedule?.adhocDate ?? '')
  const [description, setDescription] = useState(template?.defaultDescription ?? '')
  const [status, setStatus] = useState<'active' | 'draft'>(template?.status ?? 'active')

  function buildSchedule(): FrequencySchedule | undefined {
    if (frequency === 'ad_hoc') return adhocDate ? { adhocDate } : undefined
    if (frequency === 'monthly') return { dayOfMonth }
    if (frequency === 'quarterly') return { monthInQuarter, dayOfMonth }
    if (frequency === 'semi_annual') return { monthOfYear: Math.min(monthOfYear, 6), dayOfMonth }
    if (frequency === 'annual') return { monthOfYear, dayOfMonth }
    return undefined
  }

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name,
      category,
      approvalTier,
      frequency,
      frequencySchedule: buildSchedule(),
      defaultDescription: description,
      defaultWorkflowSteps: template?.defaultWorkflowSteps ?? [],
      versionPattern: template?.versionPattern ?? 'v{major}.{minor}',
      framework: template?.framework,
      status,
    })
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
        <Input label={t('settings.templateNameLabel')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as PolicyCategory)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              {POLICY_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.approvalTier')}</label>
            <select value={approvalTier} onChange={(e) => setApprovalTier(e.target.value as PolicyApprovalTier)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              {APPROVAL_TIERS.map((tier) => (
                <option key={tier} value={tier} className="capitalize">{tier}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.reviewFrequency')}</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as AuditFrequency)}
            className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semi_annual">Semi-Annual</option>
            <option value="annual">Annual</option>
            <option value="ad_hoc">Ad-Hoc</option>
          </select>
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
                  <select
                    value={monthInQuarter}
                    onChange={(e) => setMonthInQuarter(Number(e.target.value) as 1 | 2 | 3)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value={1}>{t('settings.firstMonth')}</option>
                    <option value={2}>{t('settings.secondMonth')}</option>
                    <option value={3}>{t('settings.thirdMonth')}</option>
                  </select>
                </div>
              )}
              {(frequency === 'semi_annual' || frequency === 'annual') && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.selectMonth')}</label>
                  <select
                    value={monthOfYear}
                    onChange={(e) => setMonthOfYear(Number(e.target.value))}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {Array.from({ length: frequency === 'semi_annual' ? 6 : 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2026, i, 1).toLocaleString('en', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.dayOfMonth')}</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
                  className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templateDescription')}</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.describePurposeScope')}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
          />
        </div>
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          {onDelete && (
            <RoleGuard deleteOnly hidden>
              <button onClick={onDelete} className="px-4 py-2 text-sm font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer">
                {t('settings.deleteTemplate')}
              </button>
            </RoleGuard>
          )}
          <Button variant="primary" className="flex-1" onClick={handleSave}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
