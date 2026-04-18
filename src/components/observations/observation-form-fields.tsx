'use client'

import { memo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { ObservationSource, ObservationSeverity, sourceConfig } from './observation-types'
import type { TeamMember } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'

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

// Source Selection Cards — covers correspondence authorities + legacy internal/sharia.
// Authorities first so they surface as primary options.
const SOURCE_ORDER: ObservationSource[] = ['sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'internal', 'sharia']

const SOURCE_LABEL_KEYS: Record<ObservationSource, string> = {
  sama:     'observations.sama',
  cma:      'observations.sources.cma',
  ia:       'observations.sources.ia',
  zatca:    'observations.sources.zatca',
  misa:     'observations.sources.misa',
  safiu:    'observations.sources.safiu',
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
  const { t } = useTranslation()

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block`}>
        {t('observations.form.sourceSelection')}
      </label>
      <div className="grid grid-cols-4 gap-3">
        {SOURCE_ORDER.map((source) => {
          const config = sourceConfig[source]
          const isSelected = value === source
          return (
            <button
              key={source}
              type="button"
              onClick={() => onChange(source)}
              className={`p-3 border rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                  : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
              }`}
            >
              <Icon icon={config.icon} className={`text-2xl ${config.iconColor}`} />
              <span className="text-xs font-bold text-slate-900">
                {t(SOURCE_LABEL_KEYS[source] as TranslationKey)}
              </span>
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
  const { t, language } = useTranslation()
  const { departments: allDepartments } = useDepartmentStore()

  return (
    <div>
      <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
        {t('observations.form.departmentAssignment')} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full px-4 py-3 bg-slate-50 border ${error ? 'border-rose-300' : 'border-slate-200'} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
      >
        <option value="">{t('observations.form.selectDepartment')}</option>
        {allDepartments.map((dept) => (
          <option key={dept.id} value={dept.name}>
            {language === 'ar' ? dept.nameAr : dept.name}
          </option>
        ))}
      </select>
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
