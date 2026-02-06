'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { MultiSelectFilter, FilterOption } from '@/components/ui/multi-select-filter'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAuditStore } from '@/stores/audit-store'
import { useAuditLogStore, type AuditLog as AuditLogFromStore } from '@/stores/audit-log-store'
import { AddAuditModal } from '@/components/audits/add-audit-modal'
import { EditAuditModal } from '@/components/audits/edit-audit-modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import type { Audit as AuditType } from '@/types'
import { useComplianceScore } from '@/hooks/useComplianceScore'
import type { PeriodFilter } from '@/lib/compliance-engine.types'
import { exportAuditLogsLocalized, exportSingleLog, exportAuditsLocalized, exportExecutiveReport, exportRisksLocalized } from '@/lib/export'

import type { TranslationKey } from '@/i18n'

// Tab type for header switching
type TabValue = 'audits' | 'executive' | 'detailed' | 'risks'

// Risk Register types
type RiskCategory = 'operational' | 'financial' | 'compliance' | 'strategic' | 'reputational'
type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'closed'
type MonitoringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
type HistoryAction = 'created' | 'status_changed' | 'score_updated' | 'mitigation_updated' | 'reviewed' | 'assigned' | 'note_added'

interface RiskHistoryEntry {
  id: number
  timestamp: Date
  user: string
  action: HistoryAction
  previousValue?: string
  newValue?: string
  notes?: string
}

interface RiskRegisterItem {
  id: string
  name: string
  description: string
  category: RiskCategory
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  owner: {
    name: string
    avatar: string
    department: string
  }
  status: RiskStatus
  mitigationPlan?: string
  mitigationProgress: number
  monitoringFrequency: MonitoringFrequency
  lastReviewDate?: Date
  nextReviewDate?: Date
  history: RiskHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}

// Audit type definitions
type AuditSource = 'sama_inspection' | 'internal_audit' | 'sharia_audit'
type AuditFrequency = 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'ad_hoc'
type AuditCategory = 'security_compliance' | 'financial_compliance' | 'regulatory_compliance' | 'operational_compliance' | 'hr_compliance' | 'sharia_compliance'

// Types
type Severity = 'critical' | 'high' | 'medium' | 'low'
type FindingStatus = 'remediation' | 'resolved' | 'verified' | 'open'
type ActionType = 'opened' | 'closed' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated' | 'reviewed'
type LogStatus = 'completed' | 'pending' | 'info' | 'failed'

interface AuditFinding {
  id: string
  sourceAuditId: string
  auditName: string
  category: string
  severity: Severity
  owner: { name: string; avatar: string }
  status: FindingStatus
  dueDate: Date
  description: string
}

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

interface RiskDistribution {
  category: string
  percentage: number
  color: string
}

// Audit types for the Audits tab
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

// Config
const severityConfig: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-rose-100 text-rose-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', color: 'bg-emerald-100 text-emerald-700' },
}

const statusConfig: Record<FindingStatus, { label: string; dotColor: string }> = {
  remediation: { label: 'Remediation', dotColor: 'bg-amber-500' },
  resolved: { label: 'Resolved', dotColor: 'bg-emerald-500' },
  verified: { label: 'Verified', dotColor: 'bg-blue-500' },
  open: { label: 'Open', dotColor: 'bg-rose-500' },
}

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

// Audit filter option colors (labels are localized inside component)
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

// Risk Register configs
const riskCategoryConfig: Record<RiskCategory, { label: string; icon: string; color: string }> = {
  operational: { label: 'Operational', icon: 'lucide:settings', color: 'bg-blue-100 text-blue-700' },
  financial: { label: 'Financial', icon: 'lucide:dollar-sign', color: 'bg-emerald-100 text-emerald-700' },
  compliance: { label: 'Compliance', icon: 'lucide:shield', color: 'bg-purple-100 text-purple-700' },
  strategic: { label: 'Strategic', icon: 'lucide:target', color: 'bg-amber-100 text-amber-700' },
  reputational: { label: 'Reputational', icon: 'lucide:users', color: 'bg-rose-100 text-rose-700' },
}

const riskStatusConfig: Record<RiskStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-rose-100 text-rose-700' },
  mitigating: { label: 'Mitigating', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700' },
}

// Risk Register data - empty initially, will be populated via store
const mockRiskRegister: RiskRegisterItem[] = []

// Risk helper functions
function getRiskScore(likelihood: number, impact: number): number {
  return likelihood * impact
}

function getRiskLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 20) return { label: 'Critical', color: 'text-rose-700', bgColor: 'bg-rose-500' }
  if (score >= 12) return { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-500' }
  if (score >= 6) return { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-400' }
  return { label: 'Low', color: 'text-emerald-700', bgColor: 'bg-emerald-400' }
}

function getMatrixCellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact
  if (score >= 20) return 'bg-rose-500/20 border-rose-500 hover:bg-rose-500/30'
  if (score >= 12) return 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30'
  if (score >= 6) return 'bg-amber-400/20 border-amber-400 hover:bg-amber-400/30'
  return 'bg-emerald-400/20 border-emerald-400 hover:bg-emerald-400/30'
}

function getRiskDotColor(score: number): string {
  if (score >= 20) return 'bg-rose-500'
  if (score >= 12) return 'bg-orange-500'
  if (score >= 6) return 'bg-amber-400'
  return 'bg-emerald-400'
}

function getHealthStatus(score: number): { label: string; color: string; bgColor: string; borderColor: string; icon: string } {
  if (score >= 90) return { label: 'healthExcellent', color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: 'lucide:shield-check' }
  if (score >= 75) return { label: 'healthGood', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: 'lucide:shield' }
  if (score >= 60) return { label: 'healthNeedsAttention', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: 'lucide:alert-triangle' }
  if (score >= 40) return { label: 'healthAtRisk', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', icon: 'lucide:alert-circle' }
  return { label: 'healthCritical', color: 'text-rose-600', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', icon: 'lucide:shield-alert' }
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#10b981' // emerald-500
  if (score >= 75) return '#3b82f6' // blue-500
  if (score >= 60) return '#f59e0b' // amber-500
  if (score >= 40) return '#f97316' // orange-500
  return '#ef4444' // rose-500
}

const confidenceConfig = {
  insufficient: { label: 'confidenceInsufficient', color: 'text-slate-400', bg: 'bg-slate-100' },
  low: { label: 'confidenceLow', color: 'text-amber-600', bg: 'bg-amber-50' },
  moderate: { label: 'confidenceModerate', color: 'text-blue-600', bg: 'bg-blue-50' },
  high: { label: 'confidenceHigh', color: 'text-emerald-600', bg: 'bg-emerald-50' },
}

// Risk distribution category colors for bars
const riskCategoryBarColors: Record<RiskCategory, string> = {
  operational: 'bg-blue-500',
  financial: 'bg-emerald-500',
  compliance: 'bg-purple-500',
  strategic: 'bg-amber-500',
  reputational: 'bg-rose-500',
}

export default function ReportsPage() {
  const { t, isRTL } = useTranslation()

  // Audit store connection
  const { audits: storeAudits, fetchAll: fetchAudits, delete: deleteAudit } = useAuditStore()

  // Audit edit/delete state
  const [auditToEdit, setAuditToEdit] = useState<AuditType | null>(null)
  const [auditToDelete, setAuditToDelete] = useState<AuditType | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [auditDropdownOpen, setAuditDropdownOpen] = useState<string | null>(null)

  // Audit log store connection
  const { logs: storeLogs } = useAuditLogStore()

  // Transform store logs to match the local AuditLog interface
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

  // Derive risk distribution from mockRiskRegister
  const riskDistribution: RiskDistribution[] = useMemo(() => {
    if (mockRiskRegister.length === 0) return []
    const counts: Record<string, number> = {}
    for (const risk of mockRiskRegister) {
      counts[risk.category] = (counts[risk.category] || 0) + 1
    }
    const total = mockRiskRegister.length
    return Object.entries(counts).map(([category, count]) => ({
      category,
      percentage: Math.round((count / total) * 100),
      color: riskCategoryBarColors[category as RiskCategory] || 'bg-slate-400',
    }))
  }, [])

  // Derive audit findings from audit store
  const auditFindings: AuditFinding[] = useMemo(() => {
    const statusMap: Record<string, FindingStatus> = {
      pending: 'open',
      in_progress: 'remediation',
      completed: 'resolved',
      overdue: 'open',
    }
    return storeAudits
      .map((audit): AuditFinding => ({
        id: audit.id.slice(0, 8),
        sourceAuditId: audit.id,
        auditName: audit.title,
        category: audit.type,
        severity: (audit.priority ?? 'medium') as Severity,
        owner: { name: audit.assignee.name, avatar: audit.assignee.avatar || '' },
        status: statusMap[audit.status] || 'open',
        dueDate: new Date(audit.dueDate),
        description: audit.description || audit.title,
      }))
      .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())
      .slice(0, 5)
  }, [storeAudits])

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

  // Tab state for conditional header
  const [activeTab, setActiveTab] = useState<TabValue>('audits')

  // Existing state
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState<ActionType | 'all'>('all')
  const [filterAudit, setFilterAudit] = useState<string>('all')
  const [periodFilter, setPeriodFilter] = useState('12months')

  // New state for modals and features
  const [showBreakdownModal, setShowBreakdownModal] = useState(false)
  const [showDeductionsModal, setShowDeductionsModal] = useState(false)
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [dateRangeFilter, setDateRangeFilter] = useState('month')
  const [logPage, setLogPage] = useState(1)
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null)

  // Custom filter dropdown state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

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

  // Risk Register tab states
  const [riskSearchTerm, setRiskSearchTerm] = useState('')
  const [riskCategoryFilter, setRiskCategoryFilter] = useState<RiskCategory | ''>('')
  const [riskStatusFilter, setRiskStatusFilter] = useState<RiskStatus | ''>('')
  const [selectedRisk, setSelectedRisk] = useState<RiskRegisterItem | null>(null)
  const [isRiskDrawerOpen, setIsRiskDrawerOpen] = useState(false)
  const [monitoringFrequencyFilter, setMonitoringFrequencyFilter] = useState<MonitoringFrequency | 'all'>('all')
  // State for tracking selected risk index within matrix cells with multiple risks
  const [matrixCellSelection, setMatrixCellSelection] = useState<{ cellKey: string; index: number } | null>(null)

  // Monitoring frequency labels
  const monitoringFrequencyLabels: Record<MonitoringFrequency, string> = {
    weekly: t('reports.weekly' as TranslationKey),
    monthly: t('reports.monthly' as TranslationKey),
    quarterly: t('reports.quarterly' as TranslationKey),
    semi_annual: t('reports.semiAnnual' as TranslationKey),
    annual: t('reports.annual' as TranslationKey),
  }

  // History action labels
  const historyActionLabels: Record<HistoryAction, string> = {
    created: t('reports.created' as TranslationKey),
    status_changed: t('reports.statusChanged' as TranslationKey),
    score_updated: t('reports.scoreUpdated' as TranslationKey),
    mitigation_updated: t('reports.mitigationUpdated' as TranslationKey),
    reviewed: t('reports.reviewed' as TranslationKey),
    assigned: t('reports.assigned' as TranslationKey),
    note_added: t('reports.noteAdded' as TranslationKey),
  }

  // History action colors
  const historyActionColors: Record<HistoryAction, string> = {
    created: 'bg-emerald-500',
    status_changed: 'bg-blue-500',
    score_updated: 'bg-amber-500',
    mitigation_updated: 'bg-purple-500',
    reviewed: 'bg-indigo-500',
    assigned: 'bg-slate-500',
    note_added: 'bg-teal-500',
  }

  // Filter risks by monitoring frequency for category card
  const filteredByMonitoringFrequency = mockRiskRegister.filter(risk =>
    monitoringFrequencyFilter === 'all' || risk.monitoringFrequency === monitoringFrequencyFilter
  )

  // Helper: count due risks per category
  const getDueCountForCategory = (category: RiskCategory) => {
    return filteredByMonitoringFrequency
      .filter(r => r.category === category && r.nextReviewDate && new Date(r.nextReviewDate) <= new Date())
      .length
  }

  // Helper: get next review date for category
  const getNextReviewForCategory = (category: RiskCategory): string => {
    const risks = filteredByMonitoringFrequency.filter(r => r.category === category && r.nextReviewDate)
    if (risks.length === 0) return '-'
    const nextReview = risks.map(r => r.nextReviewDate!).sort((a, b) => a.getTime() - b.getTime())[0]
    return nextReview.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Helper: get average progress for category
  const getAvgProgressForCategory = (category: RiskCategory): number => {
    const risks = filteredByMonitoringFrequency.filter(r => r.category === category)
    if (risks.length === 0) return 0
    return Math.round(risks.reduce((sum, r) => sum + r.mitigationProgress, 0) / risks.length)
  }
  const [showAddRiskModal, setShowAddRiskModal] = useState(false)

  // Filter risks
  const filteredRisks = useMemo(() => {
    return mockRiskRegister.filter(risk => {
      const matchesSearch = risk.name.toLowerCase().includes(riskSearchTerm.toLowerCase()) ||
                            risk.description.toLowerCase().includes(riskSearchTerm.toLowerCase())
      const matchesCategory = !riskCategoryFilter || risk.category === riskCategoryFilter
      const matchesStatus = !riskStatusFilter || risk.status === riskStatusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [riskSearchTerm, riskCategoryFilter, riskStatusFilter])

  // Transform store audits to page audit format
  const pageAudits: Audit[] = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return storeAudits.map((audit) => {
      // Map store audit type to page source
      const sourceMap: Record<string, AuditSource> = {
        internal: 'internal_audit',
        sama: 'sama_inspection',
        sharia: 'sharia_audit',
      }

      // Compute status - overdue takes priority if past due date and not completed
      const dueDate = new Date(audit.dueDate)
      dueDate.setHours(0, 0, 0, 0)
      const isOverdue = audit.status !== 'completed' && dueDate < today

      // Determine the display status
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
        closedOverdue: audit.closedOverdue, // Pass through the closedOverdue flag
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

  // Real compliance score from engine (weighted component scores from actual data)
  const complianceScore = useComplianceScore(periodFilter as PeriodFilter)

  // Filter labels for display
  const filterLabels: Record<string, string> = {
    '3months': t('reports.last3Months'),
    '6months': t('reports.last6Months'),
    '12months': t('reports.last12Months'),
    'fiscal': t('reports.fiscalYear2025'),
  }

  // Apply filter and close dropdown
  const applyFilter = (filterValue: string) => {
    setPeriodFilter(filterValue)
    setShowFilterDropdown(false)
  }

  // Get current trend data from engine
  const currentTrend = complianceScore.trend

  // Filter logs
  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch = log.audit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAction = filterAction === 'all' || log.action === filterAction
    const matchesAudit = filterAudit === 'all' || log.audit === filterAudit

    // Date range filter
    const now = new Date()
    let matchesDate = true
    if (dateRangeFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      matchesDate = log.timestamp >= start
    } else if (dateRangeFilter === 'week') {
      const start = new Date(now)
      start.setDate(now.getDate() - now.getDay())
      start.setHours(0, 0, 0, 0)
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

  // Pagination for logs
  const LOGS_PER_PAGE = 10
  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE))
  const paginatedLogs = sortedLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE)

  // Reset page when filters or sort change
  useEffect(() => {
    setLogPage(1)
  }, [searchTerm, filterAction, filterAudit, dateRangeFilter, sortColumn, sortDirection])

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    )
  }

  const handleFindingClick = (finding: AuditFinding) => {
    setSelectedFinding(finding)
    setIsDrawerOpen(true)
  }

  // Stats
  const criticalCount = auditFindings.filter((f) => f.severity === 'critical').length

  // Create translated labels for configs
  const severityLabels: Record<Severity, string> = {
    critical: t('reports.critical'),
    high: t('reports.high'),
    medium: t('reports.medium'),
    low: t('reports.low'),
  }

  const statusLabels: Record<FindingStatus, string> = {
    remediation: t('reports.remediation'),
    resolved: t('reports.resolved'),
    verified: t('reports.verified'),
    open: t('reports.open'),
  }

  const actionLabels: Record<ActionType, string> = {
    opened: t('reports.opened'),
    closed: t('reports.closed'),
    commented: t('reports.commented'),
    uploaded: t('reports.uploaded'),
    created: t('reports.created'),
    assigned: t('reports.assigned'),
    updated: t('reports.updated'),
    reviewed: t('reports.reviewed'),
  }

  const logStatusLabels: Record<LogStatus, string> = {
    completed: t('reports.completed'),
    pending: t('reports.pending'),
    info: t('reports.info'),
    failed: t('reports.failed'),
  }

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

  // Month labels for chart localization
  const monthLabels: Record<string, string> = {
    'Jan': t('calendar.monthsShort.jan'),
    'Feb': t('calendar.monthsShort.feb'),
    'Mar': t('calendar.monthsShort.mar'),
    'Apr': t('calendar.monthsShort.apr'),
    'May': t('calendar.monthsShort.may'),
    'Jun': t('calendar.monthsShort.jun'),
    'Jul': t('calendar.monthsShort.jul'),
    'Aug': t('calendar.monthsShort.aug'),
    'Sep': t('calendar.monthsShort.sep'),
    'Oct': t('calendar.monthsShort.oct'),
    'Nov': t('calendar.monthsShort.nov'),
    'Dec': t('calendar.monthsShort.dec'),
    'Q1': t('reports.q1'),
    'Q2': t('reports.q2'),
    'Q3': t('reports.q3'),
    'Q4': t('reports.q4'),
  }

  const riskDistributionLabels: Record<string, string> = {
    operational: t('reports.operational'),
    financial: t('reports.financial'),
    compliance: t('reports.compliance'),
    strategic: t('reports.strategic'),
    reputational: t('reports.reputational'),
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
      {/* Unified Header with 3-Tab Toggle */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {activeTab === 'audits' ? t('reports.auditManagement') : t('reports.auditReports')}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {activeTab === 'audits' ? t('reports.organizationAudits') : t('reports.analyticsFindings')}
            </p>
          </div>
          {/* 3-Tab Toggle Group */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('audits')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'audits'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('reports.auditsTab')}
            </button>
            <button
              onClick={() => setActiveTab('executive')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'executive'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('reports.executiveView')}
            </button>
            <button
              onClick={() => setActiveTab('detailed')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'detailed'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('reports.auditsLogs')}
            </button>
            <button
              onClick={() => setActiveTab('risks')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'risks'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('reports.tabs.risks' as TranslationKey)}
            </button>
          </div>
        </div>
        {/* Right side controls - conditional based on activeTab */}
        <div className={`flex items-center gap-4`}>
          {activeTab === 'risks' ? (
            <>
              <div className="relative hidden md:block">
                <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
                <input
                  type="text"
                  placeholder={t('reports.searchRisks' as TranslationKey)}
                  value={riskSearchTerm}
                  onChange={(e) => setRiskSearchTerm(e.target.value)}
                  className={`${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all`}
                />
              </div>
              <button
                className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                title={t('reports.exportReports')}
                onClick={() => exportRisksLocalized(filteredRisks, 'risk-register', t, isRTL)}
              >
                <Icon icon="lucide:download-cloud" className="text-lg" />
              </button>
              <Button className="shadow-lg shadow-emerald-100" onClick={() => setShowAddRiskModal(true)}>
                <Icon icon="lucide:plus" />
                {t('reports.addRisk' as TranslationKey)}
              </Button>
            </>
          ) : activeTab === 'audits' ? (
            <>
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
            </>
          ) : (
            <>
              {/* Custom Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className={`flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer`}
                >
                  <Icon icon="lucide:filter" className="text-slate-400" />
                  <span>{filterLabels[periodFilter]}</span>
                  <Icon
                    icon="lucide:chevron-down"
                    className={cn(
                      'text-slate-400 transition-transform',
                      showFilterDropdown && 'rotate-180'
                    )}
                  />
                </button>

                {/* Dropdown Panel */}
                {showFilterDropdown && (
                  <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden`}>
                    <button
                      onClick={() => applyFilter('3months')}
                      className={cn(
                        `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer`,
                        periodFilter === '3months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      {t('reports.last3Months')}
                    </button>
                    <button
                      onClick={() => applyFilter('6months')}
                      className={cn(
                        `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer`,
                        periodFilter === '6months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      {t('reports.last6Months')}
                    </button>
                    <button
                      onClick={() => applyFilter('12months')}
                      className={cn(
                        `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer`,
                        periodFilter === '12months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      {t('reports.last12Months')}
                    </button>
                    <button
                      onClick={() => applyFilter('fiscal')}
                      className={cn(
                        `w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-3 text-sm hover:bg-slate-50 font-medium transition-colors cursor-pointer`,
                        periodFilter === 'fiscal'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      {t('reports.fiscalYear2025')}
                    </button>
                  </div>
                )}
              </div>
              <Button
                className="shadow-lg shadow-emerald-100"
                onClick={() => {
                  if (activeTab === 'executive') {
                    exportExecutiveReport(
                      complianceScore,
                      auditFindings,
                      riskDistribution,
                      'executive-report',
                      t,
                      isRTL
                    )
                  } else {
                    exportAuditLogsLocalized(filteredLogs, 'audit-logs', t, isRTL)
                  }
                }}
              >
                <Icon icon="lucide:download" />
                {t('common.exportCsv')}
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Audits Tab */}
        {activeTab === 'audits' && (
          <div className="space-y-8">
          {/* Audit Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.filteredAudits')}</p>
              <p className="text-2xl font-bold text-slate-900">{filteredAudits.length}</p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.inProgress')}</p>
              <p className="text-2xl font-bold text-emerald-600">
                {filteredAudits.filter((a) => a.status === 'in_progress').length}
              </p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.overdue')}</p>
              <p className="text-2xl font-bold text-rose-600">
                {filteredAudits.filter((a) => a.dueDate < new Date() && a.status !== 'completed').length}
              </p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.complianceScore')}</p>
              <p className="text-2xl font-bold text-blue-600">94%</p>
            </div>
          </div>

          {/* Audit Filters */}
          <Card>
            <div className="p-6 border-b border-slate-100 bg-slate-50/30">
              <h3 className={`text-sm font-bold text-slate-900 mb-4`}>{t('reports.filterAudits')}</h3>
              <div className={`flex flex-wrap items-start gap-6`}>
                <MultiSelectFilter
                  label={t('reports.source')}
                  options={auditSourceOptions}
                  selected={selectedSources}
                  onChange={setSelectedSources}
                  showAllOption
                  allLabel={t('common.all')}
                />
                <MultiSelectFilter
                  label={t('reports.frequency')}
                  options={auditFrequencyOptions}
                  selected={selectedFrequencies}
                  onChange={setSelectedFrequencies}
                  showAllOption
                  allLabel={t('common.all')}
                />
                <MultiSelectFilter
                  label={t('common.category')}
                  options={auditCategoryOptions}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                  showAllOption
                  allLabel={t('common.all')}
                />
                <MultiSelectFilter
                  label={t('reports.status')}
                  options={auditStatusOptions}
                  selected={selectedStatuses}
                  onChange={setSelectedStatuses}
                  showAllOption
                  allLabel={t('common.all')}
                />
                <MultiSelectFilter
                  label={t('reports.priority')}
                  options={auditPriorityOptions}
                  selected={selectedPriorities}
                  onChange={setSelectedPriorities}
                  showAllOption
                  allLabel={t('common.all')}
                />
              </div>
            </div>
          </Card>

          {/* Audit Table */}
          <Card>
            <div className={`p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30`}>
              <h3 className="text-sm font-bold text-slate-900">{t('reports.activeAuditPipeline')}</h3>
              <span className="text-xs text-slate-500">
                {t('reports.showingOfAudits').replace('{count}', filteredAudits.length.toString()).replace('{total}', pageAudits.length.toString())}
              </span>
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th
                      className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => handleAuditSort('auditName')}
                    >
                      {t('reports.auditName')} <AuditSortIcon field="auditName" />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.responsible')}
                    </th>
                    <th
                      className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => handleAuditSort('dueDate')}
                    >
                      {t('reports.dueDate')} <AuditSortIcon field="dueDate" />
                    </th>
                    <th
                      className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => handleAuditSort('status')}
                    >
                      {t('reports.status')} <AuditSortIcon field="status" />
                    </th>
                    <th
                      className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => handleAuditSort('priority')}
                    >
                      {t('reports.priority')} <AuditSortIcon field="priority" />
                    </th>
                    <th
                      className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors"
                      onClick={() => handleAuditSort('progress')}
                    >
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
                          <Button
                            className="mt-2"
                            onClick={() => setShowScheduleAuditModal(true)}
                          >
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
                        <tr
                          key={audit.id}
                          className="hover:bg-slate-50/50 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <Link href={`/reports/${audit.id}`} className="block">
                              <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                {audit.name}
                              </p>
                              <p className="text-[11px] text-slate-400">{audit.description}</p>
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className={`flex items-center gap-2`}>
                              <img
                                src={audit.responsible.avatar}
                                className="w-7 h-7 rounded-full bg-slate-100"
                                alt={audit.responsible.name}
                              />
                              <span className="text-sm text-slate-600 font-medium">
                                {audit.responsible.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-600 font-medium">
                              {audit.dueDate.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                calendar: 'gregory',
                              })}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            {audit.status === 'completed' && audit.closedOverdue ? (
                              <span
                                className={cn(
                                  'px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase',
                                  'bg-amber-50 text-amber-600 border-amber-100'
                                )}
                              >
                                {t('auditDetail.closedOverdue')}
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  'px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase',
                                  statusStyle.bgColor,
                                  statusStyle.textColor,
                                  statusStyle.borderColor
                                )}
                              >
                                {auditStatusLabels[audit.status]}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase',
                                priorityStyle.bgColor,
                                priorityStyle.textColor,
                                priorityStyle.borderColor
                              )}
                            >
                              {auditPriorityLabels[audit.priority]}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className={`flex items-center gap-3 w-32`}>
                              <div className={`flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden ${isRTL ? 'rotate-180' : ''}`}>
                                <div
                                  className="h-full bg-emerald-500 transition-all"
                                  style={{ width: `${audit.progress}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">
                                {audit.progress}%
                              </span>
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
                                      // Find the corresponding store audit
                                      const storeAudit = storeAudits.find(a => a.id === audit.id)
                                      if (storeAudit) {
                                        setAuditToEdit(storeAudit)
                                      }
                                      setAuditDropdownOpen(null)
                                    }}
                                    className={`w-full ${isRTL ? 'text-right' : 'text-left'} px-4 py-2.5 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer flex items-center gap-2`}
                                  >
                                    <Icon icon="lucide:edit-3" className="text-slate-400" />
                                    {t('common.edit')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Find the corresponding store audit for delete
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
            <div className={`p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/20`}>
              <p className="text-xs text-slate-500 font-medium">
                {t('reports.showingAudits').replace('{count}', filteredAudits.length.toString())}
              </p>
              <div className={`flex gap-2`}>
                <button
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer"
                  disabled
                >
                  <Icon icon="lucide:chevron-left" className={isRTL ? "flip-x" : ""} />
                </button>
                <button className="px-3 py-1 text-xs font-bold text-emerald-600 bg-white border border-slate-200 rounded shadow-sm cursor-pointer">
                  1
                </button>
                <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 cursor-pointer">
                  <Icon icon="lucide:chevron-right" className={isRTL ? "flip-x" : ""} />
                </button>
              </div>
            </div>
          </Card>
        </div>
        )}

        {/* Executive View — Compliance Health Center (Redesigned: Compact + Unique Viz) */}
        {activeTab === 'executive' && (() => {
          const healthStatus = getHealthStatus(complianceScore.overall)
          const conf = confidenceConfig[complianceScore.confidence]
          const radius = 46
          const circumference = 2 * Math.PI * radius
          const offset = circumference - (complianceScore.overall / 100) * circumference
          const totalDeduction = complianceScore.deductions.reduce((sum, d) => sum + d.points, 0)
          const deductionSeverityColors: Record<string, string> = {
            critical: 'bg-rose-100 text-rose-700',
            high: 'bg-amber-100 text-amber-700',
            medium: 'bg-slate-100 text-slate-600',
            low: 'bg-slate-100 text-slate-600',
          }
          const deductionSeverityBorder: Record<string, string> = {
            critical: 'border-l-rose-500',
            high: 'border-l-amber-500',
            medium: 'border-l-slate-300',
            low: 'border-l-slate-200',
          }
          const componentKeys: { key: keyof typeof complianceScore.components; i18n: string }[] = [
            { key: 'auditCompletion', i18n: 'compAuditCompletion' },
            { key: 'observationClosure', i18n: 'compObservationClosure' },
            { key: 'riskPosture', i18n: 'compRiskPosture' },
            { key: 'policyCurrency', i18n: 'compPolicyCurrency' },
            { key: 'trainingCompletion', i18n: 'compTrainingCompletion' },
          ]
          const frameworkEntries: { key: keyof typeof complianceScore.frameworks; i18n: string; icon: string }[] = [
            { key: 'sama', i18n: 'frameworkSama', icon: 'lucide:landmark' },
            { key: 'internal', i18n: 'frameworkInternal', icon: 'lucide:clipboard-check' },
            { key: 'sharia', i18n: 'frameworkSharia', icon: 'lucide:moon' },
          ]
          // Mini radial gauge helper
          const miniRadius = 28
          const miniCirc = 2 * Math.PI * miniRadius
          const getGaugeColor = (score: number): string => {
            if (score >= 90) return '#10b981'
            if (score >= 75) return '#3b82f6'
            if (score >= 60) return '#f59e0b'
            return '#ef4444'
          }

          return (
          <div className="space-y-3">

            {/* ROW 1: Hero Score + Frameworks side by side */}
            <div className="grid grid-cols-5 gap-3">
              {/* Hero Compliance Score — spans 2 cols */}
              <Card className="col-span-2">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className={`flex items-center gap-4`}>
                    {/* SVG Donut — compact */}
                    <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
                      <svg width="108" height="108" className="transform -rotate-90">
                        <circle cx="54" cy="54" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                        <circle
                          cx="54" cy="54" r={radius}
                          fill="none"
                          stroke={getScoreColor(complianceScore.overall)}
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-slate-900">{complianceScore.overall}%</span>
                      </div>
                    </div>

                    {/* Info stack — tighter */}
                    <div className={`flex flex-col gap-1.5 min-w-0`}>
                      <h2 className="text-sm font-bold text-slate-900 leading-tight">{t('reports.overallComplianceScore' as TranslationKey)}</h2>

                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${healthStatus.bgColor} ${healthStatus.borderColor}`}>
                        <Icon icon={healthStatus.icon} className={`w-3 h-3 ${healthStatus.color}`} />
                        <span className={`text-[10px] font-bold ${healthStatus.color}`}>{t(('reports.' + healthStatus.label) as TranslationKey)}</span>
                      </div>

                      <div className={`flex items-center gap-1`}>
                        {complianceScore.change >= 0 ? (
                          <Icon icon="lucide:trending-up" className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Icon icon="lucide:trending-down" className="w-3.5 h-3.5 text-rose-600" />
                        )}
                        <span className={`text-xs font-bold ${complianceScore.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {complianceScore.change >= 0 ? '+' : ''}{complianceScore.change}%
                        </span>
                        <span className="text-[10px] text-slate-400">{t('reports.vsLastPeriod' as TranslationKey)}</span>
                      </div>

                      <div className={`flex items-center gap-2`}>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${conf.bg} ${conf.color}`}>
                          {t(('reports.' + conf.label) as TranslationKey)}
                        </span>
                        <span className="text-[10px] text-slate-400">{filterLabels[periodFilter]}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Framework Scores — radial gauges, spans 3 cols */}
              <Card className="col-span-3">
                <CardContent className="pt-3 pb-3 px-4">
                  <h3 className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2`}>{t('reports.frameworkScores' as TranslationKey)}</h3>
                  <div className={`flex items-center justify-around`}>
                    {frameworkEntries.map(({ key, i18n, icon }) => {
                      const fwData = complianceScore.frameworks[key]
                      const fwScore = fwData.score
                      const fwOffset = miniCirc - (fwScore / 100) * miniCirc
                      return (
                        <div key={key} className="flex flex-col items-center gap-1">
                          <div className="relative" style={{ width: 68, height: 68 }}>
                            <svg width="68" height="68" className="transform -rotate-90">
                              <circle cx="34" cy="34" r={miniRadius} fill="none" stroke="#f1f5f9" strokeWidth="5" />
                              <circle
                                cx="34" cy="34" r={miniRadius}
                                fill="none"
                                stroke={getGaugeColor(fwScore)}
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={miniCirc}
                                strokeDashoffset={fwOffset}
                                className="transition-all duration-700"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold text-slate-900">{fwScore}%</span>
                            </div>
                          </div>
                          <div className={`flex items-center gap-1`}>
                            <Icon icon={icon} className="w-3 h-3 text-slate-400" />
                            <span className="text-[10px] font-medium text-slate-600">{t(('reports.' + i18n) as TranslationKey)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ROW 2: Component Breakdown — radial gauges in a tight row */}
            <div>
              <h3 className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2`}>{t('reports.componentBreakdown' as TranslationKey)}</h3>
              <div className="grid grid-cols-5 gap-2">
                {componentKeys.map(({ key, i18n }) => {
                  const comp = complianceScore.components[key]
                  const isWarning = comp.score < 75
                  const compRadius = 24
                  const compCirc = 2 * Math.PI * compRadius
                  const compOffset = compCirc - (comp.score / 100) * compCirc
                  const strokeColor = isWarning ? '#f59e0b' : '#10b981'
                  return (
                    <Card key={key} className={cn('transition-all', isWarning ? 'border-amber-200 bg-amber-50/30' : 'hover:border-slate-200')}>
                      <CardContent className="pt-3 pb-2 px-3 flex flex-col items-center gap-1">
                        {/* Mini radial gauge */}
                        <div className="relative" style={{ width: 56, height: 56 }}>
                          <svg width="56" height="56" className="transform -rotate-90">
                            <circle cx="28" cy="28" r={compRadius} fill="none" stroke="#f1f5f9" strokeWidth="4" />
                            <circle
                              cx="28" cy="28" r={compRadius}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeDasharray={compCirc}
                              strokeDashoffset={compOffset}
                              className="transition-all duration-500"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-slate-900">{comp.score}%</span>
                          </div>
                        </div>
                        <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center leading-tight">
                          {t(('reports.' + i18n) as TranslationKey)}
                        </h4>
                        <span className="text-[9px] font-medium text-slate-400">
                          {t('reports.weight' as TranslationKey)}: {comp.weight}%
                        </span>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* ROW 3: Trend + Deductions — compact two-column */}
            <div className="grid grid-cols-2 gap-3">
              {/* Compliance Trend — slim bar chart */}
              <Card>
                <CardContent className="pt-3 pb-3 px-4">
                  <div className={`flex items-center justify-between mb-2`}>
                    <div className={isRTL ? 'text-right' : ''}>
                      <h3 className="text-xs font-bold text-slate-900">{t('reports.complianceTrend')}</h3>
                      <p className="text-[10px] text-slate-400">{t('reports.historicalPerformance')}</p>
                    </div>
                    <div className={`flex gap-3`}>
                      <div className={`flex items-center gap-1`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{t('reports.target')}</span>
                      </div>
                      <div className={`flex items-center gap-1`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{t('reports.actual')}</span>
                      </div>
                    </div>
                  </div>
                  {/* Sparkline-style area + target line */}
                  {(() => {
                    if (currentTrend.length === 0) {
                      return (
                        <div className="h-32 flex items-center justify-center text-[11px] text-slate-400">
                          {t('reports.confidenceInsufficient' as TranslationKey)}
                        </div>
                      )
                    }
                    const allVals = currentTrend.flatMap((d) => [d.actual, d.target])
                    const rawMin = Math.min(...allVals)
                    const rawMax = Math.max(...allVals)
                    const yPad = Math.max((rawMax - rawMin) * 0.2, 5)
                    const yMin = Math.max(0, Math.floor(rawMin - yPad))
                    const yMax = Math.min(100, Math.ceil(rawMax + yPad))
                    const yRange = yMax - yMin || 1

                    // Percentages: X = left%, Y = top% of the chart area
                    const padXPct = 4 // % from edges
                    const chartTopPct = 8  // % from top where chart starts
                    const chartBotPct = 78 // % from top where chart ends (leaves room for labels)
                    const chartHPct = chartBotPct - chartTopPct

                    const toXPct = (i: number) => padXPct + (currentTrend.length === 1 ? (100 - padXPct * 2) / 2 : (i / (currentTrend.length - 1)) * (100 - padXPct * 2))
                    const toYPct = (val: number) => chartTopPct + chartHPct - ((val - yMin) / yRange) * chartHPct
                    const targetYPct = toYPct(currentTrend[0].target)

                    // SVG uses same percentage units (viewBox 0 0 100 100, maps to %)
                    const linePoints = currentTrend.map((d, i) => `${toXPct(i)},${toYPct(d.actual)}`).join(' ')
                    const firstX = toXPct(0)
                    const lastX = toXPct(currentTrend.length - 1)
                    const areaPath = `M${firstX},${toYPct(currentTrend[0].actual)} ${currentTrend.map((d, i) => `L${toXPct(i)},${toYPct(d.actual)}`).join(' ')} L${lastX},${chartBotPct} L${firstX},${chartBotPct} Z`

                    return (
                      <div className="relative h-36" onMouseLeave={() => setHoveredTrendIdx(null)}>
                        {/* SVG only for line, area fill, target — stretches freely */}
                        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
                          <defs>
                            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          <line x1={padXPct} y1={targetYPct} x2={100 - padXPct} y2={targetYPct} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="1.5 1" />
                          <path d={areaPath} fill="url(#trendGradient)" opacity="0.3" />
                          <polyline points={linePoints} fill="none" stroke="#10b981" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {/* HTML overlay for dots, labels, tooltips — never deformed */}
                        {currentTrend.map((d, i) => {
                          const leftPct = toXPct(i)
                          const topPct = toYPct(d.actual)
                          const isHovered = hoveredTrendIdx === i
                          const isLast = i === currentTrend.length - 1
                          const label = monthLabels[d.month] || d.month
                          const dotColor = d.actual >= d.target ? '#10b981' : '#f59e0b'
                          return (
                            <React.Fragment key={i}>
                              {/* Dot + hit area */}
                              <div
                                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                                style={{ left: `${leftPct}%`, top: `${topPct}%`, width: 24, height: 24 }}
                                onMouseEnter={() => setHoveredTrendIdx(i)}
                                onMouseLeave={() => setHoveredTrendIdx(null)}
                              >
                                <div
                                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white transition-all duration-150"
                                  style={{
                                    width: isHovered ? 10 : isLast ? 8 : 5,
                                    height: isHovered ? 10 : isLast ? 8 : 5,
                                    backgroundColor: dotColor,
                                  }}
                                />
                              </div>
                              {/* Tooltip */}
                              {isHovered && (
                                <div
                                  className="absolute -translate-x-1/2 pointer-events-none z-10"
                                  style={{ left: `${leftPct}%`, top: `calc(${topPct}% - 28px)` }}
                                >
                                  <div className="bg-slate-800/90 text-white text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap">
                                    {d.actual}%
                                  </div>
                                </div>
                              )}
                              {/* Month label */}
                              <div
                                className="absolute -translate-x-1/2"
                                style={{ left: `${leftPct}%`, top: `calc(${chartBotPct}% + 6px)` }}
                              >
                                <span className={cn(
                                  'text-[8px] font-bold uppercase',
                                  isHovered ? 'text-slate-700' : isLast ? 'text-slate-600' : 'text-slate-400'
                                )}>
                                  {label}
                                </span>
                              </div>
                            </React.Fragment>
                          )
                        })}
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* Score Deductions — heat-coded compact list */}
              <Card>
                <CardContent className="pt-3 pb-3 px-4">
                  <h3 className={`text-xs font-bold text-slate-900 mb-2`}>{t('reports.whatsImpactingScore' as TranslationKey)}</h3>
                  <div className="space-y-1">
                    {complianceScore.deductions.slice(0, 5).map((d, idx) => (
                      <div key={idx} className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded border-l-[3px] bg-slate-50/50 transition-colors hover:bg-slate-50',
                        deductionSeverityBorder[d.severity]
                      )}>
                        <span className={cn('text-[10px] font-bold min-w-[40px] text-center rounded px-1 py-0.5', deductionSeverityColors[d.severity])}>
                          {d.points}
                        </span>
                        <span className={`text-[11px] text-slate-600 leading-tight`}>{d.descriptionKey ? t(d.descriptionKey as TranslationKey, d.descriptionParams) : d.description}</span>
                      </div>
                    ))}
                  </div>
                  <div className={`flex items-center justify-between mt-2 pt-2 border-t border-slate-100`}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.totalImpact' as TranslationKey)}</span>
                    <span className="text-xs font-bold text-rose-600">{totalDeduction} {t('reports.pts' as TranslationKey)}</span>
                  </div>
                  {complianceScore.deductions.length > 5 && (
                    <button
                      onClick={() => setShowDeductionsModal(true)}
                      className={`w-full mt-2 py-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer`}
                    >
                      {t('reports.viewScoreDetails' as TranslationKey)}
                      <Icon icon="lucide:external-link" className="w-2.5 h-2.5" />
                    </button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ROW 4: Risk Distribution + Findings Table — tighter grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Risk Distribution — horizontal stacked pills */}
              <Card>
                <CardContent className="pt-3 pb-3 px-4">
                  <h3 className={`text-xs font-bold text-slate-900 mb-3`}>{t('reports.riskDistribution')}</h3>
                  {riskDistribution.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Icon icon="lucide:shield-off" className="text-2xl text-slate-300 mb-2" />
                      <p className="text-[11px] text-slate-400">{t('reports.noRiskData' as TranslationKey)}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {riskDistribution.map((risk, idx) => (
                          <div key={idx}>
                            <div className={`flex justify-between text-[10px] font-bold mb-1`}>
                              <span className="text-slate-600">{riskDistributionLabels[risk.category] || risk.category}</span>
                              <span className="text-slate-900">{risk.percentage}%</span>
                            </div>
                            <div className={`h-1.5 bg-slate-100 rounded-full overflow-hidden`}>
                              <div
                                className={cn('h-full rounded-full transition-all', risk.color)}
                                style={{ width: `${risk.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowBreakdownModal(true)}
                        className={`w-full mt-4 py-2 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer`}
                      >
                        {t('reports.viewFullBreakdown')}
                        <Icon icon="lucide:external-link" className="w-2.5 h-2.5" />
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Findings Table — dense */}
              <Card className="col-span-2">
                <CardContent className="pt-3 pb-2 px-3">
                  <div className={`flex items-center justify-between mb-2`}>
                    <h3 className="text-xs font-bold text-slate-900">{t('reports.recentAuditFindings')}</h3>
                    <div className={`flex gap-1.5`}>
                      <Badge className="bg-rose-50 text-rose-600 text-[10px] px-1.5 py-0">{criticalCount} {t('reports.critical')}</Badge>
                      <Badge className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0">{auditFindings.length} {t('reports.total')}</Badge>
                    </div>
                  </div>
                  {auditFindings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Icon icon="lucide:clipboard-check" className="text-2xl text-slate-300 mb-2" />
                      <p className="text-[11px] text-slate-400">{t('reports.noAuditFindings' as TranslationKey)}</p>
                    </div>
                  ) : (
                  <div className="overflow-x-auto">
                    <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.id')}</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.auditName')}</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.severity')}</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.owner')}</th>
                          <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.status')}</th>
                          <th className="px-2 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {auditFindings.map((finding) => (
                          <tr
                            key={finding.id}
                            onClick={() => handleFindingClick(finding)}
                            className="group hover:bg-slate-50/50 cursor-pointer transition-colors"
                          >
                            <td className="px-2 py-2 text-[10px] font-bold text-slate-400">#{finding.id}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-900">{finding.auditName}</span>
                                <span className="text-[9px] text-slate-500 uppercase tracking-tight">{finding.category}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <Badge className={cn(severityConfig[finding.severity].color, 'text-[9px] px-1.5 py-0')}>
                                {severityLabels[finding.severity].toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-2 py-2">
                              <div className={`flex items-center gap-1.5`}>
                                {finding.owner.avatar ? (
                                  <img src={finding.owner.avatar} className="w-5 h-5 rounded-full" alt={finding.owner.name} />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">{finding.owner.name.charAt(0)}</div>
                                )}
                                <span className="text-[10px] font-medium text-slate-700">{finding.owner.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <div className={`flex items-center gap-1`}>
                                <div className={cn('w-1.5 h-1.5 rounded-full', statusConfig[finding.status].dotColor)} />
                                <span className="text-[10px] font-bold text-slate-600">{statusLabels[finding.status]}</span>
                              </div>
                            </td>
                            <td className={`px-2 py-2 ${isRTL ? 'text-left' : 'text-right'}`}>
                              <div className={`flex items-center justify-end text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                <span className="text-[10px] font-bold">{t('reports.details')}</span>
                                <Icon icon="lucide:chevron-right" className={cn("w-3.5 h-3.5", isRTL && "flip-x")} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
          )
        })()}

        {/* Detailed Logs View - matches prototype 03 */}
        {activeTab === 'detailed' && (
          <div className="space-y-6">
          {/* Enhanced Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className={`min-w-0`}>
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
                <div className={`min-w-0`}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.actionType')}</label>
                  <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value as ActionType | 'all')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">{t('reports.allActions')}</option>
                    {Object.entries(actionConfig).map(([key]) => (
                      <option key={key} value={key}>{actionLabels[key as ActionType]}</option>
                    ))}
                  </select>
                </div>
                <div className={`min-w-0`}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.auditNameFilter')}</label>
                  <select
                    value={filterAudit}
                    onChange={(e) => setFilterAudit(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">{t('reports.allAudits')}</option>
                    {[...new Set(auditLogs.map(l => l.audit))].map((audit) => (
                      <option key={audit} value={audit}>{audit}</option>
                    ))}
                  </select>
                </div>
                <div className={`min-w-0`}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.dateRange')}</label>
                  <select
                    value={dateRangeFilter}
                    onChange={(e) => setDateRangeFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="today">{t('reports.today')}</option>
                    <option value="week">{t('reports.thisWeek')}</option>
                    <option value="month">{t('reports.thisMonth')}</option>
                    <option value="quarter">{t('reports.thisQuarter')}</option>
                  </select>
                </div>
              </div>
              <div className={`flex items-center justify-between`}>
                <span className="text-xs text-slate-500">
                  {t('reports.logEntriesFound').replace('{count}', filteredLogs.length.toString())}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterAudit('all'); setDateRangeFilter('month') }}
                >
                  <Icon icon="lucide:x" className="w-3 h-3" />
                  {t('reports.clearFilters')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table with Live Tracking badge */}
          <Card>
            <CardHeader>
              <div className={`flex items-center justify-between`}>
                <div className={`flex items-center gap-3`}>
                  <CardTitle>{t('reports.activityLogs')}</CardTitle>
                  <span className={`px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 uppercase flex items-center gap-1.5`}>
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
                        onClick={() => {
                          if (sortColumn === 'timestamp') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortColumn('timestamp')
                            setSortDirection('desc')
                          }
                        }}
                        className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className={`flex items-center gap-1`}>
                          {t('reports.timestamp')}
                          {sortColumn !== 'timestamp' ? (
                            <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              <Icon
                                icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
                                className="w-3 h-3 text-emerald-600"
                              />
                              <Icon
                                icon="lucide:x"
                                className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }}
                              />
                            </span>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.user')}</th>
                      <th
                        onClick={() => {
                          if (sortColumn === 'action') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortColumn('action')
                            setSortDirection('asc')
                          }
                        }}
                        className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className={`flex items-center gap-1`}>
                          {t('reports.action')}
                          {sortColumn !== 'action' ? (
                            <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              <Icon
                                icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
                                className="w-3 h-3 text-emerald-600"
                              />
                              <Icon
                                icon="lucide:x"
                                className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }}
                              />
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        onClick={() => {
                          if (sortColumn === 'audit') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortColumn('audit')
                            setSortDirection('asc')
                          }
                        }}
                        className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className={`flex items-center gap-1`}>
                          {t('reports.audit')}
                          {sortColumn !== 'audit' ? (
                            <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              <Icon
                                icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
                                className="w-3 h-3 text-emerald-600"
                              />
                              <Icon
                                icon="lucide:x"
                                className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }}
                              />
                            </span>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.description')}</th>
                      <th
                        onClick={() => {
                          if (sortColumn === 'status') {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortColumn('status')
                            setSortDirection('asc')
                          }
                        }}
                        className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors"
                      >
                        <div className={`flex items-center gap-1`}>
                          {t('reports.status')}
                          {sortColumn !== 'status' ? (
                            <Icon icon="lucide:arrow-up-down" className="w-3 h-3 text-slate-300" />
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              <Icon
                                icon={sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'}
                                className="w-3 h-3 text-emerald-600"
                              />
                              <Icon
                                icon="lucide:x"
                                className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setSortColumn(null) }}
                              />
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
                          className={cn(
                            'cursor-pointer transition-colors',
                            expandedLogs.includes(log.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                          )}
                        >
                          <td className="px-4 py-4 text-xs text-slate-500">
                            {log.timestamp.toLocaleString(isRTL ? 'ar-SA' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              calendar: 'gregory',
                            })}
                          </td>
                          <td className="px-4 py-4">
                            <div className={`flex items-center gap-2`}>
                              <img src={log.user.avatar} className="w-6 h-6 rounded-full" alt={log.user.name} />
                              <span className="text-xs font-medium text-slate-700">{log.user.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge className={actionConfig[log.action].color}>
                              {actionLabels[log.action]}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-900">{log.audit}</td>
                          <td className="px-4 py-4 text-xs text-slate-500">{log.description}</td>
                          <td className="px-4 py-4">
                            <Badge className={logStatusConfig[log.status].color}>
                              {logStatusLabels[log.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <Icon
                              icon={expandedLogs.includes(log.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                              className="w-4 h-4 text-slate-400"
                            />
                          </td>
                        </tr>
                        {expandedLogs.includes(log.id) && (
                          <tr className="animate-expand-row">
                            <td colSpan={7} className="px-4 py-4 bg-slate-50">
                              <div className={`${isRTL ? 'mr-8' : 'ml-8'} p-5 bg-white rounded-xl border border-slate-200 shadow-sm`}>
                                <div className="grid grid-cols-4 gap-6">
                                  <div className={`flex items-center gap-3`}>
                                    <img src={log.user.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt={log.user.name} />
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
                                  <div className={`mt-4 pt-4 border-t border-slate-100`}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('reports.fullContext')}</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{log.context}</p>
                                  </div>
                                )}
                                <div className={`flex gap-3 mt-4 pt-4 border-t border-slate-100`}>
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
              {/* Pagination */}
              {filteredLogs.length > LOGS_PER_PAGE && (
                <div className={`flex items-center justify-between pt-4 mt-4 border-t border-slate-100`}>
                  <span className="text-xs text-slate-500" dir="ltr">
                    {(logPage - 1) * LOGS_PER_PAGE + 1}–{Math.min(logPage * LOGS_PER_PAGE, filteredLogs.length)} / {filteredLogs.length}
                  </span>
                  <div className={`flex items-center gap-2`}>
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
        )}

        {/* Risk Register Tab */}
        {activeTab === 'risks' && (
          <div className="p-8 space-y-8">
            {/* Risk Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="p-6">
                <div className={`flex items-center gap-4`}>
                  <div className="p-3 bg-rose-50 rounded-xl">
                    <Icon icon="lucide:alert-triangle" className="text-2xl text-rose-600" />
                  </div>
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-2xl font-bold text-slate-900">{mockRiskRegister.filter(r => r.status === 'open').length}</p>
                    <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.openRisks' as TranslationKey)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className={`flex items-center gap-4`}>
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <Icon icon="lucide:clock" className="text-2xl text-amber-600" />
                  </div>
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-2xl font-bold text-slate-900">{mockRiskRegister.filter(r => r.status === 'mitigating').length}</p>
                    <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.mitigating' as TranslationKey)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className={`flex items-center gap-4`}>
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <Icon icon="lucide:check-circle" className="text-2xl text-blue-600" />
                  </div>
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-2xl font-bold text-slate-900">{mockRiskRegister.filter(r => r.status === 'accepted').length}</p>
                    <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.accepted' as TranslationKey)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className={`flex items-center gap-4`}>
                  <div className="p-3 bg-emerald-50 rounded-xl">
                    <Icon icon="lucide:shield-check" className="text-2xl text-emerald-600" />
                  </div>
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-2xl font-bold text-slate-900">{mockRiskRegister.filter(r => r.status === 'closed').length}</p>
                    <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.closed' as TranslationKey)}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Risk Matrix and List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* 5x5 Risk Matrix */}
              <Card className="p-6">
                <CardHeader className="p-0 mb-6">
                  <CardTitle className={`text-sm font-bold text-slate-900 flex items-center gap-2`}>
                    <Icon icon="lucide:grid-3x3" className="text-slate-400" />
                    {t('reports.riskMatrix' as TranslationKey)}
                  </CardTitle>
                </CardHeader>
                <div className="relative">
                  {/* Y-axis label */}
                  <div className={`absolute ${isRTL ? '-right-6' : '-left-6'} top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap`}>
                    {t('reports.impact' as TranslationKey)}
                  </div>
                  {/* Matrix Grid */}
                  <div className="pl-4">
                    <div className="grid grid-cols-5 gap-1">
                      {[5, 4, 3, 2, 1].map(impact => (
                        [1, 2, 3, 4, 5].map(likelihood => {
                          const risksInCell = mockRiskRegister.filter(r => r.likelihood === likelihood && r.impact === impact)
                          const cellKey = `${impact}-${likelihood}`
                          const currentSelection = matrixCellSelection?.cellKey === cellKey ? matrixCellSelection.index : 0
                          return (
                            <button
                              key={cellKey}
                              className={cn(
                                'aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all cursor-pointer relative',
                                getMatrixCellColor(likelihood, impact),
                                matrixCellSelection?.cellKey === cellKey && 'ring-2 ring-slate-900 ring-offset-1'
                              )}
                              onClick={() => {
                                if (risksInCell.length > 0) {
                                  // If clicking the same cell, cycle to next risk
                                  if (matrixCellSelection?.cellKey === cellKey) {
                                    const nextIndex = (currentSelection + 1) % risksInCell.length
                                    setMatrixCellSelection({ cellKey, index: nextIndex })
                                    setSelectedRisk(risksInCell[nextIndex])
                                  } else {
                                    // New cell - start at first risk
                                    setMatrixCellSelection({ cellKey, index: 0 })
                                    setSelectedRisk(risksInCell[0])
                                  }
                                  setIsRiskDrawerOpen(true)
                                }
                              }}
                            >
                              {risksInCell.length > 0 && (
                                <>
                                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold', getRiskDotColor(getRiskScore(likelihood, impact)))}>
                                    {risksInCell.length}
                                  </div>
                                  {/* Show current selection indicator if multiple risks and this cell is selected */}
                                  {risksInCell.length > 1 && matrixCellSelection?.cellKey === cellKey && (
                                    <span className="absolute -bottom-0.5 text-[8px] font-bold text-slate-600 bg-white px-1 rounded">
                                      {currentSelection + 1}/{risksInCell.length}
                                    </span>
                                  )}
                                </>
                              )}
                            </button>
                          )
                        })
                      ))}
                    </div>
                    {/* X-axis label */}
                    <div className={`text-center mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest`}>
                      {t('reports.likelihood' as TranslationKey)}
                    </div>
                  </div>
                  {/* Legend */}
                  <div className={`flex justify-center gap-4 mt-4 pt-4 border-t border-slate-100`}>
                    <div className={`flex items-center gap-1`}>
                      <div className="w-3 h-3 rounded bg-rose-500" />
                      <span className="text-[10px] font-bold text-slate-500">{t('reports.critical' as TranslationKey)}</span>
                    </div>
                    <div className={`flex items-center gap-1`}>
                      <div className="w-3 h-3 rounded bg-orange-500" />
                      <span className="text-[10px] font-bold text-slate-500">{t('reports.high' as TranslationKey)}</span>
                    </div>
                    <div className={`flex items-center gap-1`}>
                      <div className="w-3 h-3 rounded bg-amber-400" />
                      <span className="text-[10px] font-bold text-slate-500">{t('reports.medium' as TranslationKey)}</span>
                    </div>
                    <div className={`flex items-center gap-1`}>
                      <div className="w-3 h-3 rounded bg-emerald-400" />
                      <span className="text-[10px] font-bold text-slate-500">{t('reports.low' as TranslationKey)}</span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Category Distribution with Monitoring */}
              <Card className="p-6">
                <CardHeader className="p-0 mb-6">
                  <div className={`flex items-center justify-between`}>
                    <CardTitle className={`text-sm font-bold text-slate-900 flex items-center gap-2`}>
                      <Icon icon="lucide:pie-chart" className="text-slate-400" />
                      {t('reports.risksByCategory' as TranslationKey)}
                    </CardTitle>
                    <div className={`flex items-center gap-2`}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{t('reports.monitoringFrequency' as TranslationKey)}:</span>
                      <select
                        value={monitoringFrequencyFilter}
                        onChange={(e) => setMonitoringFrequencyFilter(e.target.value as MonitoringFrequency | 'all')}
                        className={`px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                      >
                        <option value="all">{t('common.all')}</option>
                        <option value="weekly">{t('reports.weekly' as TranslationKey)}</option>
                        <option value="monthly">{t('reports.monthly' as TranslationKey)}</option>
                        <option value="quarterly">{t('reports.quarterly' as TranslationKey)}</option>
                        <option value="semi_annual">{t('reports.semiAnnual' as TranslationKey)}</option>
                        <option value="annual">{t('reports.annual' as TranslationKey)}</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <div className="space-y-4">
                  {(['operational', 'financial', 'compliance', 'strategic', 'reputational'] as RiskCategory[]).map(category => {
                    const count = filteredByMonitoringFrequency.filter(r => r.category === category).length
                    const totalFiltered = filteredByMonitoringFrequency.length
                    const percentage = totalFiltered > 0 ? (count / totalFiltered) * 100 : 0
                    const config = riskCategoryConfig[category]
                    const dueCount = getDueCountForCategory(category)
                    const nextReview = getNextReviewForCategory(category)
                    const avgProgress = getAvgProgressForCategory(category)

                    if (count === 0) return null

                    return (
                      <div key={category} className="p-3 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors">
                        <div className={`flex items-center justify-between mb-2`}>
                          <div className={`flex items-center gap-2`}>
                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.color)}>
                              <Icon icon={config.icon} className="text-sm" />
                            </div>
                            <div className={isRTL ? 'text-right' : ''}>
                              <span className="text-sm font-bold text-slate-700">{config.label}</span>
                              <span className="text-xs text-slate-400 ml-2">{count} {t('reports.risk' as TranslationKey)}{count !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          <div className={`flex items-center gap-4`}>
                            {/* Due for review indicators */}
                            <div className={`flex items-center gap-1.5`}>
                              <div className={`flex gap-0.5`}>
                                {[...Array(Math.min(count, 5))].map((_, i) => (
                                  <div
                                    key={i}
                                    className={cn(
                                      'w-2 h-2 rounded-full',
                                      i < dueCount ? 'bg-rose-500' : 'bg-slate-200'
                                    )}
                                  />
                                ))}
                              </div>
                              <span className={cn(
                                'text-[10px] font-bold',
                                dueCount > 0 ? 'text-rose-600' : 'text-slate-400'
                              )}>
                                {dueCount} {t('reports.dueForReview' as TranslationKey)}
                              </span>
                            </div>
                            {/* Next review */}
                            <div className={`text-right ${isRTL ? 'text-left' : ''}`}>
                              <p className="text-[10px] text-slate-400">{t('reports.nextReview' as TranslationKey)}</p>
                              <p className="text-xs font-bold text-slate-600">{nextReview}</p>
                            </div>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className={`flex items-center justify-between text-[10px] text-slate-400 mb-1`}>
                            <span>{t('reports.progress' as TranslationKey)}</span>
                            <span className="font-bold text-slate-600">{avgProgress}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full bg-emerald-500')}
                              style={{ width: `${avgProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>

            {/* Risk List */}
            <Card>
              <CardHeader className={`flex items-center justify-between`}>
                <CardTitle className="text-sm font-bold text-slate-900">{t('reports.riskList' as TranslationKey)}</CardTitle>
                <div className={`flex items-center gap-3`}>
                  <select
                    value={riskCategoryFilter}
                    onChange={(e) => setRiskCategoryFilter(e.target.value as RiskCategory | '')}
                    className={`px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  >
                    <option value="">{t('reports.allCategories' as TranslationKey)}</option>
                    <option value="operational">{t('reports.operational' as TranslationKey)}</option>
                    <option value="financial">{t('reports.financial' as TranslationKey)}</option>
                    <option value="compliance">{t('reports.compliance' as TranslationKey)}</option>
                    <option value="strategic">{t('reports.strategic' as TranslationKey)}</option>
                    <option value="reputational">{t('reports.reputational' as TranslationKey)}</option>
                  </select>
                  <select
                    value={riskStatusFilter}
                    onChange={(e) => setRiskStatusFilter(e.target.value as RiskStatus | '')}
                    className={`px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  >
                    <option value="">{t('reports.allStatuses' as TranslationKey)}</option>
                    <option value="open">{t('reports.open' as TranslationKey)}</option>
                    <option value="mitigating">{t('reports.mitigating' as TranslationKey)}</option>
                    <option value="accepted">{t('reports.accepted' as TranslationKey)}</option>
                    <option value="closed">{t('reports.closed' as TranslationKey)}</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-y border-slate-100">
                      <tr>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('reports.risk' as TranslationKey)}</th>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('reports.category' as TranslationKey)}</th>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('reports.score' as TranslationKey)}</th>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('common.status')}</th>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('reports.owner' as TranslationKey)}</th>
                        <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRisks.map(risk => {
                        const score = getRiskScore(risk.likelihood, risk.impact)
                        const level = getRiskLevel(score)
                        const categoryConfig = riskCategoryConfig[risk.category]
                        const statusConf = riskStatusConfig[risk.status]
                        return (
                          <tr key={risk.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className={isRTL ? 'text-right' : ''}>
                                <span className="text-xs font-bold text-slate-400">{risk.id}</span>
                                <p className="text-sm font-bold text-slate-900">{risk.name}</p>
                                <p className="text-xs text-slate-500 line-clamp-1">{risk.description}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit', categoryConfig.color)}>
                                <Icon icon={categoryConfig.icon} className="text-xs" />
                                {categoryConfig.label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`flex items-center gap-2`}>
                                <div className={cn('w-3 h-3 rounded', level.bgColor)} />
                                <span className={cn('text-sm font-bold', level.color)}>{score}</span>
                                <span className="text-xs text-slate-400">({level.label})</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', statusConf.color)}>
                                {statusConf.label}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`flex items-center gap-2`}>
                                <img src={risk.owner.avatar} className="w-7 h-7 rounded-full border border-slate-200" alt={risk.owner.name} />
                                <div className={isRTL ? 'text-right' : ''}>
                                  <p className="text-xs font-bold text-slate-700">{risk.owner.name}</p>
                                  <p className="text-[10px] text-slate-400">{risk.owner.department}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => {
                                  setSelectedRisk(risk)
                                  setIsRiskDrawerOpen(true)
                                }}
                                className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                              >
                                <Icon icon="lucide:eye" className="text-lg" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Risk Breakdown Modal - matches prototype 03 */}
      <Modal
        isOpen={showBreakdownModal}
        onClose={() => setShowBreakdownModal(false)}
        size="xl"
      >
        <div className={`flex flex-col max-h-[85vh] -m-6 ${isRTL ? 'rtl' : ''}`}>
          {/* Header with bg */}
          <div className={`p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50`}>
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-xl font-bold font-display text-slate-900">{t('reports.detailedRiskBreakdown')}</h2>
              <p className="text-xs text-slate-500">{t('reports.comprehensiveAnalysis')}</p>
            </div>
            <button
              onClick={() => setShowBreakdownModal(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-2 cursor-pointer"
            >
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6 overflow-y-auto hide-scrollbar">
            {mockRiskRegister.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon icon="lucide:shield-off" className="text-4xl text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">{t('reports.noRiskData' as TranslationKey)}</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Risk Distribution by Category */}
              <div className="space-y-6">
                <h3 className={`text-[10px] font-black text-slate-400 uppercase tracking-widest`}>{t('reports.riskDistribution')}</h3>
                <div className="space-y-4">
                  {riskDistribution.map((risk, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className={`flex justify-between items-center`}>
                        <span className="text-sm font-bold text-slate-700">{riskDistributionLabels[risk.category] || risk.category}</span>
                        <span className="text-xs font-bold text-slate-600">{risk.percentage}%</span>
                      </div>
                      <div className={`h-2 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                        <div className={cn('h-full rounded-full', risk.color)} style={{ width: `${risk.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column - Risk Summary */}
              <div className="space-y-6">
                <h3 className={`text-[10px] font-black text-slate-400 uppercase tracking-widest`}>{t('reports.riskSummary' as TranslationKey)}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.totalRegisteredRisks' as TranslationKey)}</p>
                    <p className="text-2xl font-black text-slate-900">{mockRiskRegister.length}</p>
                  </div>
                  <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.avgScore' as TranslationKey)}</p>
                    <p className="text-2xl font-black text-slate-900">
                      {Math.round(mockRiskRegister.reduce((sum, r) => sum + getRiskScore(r.likelihood, r.impact), 0) / mockRiskRegister.length)}
                    </p>
                  </div>
                  {(() => {
                    const sorted = [...mockRiskRegister].sort((a, b) => getRiskScore(b.likelihood, b.impact) - getRiskScore(a.likelihood, a.impact))
                    const highest = sorted[0]
                    const lowest = sorted[sorted.length - 1]
                    return (
                      <>
                        <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm`}>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.highestRisk' as TranslationKey)}</p>
                          <p className="text-sm font-black text-rose-600 truncate">{highest.name}</p>
                          <p className="text-[10px] text-slate-500">{t('reports.score')}: {getRiskScore(highest.likelihood, highest.impact)}</p>
                        </div>
                        <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm`}>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.lowestRisk' as TranslationKey)}</p>
                          <p className="text-sm font-black text-emerald-600 truncate">{lowest.name}</p>
                          <p className="text-[10px] text-slate-500">{t('reports.score')}: {getRiskScore(lowest.likelihood, lowest.impact)}</p>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Footer */}
          <div className={`p-8 border-t border-slate-100 bg-slate-50/30 flex gap-3`}>
            <button
              onClick={() => setShowBreakdownModal(false)}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              {t('reports.dismiss')}
            </button>
            <button className={`flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer`}>
              <Icon icon="lucide:file-text" />
              {t('reports.generateDetailedReportPdf')}
            </button>
          </div>
        </div>
      </Modal>

      {/* All Deductions Modal */}
      <Modal
        isOpen={showDeductionsModal}
        onClose={() => setShowDeductionsModal(false)}
        size="lg"
      >
        <div className={`flex flex-col max-h-[85vh] -m-6 ${isRTL ? 'rtl' : ''}`}>
          {/* Header */}
          <div className={`p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50`}>
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-lg font-bold font-display text-slate-900">{t('reports.allDeductions' as TranslationKey)}</h2>
              <p className="text-xs text-slate-500">{t('reports.deductionsSummary' as TranslationKey)}</p>
            </div>
            <button
              onClick={() => setShowDeductionsModal(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-2 cursor-pointer"
            >
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto hide-scrollbar space-y-1.5">
            {complianceScore.deductions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Icon icon="lucide:shield-check" className="text-3xl text-emerald-400 mb-2" />
                <p className="text-sm text-slate-500">{t('reports.noDeductions' as TranslationKey)}</p>
              </div>
            ) : (
              complianceScore.deductions.map((d, idx) => {
                const deductionSeverityColors: Record<string, string> = {
                  critical: 'bg-rose-100 text-rose-700',
                  high: 'bg-amber-100 text-amber-700',
                  medium: 'bg-slate-100 text-slate-600',
                  low: 'bg-slate-100 text-slate-600',
                }
                const deductionSeverityBorder: Record<string, string> = {
                  critical: 'border-l-rose-500',
                  high: 'border-l-amber-500',
                  medium: 'border-l-slate-300',
                  low: 'border-l-slate-200',
                }
                return (
                  <div key={idx} className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded border-l-[3px] bg-slate-50/50 transition-colors hover:bg-slate-50',
                    deductionSeverityBorder[d.severity]
                  )}>
                    <span className={cn('text-[10px] font-bold min-w-[44px] text-center rounded px-1.5 py-0.5', deductionSeverityColors[d.severity])}>
                      {d.points}
                    </span>
                    <span className={`text-xs text-slate-600 leading-tight`}>{d.descriptionKey ? t(d.descriptionKey as TranslationKey, d.descriptionParams) : d.description}</span>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className={`p-6 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between`}>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.totalImpact' as TranslationKey)}</span>
              <span className="text-sm font-bold text-rose-600 ml-2">
                {complianceScore.deductions.reduce((sum, d) => sum + d.points, 0)} {t('reports.pts' as TranslationKey)}
              </span>
            </div>
            <button
              onClick={() => setShowDeductionsModal(false)}
              className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              {t('reports.dismiss')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Schedule Audit Modal - Using AddAuditModal component */}
      <AddAuditModal
        isOpen={showScheduleAuditModal}
        onClose={() => setShowScheduleAuditModal(false)}
        onSuccess={() => {
          fetchAudits() // Refresh the audit list after creating a new audit
        }}
      />

      {/* Finding Detail Drawer - connected to real audit data */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        size="md"
        hideBackdrop
        isRTL={isRTL}
      >
        {selectedFinding && (() => {
          const sourceAudit = storeAudits.find(a => a.id === selectedFinding.sourceAuditId)
          const auditTypeLabels: Record<string, string> = {
            sama: t('reports.samaInspection'),
            internal: t('reports.internalAudit'),
            sharia: t('reports.shariaAudit'),
          }
          const docTypeIcons: Record<string, string> = {
            pdf: 'lucide:file-text',
            image: 'lucide:image',
            doc: 'lucide:file',
          }
          const docTypeColors: Record<string, string> = {
            pdf: 'text-rose-500',
            image: 'text-blue-500',
            doc: 'text-emerald-500',
          }
          return (
          <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
            {/* Header */}
            <div className={`pb-6 border-b border-slate-100`}>
              <div className={`flex items-center justify-between mb-4`}>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{t('reports.findingDetail')}</span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:x" className="text-xl" />
                </button>
              </div>
              <h2 className="text-xl font-bold font-display text-slate-900">{selectedFinding.auditName}</h2>
              <p className="text-sm text-slate-500">{auditTypeLabels[selectedFinding.category] || selectedFinding.category}</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 space-y-8 hide-scrollbar">
              {/* Meta info row */}
              <section>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.severity')}</p>
                    <Badge className={cn(severityConfig[selectedFinding.severity].color, 'text-[10px] px-2 py-0.5')}>
                      {severityLabels[selectedFinding.severity].toUpperCase()}
                    </Badge>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.status')}</p>
                    <div className={`flex items-center gap-1.5`}>
                      <div className={cn('w-2 h-2 rounded-full', statusConfig[selectedFinding.status].dotColor)} />
                      <span className="text-xs font-bold text-slate-700">{statusLabels[selectedFinding.status]}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.dueDate')}</p>
                    <span className="text-xs font-bold text-slate-700">{selectedFinding.dueDate.toLocaleDateString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.progress')}</p>
                    <div className={`flex items-center gap-2`}>
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sourceAudit?.progress ?? 0}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-600">{sourceAudit?.progress ?? 0}%</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Assignee */}
              <section className={isRTL ? 'text-right' : ''}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.owner')}</h3>
                <div className={`flex items-center gap-3 p-3 bg-slate-50 rounded-lg`}>
                  {selectedFinding.owner.avatar ? (
                    <img src={selectedFinding.owner.avatar} className="w-8 h-8 rounded-full" alt={selectedFinding.owner.name} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{selectedFinding.owner.name.charAt(0)}</div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{selectedFinding.owner.name}</p>
                    {sourceAudit?.assignee.department && (
                      <p className="text-[10px] text-slate-500">{sourceAudit.assignee.department}</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Description */}
              <section className={isRTL ? 'text-right' : ''}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.issueSummary')}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedFinding.description}</p>

                {/* Priority Action Box */}
                {selectedFinding.severity === 'critical' && (
                  <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                    <div className={`flex items-center gap-2 text-rose-700 font-bold text-xs mb-2`}>
                      <Icon icon="lucide:alert-circle" />
                      {t('reports.priorityActionRequired')}
                    </div>
                    <p className="text-[11px] text-rose-600">{t('reports.mandatoryFixRequired')}</p>
                  </div>
                )}
              </section>

              {/* Team Members */}
              {sourceAudit?.team && sourceAudit.team.length > 0 && (
                <section className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('navigation.team' as TranslationKey)}</h3>
                  <div className="space-y-2">
                    {sourceAudit.team.map((member) => (
                      <div key={member.id} className={`flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors`}>
                        {member.avatar ? (
                          <img src={member.avatar} className="w-6 h-6 rounded-full" alt={member.name} />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500">{member.name.charAt(0)}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{member.name}</p>
                          <p className="text-[10px] text-slate-400">{member.role}</p>
                        </div>
                        {member.isOwner && (
                          <Badge className="bg-emerald-50 text-emerald-600 text-[8px] px-1.5 py-0">{t('audits.owner' as TranslationKey)}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Documents */}
              {sourceAudit?.documents && sourceAudit.documents.length > 0 && (
                <section className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('reports.evidenceArtifacts')}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {sourceAudit.documents.map((doc) => (
                      <div key={doc.id} className={`p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors`}>
                        <Icon icon={docTypeIcons[doc.type] || 'lucide:file'} className={docTypeColors[doc.type] || 'text-slate-500'} />
                        <span className="text-[10px] font-bold truncate">{doc.name}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Comments */}
              {sourceAudit?.comments && sourceAudit.comments.length > 0 && (
                <section className={isRTL ? 'text-right' : ''}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('audits.comments' as TranslationKey)}</h3>
                  <div className="space-y-3">
                    {sourceAudit.comments.map((comment) => (
                      <div key={comment.id} className="p-3 bg-slate-50 rounded-lg">
                        <div className={`flex items-center gap-2 mb-2`}>
                          {comment.author.avatar ? (
                            <img src={comment.author.avatar} className="w-5 h-5 rounded-full" alt={comment.author.name} />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500">{comment.author.name.charAt(0)}</div>
                          )}
                          <span className="text-[10px] font-bold text-slate-700">{comment.author.name}</span>
                          <span className="text-[9px] text-slate-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className={`pt-6 border-t border-slate-100 flex gap-3`}>
              <button className="flex-1 bg-slate-100 text-slate-900 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer">
                {t('reports.shareReport')}
              </button>
              {sourceAudit && (
                <Link
                  href={`/audits/${sourceAudit.id}`}
                  className={`flex-1 bg-slate-900 text-white py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-center`}
                >
                  {t('reports.viewAuditDetails')} <Icon icon="lucide:external-link" className="w-3 h-3 shrink-0" />
                </Link>
              )}
            </div>
          </div>
          )
        })()}
      </Drawer>

      {/* Risk Detail Drawer */}
      <Drawer
        isOpen={isRiskDrawerOpen}
        onClose={() => setIsRiskDrawerOpen(false)}
        title={selectedRisk?.name || t('reports.riskDetails' as TranslationKey)}
        hideBackdrop
        isRTL={isRTL}
      >
        {selectedRisk && (() => {
          const score = getRiskScore(selectedRisk.likelihood, selectedRisk.impact)
          const level = getRiskLevel(score)
          const categoryConfig = riskCategoryConfig[selectedRisk.category]
          const statusConf = riskStatusConfig[selectedRisk.status]
          return (
            <div className="space-y-6">
              {/* Risk Score */}
              <div className={`flex items-center justify-between`}>
                <div className={`flex items-center gap-3`}>
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg', level.bgColor)}>
                    {score}
                  </div>
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-xs font-bold text-slate-400 uppercase">{t('reports.riskScore' as TranslationKey)}</p>
                    <p className={cn('text-sm font-bold', level.color)}>{level.label} {t('reports.risk' as TranslationKey)}</p>
                  </div>
                </div>
                <span className={cn('px-3 py-1 text-xs font-bold rounded-full', statusConf.color)}>
                  {statusConf.label}
                </span>
              </div>

              {/* Category */}
              <div className={`p-4 bg-slate-50 rounded-xl`}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.category' as TranslationKey)}</p>
                <span className={cn('text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1', categoryConfig.color)}>
                  <Icon icon={categoryConfig.icon} />
                  {categoryConfig.label}
                </span>
              </div>

              {/* Likelihood & Impact */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 bg-slate-50 rounded-xl`}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.likelihood' as TranslationKey)}</p>
                  <p className="text-lg font-bold text-slate-900">{selectedRisk.likelihood}/5</p>
                </div>
                <div className={`p-4 bg-slate-50 rounded-xl`}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.impact' as TranslationKey)}</p>
                  <p className="text-lg font-bold text-slate-900">{selectedRisk.impact}/5</p>
                </div>
              </div>

              {/* Description */}
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.description' as TranslationKey)}</p>
                <p className="text-sm text-slate-600">{selectedRisk.description}</p>
              </div>

              {/* Owner */}
              <div className={`p-4 bg-slate-50 rounded-xl flex items-center gap-3`}>
                <img src={selectedRisk.owner.avatar} className="w-10 h-10 rounded-full border-2 border-white" alt={selectedRisk.owner.name} />
                <div className={isRTL ? 'text-right' : ''}>
                  <p className="text-xs font-bold text-slate-400 uppercase">{t('reports.owner' as TranslationKey)}</p>
                  <p className="text-sm font-bold text-slate-900">{selectedRisk.owner.name}</p>
                  <p className="text-xs text-slate-500">{selectedRisk.owner.department}</p>
                </div>
              </div>

              {/* Mitigation Plan */}
              {selectedRisk.mitigationPlan && (
                <div className={isRTL ? 'text-right' : ''}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.mitigationPlan' as TranslationKey)}</p>
                  <p className="text-sm text-slate-600">{selectedRisk.mitigationPlan}</p>
                  <div className="mt-3">
                    <div className={`flex justify-between items-center mb-1`}>
                      <span className="text-xs font-bold text-slate-500">{t('reports.progress' as TranslationKey)}</span>
                      <span className="text-xs font-bold text-emerald-600">{selectedRisk.mitigationProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selectedRisk.mitigationProgress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Monitoring Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 bg-slate-50 rounded-xl`}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.monitoringFrequency' as TranslationKey)}</p>
                  <span className="text-sm font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                    {monitoringFrequencyLabels[selectedRisk.monitoringFrequency]}
                  </span>
                </div>
                <div className={`p-4 bg-slate-50 rounded-xl`}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.nextReview' as TranslationKey)}</p>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedRisk.nextReviewDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '-'}
                  </p>
                </div>
              </div>

              {/* Audit Trail */}
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">{t('reports.auditTrail' as TranslationKey)}</p>
                <div className="relative">
                  {/* Vertical line */}
                  <div className={`absolute ${isRTL ? 'right-[7px]' : 'left-[7px]'} top-3 bottom-3 w-0.5 bg-slate-200`} />

                  <div className="space-y-4">
                    {[...selectedRisk.history].reverse().map((entry) => (
                      <div key={entry.id} className={`relative flex gap-3`}>
                        {/* Dot */}
                        <div className={cn(
                          'w-4 h-4 rounded-full shrink-0 z-10 border-2 border-white',
                          historyActionColors[entry.action]
                        )} />

                        {/* Content */}
                        <div className={`flex-1 pb-2`}>
                          <div className={`flex items-center gap-2`}>
                            <span className="text-[10px] text-slate-400">
                              {entry.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span className="text-[10px] text-slate-400">-</span>
                            <span className="text-[10px] font-bold text-slate-600">{entry.user}</span>
                          </div>
                          <p className="text-xs text-slate-900 mt-1">
                            <span className="font-bold">{historyActionLabels[entry.action]}</span>
                            {entry.previousValue && entry.newValue && (
                              <span className="text-slate-500">: {entry.previousValue} → {entry.newValue}</span>
                            )}
                            {!entry.previousValue && entry.newValue && (
                              <span className="text-slate-500">: {entry.newValue}</span>
                            )}
                          </p>
                          {entry.notes && (
                            <p className="text-[10px] text-slate-500 mt-1 italic">"{entry.notes}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className={`pt-4 border-t border-slate-100 flex gap-3`}>
                <button className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer">
                  {t('reports.exportRisk' as TranslationKey)}
                </button>
                <button className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all cursor-pointer">
                  {t('reports.editRisk' as TranslationKey)}
                </button>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* Add Risk Modal */}
      <Modal
        isOpen={showAddRiskModal}
        onClose={() => setShowAddRiskModal(false)}
        title={t('reports.addNewRisk' as TranslationKey)}
        subtitle={t('reports.createNewRiskEntry' as TranslationKey)}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
              {t('reports.riskName' as TranslationKey)} *
            </label>
            <input
              type="text"
              placeholder={t('reports.enterRiskName' as TranslationKey)}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
                {t('reports.category' as TranslationKey)} *
              </label>
              <select className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}>
                <option value="">{t('reports.selectCategory' as TranslationKey)}</option>
                <option value="operational">{t('reports.operational' as TranslationKey)}</option>
                <option value="financial">{t('reports.financial' as TranslationKey)}</option>
                <option value="compliance">{t('reports.compliance' as TranslationKey)}</option>
                <option value="strategic">{t('reports.strategic' as TranslationKey)}</option>
                <option value="reputational">{t('reports.reputational' as TranslationKey)}</option>
              </select>
            </div>
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
                {t('reports.owner' as TranslationKey)} *
              </label>
              <select className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}>
                <option value="">{t('reports.selectOwner' as TranslationKey)}</option>
                <option value="sarah">Sarah Chen - IT Security</option>
                <option value="ahmed">Ahmed Al-Rashid - Compliance</option>
                <option value="maria">Maria Lopez - Procurement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
                {t('reports.likelihood' as TranslationKey)} *
              </label>
              <select className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}>
                <option value="1">1 - Rare</option>
                <option value="2">2 - Unlikely</option>
                <option value="3">3 - Possible</option>
                <option value="4">4 - Likely</option>
                <option value="5">5 - Almost Certain</option>
              </select>
            </div>
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
                {t('reports.impact' as TranslationKey)} *
              </label>
              <select className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}>
                <option value="1">1 - Negligible</option>
                <option value="2">2 - Minor</option>
                <option value="3">3 - Moderate</option>
                <option value="4">4 - Major</option>
                <option value="5">5 - Catastrophic</option>
              </select>
            </div>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
              {t('reports.description' as TranslationKey)} *
            </label>
            <textarea
              rows={3}
              placeholder={t('reports.enterRiskDescription' as TranslationKey)}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
              {t('reports.mitigationPlan' as TranslationKey)}
            </label>
            <textarea
              rows={2}
              placeholder={t('reports.enterMitigationPlan' as TranslationKey)}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div className={`flex gap-3 mt-6`}>
            <Button
              className="flex-1"
              onClick={() => setShowAddRiskModal(false)}
            >
              <Icon icon="lucide:plus" />
              {t('reports.createRisk' as TranslationKey)}
            </Button>
            <button
              onClick={() => setShowAddRiskModal(false)}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Audit Modal */}
      <EditAuditModal
        isOpen={!!auditToEdit}
        onClose={() => setAuditToEdit(null)}
        audit={auditToEdit}
        onSuccess={() => {
          fetchAudits()
        }}
      />

      {/* Delete Audit Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setAuditToDelete(null)
        }}
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
