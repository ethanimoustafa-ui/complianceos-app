'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useTranslation } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import type { AuditTemplate, AuditTemplateCategory, AuditPriority, AuditFrequency, FrequencySchedule } from '@/types'

type SortCol = 'name' | 'category' | 'updatedAt' | 'usageCount'

const CATEGORIES: AuditTemplateCategory[] = [
  'security-compliance', 'financial-compliance', 'regulatory-compliance',
  'operational-compliance', 'data-privacy', 'sharia-compliance', 'internal-controls', 'custom',
]

const CATEGORY_LABELS: Record<AuditTemplateCategory, string> = {
  'security-compliance': 'templateCategorySecurity',
  'financial-compliance': 'templateCategoryFinancial',
  'regulatory-compliance': 'templateCategoryRegulatory',
  'operational-compliance': 'templateCategoryOperational',
  'data-privacy': 'templateCategoryDataPrivacy',
  'sharia-compliance': 'templateCategorySharia',
  'internal-controls': 'templateCategoryInternalControls',
  'custom': 'templateCategoryCustom',
}

export function AuditTemplatesSection() {
  const { t } = useTranslation()
  const { templates, create, update, delete: deleteTemplate } = useAuditTemplateStore()
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
          <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.auditTemplates')}</h2>
          <p className="text-sm text-slate-500">{t('settings.standardizeChecks')}</p>
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
                    <Icon icon="lucide:file-check" className="text-emerald-500" />
                    <span className="text-sm font-bold text-slate-700">{tmpl.name}</span>
                  </div>
                </td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500">
                  {t(('settings.' + CATEGORY_LABELS[tmpl.category]) as any)}
                </td>
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
      <AuditTemplateFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={(data) => { create(data); setIsCreateOpen(false) }}
        t={t}
      />

      {/* Edit Modal */}
      {editTemplate && (
        <AuditTemplateFormModal
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

function AuditTemplateFormModal({
  isOpen,
  onClose,
  template,
  onSave,
  onDelete,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  template?: AuditTemplate
  onSave: (data: any) => void
  onDelete?: () => void
  t: (key: any) => string
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [auditType, setAuditType] = useState(template?.auditType ?? 'internal')
  const [category, setCategory] = useState<AuditTemplateCategory>(template?.category ?? 'security-compliance')
  const [priority, setPriority] = useState<AuditPriority>(template?.priority ?? 'medium')
  const [frequency, setFrequency] = useState<AuditFrequency>(template?.frequency ?? 'quarterly')
  const [dayOfMonth, setDayOfMonth] = useState(template?.frequencySchedule?.dayOfMonth ?? 1)
  const [monthInQuarter, setMonthInQuarter] = useState<1 | 2 | 3>(template?.frequencySchedule?.monthInQuarter ?? 1)
  const [monthOfYear, setMonthOfYear] = useState(template?.frequencySchedule?.monthOfYear ?? 1)
  const [adhocDate, setAdhocDate] = useState(template?.frequencySchedule?.adhocDate ?? '')
  const [description, setDescription] = useState(template?.defaultDescription ?? '')
  const [status, setStatus] = useState<'active' | 'draft'>(template?.status ?? 'active')

  // Reset on open
  useState(() => {
    if (template) {
      setName(template.name)
      setAuditType(template.auditType)
      setCategory(template.category)
      setPriority(template.priority)
      setFrequency(template.frequency)
      setDayOfMonth(template.frequencySchedule?.dayOfMonth ?? 1)
      setMonthInQuarter(template.frequencySchedule?.monthInQuarter ?? 1)
      setMonthOfYear(template.frequencySchedule?.monthOfYear ?? 1)
      setAdhocDate(template.frequencySchedule?.adhocDate ?? '')
      setDescription(template.defaultDescription)
      setStatus(template.status)
    }
  })

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
      auditType,
      category,
      priority,
      frequency,
      frequencySchedule: buildSchedule(),
      defaultTitle: name,
      defaultDescription: description,
      defaultChecklistItems: template?.defaultChecklistItems ?? [],
      defaultTeamRoles: template?.defaultTeamRoles ?? [],
      framework: template?.framework,
      status,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? t('settings.editTemplate') : t('settings.createNewTemplate')}
      subtitle={template ? template.name : t('settings.buildReusableTemplate')}
      size="md"
    >
      <div className="space-y-4">
        <Input label={t('settings.templateNameLabel')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templateType')}</label>
            <select value={auditType} onChange={(e) => setAuditType(e.target.value as any)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="internal">Internal</option>
              <option value="sama">SAMA</option>
              <option value="sharia">Sharia</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as AuditTemplateCategory)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(('settings.' + CATEGORY_LABELS[c]) as any)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templatePriority')}</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as AuditPriority)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templateFrequency')}</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as AuditFrequency)} className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option value="quarterly">Quarterly</option>
              <option value="semi_annual">Semi-Annual</option>
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="ad_hoc">Ad-Hoc</option>
            </select>
          </div>
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
              {(frequency === 'quarterly') && (
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
