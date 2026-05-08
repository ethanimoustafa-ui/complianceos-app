'use client'

import { Icon } from '@iconify/react'
import type { CircularAuthority, PolicyCategory, PolicyStatus } from '@/types'
import type { TranslationKey } from '@/i18n'
import { useDepartmentStore } from '@/stores/department-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'

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
  resultLabel: string
  rightSlot?: React.ReactNode
  t: (key: TranslationKey, params?: Record<string, string>) => string
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
  resultLabel,
  rightSlot,
  t,
  isRTL,
}: RegDocFilterBarProps) {
  const { departments: allDepartments } = useDepartmentStore()
  const allFrameworks = useFrameworkConfigStore((s) => s.frameworks)
  // Authority filter only surfaces correspondence-based frameworks — these are
  // the authorities that actually issue circulars/rules.
  const authorityFrameworks = allFrameworks.filter((f) => f.correspondenceBased)
  const policyCategoryItems = usePolicyCategoryStore((s) => s.categories)
  const selectClass = `px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`

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
            <select
              className={selectClass}
              value={authorityFilter}
              onChange={(e) => onAuthorityChange?.(e.target.value as CircularAuthority | 'all')}
            >
              <option value="all">{t('regulatoryUpdates.allAuthorities')}</option>
              {authorityFrameworks.map((f) => (
                <option key={f.id} value={f.id}>
                  {isRTL ? f.nameAr : f.name}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={departmentFilter}
              onChange={(e) => onDepartmentChange?.(e.target.value)}
            >
              <option value="all">{t('regulatoryUpdates.allDepartments')}</option>
              {allDepartments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {isRTL ? dept.nameAr : dept.name}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Policy-specific dropdowns */}
        {variant === 'policy' && (
          <>
            <select
              className={selectClass}
              value={categoryFilter}
              onChange={(e) => onCategoryChange?.(e.target.value as PolicyCategory | 'all')}
            >
              <option value="all">{t('policies.allCategories')}</option>
              {policyCategoryItems.map((c) => (
                <option key={c.id} value={c.id}>{isRTL && c.labelAr ? c.labelAr : c.label}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={statusFilter}
              onChange={(e) => onStatusChange?.(e.target.value as PolicyStatus | 'all')}
            >
              <option value="all">{t('policies.allStatuses')}</option>
              <option value="draft">{t('policies.statusDraft')}</option>
              <option value="under-review">{t('policies.statusUnderReview')}</option>
              <option value="approved">{t('policies.statusApproved')}</option>
              <option value="expired">{t('policies.statusExpired')}</option>
              <option value="overdue">{t('policies.statusOverdue')}</option>
              <option value="requires-review">{t('policies.statusRequiresReview')}</option>
            </select>
          </>
        )}
      </div>

      {/* Right side: result count + slot */}
      <div className={`flex items-center gap-3 shrink-0`}>
        <span className={`text-xs font-bold text-slate-500`}>
          {resultCount} {resultLabel}
        </span>
        {rightSlot}
      </div>
    </div>
  )
}
