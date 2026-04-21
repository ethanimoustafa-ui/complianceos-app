'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAuditLogStore, type AuditLog as AuditLogFromStore } from '@/stores/audit-log-store'
import { useComplianceScore } from '@/hooks/useComplianceScore'
import type { PeriodFilter } from '@/lib/compliance-engine.types'
import { exportAuditLogsLocalized, exportSingleLog } from '@/lib/export'
import type { TranslationKey } from '@/i18n'

// Types
type ActionType = 'opened' | 'closed' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated' | 'reviewed'
type LogStatus = 'completed' | 'pending' | 'info' | 'failed'

interface AuditLog {
  id: string
  timestamp: Date
  user: { name: string; avatar: string }
  action: ActionType
  audit: string
  auditId: string
  description: string
  status: LogStatus
  duration?: string
  context?: string
}

// Configs
const actionConfig: Record<ActionType, { label: string; color: string }> = {
  opened: { label: 'Opened', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700' },
  commented: { label: 'Commented', color: 'bg-purple-100 text-purple-700' },
  uploaded: { label: 'Uploaded', color: 'bg-amber-100 text-amber-700' },
  created: { label: 'Created', color: 'bg-indigo-100 text-indigo-700' },
  assigned: { label: 'Assigned', color: 'bg-cyan-100 text-cyan-700' },
  updated: { label: 'Updated', color: 'bg-orange-100 text-orange-700' },
  reviewed: { label: 'Reviewed', color: 'bg-slate-100 text-slate-700' },
}

const logStatusConfig: Record<LogStatus, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  info: { label: 'Info', color: 'bg-blue-100 text-blue-700' },
  failed: { label: 'Failed', color: 'bg-rose-100 text-rose-700' },
}

export default function ReportsDetailedPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()

  // Stores
  const { logs: storeLogs } = useAuditLogStore()

  // State
  const [periodFilter, setPeriodFilter] = useState('12months')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState<ActionType | 'all'>('all')
  const [filterAudit, setFilterAudit] = useState<string>('all')
  const [dateRangeFilter, setDateRangeFilter] = useState('month')
  const [expandedLogs, setExpandedLogs] = useState<string[]>([])
  const [sortColumn, setSortColumn] = useState<string | null>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [logPage, setLogPage] = useState(1)

  const complianceScore = useComplianceScore(periodFilter as PeriodFilter)

  // Transform store logs
  const auditLogs: AuditLog[] = useMemo(() => {
    return storeLogs.map((log: AuditLogFromStore) => ({
      id: log.id,
      timestamp: new Date(log.timestamp),
      user: log.user,
      action: log.action,
      audit: log.audit,
      auditId: log.auditId,
      description: log.description,
      status: log.status,
      duration: log.duration,
      context: log.context,
    }))
  }, [storeLogs])

  // Labels
  const filterLabels: Record<string, string> = {
    '3months': t('reports.last3Months'),
    '6months': t('reports.last6Months'),
    '12months': t('reports.last12Months'),
    'fiscal': t('reports.fiscalYear2025'),
  }

  const actionLabels: Record<ActionType, string> = {
    opened: t('reports.opened'), closed: t('reports.closed'), commented: t('reports.commented'), uploaded: t('reports.uploaded'),
    created: t('reports.created'), assigned: t('reports.assigned'), updated: t('reports.updated'), reviewed: t('reports.reviewed'),
  }

  const logStatusLabels: Record<LogStatus, string> = {
    completed: t('reports.completed'), pending: t('reports.pending'), info: t('reports.info'), failed: t('reports.failed'),
  }

  const applyFilter = (filterValue: string) => { setPeriodFilter(filterValue); setShowFilterDropdown(false) }

  // Filter logs
  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch = log.audit.toLowerCase().includes(searchTerm.toLowerCase()) || log.user.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAction = filterAction === 'all' || log.action === filterAction
    const matchesAudit = filterAudit === 'all' || log.audit === filterAudit
    const now = new Date()
    let matchesDate = true
    if (dateRangeFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      matchesDate = log.timestamp >= start
    } else if (dateRangeFilter === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0)
      matchesDate = log.timestamp >= start
    } else if (dateRangeFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      matchesDate = log.timestamp >= start
    } else if (dateRangeFilter === 'quarter') {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3
      const start = new Date(now.getFullYear(), quarterStart, 1)
      matchesDate = log.timestamp >= start
    }
    return matchesSearch && matchesAction && matchesAudit && matchesDate
  })

  // Sort logs
  const sortedLogs = useMemo(() => {
    if (!sortColumn) return filteredLogs
    const lso: Record<LogStatus, number> = { failed: 0, pending: 1, info: 2, completed: 3 }
    return [...filteredLogs].sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'timestamp': comparison = a.timestamp.getTime() - b.timestamp.getTime(); break
        case 'action': comparison = a.action.localeCompare(b.action); break
        case 'audit': comparison = a.audit.localeCompare(b.audit); break
        case 'status': comparison = lso[a.status] - lso[b.status]; break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredLogs, sortColumn, sortDirection])

  // Pagination
  const LOGS_PER_PAGE = 10
  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE))
  const paginatedLogs = sortedLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE)

  useEffect(() => { setLogPage(1) }, [searchTerm, filterAction, filterAudit, dateRangeFilter, sortColumn, sortDirection])

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs((prev) => prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId])
  }

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
        <div className={`flex items-center gap-4`}>
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:filter" className="text-slate-400" />
              <span>{filterLabels[periodFilter]}</span>
              <Icon icon="lucide:chevron-down" className={cn('text-slate-400 transition-transform', showFilterDropdown && 'rotate-180')} />
            </button>
            {showFilterDropdown && (
              <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden`}>
                {(['3months', '6months', '12months', 'fiscal'] as const).map(val => (
                  <button
                    key={val}
                    onClick={() => applyFilter(val)}
                    className={cn(
                      `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer`,
                      periodFilter === val ? 'text-emerald-600 bg-emerald-50/30 font-bold' : 'text-slate-700'
                    )}
                  >
                    {filterLabels[val]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            className="shadow-lg shadow-emerald-100"
            onClick={() => exportAuditLogsLocalized(filteredLogs, 'audit-logs', t, isRTL)}
          >
            <Icon icon="lucide:download" />
            {t('common.exportCsv')}
          </Button>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Enhanced Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="min-w-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.search')}</label>
                <div className="relative">
                  <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
                  <input
                    type="text"
                    placeholder={t('reports.searchLogs')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full ${isRTL ? 'pr-2 pl-4 py-3.5' : 'pl-10 pr-4 py-2.5'} bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.actionType')}</label>
                <select value={filterAction} onChange={(e) => setFilterAction(e.target.value as ActionType | 'all')} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                  <option value="all">{t('reports.allActions')}</option>
                  {Object.entries(actionConfig).map(([key]) => (
                    <option key={key} value={key}>{actionLabels[key as ActionType]}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.auditNameFilter')}</label>
                <select value={filterAudit} onChange={(e) => setFilterAudit(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                  <option value="all">{t('reports.allAudits')}</option>
                  {[...new Set(auditLogs.map(l => l.audit))].map((audit) => (
                    <option key={audit} value={audit}>{audit}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.dateRange')}</label>
                <select value={dateRangeFilter} onChange={(e) => setDateRangeFilter(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                  <option value="today">{t('reports.today')}</option>
                  <option value="week">{t('reports.thisWeek')}</option>
                  <option value="month">{t('reports.thisMonth')}</option>
                  <option value="quarter">{t('reports.thisQuarter')}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{t('reports.logEntriesFound').replace('{count}', filteredLogs.length.toString())}</span>
              <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterAudit('all'); setDateRangeFilter('month') }}>
                <Icon icon="lucide:x" className="w-3 h-3" />
                {t('reports.clearFilters')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>{t('reports.activityLogs')}</CardTitle>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {t('reports.liveTracking')}
                </span>
              </div>
              <span className="text-sm text-slate-500">{filteredLogs.length} {t('reports.entries')}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr className="border-b border-slate-100">
                    <th
                      onClick={() => { if (sortColumn === 'timestamp') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn('timestamp'); setSortDirection('desc') } }}
                      className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        {t('reports.timestamp')}
                        {sortColumn !== 'timestamp' ? (
                          <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Icon icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'} className="w-3 h-3 text-emerald-600" />
                            <Icon icon="lucide:x" className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }} />
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.user')}</th>
                    <th
                      onClick={() => { if (sortColumn === 'action') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn('action'); setSortDirection('asc') } }}
                      className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        {t('reports.action')}
                        {sortColumn !== 'action' ? (
                          <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Icon icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'} className="w-3 h-3 text-emerald-600" />
                            <Icon icon="lucide:x" className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }} />
                          </span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => { if (sortColumn === 'audit') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn('audit'); setSortDirection('asc') } }}
                      className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        {t('reports.audit')}
                        {sortColumn !== 'audit' ? (
                          <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Icon icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'} className="w-3 h-3 text-emerald-600" />
                            <Icon icon="lucide:x" className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }} />
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.description')}</th>
                    <th
                      onClick={() => { if (sortColumn === 'status') { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn('status'); setSortDirection('asc') } }}
                      className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        {t('reports.status')}
                        {sortColumn !== 'status' ? (
                          <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                        ) : (
                          <span className="inline-flex items-center gap-0.5">
                            <Icon icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'} className="w-3 h-3 text-emerald-600" />
                            <Icon icon="lucide:x" className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }} />
                          </span>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleLogExpand(log.id)}
                        className={cn('cursor-pointer transition-colors', expandedLogs.includes(log.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50')}
                      >
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {log.timestamp.toLocaleString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', calendar: 'gregory' })}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.avatar || log.user.name}`} className="w-6 h-6 rounded-full" alt={log.user.name} />
                            <span className="text-xs font-medium text-slate-700">{log.user.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={actionConfig[log.action].color}>{actionLabels[log.action]}</Badge>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-slate-900">{log.audit}</td>
                        <td className="px-4 py-4 text-xs text-slate-500">{log.description}</td>
                        <td className="px-4 py-4">
                          <Badge className={logStatusConfig[log.status].color}>{logStatusLabels[log.status]}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Icon icon={expandedLogs.includes(log.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="w-4 h-4 text-slate-400" />
                        </td>
                      </tr>
                      {expandedLogs.includes(log.id) && (
                        <tr className="animate-expand-row">
                          <td colSpan={7} className="px-4 py-4 bg-slate-50">
                            <div className={`${isRTL ? 'mr-8' : 'ml-8'} p-5 bg-white rounded-xl border border-slate-200 shadow-sm`}>
                              <div className="grid grid-cols-4 gap-6">
                                <div className="flex items-center gap-3">
                                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.avatar || log.user.name}`} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt={log.user.name} />
                                  <div className={isRTL ? 'text-right' : ''}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.performedBy')}</p>
                                    <p className="text-sm font-bold text-slate-900">{log.user.name}</p>
                                  </div>
                                </div>
                                <div className={isRTL ? 'text-right' : ''}>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.actionId')}</p>
                                  <p className="font-mono text-sm text-slate-700">{log.id}</p>
                                </div>
                                {log.duration && (
                                  <div className={isRTL ? 'text-right' : ''}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.duration')}</p>
                                    <p className="text-sm font-bold text-slate-900">{log.duration}</p>
                                  </div>
                                )}
                                <div className={isRTL ? 'text-right' : ''}>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.relatedDocs')}</p>
                                  <p className="text-sm text-slate-600">2 {t('reports.attachments')}</p>
                                </div>
                              </div>
                              {log.context && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('reports.fullContext')}</p>
                                  <p className="text-sm text-slate-700 leading-relaxed">{log.context}</p>
                                </div>
                              )}
                              <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                                {log.auditId ? (
                                  <Link href={`/audits/${log.auditId}`}>
                                    <Button variant="outline" size="sm">
                                      <Icon icon="lucide:external-link" className="w-3 h-3" />
                                      {t('reports.viewAuditDetails')}
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button variant="outline" size="sm" disabled>
                                    <Icon icon="lucide:external-link" className="w-3 h-3" />
                                    {t('reports.viewAuditDetails')}
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={() => exportSingleLog(log, `log-${log.id}`, t, isRTL)}>
                                  <Icon icon="lucide:download" className="w-3 h-3" />
                                  {t('reports.exportLogEntry')}
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredLogs.length > LOGS_PER_PAGE && (
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500" dir="ltr">
                  {(logPage - 1) * LOGS_PER_PAGE + 1}–{Math.min(logPage * LOGS_PER_PAGE, filteredLogs.length)} / {filteredLogs.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    disabled={logPage === 1}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold text-slate-700" dir="ltr">{logPage} / {totalLogPages}</span>
                  <button
                    onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                    disabled={logPage === totalLogPages}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
