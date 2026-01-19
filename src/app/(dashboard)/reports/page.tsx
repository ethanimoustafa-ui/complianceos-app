'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

// Tab type for header switching
type TabValue = 'audits' | 'executive' | 'detailed'

// Types
type Severity = 'critical' | 'high' | 'medium' | 'low'
type FindingStatus = 'remediation' | 'resolved' | 'verified' | 'open'
type ActionType = 'opened' | 'closed' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated' | 'reviewed'
type LogStatus = 'completed' | 'pending' | 'info' | 'failed'

interface AuditFinding {
  id: string
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
  description: string
  status: LogStatus
  duration?: string
  context?: string
}

interface ComplianceTrendData {
  month: string
  actual: number
  target: number
}

interface RiskDistribution {
  category: string
  percentage: number
  color: string
}

// Audit types for the Audits tab
type AuditStatus = 'in_progress' | 'pending' | 'in_review' | 'completed'
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
}

const auditPriorityConfig: Record<AuditPriority, { label: string; bgColor: string; textColor: string; borderColor: string }> = {
  critical: { label: 'Critical', bgColor: 'bg-rose-50', textColor: 'text-rose-600', borderColor: 'border-rose-100' },
  high: { label: 'High', bgColor: 'bg-amber-50', textColor: 'text-amber-600', borderColor: 'border-amber-100' },
  medium: { label: 'Medium', bgColor: 'bg-slate-50', textColor: 'text-slate-500', borderColor: 'border-slate-200' },
  low: { label: 'Low', bgColor: 'bg-slate-50', textColor: 'text-slate-500', borderColor: 'border-slate-200' },
}

// Mock data
const complianceTrend: ComplianceTrendData[] = [
  { month: 'Jul', actual: 70, target: 90 },
  { month: 'Aug', actual: 75, target: 90 },
  { month: 'Sep', actual: 82, target: 90 },
  { month: 'Oct', actual: 68, target: 90 },
  { month: 'Nov', actual: 88, target: 90 },
  { month: 'Dec', actual: 84, target: 90 },
  { month: 'Jan', actual: 94, target: 90 },
  { month: 'Feb', actual: 78, target: 90 },
  { month: 'Mar', actual: 85, target: 90 },
  { month: 'Apr', actual: 72, target: 90 },
  { month: 'May', actual: 90, target: 90 },
  { month: 'Jun', actual: 92, target: 90 },
]

const riskDistribution: RiskDistribution[] = [
  { category: 'Data Privacy', percentage: 35, color: 'bg-emerald-500' },
  { category: 'Internal Access', percentage: 22, color: 'bg-amber-400' },
  { category: 'Infrastructure', percentage: 18, color: 'bg-rose-500' },
  { category: 'Regulatory Compliance', percentage: 25, color: 'bg-blue-500' },
]

const audits: Audit[] = [
  {
    id: 'audit-1',
    name: 'ISO 27001 Internal Review',
    description: 'A.9 & A.12 Controls',
    responsible: { name: 'Felix H.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    dueDate: new Date('2026-01-24'),
    status: 'in_progress',
    priority: 'critical',
    progress: 60,
  },
  {
    id: 'audit-2',
    name: 'SOC2 Type II Readiness',
    description: 'Trust Services Criteria',
    responsible: { name: 'Sarah C.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    dueDate: new Date('2026-02-15'),
    status: 'pending',
    priority: 'high',
    progress: 0,
  },
  {
    id: 'audit-3',
    name: 'GDPR Compliance Check',
    description: 'Data Processing Records',
    responsible: { name: 'Michael S.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael' },
    dueDate: new Date('2026-01-30'),
    status: 'in_review',
    priority: 'medium',
    progress: 90,
  },
  {
    id: 'audit-4',
    name: 'PCI-DSS Quarterly Scan',
    description: 'Network Vulnerabilities',
    responsible: { name: 'Sarah C.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    dueDate: new Date('2026-01-12'),
    status: 'completed',
    priority: 'high',
    progress: 100,
  },
  {
    id: 'audit-5',
    name: 'Vendor Risk Assessment',
    description: 'Cloud Service Providers',
    responsible: { name: 'Felix H.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    dueDate: new Date('2026-03-05'),
    status: 'pending',
    priority: 'low',
    progress: 0,
  },
]

const auditFindings: AuditFinding[] = [
  {
    id: 'AU-9021',
    auditName: 'ISO 27001 Access Control Review',
    category: 'Cloud Infrastructure',
    severity: 'critical',
    owner: { name: 'Sarah Connor', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    status: 'remediation',
    dueDate: new Date('2026-01-25'),
    description: 'Critical access control vulnerabilities identified in cloud infrastructure requiring immediate remediation.',
  },
  {
    id: 'AU-8834',
    auditName: 'GDPR Data Encryption Audit',
    category: 'Data Privacy',
    severity: 'medium',
    owner: { name: 'Michael Scott', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael' },
    status: 'resolved',
    dueDate: new Date('2026-01-20'),
    description: 'Data encryption audit findings related to GDPR compliance requirements.',
  },
  {
    id: 'AU-8712',
    auditName: 'Quarterly Financial Controls',
    category: 'Finance',
    severity: 'low',
    owner: { name: 'Felix H.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    status: 'verified',
    dueDate: new Date('2026-01-15'),
    description: 'Standard quarterly review of financial control procedures.',
  },
  {
    id: 'AU-9102',
    auditName: 'SAMA Cybersecurity Assessment',
    category: 'Regulatory',
    severity: 'high',
    owner: { name: 'Ahmed Al-Rashid', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed' },
    status: 'open',
    dueDate: new Date('2026-01-30'),
    description: 'Annual SAMA cybersecurity framework assessment and gap analysis.',
  },
]

const auditLogs: AuditLog[] = [
  {
    id: 'LOG-001',
    timestamp: new Date('2026-01-16T14:32:00'),
    user: { name: 'Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    action: 'closed',
    audit: 'ISO 27001 Access Control',
    description: 'Audit closed after final verification',
    status: 'completed',
    duration: '4.2 hours',
    context: 'All remediation items verified and signed off by compliance officer.',
  },
  {
    id: 'LOG-002',
    timestamp: new Date('2026-01-16T11:15:00'),
    user: { name: 'Ahmed Al-Rashid', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed' },
    action: 'commented',
    audit: 'SAMA Cybersecurity Assessment',
    description: 'Added findings summary comment',
    status: 'info',
    context: 'Initial assessment findings documented for team review.',
  },
  {
    id: 'LOG-003',
    timestamp: new Date('2026-01-16T09:45:00'),
    user: { name: 'Maria Lopez', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria' },
    action: 'uploaded',
    audit: 'GDPR Data Encryption',
    description: 'Uploaded evidence documents',
    status: 'completed',
    duration: '12 min',
    context: 'Evidence package includes encryption certificates and configuration screenshots.',
  },
  {
    id: 'LOG-004',
    timestamp: new Date('2026-01-15T16:20:00'),
    user: { name: 'David Kim', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David' },
    action: 'created',
    audit: 'Q1 Internal Controls Review',
    description: 'Created new audit task',
    status: 'pending',
    context: 'Quarterly internal controls review initiated for Q1 2026.',
  },
  {
    id: 'LOG-005',
    timestamp: new Date('2026-01-15T14:00:00'),
    user: { name: 'Emma Wilson', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma' },
    action: 'assigned',
    audit: 'NCA ECC Assessment',
    description: 'Assigned to IT Security team',
    status: 'completed',
    context: 'IT Security team assigned as primary owners for NCA ECC compliance assessment.',
  },
  {
    id: 'LOG-006',
    timestamp: new Date('2026-01-15T10:30:00'),
    user: { name: 'John Smith', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John' },
    action: 'reviewed',
    audit: 'Financial Controls Audit',
    description: 'Completed management review',
    status: 'completed',
    duration: '2.5 hours',
    context: 'Management review completed with no major findings.',
  },
  {
    id: 'LOG-007',
    timestamp: new Date('2026-01-14T15:45:00'),
    user: { name: 'Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    action: 'updated',
    audit: 'ISO 27001 Access Control',
    description: 'Updated remediation status',
    status: 'pending',
    context: 'Remediation progress updated to 85% complete.',
  },
  {
    id: 'LOG-008',
    timestamp: new Date('2026-01-14T11:00:00'),
    user: { name: 'Felix H.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    action: 'opened',
    audit: 'Vendor Risk Assessment',
    description: 'Initiated vendor risk review',
    status: 'info',
    context: 'Annual vendor risk assessment process initiated for critical vendors.',
  },
]

export default function ReportsPage() {
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
  const [showScheduleAuditModal, setShowScheduleAuditModal] = useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<string | null>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [dateRangeFilter, setDateRangeFilter] = useState('month')

  // Custom filter dropdown state
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  // Filter data for Executive View - changes based on period filter
  const filterData: Record<string, { compliance: string; findings: string; audits: number; mttr: string }> = {
    '3months': { compliance: '96.8%', findings: '03', audits: 18, mttr: '3.8d' },
    '6months': { compliance: '95.1%', findings: '05', audits: 21, mttr: '4.0d' },
    '12months': { compliance: '94.2%', findings: '08', audits: 24, mttr: '4.2d' },
    'fiscal': { compliance: '93.5%', findings: '10', audits: 26, mttr: '4.5d' },
  }

  // Filter labels for display
  const filterLabels: Record<string, string> = {
    '3months': 'Last 3 Months',
    '6months': 'Last 6 Months',
    '12months': 'Last 12 Months',
    'fiscal': 'Fiscal Year 2025',
  }

  // Apply filter and close dropdown
  const applyFilter = (filterValue: string) => {
    setPeriodFilter(filterValue)
    setShowFilterDropdown(false)
  }

  // Compliance trend data per filter - changes chart based on selection
  const complianceTrendData: Record<string, ComplianceTrendData[]> = {
    '3months': [
      { month: 'Nov', actual: 88, target: 90 },
      { month: 'Dec', actual: 92, target: 90 },
      { month: 'Jan', actual: 97, target: 90 },
    ],
    '6months': [
      { month: 'Aug', actual: 75, target: 90 },
      { month: 'Sep', actual: 82, target: 90 },
      { month: 'Oct', actual: 85, target: 90 },
      { month: 'Nov', actual: 88, target: 90 },
      { month: 'Dec', actual: 92, target: 90 },
      { month: 'Jan', actual: 95, target: 90 },
    ],
    '12months': [
      { month: 'Feb', actual: 70, target: 90 },
      { month: 'Mar', actual: 75, target: 90 },
      { month: 'Apr', actual: 78, target: 90 },
      { month: 'May', actual: 82, target: 90 },
      { month: 'Jun', actual: 80, target: 90 },
      { month: 'Jul', actual: 85, target: 90 },
      { month: 'Aug', actual: 83, target: 90 },
      { month: 'Sep', actual: 88, target: 90 },
      { month: 'Oct', actual: 86, target: 90 },
      { month: 'Nov', actual: 90, target: 90 },
      { month: 'Dec', actual: 92, target: 90 },
      { month: 'Jan', actual: 94, target: 90 },
    ],
    'fiscal': [
      { month: 'Q1', actual: 72, target: 90 },
      { month: 'Q2', actual: 80, target: 90 },
      { month: 'Q3', actual: 88, target: 90 },
      { month: 'Q4', actual: 93, target: 90 },
    ],
  }

  // Get current trend data based on filter
  const currentTrend = complianceTrendData[periodFilter]

  // Filter logs
  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch = log.audit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAction = filterAction === 'all' || log.action === filterAction
    const matchesAudit = filterAudit === 'all' || log.audit === filterAudit
    return matchesSearch && matchesAction && matchesAudit
  })

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
  const openCount = auditFindings.filter((f) => f.status === 'open' || f.status === 'remediation').length

  return (
    <div className="flex flex-col h-full">
      {/* Unified Header with 3-Tab Toggle */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {activeTab === 'audits' ? 'Audit Management' : 'Audit Reports'}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {activeTab === 'audits' ? 'Organization • Audits' : 'Analytics & Findings'}
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
              Audits
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
              Executive View
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
              Audits Logs
            </button>
          </div>
        </div>
        {/* Right side controls - conditional based on activeTab */}
        <div className="flex items-center gap-4">
          {activeTab === 'audits' ? (
            <>
              <div className="relative hidden md:block">
                <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search audits..."
                  value={auditSearchTerm}
                  onChange={(e) => setAuditSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all"
                />
              </div>
              <button
                className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                title="Export Reports"
              >
                <Icon icon="lucide:download-cloud" className="text-lg" />
              </button>
              <Button className="shadow-lg shadow-emerald-100" onClick={() => setShowScheduleAuditModal(true)}>
                <Icon icon="lucide:plus" />
                Schedule Audit
              </Button>
            </>
          ) : (
            <>
              {/* Custom Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
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
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => applyFilter('3months')}
                      className={cn(
                        'w-full text-left px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer',
                        periodFilter === '3months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      Last 3 Months
                    </button>
                    <button
                      onClick={() => applyFilter('6months')}
                      className={cn(
                        'w-full text-left px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer',
                        periodFilter === '6months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      Last 6 Months
                    </button>
                    <button
                      onClick={() => applyFilter('12months')}
                      className={cn(
                        'w-full text-left px-4 py-3 text-sm hover:bg-slate-50 font-medium border-b border-slate-100 transition-colors cursor-pointer',
                        periodFilter === '12months'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      Last 12 Months
                    </button>
                    <button
                      onClick={() => applyFilter('fiscal')}
                      className={cn(
                        'w-full text-left px-4 py-3 text-sm hover:bg-slate-50 font-medium transition-colors cursor-pointer',
                        periodFilter === 'fiscal'
                          ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                          : 'text-slate-700'
                      )}
                    >
                      Fiscal Year 2025
                    </button>
                  </div>
                )}
              </div>
              <Button className="shadow-lg shadow-emerald-100">
                <Icon icon="lucide:download" />
                Export CSV
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
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Audits</p>
              <p className="text-2xl font-bold text-slate-900">{audits.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">In Progress</p>
              <p className="text-2xl font-bold text-emerald-600">
                {audits.filter((a) => a.status === 'in_progress').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Overdue</p>
              <p className="text-2xl font-bold text-rose-600">
                {audits.filter((a) => a.dueDate < new Date() && a.status !== 'completed').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Compliance Score</p>
              <p className="text-2xl font-bold text-blue-600">94%</p>
            </div>
          </div>

          {/* Audit Table */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <h3 className="text-sm font-bold text-slate-900">Active Audit Pipeline</h3>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-md transition-all cursor-pointer">
                  All
                </button>
                <button className="px-3 py-1.5 text-xs font-bold text-emerald-600 bg-white border border-slate-200 rounded-md shadow-sm cursor-pointer">
                  Active
                </button>
                <button className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-md transition-all cursor-pointer">
                  Completed
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Audit Name
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Responsible
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Due Date
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Priority
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Progress
                    </th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audits.map((audit) => {
                    const statusStyle = auditStatusConfig[audit.status]
                    const priorityStyle = auditPriorityConfig[audit.priority]
                    return (
                      <tr
                        key={audit.id}
                        className="hover:bg-slate-50/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <Link href={`/audits/${audit.id}`} className="block">
                            <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                              {audit.name}
                            </p>
                            <p className="text-[11px] text-slate-400">{audit.description}</p>
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
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
                            {audit.dueDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase',
                              statusStyle.bgColor,
                              statusStyle.textColor,
                              statusStyle.borderColor
                            )}
                          >
                            {statusStyle.label}
                          </span>
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
                            {priorityStyle.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3 w-32">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
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
                        <td className="px-6 py-4 text-right">
                          <button className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer">
                            <Icon icon="lucide:more-horizontal" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
              <p className="text-xs text-slate-500 font-medium">
                Showing 1 to {audits.length} of {audits.length} audits
              </p>
              <div className="flex gap-2">
                <button
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer"
                  disabled
                >
                  <Icon icon="lucide:chevron-left" />
                </button>
                <button className="px-3 py-1 text-xs font-bold text-emerald-600 bg-white border border-slate-200 rounded shadow-sm cursor-pointer">
                  1
                </button>
                <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 cursor-pointer">
                  <Icon icon="lucide:chevron-right" />
                </button>
              </div>
            </div>
          </Card>
        </div>
        )}

        {/* Executive View */}
        {activeTab === 'executive' && (
          <div className="space-y-8">
          {/* Stats - uses filterData based on periodFilter */}
          <div className="grid grid-cols-4 gap-6">
            <Card className="stat-card">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Icon icon="lucide:activity" className="text-xl text-emerald-600" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">+12% vs LY</span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Compliance Score</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].compliance}</span>
                  <span className="text-xs text-slate-400">Healthy</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-rose-50 rounded-lg">
                    <Icon icon="lucide:alert-triangle" className="text-xl text-rose-600" />
                  </div>
                  <span className="text-[10px] font-bold text-rose-600">High Risk</span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Open Findings</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].findings}</span>
                  <span className="text-xs text-slate-400">Requiring Action</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Icon icon="lucide:check-circle" className="text-xl text-blue-600" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Audits Passed</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].audits}</span>
                  <span className="text-xs text-slate-400">Current Year</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Icon icon="lucide:clock" className="text-xl text-slate-600" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">MTTR</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].mttr}</span>
                  <span className="text-xs text-slate-400">Time to Resolve</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-3 gap-6">
            {/* Compliance Trend Chart */}
            <Card className="col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Compliance Trend</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">Historical performance for the selected period</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Target</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Actual</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end justify-between gap-2 border-b border-slate-100 pb-4">
                  {currentTrend.map((data, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full h-48 flex flex-col justify-end">
                        {/* Target bar (background) */}
                        <div
                          className="absolute bottom-0 w-full bg-slate-100 rounded-t-md"
                          style={{ height: `${data.target}%` }}
                        />
                        {/* Actual bar */}
                        <div
                          className={cn(
                            'relative w-full rounded-t-md transition-all duration-500',
                            data.actual >= data.target ? 'bg-emerald-500' : 'bg-emerald-400'
                          )}
                          style={{ height: `${data.actual}%` }}
                        />
                      </div>
                      <span className={cn(
                        'text-[9px] font-bold text-slate-400',
                        idx === currentTrend.length - 1 && 'text-slate-600'
                      )}>
                        {data.month.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Risk Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {riskDistribution.map((risk, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-600">{risk.category}</span>
                        <span className="text-slate-900">{risk.percentage}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
                  className="w-full mt-8 py-3 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  View Full Breakdown
                  <Icon icon="lucide:external-link" className="w-3 h-3" />
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Findings Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Audit Findings</CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-rose-50 text-rose-600">{criticalCount} Critical</Badge>
                  <Badge className="bg-slate-100 text-slate-600">{auditFindings.length} Total</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Audit Name</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Severity</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Owner</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {auditFindings.map((finding) => (
                      <tr
                        key={finding.id}
                        onClick={() => handleFindingClick(finding)}
                        className="group hover:bg-slate-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-4 text-xs font-bold text-slate-400">#{finding.id}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{finding.auditName}</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-tight">{finding.category}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Badge className={severityConfig[finding.severity].color}>
                            {severityConfig[finding.severity].label.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <img src={finding.owner.avatar} className="w-6 h-6 rounded-full" alt={finding.owner.name} />
                            <span className="text-xs font-medium text-slate-700">{finding.owner.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={cn('w-1.5 h-1.5 rounded-full', statusConfig[finding.status].dotColor)} />
                            <span className="text-xs font-bold text-slate-600">{statusConfig[finding.status].label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold">Details</span>
                            <Icon icon="lucide:chevron-right" className="w-4 h-4" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          </div>
        )}

        {/* Detailed Logs View - matches prototype 03 */}
        {activeTab === 'detailed' && (
          <div className="space-y-6">
          {/* Enhanced Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Search</label>
                  <div className="relative">
                    <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Action Type</label>
                  <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value as ActionType | 'all')}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">All Actions</option>
                    {Object.entries(actionConfig).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Audit Name</label>
                  <select
                    value={filterAudit}
                    onChange={(e) => setFilterAudit(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">All Audits</option>
                    {[...new Set(auditLogs.map(l => l.audit))].map((audit) => (
                      <option key={audit} value={audit}>{audit}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Date Range</label>
                  <select
                    value={dateRangeFilter}
                    onChange={(e) => setDateRangeFilter(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="quarter">This Quarter</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {filteredLogs.length} log entries found
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterAudit('all'); setDateRangeFilter('month') }}
                >
                  <Icon icon="lucide:x" className="w-3 h-3" />
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table with Live Tracking badge */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle>Activity Logs</CardTitle>
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 uppercase flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Live Tracking
                  </span>
                </div>
                <span className="text-sm text-slate-500">{filteredLogs.length} entries</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
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
                        <div className="flex items-center gap-1">
                          Timestamp
                          <Icon
                            icon={sortColumn === 'timestamp' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'timestamp' ? 'text-emerald-600' : 'text-slate-300')}
                          />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User</th>
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
                        <div className="flex items-center gap-1">
                          Action
                          <Icon
                            icon={sortColumn === 'action' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'action' ? 'text-emerald-600' : 'text-slate-300')}
                          />
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
                        <div className="flex items-center gap-1">
                          Audit
                          <Icon
                            icon={sortColumn === 'audit' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'audit' ? 'text-emerald-600' : 'text-slate-300')}
                          />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
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
                        <div className="flex items-center gap-1">
                          Status
                          <Icon
                            icon={sortColumn === 'status' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'status' ? 'text-emerald-600' : 'text-slate-300')}
                          />
                        </div>
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLogs.map((log) => (
                      <React.Fragment key={log.id}>
                        <tr
                          onClick={() => toggleLogExpand(log.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            expandedLogs.includes(log.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                          )}
                        >
                          <td className="px-4 py-4 text-xs text-slate-500">
                            {log.timestamp.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <img src={log.user.avatar} className="w-6 h-6 rounded-full" alt={log.user.name} />
                              <span className="text-xs font-medium text-slate-700">{log.user.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge className={actionConfig[log.action].color}>
                              {actionConfig[log.action].label}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-slate-900">{log.audit}</td>
                          <td className="px-4 py-4 text-xs text-slate-500">{log.description}</td>
                          <td className="px-4 py-4">
                            <Badge className={logStatusConfig[log.status].color}>
                              {logStatusConfig[log.status].label}
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
                              <div className="ml-8 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <div className="grid grid-cols-4 gap-6">
                                  <div className="flex items-center gap-3">
                                    <img src={log.user.avatar} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt={log.user.name} />
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Performed By</p>
                                      <p className="text-sm font-bold text-slate-900">{log.user.name}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Action ID</p>
                                    <p className="font-mono text-sm text-slate-700">{log.id}</p>
                                  </div>
                                  {log.duration && (
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                                      <p className="text-sm font-bold text-slate-900">{log.duration}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Related Docs</p>
                                    <p className="text-sm text-slate-600">2 attachments</p>
                                  </div>
                                </div>
                                {log.context && (
                                  <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Context</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{log.context}</p>
                                  </div>
                                )}
                                <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                                  <Button variant="outline" size="sm">
                                    <Icon icon="lucide:external-link" className="w-3 h-3" />
                                    View Audit Details
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <Icon icon="lucide:download" className="w-3 h-3" />
                                    Export Log Entry
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
        <div className="flex flex-col max-h-[85vh] -m-6">
          {/* Header with bg */}
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-xl font-bold font-display text-slate-900">Detailed Risk Breakdown</h2>
              <p className="text-xs text-slate-500">Comprehensive analysis across all security vectors</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Primary Vectors */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Vectors</h3>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">Cloud Infrastructure</span>
                      <span className="text-xs font-bold text-emerald-600">42.5%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '42.5%' }} />
                    </div>
                    <p className="text-[10px] text-slate-400">Includes VPC, IAM, and Storage buckets</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">User Management</span>
                      <span className="text-xs font-bold text-amber-500">28.1%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: '28.1%' }} />
                    </div>
                    <p className="text-[10px] text-slate-400">MFA compliance and orphan accounts</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">Data Encryption</span>
                      <span className="text-xs font-bold text-blue-500">15.4%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: '15.4%' }} />
                    </div>
                    <p className="text-[10px] text-slate-400">At-rest and in-transit coverage</p>
                  </div>
                </div>
              </div>

              {/* Right Column - Risk Trend Analysis */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Trend Analysis</h3>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                      <Icon icon="lucide:trending-up" className="text-2xl" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Trend Increase</p>
                      <p className="text-[10px] text-slate-500">+4.2% since last month</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Risk concentration has shifted from Infrastructure to Application Security due to recent CI/CD pipeline modifications.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Worst Performer</p>
                    <p className="text-sm font-black text-rose-600">Mobile App v2</p>
                  </div>
                  <div className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Best Performer</p>
                    <p className="text-sm font-black text-emerald-600">Core API</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex gap-3">
            <button
              onClick={() => setShowBreakdownModal(false)}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              Dismiss
            </button>
            <button className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer">
              <Icon icon="lucide:file-text" />
              Generate Detailed Report PDF
            </button>
          </div>
        </div>
      </Modal>

      {/* Schedule Audit Modal */}
      <Modal
        isOpen={showScheduleAuditModal}
        onClose={() => setShowScheduleAuditModal(false)}
        title="Schedule New Audit"
        subtitle="Create a new audit to track compliance activities"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Audit Name</label>
            <input
              type="text"
              placeholder="e.g., ISO 27001 Internal Review"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Framework</label>
              <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option>ISO 27001</option>
                <option>SOC 2 Type II</option>
                <option>GDPR</option>
                <option>PCI-DSS</option>
                <option>SAMA CSF</option>
                <option>NCA ECC</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Priority</label>
              <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Start Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Due Date</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Lead Auditor</label>
            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
              <option>Felix Henderson</option>
              <option>Sarah Connor</option>
              <option>Michael Scott</option>
              <option>Ahmed Al-Rashid</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Description</label>
            <textarea
              rows={3}
              placeholder="Brief description of the audit scope and objectives..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
          <Button variant="outline" onClick={() => setShowScheduleAuditModal(false)}>
            Cancel
          </Button>
          <Button onClick={() => setShowScheduleAuditModal(false)}>
            <Icon icon="lucide:calendar-plus" className="w-4 h-4" />
            Schedule Audit
          </Button>
        </div>
      </Modal>

      {/* Finding Detail Drawer - matches prototype 03 exactly */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        size="md"
        hideBackdrop
      >
        {selectedFinding && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="pb-6 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Finding Detail</span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:x" className="text-xl" />
                </button>
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{selectedFinding.id}</h2>
              <p className="text-sm text-slate-500">{selectedFinding.category} Review Analysis</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 space-y-10 hide-scrollbar">
              {/* Issue Summary */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Issue Summary</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedFinding.description}</p>

                {/* Priority Action Box */}
                {selectedFinding.severity === 'critical' && (
                  <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-xs mb-2">
                      <Icon icon="lucide:alert-circle" />
                      Priority Action Required
                    </div>
                    <p className="text-[11px] text-rose-600">Mandatory fix required within 48 hours to avoid non-compliance certification risks.</p>
                  </div>
                )}
              </section>

              {/* Remediation Plan */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Remediation Plan</h3>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">01</div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Identify Users</p>
                      <p className="text-[10px] text-slate-500">Generate list of all admin roles without MFA.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">02</div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">Enforce Policy</p>
                      <p className="text-[10px] text-slate-500">Update IAM policies to require MFA for all console access.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Evidence Artifacts */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Evidence Artifacts</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Icon icon="lucide:file" className="text-emerald-500" />
                    <span className="text-[10px] font-bold truncate">iam_log_v2.pdf</span>
                  </div>
                  <div className="p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Icon icon="lucide:image" className="text-blue-500" />
                    <span className="text-[10px] font-bold truncate">screenshot.png</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-slate-100 flex gap-3">
              <button className="flex-1 bg-slate-100 text-slate-900 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer">
                Share Report
              </button>
              <button className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer">
                Edit Finding <Icon icon="lucide:edit-3" />
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
