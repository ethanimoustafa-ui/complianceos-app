'use client'

import { Icon } from '@iconify/react'
import type { CircularAuthority, PolicyCategory, PolicyStatus } from '@/types'
import type { TranslationKey } from '@/i18n'

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
  const selectClass = `px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none ${isRTL ? 'text-right' : ''}`

  return (
    <div className={`flex items-center justify-between mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`flex gap-4 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
        {/* Search */}
        <div className="relative">
          <Icon
            icon="lucide:search"
            className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
          />
          <input
            type="text"
            placeholder={variant === 'circular' ? t('regulatoryUpdates.searchCirculars') : t('policies.searchPolicies')}
            className={`${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2 bg-white border border-slate-200 rounded-lg text-sm w-72 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`}
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
              <option value="SAMA">{t('regulatoryUpdates.authoritySAMA')}</option>
              <option value="CMA">{t('regulatoryUpdates.authorityCMA')}</option>
              <option value="IA">{t('regulatoryUpdates.authorityIA')}</option>
              <option value="ZATCA">{t('regulatoryUpdates.authorityZATCA')}</option>
              <option value="MISA">{t('regulatoryUpdates.authorityMISA')}</option>
              <option value="SAFIU">{t('regulatoryUpdates.authoritySAFIU')}</option>
            </select>
            <select
              className={selectClass}
              value={departmentFilter}
              onChange={(e) => onDepartmentChange?.(e.target.value)}
            >
              <option value="all">{t('regulatoryUpdates.allDepartments')}</option>
              <option value="compliance">{t('regulatoryUpdates.compliance')}</option>
              <option value="it">{t('regulatoryUpdates.itCyber')}</option>
              <option value="finance">{t('regulatoryUpdates.finance')}</option>
              <option value="risk">{t('regulatoryUpdates.risk')}</option>
              <option value="legal">{t('regulatoryUpdates.legal')}</option>
              <option value="security">{t('regulatoryUpdates.security')}</option>
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
              <option value="compliance">{t('policies.categoryCompliance')}</option>
              <option value="it">{t('policies.categoryIT')}</option>
              <option value="operations">{t('policies.categoryOperations')}</option>
              <option value="risk">{t('policies.categoryRisk')}</option>
              <option value="hr">{t('policies.categoryHR')}</option>
              <option value="finance">{t('policies.categoryFinance')}</option>
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
            </select>
          </>
        )}
      </div>

      {/* Right side: result count + slot */}
      <div className={`flex items-center gap-3 shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className={`text-xs font-bold text-slate-500 ${isRTL ? 'text-right' : ''}`}>
          {resultCount} {resultLabel}
        </span>
        {rightSlot}
      </div>
    </div>
  )
}
