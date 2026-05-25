'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { EditableSelect } from '@/components/ui/editable-select'
import type { AuditAuthority, AuditTemplate, AuditTemplateCategory, AuditPriority, AuditFrequency, FrequencySchedule } from '@/types'

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
  const { t, isRTL } = useTranslation()
  const { templates, create, update, delete: deleteTemplate } = useAuditTemplateStore()
  const isLoading = useAuditTemplateStore((s) => s.isLoading)
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
        <Gate perm="Manage Audit Templates">
          <Button variant="dark" onClick={() => setIsCreateOpen(true)}>
            <Icon icon="lucide:plus" />
            {t('settings.newTemplate')}
          </Button>
        </Gate>
      </div>
      {isLoading && templates.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={5} /></div>
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
                <td colSpan={5} className="px-8 py-12 text-center text-xs text-slate-400 italic">
                  {t('listsAndCategories.empty')}
                </td>
              </tr>
            )}
            {sorted.map((tmpl) => (
              <tr key={tmpl.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    {/* H1: show template's custom icon if set, else fall back to category default */}
                    <Icon
                      icon={tmpl.frequencySchedule?.templateIcon || 'lucide:file-check'}
                      className="text-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-700">{isRTL ? (tmpl.nameAr || tmpl.name) : tmpl.name}</span>
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
                  <Gate perm="Manage Audit Templates">
                    <button
                      onClick={() => setEditId(tmpl.id)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:edit-3" />
                    </button>
                  </Gate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Create Modal */}
      <AuditTemplateFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={(data) => { create(data); setIsCreateOpen(false) }}
        t={t}
        isRTL={isRTL}
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
          isRTL={isRTL}
        />
      )}
    </section>
  )
}

// H1: curated icon set for template icon picker — lucide icons via @iconify/react.
const TEMPLATE_ICONS: { id: string; label: string }[] = [
  { id: 'lucide:shield-check', label: 'Shield Check' },
  { id: 'lucide:file-check', label: 'File Check' },
  { id: 'lucide:clipboard-check', label: 'Clipboard Check' },
  { id: 'lucide:scale', label: 'Scale' },
  { id: 'lucide:lock', label: 'Lock' },
  { id: 'lucide:building-2', label: 'Building' },
  { id: 'lucide:landmark', label: 'Landmark' },
  { id: 'lucide:gavel', label: 'Gavel' },
  { id: 'lucide:search', label: 'Search' },
  { id: 'lucide:trending-up', label: 'Trending Up' },
  { id: 'lucide:bar-chart-2', label: 'Bar Chart' },
  { id: 'lucide:pie-chart', label: 'Pie Chart' },
  { id: 'lucide:database', label: 'Database' },
  { id: 'lucide:server', label: 'Server' },
  { id: 'lucide:cpu', label: 'CPU' },
  { id: 'lucide:users', label: 'Users' },
  { id: 'lucide:user-check', label: 'User Check' },
  { id: 'lucide:briefcase', label: 'Briefcase' },
  { id: 'lucide:dollar-sign', label: 'Dollar' },
  { id: 'lucide:credit-card', label: 'Credit Card' },
  { id: 'lucide:alert-triangle', label: 'Alert' },
  { id: 'lucide:activity', label: 'Activity' },
  { id: 'lucide:layers', label: 'Layers' },
  { id: 'lucide:settings', label: 'Settings' },
]

function AuditTemplateFormModal({
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
  template?: AuditTemplate
  onSave: (data: any) => void
  onDelete?: () => void
  t: (key: any) => string
  isRTL: boolean
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [nameAr, setNameAr] = useState(template?.nameAr ?? '')
  const [auditType, setAuditType] = useState(template?.auditType ?? 'internal')
  const [category, setCategory] = useState<AuditTemplateCategory>(template?.category ?? 'security-compliance')
  const [priority, setPriority] = useState<AuditPriority>(template?.priority ?? 'medium')
  const [frequency, setFrequency] = useState<AuditFrequency>(template?.frequency ?? 'quarterly')
  const [dayOfMonth, setDayOfMonth] = useState(template?.frequencySchedule?.dayOfMonth ?? 1)
  const [monthInQuarter, setMonthInQuarter] = useState<1 | 2 | 3>(template?.frequencySchedule?.monthInQuarter ?? 1)
  const [monthOfYear, setMonthOfYear] = useState(template?.frequencySchedule?.monthOfYear ?? 1)
  const [adhocDate, setAdhocDate] = useState(template?.frequencySchedule?.adhocDate ?? '')
  const [description, setDescription] = useState(template?.defaultDescription ?? '')
  const [descriptionAr, setDescriptionAr] = useState(template?.defaultDescriptionAr ?? '')
  const [status, setStatus] = useState<'active' | 'draft'>(template?.status ?? 'active')
  // H1: icon picker — stored in frequencySchedule.templateIcon (no DB column needed)
  const [templateIcon, setTemplateIcon] = useState(template?.frequencySchedule?.templateIcon ?? '')

  // Reset on open
  useState(() => {
    if (template) {
      setName(template.name)
      setNameAr(template.nameAr ?? '')
      setAuditType(template.auditType)
      setCategory(template.category)
      setPriority(template.priority)
      setFrequency(template.frequency)
      setDayOfMonth(template.frequencySchedule?.dayOfMonth ?? 1)
      setMonthInQuarter(template.frequencySchedule?.monthInQuarter ?? 1)
      setMonthOfYear(template.frequencySchedule?.monthOfYear ?? 1)
      setAdhocDate(template.frequencySchedule?.adhocDate ?? '')
      setDescription(template.defaultDescription)
      setDescriptionAr(template.defaultDescriptionAr ?? '')
      setStatus(template.status)
    }
  })

  function buildSchedule(): FrequencySchedule | undefined {
    // H1: always embed templateIcon when selected so it persists in the jsonb column.
    const icon = templateIcon || undefined
    if (frequency === 'ad_hoc') return adhocDate ? { adhocDate, templateIcon: icon } : (icon ? { templateIcon: icon } : undefined)
    if (frequency === 'monthly') return { dayOfMonth, templateIcon: icon }
    if (frequency === 'quarterly') return { monthInQuarter, dayOfMonth, templateIcon: icon }
    if (frequency === 'semi_annual') return { monthOfYear: Math.min(monthOfYear, 6), dayOfMonth, templateIcon: icon }
    if (frequency === 'annual') return { monthOfYear, dayOfMonth, templateIcon: icon }
    return icon ? { templateIcon: icon } : undefined
  }

  function handleSave() {
    if (!name.trim()) return
    onSave({
      name,
      nameAr: nameAr || undefined,
      auditType,
      category,
      priority,
      frequency,
      frequencySchedule: buildSchedule(),
      defaultTitle: name,
      defaultTitleAr: nameAr || undefined,
      defaultDescription: description,
      defaultDescriptionAr: descriptionAr || undefined,
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
        <Input label={t('settings.nameEnglish')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} />
        <Input label={t('settings.nameArabic')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={t('settings.templateNamePlaceholder')} dir="rtl" />
        <div className="grid grid-cols-2 gap-4">
          <AuditTypeSelect auditType={auditType} setAuditType={setAuditType} t={t} isRTL={isRTL} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <EditableSelect
              locked
              value={category}
              onChange={(id) => setCategory(id as AuditTemplateCategory)}
              items={CATEGORIES.map((c) => ({ id: c, label: t(('settings.' + CATEGORY_LABELS[c]) as any) }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templatePriority')}</label>
            <EditableSelect
              locked
              value={priority}
              onChange={(id) => setPriority(id as AuditPriority)}
              items={[
                { id: 'critical', label: t('settings.priorityCritical') },
                { id: 'high', label: t('settings.priorityHigh') },
                { id: 'medium', label: t('settings.priorityMedium') },
                { id: 'low', label: t('settings.priorityLow') },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templateFrequency')}</label>
            <EditableSelect
              locked
              value={frequency}
              onChange={(id) => setFrequency(id as AuditFrequency)}
              items={[
                { id: 'quarterly', label: t('settings.freqQuarterly') },
                { id: 'semi_annual', label: t('settings.freqSemiAnnual') },
                { id: 'annual', label: t('settings.freqAnnual') },
                { id: 'monthly', label: t('settings.freqMonthly') },
                { id: 'ad_hoc', label: t('settings.freqAdHoc') },
              ]}
            />
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
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
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
        {/* H1: Icon picker — compact SVG icon grid */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t('settings.templateIcon')}</label>
          <div className="grid grid-cols-8 gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
            {/* "None" option */}
            <button
              type="button"
              onClick={() => setTemplateIcon('')}
              title="No icon"
              className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                templateIcon === ''
                  ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400'
              }`}
            >
              —
            </button>
            {TEMPLATE_ICONS.map((ic) => (
              <button
                key={ic.id}
                type="button"
                onClick={() => setTemplateIcon(ic.id)}
                title={ic.label}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  templateIcon === ic.id
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-600'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
                }`}
              >
                <Icon icon={ic.id} className="text-base" />
              </button>
            ))}
          </div>
          {templateIcon && (
            <p className="mt-1 text-[11px] text-slate-400">{t('settings.selectedIcon')}: <span className="font-mono">{templateIcon}</span></p>
          )}
        </div>
        {!name.trim() && (
          <p className="text-xs text-rose-600 text-end">
            Missing required: {t('settings.nameEnglish')}
          </p>
        )}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          {onDelete && (
            <Gate perm="Manage Audit Templates">
              <button onClick={onDelete} className="px-4 py-2 text-sm font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer">
                {t('settings.deleteTemplate')}
              </button>
            </Gate>
          )}
          <LoadingButton variant="primary" className="flex-1" disabled={!name.trim()} onClick={handleSave}>
            {t('common.saveChanges')}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}

// Dynamic audit-type dropdown driven by enabled correspondence-based frameworks.
function AuditTypeSelect({
  auditType,
  setAuditType,
  t,
  isRTL,
}: {
  auditType: AuditAuthority
  setAuditType: (v: AuditAuthority) => void
  t: (key: any) => string
  isRTL: boolean
}) {
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const enabledCorrespondence = useMemo(
    () => frameworks.filter((f) => f.enabled && f.correspondenceBased),
    [frameworks]
  )
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.templateType')}</label>
      <EditableSelect
        locked
        value={auditType}
        onChange={(id) => setAuditType(id as AuditAuthority)}
        items={[
          { id: 'internal', label: t('auditDetail.internalAuditType') },
          ...enabledCorrespondence.map((fw) => ({
            id: fw.id,
            label: isRTL ? fw.nameAr : fw.name,
          })),
        ]}
      />
    </div>
  )
}
