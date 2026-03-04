'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MultiSelectFilter, FilterOption } from '@/components/ui/multi-select-filter'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAuditStore } from '@/stores/audit-store'
import { AddAuditModal } from '@/components/reports/audits/add-audit-modal'
import { EditAuditModal } from '@/components/reports/audits/edit-audit-modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import type { Audit as AuditType } from '@/types'
import { exportAuditsLocalized } from '@/lib/export'
import type { TranslationKey } from '@/i18n'

// Audit type definitions
type AuditSource = 'sama_inspection' | 'internal_audit' | 'sharia_audit'
type AuditFrequency = 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'ad_hoc'
type AuditCategory = 'security_compliance' | 'financial_compliance' | 'regulatory_compliance' | 'operational_compliance' | 'hr_compliance' | 'sharia_compliance'
type AuditStatus = 'in_progress' | 'pending' | 'in_review' | 'completed' | 'overdue'
type AuditPriority = 'critical' | 'high' | 'medium' | 'low'

interface Audit {
  id: string
  name: string
  description: string
  responsible: { name: string; avatar: string }
  dueDate: Date
  status: AuditStatus
  priority: AuditPriority
  progress: number
  source: AuditSource
  frequency: AuditFrequency
  category: AuditCategory
  closedOverdue?: boolean
}

// Configs
const auditStatusConfig: Record<AuditStatus, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  in_progress: { label: 'In Progress', bgColor: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-100' },
  pending: { label: 'Pending', bgColor: 'bg-slate-50', textColor: 'text-slate-500', borderColor: 'border-slate-200' },
  in_review: { label: 'In Review', bgColor: 'bg-blue-50', textColor: 'text-blue-600', borderColor: 'border-blue-100' },
  completed: { label: 'Completed', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600', borderColor: 'border-emerald-100' },
  overdue: { label: 'Overdue', bgColor: 'bg-rose-50', textColor: 'text-rose-600', borderColor: 'border-rose-100' },
}

const auditPriorityConfig: Record<AuditPriority, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  critical: { label: 'Critical', bgColor: 'bg-rose-50', textColor: 'text-rose-600', borderColor: 'border-rose-100' },
  high: { label: 'High', bgColor: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-100' },
  medium: { label: 'Medium', bgColor: 'bg-slate-50', textColor: 'text-slate-500', borderColor: 'border-slate-200' },
  low: { label: 'Low', bgColor: 'bg-slate-50', textColor: 'text-slate-500', borderColor: 'border-slate-200' },
}

const auditSourceColors: Record<AuditSource, { dot: string; bg: string; text: string; border: string }> = {
  sama_inspection: { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  internal_audit: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  sharia_audit: { dot: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
}

const auditFrequencyColors: Record<AuditFrequency, { dot: string; bg: string; text: string; border: string }> = {
  annual: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  semi_annual: { dot: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-600', border: 'border-teal-200' },
  quarterly: { dot: 'bg-cyan-500', bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200' },
  monthly: { dot: 'bg-sky-500', bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
  ad_hoc: { dot: 'bg-slate-500', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
}

const auditCategoryColors: Record<AuditCategory, { dot: string; bg: string; text: string; border: string }> = {
  security_compliance: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
  financial_compliance: { dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
  regulatory_compliance: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
  operational_compliance: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  hr_compliance: { dot: 'bg-pink-500', bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200' },
  sharia_compliance: { dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
}

const auditStatusColors: Record<AuditStatus, { dot: string; bg: string; text: string; border: string }> = {
  in_progress: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  pending: { dot: 'bg-slate-500', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  in_review: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  completed: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  overdue: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
}

const auditPriorityColors: Record<AuditPriority, { dot: string; bg: string; text: string; border: string }> = {
  critical: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
  high: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  medium: { dot: 'bg-slate-500', bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  low: { dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' },
}

export default function ReportsAuditsPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()

  // Audit store connection
  const { audits: storeAudits, fetchAll: fetchAudits, delete: deleteAudit } = useAuditStore()

  // Audit edit/delete state
  const [auditToEdit, setAuditToEdit] = useState<AuditType | null>(null)
  const [auditToDelete, setAuditToDelete] = useState<AuditType | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [auditDropdownOpen, setAuditDropdownOpen] = useState<string | null>(null)

  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = useState('')

  // Audit filter state
  const [selectedSources, setSelectedSources] = useState<Set<AuditSource>>(
    new Set(['sama_inspection', 'internal_audit', 'sharia_audit'])
  )
  const [selectedFrequencies, setSelectedFrequencies] = useState<Set<AuditFrequency>>(
    new Set(['annual', 'semi_annual', 'quarterly', 'monthly', 'ad_hoc'])
  )
  const [selectedCategories, setSelectedCategories] = useState<Set<AuditCategory>>(
    new Set(['security_compliance', 'financial_compliance', 'regulatory_compliance', 'operational_compliance', 'hr_compliance', 'sharia_compliance'])
  )
  const [selectedStatuses, setSelectedStatuses] = useState<Set<AuditStatus>>(
    new Set(['in_progress', 'pending', 'in_review', 'completed', 'overdue'])
  )
  const [selectedPriorities, setSelectedPriorities] = useState<Set<AuditPriority>>(
    new Set(['critical', 'high', 'medium', 'low'])
  )

  // Fetch audits on mount
  useEffect(() => {
    fetchAudits()
  }, [fetchAudits])

  // Close audit dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (auditDropdownOpen) {
        setAuditDropdownOpen(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [auditDropdownOpen])

  // Transform store audits to page audit format
  const pageAudits: Audit[] = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return storeAudits.map((audit) => {
      const sourceMap: Record<string, AuditSource> = {
        internal: 'internal_audit',
        sama: 'sama_inspection',
        sharia: 'sharia_audit',
      }

      const dueDate = new Date(audit.dueDate)
      dueDate.setHours(0, 0, 0, 0)
      const isOverdue = audit.status !== 'completed' && dueDate < today

      let displayStatus: AuditStatus
      if (isOverdue) {
        displayStatus = 'overdue'
      } else if (audit.status === 'pending') {
        displayStatus = 'pending'
      } else if (audit.status === 'in_progress') {
        displayStatus = 'in_progress'
      } else if (audit.status === 'completed') {
        displayStatus = 'completed'
      } else {
        displayStatus = 'pending'
      }

      return {
        id: audit.id,
        name: audit.title,
        description: '',
        responsible: {
          name: audit.assignee?.name || 'Unassigned',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${audit.assignee?.name || 'default'}`,
        },
        dueDate: new Date(audit.dueDate),
        status: displayStatus,
        priority: (audit.priority || 'medium') as AuditPriority,
        progress: audit.progress,
        source: sourceMap[audit.type] || 'internal_audit',
        frequency: (audit.frequency || 'annual') as AuditFrequency,
        category: (audit.category || 'regulatory_compliance') as AuditCategory,
        closedOverdue: audit.closedOverdue,
      }
    })
  }, [storeAudits])

  // Filtered audits based on selected filters
  const filteredAudits = useMemo(() => {
    return pageAudits.filter(audit =>
      selectedSources.has(audit.source) &&
      selectedFrequencies.has(audit.frequency) &&
      selectedCategories.has(audit.category) &&
      selectedStatuses.has(audit.status) &&
      selectedPriorities.has(audit.priority)
    )
  }, [pageAudits, selectedSources, selectedFrequencies, selectedCategories, selectedStatuses, selectedPriorities])

  // Audit sort state
  type AuditSortField = 'auditName' | 'dueDate' | 'status' | 'priority' | 'progress'
  const [auditSortField, setAuditSortField] = useState<AuditSortField | null>(null)
  const [auditSortDirection, setAuditSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleAuditSort = (field: AuditSortField) => {
    if (auditSortField === field) {
      setAuditSortDirection(auditSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setAuditSortField(field)
      setAuditSortDirection('asc')
    }
  }

  const clearAuditSort = (e: React.MouseEvent) => {
    e.stopPropagation()
    setAuditSortField(null)
    setAuditSortDirection('asc')
  }

  const AuditSortIcon = ({ field }: { field: AuditSortField }) => {
    if (auditSortField !== field) {
      return <Icon icon="lucide:arrow-up-down" className={`text-[10px] inline ${isRTL ? 'mr-1' : 'ml-1'} opacity-30`} />
    }
    return (
      <span className={`inline-flex items-center ${isRTL ? 'mr-1' : 'ml-1'} gap-0.5`}>
        <Icon
          icon={auditSortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
          className="text-[10px] text-emerald-600"
        />
        <Icon
          icon="lucide:x"
          className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
          onClick={clearAuditSort}
        />
      </span>
    )
  }

  const statusOrder: Record<AuditStatus, number> = { pending: 0, in_progress: 1, in_review: 2, completed: 3, overdue: 4 }
  const priorityOrder: Record<AuditPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

  const sortedAudits = useMemo(() => {
    if (!auditSortField) return filteredAudits
    return [...filteredAudits].sort((a, b) => {
      let comparison = 0
      switch (auditSortField) {
        case 'auditName': comparison = a.name.localeCompare(b.name); break
        case 'dueDate': comparison = a.dueDate.getTime() - b.dueDate.getTime(); break
        case 'status': comparison = statusOrder[a.status] - statusOrder[b.status]; break
        case 'priority': comparison = priorityOrder[a.priority] - priorityOrder[b.priority]; break
        case 'progress': comparison = a.progress - b.progress; break
      }
      return auditSortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredAudits, auditSortField, auditSortDirection])

  // Labels
  const auditStatusLabels: Record<AuditStatus, string> = {
    in_progress: t('reports.inProgress'),
    pending: t('reports.pending'),
    in_review: t('reports.inReview'),
    completed: t('reports.completed'),
    overdue: t('reports.overdue'),
  }

  const auditPriorityLabels: Record<AuditPriority, string> = {
    critical: t('reports.critical'),
    high: t('reports.high'),
    medium: t('reports.medium'),
    low: t('reports.low'),
  }

  // Localized filter options
  const auditSourceOptions: FilterOption<AuditSource>[] = useMemo(() => [
    { value: 'sama_inspection' as AuditSource, label: t('reports.samaInspection'), color: auditSourceColors.sama_inspection },
    { value: 'internal_audit' as AuditSource, label: t('reports.internalAudit'), color: auditSourceColors.internal_audit },
    { value: 'sharia_audit' as AuditSource, label: t('reports.shariaAudit'), color: auditSourceColors.sharia_audit },
  ], [t])

  const auditFrequencyOptions: FilterOption<AuditFrequency>[] = useMemo(() => [
    { value: 'annual' as AuditFrequency, label: t('reports.annual'), color: auditFrequencyColors.annual },
    { value: 'semi_annual' as AuditFrequency, label: t('reports.semiAnnual'), color: auditFrequencyColors.semi_annual },
    { value: 'quarterly' as AuditFrequency, label: t('reports.quarterly'), color: auditFrequencyColors.quarterly },
    { value: 'monthly' as AuditFrequency, label: t('reports.monthly'), color: auditFrequencyColors.monthly },
    { value: 'ad_hoc' as AuditFrequency, label: t('reports.adHoc'), color: auditFrequencyColors.ad_hoc },
  ], [t])

  const auditCategoryOptions: FilterOption<AuditCategory>[] = useMemo(() => [
    { value: 'security_compliance' as AuditCategory, label: t('reports.security'), color: auditCategoryColors.security_compliance },
    { value: 'financial_compliance' as AuditCategory, label: t('reports.financial'), color: auditCategoryColors.financial_compliance },
    { value: 'regulatory_compliance' as AuditCategory, label: t('reports.regulatory'), color: auditCategoryColors.regulatory_compliance },
    { value: 'operational_compliance' as AuditCategory, label: t('reports.operational'), color: auditCategoryColors.operational_compliance },
    { value: 'hr_compliance' as AuditCategory, label: t('reports.hr'), color: auditCategoryColors.hr_compliance },
    { value: 'sharia_compliance' as AuditCategory, label: t('reports.sharia'), color: auditCategoryColors.sharia_compliance },
  ], [t])

  const auditStatusOptions: FilterOption<AuditStatus>[] = useMemo(() => [
    { value: 'pending' as AuditStatus, label: t('reports.pending'), color: auditStatusColors.pending },
    { value: 'in_progress' as AuditStatus, label: t('reports.inProgress'), color: auditStatusColors.in_progress },
    { value: 'in_review' as AuditStatus, label: t('reports.inReview'), color: auditStatusColors.in_review },
    { value: 'completed' as AuditStatus, label: t('reports.completed'), color: auditStatusColors.completed },
    { value: 'overdue' as AuditStatus, label: t('reports.overdue'), color: auditStatusColors.overdue },
  ], [t])

  const auditPriorityOptions: FilterOption<AuditPriority>[] = useMemo(() => [
    { value: 'critical' as AuditPriority, label: t('reports.critical'), color: auditPriorityColors.critical },
    { value: 'high' as AuditPriority, label: t('reports.high'), color: auditPriorityColors.high },
    { value: 'medium' as AuditPriority, label: t('reports.medium'), color: auditPriorityColors.medium },
    { value: 'low' as AuditPriority, label: t('reports.low'), color: auditPriorityColors.low },
  ], [t])

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {pathname.startsWith('/reports/audits') ? t('reports.auditManagement' as TranslationKey) : t('reports.auditReports' as TranslationKey)}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {pathname.startsWith('/reports/audits') ? t('reports.organizationAudits' as TranslationKey) : t('reports.analyticsFindings' as TranslationKey)}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsTab' as TranslationKey)}
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.executiveView' as TranslationKey)}
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsLogs' as TranslationKey)}
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.tabs.risks' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="relative hidden md:block">
            <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input
              type="text"
              placeholder={t('reports.searchAudits')}
              value={auditSearchTerm}
              onChange={(e) => setAuditSearchTerm(e.target.value)}
              className={`${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all`}
            />
          </div>
          <button
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
            title={t('reports.exportReports')}
            onClick={() => exportAuditsLocalized(sortedAudits, 'audits', t, isRTL)}
          >
            <Icon icon="lucide:download-cloud" className="text-lg" />
          </button>
          <Button className="shadow-lg shadow-emerald-100" onClick={() => setShowScheduleAuditModal(true)}>
            <Icon icon="lucide:plus" />
            {t('reports.scheduleAudit')}
          </Button>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <div className="space-y-8">
          {/* Audit Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.filteredAudits')}</p>
              <p className="text-2xl font-bold text-slate-900">{filteredAudits.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.inProgress')}</p>
              <p className="text-2xl font-bold text-emerald-600">
                {filteredAudits.filter((a) => a.status === 'in_progress').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.overdue')}</p>
              <p className="text-2xl font-bold text-rose-600">
                {filteredAudits.filter((a) => a.dueDate < new Date() && a.status !== 'completed').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.complianceScore')}</p>
              <p className="text-2xl font-bold text-blue-600">94%</p>
            </div>
          </div>

          {/* Audit Filters */}
          <Card>
            <div className="p-6 border-b border-slate-100 bg-slate-50/30">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t('reports.filterAudits')}</h3>
              <div className="flex flex-wrap items-start gap-6">
                <MultiSelectFilter label={t('reports.source')} options={auditSourceOptions} selected={selectedSources} onChange={setSelectedSources} showAllOption allLabel={t('common.all')} />
                <MultiSelectFilter label={t('reports.frequency')} options={auditFrequencyOptions} selected={selectedFrequencies} onChange={setSelectedFrequencies} showAllOption allLabel={t('common.all')} />
                <MultiSelectFilter label={t('common.category')} options={auditCategoryOptions} selected={selectedCategories} onChange={setSelectedCategories} showAllOption allLabel={t('common.all')} />
                <MultiSelectFilter label={t('reports.status')} options={auditStatusOptions} selected={selectedStatuses} onChange={setSelectedStatuses} showAllOption allLabel={t('common.all')} />
                <MultiSelectFilter label={t('reports.priority')} options={auditPriorityOptions} selected={selectedPriorities} onChange={setSelectedPriorities} showAllOption allLabel={t('common.all')} />
              </div>
            </div>
          </Card>

          {/* Audit Table */}
          <Card>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <h3 className="text-sm font-bold text-slate-900">{t('reports.activeAuditPipeline')}</h3>
              <span className="text-xs text-slate-500">
                {t('reports.showingOfAudits').replace('{count}', filteredAudits.length.toString()).replace('{total}', pageAudits.length.toString())}
              </span>
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleAuditSort('auditName')}>
                      {t('reports.auditName')} <AuditSortIcon field="auditName" />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.responsible')}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleAuditSort('dueDate')}>
                      {t('reports.dueDate')} <AuditSortIcon field="dueDate" />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleAuditSort('status')}>
                      {t('reports.status')} <AuditSortIcon field="status" />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleAuditSort('priority')}>
                      {t('reports.priority')} <AuditSortIcon field="priority" />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => handleAuditSort('progress')}>
                      {t('reports.progress')} <AuditSortIcon field="progress" />
                    </th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAudits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="p-4 bg-slate-100 rounded-full">
                            <Icon icon="lucide:clipboard-list" className="text-3xl text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 mb-1">{t('reports.noAuditsFound')}</p>
                            <p className="text-xs text-slate-500">{t('reports.createFirstAudit')}</p>
                          </div>
                          <Button className="mt-2" onClick={() => setShowScheduleAuditModal(true)}>
                            <Icon icon="lucide:plus" />
                            {t('reports.scheduleAudit')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedAudits.map((audit) => {
                      const statusStyle = auditStatusConfig[audit.status]
                      const priorityStyle = auditPriorityConfig[audit.priority]
                      return (
                        <tr key={audit.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <Link href={`/reports/${audit.id}`} className="block">
                              <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">{audit.name}</p>
                              <p className="text-[11px] text-slate-400">{audit.description}</p>
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <img src={audit.responsible.avatar} className="w-7 h-7 rounded-full bg-slate-100" alt={audit.responsible.name} />
                              <span className="text-sm text-slate-600 font-medium">{audit.responsible.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-600 font-medium">
                              {audit.dueDate.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', calendar: 'gregory' })}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            {audit.status === 'completed' && audit.closedOverdue ? (
                              <span className={cn('px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase', 'bg-amber-50 text-amber-600 border-amber-100')}>
                                {t('auditDetail.closedOverdue')}
                              </span>
                            ) : (
                              <span className={cn('px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase', statusStyle.bgColor, statusStyle.textColor, statusStyle.borderColor)}>
                                {auditStatusLabels[audit.status]}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn('px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase', priorityStyle.bgColor, priorityStyle.textColor, priorityStyle.borderColor)}>
                              {auditPriorityLabels[audit.priority]}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 w-32">
                              <div className={`flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden ${isRTL ? 'rotate-180' : ''}`}>
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${audit.progress}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">{audit.progress}%</span>
                            </div>
                          </td>
                          <td className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                            <div className="relative">
                              <button
                                className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setAuditDropdownOpen(auditDropdownOpen === audit.id ? null : audit.id)
                                }}
                              >
                                <Icon icon="lucide:more-horizontal" />
                              </button>
                              {auditDropdownOpen === audit.id && (
                                <div
                                  className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      const storeAudit = storeAudits.find(a => a.id === audit.id)
                                      if (storeAudit) setAuditToEdit(storeAudit)
                                      setAuditDropdownOpen(null)
                                    }}
                                    className={`w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-2.5 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer flex items-center gap-2`}
                                  >
                                    <Icon icon="lucide:edit-3" className="text-slate-400" />
                                    {t('common.edit')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const storeAudit = storeAudits.find(a => a.id === audit.id)
                                      if (storeAudit) {
                                        setAuditToDelete(storeAudit)
                                        setShowDeleteConfirm(true)
                                      }
                                      setAuditDropdownOpen(null)
                                    }}
                                    className={`w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-2.5 text-sm hover:bg-rose-50 font-medium text-rose-600 transition-colors cursor-pointer flex items-center gap-2`}
                                  >
                                    <Icon icon="lucide:trash-2" className="text-rose-400" />
                                    {t('common.delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
              <p className="text-xs text-slate-500 font-medium">
                {t('reports.showingAudits').replace('{count}', filteredAudits.length.toString())}
              </p>
              <div className="flex gap-2">
                <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer" disabled>
                  <Icon icon="lucide:chevron-left" className={isRTL ? "flip-x" : ""} />
                </button>
                <button className="px-3 py-1 text-xs font-bold text-emerald-600 bg-white border border-slate-200 rounded shadow-sm cursor-pointer">1</button>
                <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 cursor-pointer">
                  <Icon icon="lucide:chevron-right" className={isRTL ? "flip-x" : ""} />
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <AddAuditModal
        isOpen={showScheduleAuditModal}
        onClose={() => setShowScheduleAuditModal(false)}
        onSuccess={() => { fetchAudits() }}
      />
      <EditAuditModal
        isOpen={!!auditToEdit}
        onClose={() => setAuditToEdit(null)}
        audit={auditToEdit}
        onSuccess={() => { fetchAudits() }}
      />
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setAuditToDelete(null) }}
        onConfirm={async () => {
          if (auditToDelete) {
            await deleteAudit(auditToDelete.id)
            fetchAudits()
          }
        }}
        itemType={t('reports.audit')}
        itemName={auditToDelete?.title || ''}
      />
    </div>
  )
}
