'use client'

import { memo, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { ObservationSource, ObservationSeverity, sourceConfig } from './observation-types'
import type { TeamMember, RegulatoryBodyId } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { EditableSelect } from '@/components/ui/editable-select'

// Department keys for translation lookup (kept for backward compatibility)
export const departmentKeys: Record<string, string> = {
  'IT & Cybersecurity': 'observations.departments.itCybersecurity',
  'Human Resources': 'observations.departments.humanResources',
  'Risk Management': 'observations.departments.riskManagement',
  'Operations': 'observations.departments.operations',
  'Legal': 'observations.departments.legal',
  'Compliance': 'observations.departments.compliance',
  'Finance': 'observations.departments.finance',
}

export const departments = Object.keys(departmentKeys)

export interface ObservationFormFieldsProps {
  values: {
    source: ObservationSource
    severity: ObservationSeverity
    department: string
    assignees: TeamMember[]
    dueDate: string
  }
  onChange: (field: string, value: unknown) => void
  availableMembers: TeamMember[]
  errors?: Record<string, string>
  isRTL: boolean
}

// Source Selection Cards.
// Correspondence-based sources are filtered at runtime by which frameworks
// are enabled in settings. 'internal' is always available.
const SOURCE_ORDER: ObservationSource[] = ['sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'citc', 'sharia', 'internal']

// Maps each observation source to the framework-config id that governs it.
// 'internal' has no framework — always shown.
const SOURCE_TO_FRAMEWORK_ID: Record<ObservationSource, RegulatoryBodyId | null> = {
  sama:     'sama',
  cma:      'cma',
  ia:       'ia',
  zatca:    'zatca',
  misa:     'misa',
  safiu:    'safiu',
  citc:     'citc',
  internal: null,
  sharia:   'sharia-board',
}

const SOURCE_LABEL_KEYS: Record<ObservationSource, string> = {
  sama:     'observations.sama',
  cma:      'observations.sources.cma',
  ia:       'observations.sources.ia',
  zatca:    'observations.sources.zatca',
  misa:     'observations.sources.misa',
  safiu:    'observations.sources.safiu',
  citc:     'observations.sources.citc',
  internal: 'observations.sources.internal',
  sharia:   'observations.sources.sharia',
}

export const SourceSelectionField = memo(function SourceSelectionField({
  value,
  onChange,
}: {
  value: ObservationSource
  onChange: (source: ObservationSource) => void
}) {
  const { t, isRTL } = useTranslation()
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)

  // Build the picker options directly from the framework store so
  // user-added custom correspondence frameworks surface automatically.
  // 'Internal' is always available; the currently-selected source stays
  // visible even if its backing framework was later disabled.
  type Option = { source: string; label: string; icon: string; iconColor: string }
  const options = useMemo<Option[]>(() => {
    const seedOpts: Option[] = SOURCE_ORDER
      .filter((source) => {
        if (source === 'internal' || source === value) return true
        const fwId = SOURCE_TO_FRAMEWORK_ID[source as keyof typeof SOURCE_TO_FRAMEWORK_ID]
        if (!fwId) return true
        const fw = frameworks.find((f) => f.id === fwId)
        return !!fw?.enabled && !!fw.correspondenceBased
      })
      .map((source) => ({
        source,
        label: t(SOURCE_LABEL_KEYS[source] as TranslationKey),
        icon: sourceConfig[source].icon,
        iconColor: sourceConfig[source].iconColor,
      }))

    // Custom enabled correspondence frameworks (not already in SOURCE_ORDER
    // and not mapped to a seed source) tack on at the end.
    const seedFwIds = new Set(
      Object.values(SOURCE_TO_FRAMEWORK_ID).filter((v): v is NonNullable<typeof v> => !!v)
    )
    const customOpts: Option[] = frameworks
      .filter((f) => f.enabled && f.correspondenceBased && !seedFwIds.has(f.id))
      .map((f) => ({
        source: f.id,
        label: isRTL ? f.nameAr : f.name,
        icon: f.icon,
        iconColor: `text-${f.iconColor}-500`,
      }))

    return [...seedOpts, ...customOpts]
  }, [frameworks, value, t, isRTL])

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block`}>
        {t('observations.form.sourceSelection')}
      </label>
      <div className="grid grid-cols-4 gap-3">
        {options.map((opt) => {
          const isSelected = value === opt.source
          return (
            <button
              key={opt.source}
              type="button"
              onClick={() => onChange(opt.source)}
              className={`p-3 border rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                  : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
              }`}
            >
              <Icon icon={opt.icon} className={`text-2xl ${opt.iconColor}`} />
              <span className="text-xs font-bold text-slate-900">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})

// Severity Dropdown
export const SeverityField = memo(function SeverityField({
  value,
  onChange,
  error,
}: {
  value: ObservationSeverity
  onChange: (severity: ObservationSeverity) => void
  error?: string
}) {
  const { t } = useTranslation()

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
        {t('observations.severity')}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ObservationSeverity)}
        className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
      >
        <option value="critical">{t('observations.severityOptions.critical')}</option>
        <option value="high">{t('observations.severityOptions.high')}</option>
        <option value="medium">{t('observations.severityOptions.medium')}</option>
        <option value="low">{t('observations.severityOptions.low')}</option>
      </select>
      {error ? <p className="text-rose-500 text-xs mt-1">{error}</p> : null}
    </div>
  )
})

// Department Dropdown
export const DepartmentField = memo(function DepartmentField({
  value,
  onChange,
  onBlur,
  showEmpty = false,
  error,
  required = false,
}: {
  value: string
  onChange: (department: string) => void
  onBlur?: () => void
  showEmpty?: boolean
  error?: string
  required?: boolean
}) {
  const { t, isRTL } = useTranslation()
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
        {t('observations.form.departmentAssignment')} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <EditableSelect
        value={allDepartments.find((d) => d.name === value)?.id ?? null}
        onChange={(id) => {
          const dept = allDepartments.find((d) => d.id === id)
          onChange(dept ? dept.name : '')
          onBlur?.()
        }}
        items={allDepartments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
        placeholder={t('observations.form.selectDepartment')}
        onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
        onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
        onDelete={(id) => removeDepartment(id)}
        isRTL={isRTL}
      />
      {error ? <p className="text-rose-500 text-xs mt-1">{error}</p> : null}
    </div>
  )
})

// Assignee Multi-select
export const AssigneeField = memo(function AssigneeField({
  selectedAssignees,
  availableMembers,
  onChange,
  isRTL,
  error,
  required = false,
}: {
  selectedAssignees: TeamMember[]
  availableMembers: TeamMember[]
  onChange: (assignees: TeamMember[]) => void
  isRTL: boolean
  error?: string
  required?: boolean
}) {
  const { t } = useTranslation()

  const handleAdd = (memberId: string) => {
    const member = availableMembers.find(m => m.id === memberId)
    if (member && !selectedAssignees.find(m => m.id === member.id)) {
      onChange([...selectedAssignees, member])
    }
  }

  const handleRemove = (memberId: string) => {
    onChange(selectedAssignees.filter(m => m.id !== memberId))
  }

  const filteredMembers = availableMembers.filter(
    m => !selectedAssignees.find(s => s.id === m.id)
  )

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
        {t('observations.form.assignees')} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      {/* Selected assignees as chips */}
      {selectedAssignees.length > 0 ? (
        <div className={`flex flex-wrap gap-2 mb-3 max-h-20 overflow-y-auto`}>
          {selectedAssignees.map(member => (
            <span
              key={member.id}
              className={`flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-slate-700`}
            >
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                className="w-5 h-5 rounded-full"
                alt={member.name}
              />
              {member.name}
              <button
                type="button"
                onClick={() => handleRemove(member.id)}
                className="text-slate-400 hover:text-rose-500 transition-colors"
              >
                <Icon icon="lucide:x" className="text-sm" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {/* Dropdown to add more */}
      <div className="relative">
        <Icon
          icon="lucide:user-plus"
          className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
        />
        <select
          value=""
          onChange={(e) => handleAdd(e.target.value)}
          className={`w-full pl-10 pr-8 py-3 bg-slate-50 border ${error ? 'border-rose-300' : 'border-slate-200'} rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500`}
        >
          <option value="">{t('observations.form.addAssignee')}</option>
          {filteredMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} - {member.role} ({member.department})
            </option>
          ))}
        </select>
        <Icon
          icon="lucide:chevron-down"
          className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
        />
      </div>
      {error ? <p className="text-rose-500 text-xs mt-1">{error}</p> : null}
    </div>
  )
})

// Due Date Picker
export const DueDateField = memo(function DueDateField({
  value,
  onChange,
  onBlur,
  error,
  required = false,
}: {
  value: string
  onChange: (date: string) => void
  onBlur?: () => void
  error?: string
  required?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
        {t('observations.dueDate')} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full px-4 py-3 bg-slate-50 border ${error ? 'border-rose-300' : 'border-slate-200'} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
      />
      {error ? <p className="text-rose-500 text-xs mt-1">{error}</p> : null}
    </div>
  )
})
