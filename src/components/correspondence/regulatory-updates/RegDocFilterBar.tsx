'use client'

import { Icon } from '@iconify/react'
import type { CircularAuthority, PolicyCategory, PolicyStatus } from '@/types'
import type { TranslationKey } from '@/i18n'
import { useDepartmentStore } from '@/stores/department-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { EditableSelect } from '@/components/ui/editable-select'

interface RegDocFilterBarProps {
  variant: 'circular' | 'policy'
  searchQuery: string
  onSearchChange: (v: string) => void
  // Circular-only
  authorityFilter?: CircularAuthority | 'all'
  onAuthorityChange?: (v: CircularAuthority | 'all') => void
  departmentFilter?: string
  onDepartmentChange?: (v: string) => void
  // Policy-only
  categoryFilter?: PolicyCategory | 'all'
  onCategoryChange?: (v: PolicyCategory | 'all') => void
  statusFilter?: PolicyStatus | 'all'
  onStatusChange?: (v: PolicyStatus | 'all') => void
  resultCount: number
  // GAP-5: base translation key for the result-count line. The component
  // resolves it count-aware via `tCount` ("1 circular found" / "2 circulars
  // found"). Reusable across circular / policy / observation / letter lists.
  resultLabelKey: string
  rightSlot?: React.ReactNode
  t: (key: TranslationKey, params?: Record<string, string>) => string
  // GAP-5: count-aware translator from `useTranslation()`.
  tCount: (baseKey: string, count: number, params?: Record<string, string | number>) => string
  isRTL: boolean
}

export function RegDocFilterBar({
  variant,
  searchQuery,
  onSearchChange,
  authorityFilter = 'all',
  onAuthorityChange,
  departmentFilter = 'all',
  onDepartmentChange,
  categoryFilter = 'all',
  onCategoryChange,
  statusFilter = 'all',
  onStatusChange,
  resultCount,
  resultLabelKey,
  rightSlot,
  t,
  tCount,
  isRTL,
}: RegDocFilterBarProps) {
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const allFrameworks = useFrameworkConfigStore((s) => s.frameworks)
  // Authority filter only surfaces correspondence-based frameworks — these are
  // the authorities that actually issue circulars/rules.
  const authorityFrameworks = allFrameworks.filter((f) => f.correspondenceBased)
  const policyCategoryItems = usePolicyCategoryStore((s) => s.categories)
  const addPolicyCategory = usePolicyCategoryStore((s) => s.add)
  const editPolicyCategory = usePolicyCategoryStore((s) => s.update)
  const removePolicyCategory = usePolicyCategoryStore((s) => s.remove)

  return (
    <div className={`flex items-center justify-between mb-6`}>
      <div className={`flex gap-4 flex-wrap`}>
        {/* Search */}
        <div className="relative">
          <Icon
            icon="lucide:search"
            className={`absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
          />
          <input
            type="text"
            placeholder={variant === 'circular' ? t('regulatoryUpdates.searchCirculars') : t('policies.searchPolicies')}
            className={`pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-72 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Circular-specific dropdowns */}
        {variant === 'circular' && (
          <>
            <div className="min-w-[180px]">
              <EditableSelect
                locked
                value={authorityFilter}
                onChange={(id) => onAuthorityChange?.(id as CircularAuthority | 'all')}
                items={[
                  { id: 'all', label: t('regulatoryUpdates.allAuthorities') },
                  ...authorityFrameworks.map((f) => ({ id: f.id, label: isRTL ? f.nameAr : f.name })),
                ]}
                isRTL={isRTL}
              />
            </div>
            <div className="min-w-[180px]">
              <EditableSelect
                value={departmentFilter}
                onChange={(id) => onDepartmentChange?.(id)}
                items={[
                  { id: 'all', label: t('regulatoryUpdates.allDepartments') },
                  ...allDepartments.map((dept) => ({
                    id: dept.name,
                    label: dept.name,
                    labelAr: dept.nameAr,
                    isDefault: dept.isDefault,
                  })),
                ]}
                onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
                onEdit={(id, label, labelAr) => {
                  const dept = allDepartments.find((d) => d.name === id)
                  if (dept) updateDepartment(dept.id, { name: label, nameAr: labelAr ?? label })
                }}
                onDelete={(id) => {
                  const dept = allDepartments.find((d) => d.name === id)
                  if (dept) removeDepartment(dept.id)
                }}
                isRTL={isRTL}
              />
            </div>
          </>
        )}

        {/* Policy-specific dropdowns */}
        {variant === 'policy' && (
          <>
            <div className="min-w-[180px]">
              <EditableSelect
                value={categoryFilter}
                onChange={(id) => onCategoryChange?.(id as PolicyCategory | 'all')}
                items={[
                  { id: 'all', label: t('policies.allCategories') },
                  ...policyCategoryItems.map((c) => ({ id: c.id, label: c.label, labelAr: c.labelAr, isDefault: c.isDefault })),
                ]}
                onAdd={(label, labelAr) => addPolicyCategory(label, labelAr)}
                onEdit={(id, label, labelAr) => editPolicyCategory(id, { label, labelAr })}
                onDelete={(id) => removePolicyCategory(id)}
                isRTL={isRTL}
              />
            </div>
            <div className="min-w-[180px]">
              <EditableSelect
                locked
                value={statusFilter}
                onChange={(id) => onStatusChange?.(id as PolicyStatus | 'all')}
                items={[
                  { id: 'all', label: t('policies.allStatuses') },
                  { id: 'draft', label: t('policies.statusDraft') },
                  { id: 'under-review', label: t('policies.statusUnderReview') },
                  { id: 'approved', label: t('policies.statusApproved') },
                  { id: 'expired', label: t('policies.statusExpired') },
                  { id: 'overdue', label: t('policies.statusOverdue') },
                  { id: 'requires-review', label: t('policies.statusRequiresReview') },
                ]}
                isRTL={isRTL}
              />
            </div>
          </>
        )}
      </div>

      {/* Right side: result count + slot */}
      <div className={`flex items-center gap-3 shrink-0`}>
        <span className={`text-xs font-bold text-slate-500`}>
          {tCount(resultLabelKey, resultCount)}
        </span>
        {rightSlot}
      </div>
    </div>
  )
}
