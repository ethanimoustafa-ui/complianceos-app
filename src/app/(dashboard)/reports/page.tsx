'use client'

import React, { useState, useMemo } from 'react'
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

// Tab type for header switching
type TabValue = 'audits' | 'executive' | 'detailed'

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
  source: AuditSource
  frequency: AuditFrequency
  category: AuditCategory
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
    source: 'internal_audit',
    frequency: 'annual',
    category: 'security_compliance',
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
    source: 'internal_audit',
    frequency: 'annual',
    category: 'operational_compliance',
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
    source: 'internal_audit',
    frequency: 'quarterly',
    category: 'regulatory_compliance',
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
    source: 'internal_audit',
    frequency: 'quarterly',
    category: 'security_compliance',
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
    source: 'internal_audit',
    frequency: 'semi_annual',
    category: 'operational_compliance',
  },
  {
    id: 'audit-6',
    name: 'SAMA Cybersecurity Framework',
    description: 'Annual SAMA CSF Assessment',
    responsible: { name: 'Ahmed A.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed' },
    dueDate: new Date('2026-02-28'),
    status: 'in_progress',
    priority: 'critical',
    progress: 35,
    source: 'sama_inspection',
    frequency: 'annual',
    category: 'regulatory_compliance',
  },
  {
    id: 'audit-7',
    name: 'Sharia Compliance Review',
    description: 'Product & Service Compliance',
    responsible: { name: 'Khalid M.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khalid' },
    dueDate: new Date('2026-01-20'),
    status: 'in_review',
    priority: 'high',
    progress: 85,
    source: 'sharia_audit',
    frequency: 'quarterly',
    category: 'sharia_compliance',
  },
  {
    id: 'audit-8',
    name: 'Saudization Compliance',
    description: 'HR Nitaqat Requirements',
    responsible: { name: 'Sarah C.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    dueDate: new Date('2026-03-15'),
    status: 'pending',
    priority: 'medium',
    progress: 0,
    source: 'sama_inspection',
    frequency: 'monthly',
    category: 'hr_compliance',
  },
  {
    id: 'audit-9',
    name: 'Financial Controls Review',
    description: 'Q1 Financial Audit',
    responsible: { name: 'Michael S.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael' },
    dueDate: new Date('2026-01-31'),
    status: 'in_progress',
    priority: 'high',
    progress: 45,
    source: 'internal_audit',
    frequency: 'quarterly',
    category: 'financial_compliance',
  },
  {
    id: 'audit-10',
    name: 'Ad-hoc Security Assessment',
    description: 'Post-Incident Review',
    responsible: { name: 'Felix H.', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
    dueDate: new Date('2026-01-18'),
    status: 'completed',
    priority: 'critical',
    progress: 100,
    source: 'internal_audit',
    frequency: 'ad_hoc',
    category: 'security_compliance',
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
  const { t, isRTL } = useTranslation()

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

  // Filtered audits based on selected filters
  const filteredAudits = useMemo(() => {
    return audits.filter(audit =>
      selectedSources.has(audit.source) &&
      selectedFrequencies.has(audit.frequency) &&
      selectedCategories.has(audit.category)
    )
  }, [selectedSources, selectedFrequencies, selectedCategories])

  // Filter data for Executive View - changes based on period filter
  const filterData: Record<string, { compliance: string; findings: string; audits: number; mttr: string }> = {
    '3months': { compliance: '96.8%', findings: '03', audits: 18, mttr: '3.8d' },
    '6months': { compliance: '95.1%', findings: '05', audits: 21, mttr: '4.0d' },
    '12months': { compliance: '94.2%', findings: '08', audits: 24, mttr: '4.2d' },
    'fiscal': { compliance: '93.5%', findings: '10', audits: 26, mttr: '4.5d' },
  }

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
  }

  const auditPriorityLabels: Record<AuditPriority, string> = {
    critical: t('reports.critical'),
    high: t('reports.high'),
    medium: t('reports.medium'),
    low: t('reports.low'),
  }

  const riskDistributionLabels: Record<string, string> = {
    'Data Privacy': t('reports.dataPrivacy'),
    'Internal Access': t('reports.internalAccess'),
    'Infrastructure': t('reports.infrastructure'),
    'Regulatory Compliance': t('reports.regulatoryCompliance'),
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

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      {/* Unified Header with 3-Tab Toggle */}
      <header className={`h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {activeTab === 'audits' ? t('reports.auditManagement') : t('reports.auditReports')}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {activeTab === 'audits' ? t('reports.organizationAudits') : t('reports.analyticsFindings')}
            </p>
          </div>
          {/* 3-Tab Toggle Group */}
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
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
          </div>
        </div>
        {/* Right side controls - conditional based on activeTab */}
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {activeTab === 'audits' ? (
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
                  className={`flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
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
              <Button className="shadow-lg shadow-emerald-100">
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
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${isRTL ? 'text-right' : ''}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.filteredAudits')}</p>
              <p className="text-2xl font-bold text-slate-900">{filteredAudits.length}</p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${isRTL ? 'text-right' : ''}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.inProgress')}</p>
              <p className="text-2xl font-bold text-emerald-600">
                {filteredAudits.filter((a) => a.status === 'in_progress').length}
              </p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${isRTL ? 'text-right' : ''}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.overdue')}</p>
              <p className="text-2xl font-bold text-rose-600">
                {filteredAudits.filter((a) => a.dueDate < new Date() && a.status !== 'completed').length}
              </p>
            </div>
            <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${isRTL ? 'text-right' : ''}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('reports.complianceScore')}</p>
              <p className="text-2xl font-bold text-blue-600">94%</p>
            </div>
          </div>

          {/* Audit Filters */}
          <Card className="overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/30">
              <h3 className={`text-sm font-bold text-slate-900 mb-4 ${isRTL ? 'text-right' : ''}`}>{t('reports.filterAudits')}</h3>
              <div className={`flex flex-wrap items-start gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
              </div>
            </div>
          </Card>

          {/* Audit Table */}
          <Card className="overflow-hidden">
            <div className={`p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-sm font-bold text-slate-900">{t('reports.activeAuditPipeline')}</h3>
              <span className="text-xs text-slate-500">
                {t('reports.showingOfAudits').replace('{count}', filteredAudits.length.toString()).replace('{total}', audits.length.toString())}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.auditName')}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.responsible')}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.dueDate')}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.status')}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.priority')}
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('reports.progress')}
                    </th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAudits.map((audit) => {
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
                          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
                          <div className={`flex items-center gap-3 w-32 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
            <div className={`p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/20 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <p className="text-xs text-slate-500 font-medium">
                {t('reports.showingAudits').replace('{count}', filteredAudits.length.toString())}
              </p>
              <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer"
                  disabled
                >
                  <Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} />
                </button>
                <button className="px-3 py-1 text-xs font-bold text-emerald-600 bg-white border border-slate-200 rounded shadow-sm cursor-pointer">
                  1
                </button>
                <button className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-white rounded border border-transparent hover:border-slate-200 cursor-pointer">
                  <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} />
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
              <CardContent className={`pt-6 ${isRTL ? 'text-right' : ''}`}>
                <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Icon icon="lucide:activity" className="text-xl text-emerald-600" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">+12% {t('reports.vsLY')}</span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{t('reports.complianceScore')}</h3>
                <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].compliance}</span>
                  <span className="text-xs text-slate-400">{t('reports.healthy')}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className={`pt-6 ${isRTL ? 'text-right' : ''}`}>
                <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="p-2 bg-rose-50 rounded-lg">
                    <Icon icon="lucide:alert-triangle" className="text-xl text-rose-600" />
                  </div>
                  <span className="text-[10px] font-bold text-rose-600">{t('reports.highRisk')}</span>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{t('reports.openFindings')}</h3>
                <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].findings}</span>
                  <span className="text-xs text-slate-400">{t('reports.requiringAction')}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className={`pt-6 ${isRTL ? 'text-right' : ''}`}>
                <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Icon icon="lucide:check-circle" className="text-xl text-blue-600" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{t('reports.auditsPassed')}</h3>
                <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].audits}</span>
                  <span className="text-xs text-slate-400">{t('reports.currentYear')}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card">
              <CardContent className={`pt-6 ${isRTL ? 'text-right' : ''}`}>
                <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Icon icon="lucide:clock" className="text-xl text-slate-600" />
                  </div>
                </div>
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{t('reports.mttr')}</h3>
                <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-3xl font-bold text-slate-900">{filterData[periodFilter].mttr}</span>
                  <span className="text-xs text-slate-400">{t('reports.timeToResolve')}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-3 gap-6">
            {/* Compliance Trend Chart */}
            <Card className="col-span-2">
              <CardHeader>
                <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <CardTitle>{t('reports.complianceTrend')}</CardTitle>
                    <p className="text-xs text-slate-500 mt-1">{t('reports.historicalPerformance')}</p>
                  </div>
                  <div className={`flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{t('reports.target')}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{t('reports.actual')}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`h-64 flex items-end justify-between gap-2 border-b border-slate-100 pb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
              <CardHeader className={isRTL ? 'text-right' : ''}>
                <CardTitle>{t('reports.riskDistribution')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {riskDistribution.map((risk, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className={`flex justify-between text-xs font-bold ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <span className="text-slate-600">{riskDistributionLabels[risk.category] || risk.category}</span>
                        <span className="text-slate-900">{risk.percentage}%</span>
                      </div>
                      <div className={`h-2 bg-slate-100 rounded-full overflow-hidden ${isRTL ? 'rotate-180' : ''}`}>
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
                  className={`w-full mt-8 py-3 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-xl flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  {t('reports.viewFullBreakdown')}
                  <Icon icon="lucide:external-link" className="w-3 h-3" />
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Findings Table */}
          <Card>
            <CardHeader>
              <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <CardTitle>{t('reports.recentAuditFindings')}</CardTitle>
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Badge className="bg-rose-50 text-rose-600">{criticalCount} {t('reports.critical')}</Badge>
                  <Badge className="bg-slate-100 text-slate-600">{auditFindings.length} {t('reports.total')}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.id')}</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.auditName')}</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.severity')}</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.owner')}</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.status')}</th>
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
                            {severityLabels[finding.severity].toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <img src={finding.owner.avatar} className="w-6 h-6 rounded-full" alt={finding.owner.name} />
                            <span className="text-xs font-medium text-slate-700">{finding.owner.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <div className={cn('w-1.5 h-1.5 rounded-full', statusConfig[finding.status].dotColor)} />
                            <span className="text-xs font-bold text-slate-600">{statusLabels[finding.status]}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                          <div className={`flex items-center ${isRTL ? 'justify-start flex-row-reverse' : 'justify-end'} text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity`}>
                            <span className="text-xs font-bold">{t('reports.details')}</span>
                            <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="w-4 h-4" />
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
                <div className={isRTL ? 'text-right' : ''}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.search')}</label>
                  <div className="relative">
                    <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
                    <input
                      type="text"
                      placeholder={t('reports.searchLogs')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
                    />
                  </div>
                </div>
                <div className={isRTL ? 'text-right' : ''}>
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
                <div className={isRTL ? 'text-right' : ''}>
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
                <div className={isRTL ? 'text-right' : ''}>
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
              <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
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
              <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <CardTitle>{t('reports.activityLogs')}</CardTitle>
                  <span className={`px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full border border-emerald-100 uppercase flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
                        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {t('reports.timestamp')}
                          <Icon
                            icon={sortColumn === 'timestamp' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'timestamp' ? 'text-emerald-600' : 'text-slate-300')}
                          />
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
                        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {t('reports.action')}
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
                        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {t('reports.audit')}
                          <Icon
                            icon={sortColumn === 'audit' ? (sortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down') : 'lucide:arrow-up-down'}
                            className={cn('w-3 h-3', sortColumn === 'audit' ? 'text-emerald-600' : 'text-slate-300')}
                          />
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
                        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {t('reports.status')}
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
                            {log.timestamp.toLocaleString(isRTL ? 'ar-SA' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              calendar: 'gregory',
                            })}
                          </td>
                          <td className="px-4 py-4">
                            <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
                                  <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
                                  <div className={`mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('reports.fullContext')}</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{log.context}</p>
                                  </div>
                                )}
                                <div className={`flex gap-3 mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                  <Button variant="outline" size="sm">
                                    <Icon icon="lucide:external-link" className="w-3 h-3" />
                                    {t('reports.viewAuditDetails')}
                                  </Button>
                                  <Button variant="ghost" size="sm">
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
          <div className={`p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Primary Vectors */}
              <div className="space-y-6">
                <h3 className={`text-[10px] font-black text-slate-400 uppercase tracking-widest ${isRTL ? 'text-right' : ''}`}>{t('reports.primaryVectors')}</h3>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-bold text-slate-700">{t('reports.cloudInfrastructure')}</span>
                      <span className="text-xs font-bold text-emerald-600">42.5%</span>
                    </div>
                    <div className={`h-2 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '42.5%' }} />
                    </div>
                    <p className={`text-[10px] text-slate-400 ${isRTL ? 'text-right' : ''}`}>{t('reports.includesVpcIam')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-bold text-slate-700">{t('reports.userManagement')}</span>
                      <span className="text-xs font-bold text-amber-500">28.1%</span>
                    </div>
                    <div className={`h-2 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: '28.1%' }} />
                    </div>
                    <p className={`text-[10px] text-slate-400 ${isRTL ? 'text-right' : ''}`}>{t('reports.mfaCompliance')}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-sm font-bold text-slate-700">{t('reports.dataEncryption')}</span>
                      <span className="text-xs font-bold text-blue-500">15.4%</span>
                    </div>
                    <div className={`h-2 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: '15.4%' }} />
                    </div>
                    <p className={`text-[10px] text-slate-400 ${isRTL ? 'text-right' : ''}`}>{t('reports.atRestInTransit')}</p>
                  </div>
                </div>
              </div>

              {/* Right Column - Risk Trend Analysis */}
              <div className="space-y-6">
                <h3 className={`text-[10px] font-black text-slate-400 uppercase tracking-widest ${isRTL ? 'text-right' : ''}`}>{t('reports.riskTrendAnalysis')}</h3>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className={`flex items-center gap-4 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                      <Icon icon="lucide:trending-up" className="text-2xl" />
                    </div>
                    <div className={isRTL ? 'text-right' : ''}>
                      <p className="text-xs font-bold text-slate-900">{t('reports.trendIncrease')}</p>
                      <p className="text-[10px] text-slate-500">+4.2% {t('reports.sinceLastMonth')}</p>
                    </div>
                  </div>
                  <p className={`text-xs text-slate-600 leading-relaxed ${isRTL ? 'text-right' : ''}`}>
                    {t('reports.riskShiftDescription')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm ${isRTL ? 'text-right' : ''}`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.worstPerformer')}</p>
                    <p className="text-sm font-black text-rose-600">Mobile App v2</p>
                  </div>
                  <div className={`p-4 bg-white border border-slate-100 rounded-xl shadow-sm ${isRTL ? 'text-right' : ''}`}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('reports.bestPerformer')}</p>
                    <p className="text-sm font-black text-emerald-600">Core API</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`p-8 border-t border-slate-100 bg-slate-50/30 flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => setShowBreakdownModal(false)}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all cursor-pointer"
            >
              {t('reports.dismiss')}
            </button>
            <button className={`flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:file-text" />
              {t('reports.generateDetailedReportPdf')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Schedule Audit Modal */}
      <Modal
        isOpen={showScheduleAuditModal}
        onClose={() => setShowScheduleAuditModal(false)}
        title={t('reports.scheduleNewAudit')}
        subtitle={t('reports.createNewAudit')}
        size="lg"
      >
        <div className={`space-y-6 ${isRTL ? 'rtl text-right' : ''}`}>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.auditNameLabel')}</label>
            <input
              type="text"
              placeholder={t('reports.auditNamePlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.framework')}</label>
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.priority')}</label>
              <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option>{t('reports.critical')}</option>
                <option>{t('reports.high')}</option>
                <option>{t('reports.medium')}</option>
                <option>{t('reports.low')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.startDate')}</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.dueDate')}</label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.leadAuditor')}</label>
            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
              <option>Felix Henderson</option>
              <option>Sarah Connor</option>
              <option>Michael Scott</option>
              <option>Ahmed Al-Rashid</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('reports.descriptionLabel')}</label>
            <textarea
              rows={3}
              placeholder={t('reports.descriptionPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
            />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowScheduleAuditModal(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => setShowScheduleAuditModal(false)}>
            <Icon icon="lucide:calendar-plus" className="w-4 h-4" />
            {t('reports.scheduleAudit')}
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
          <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
            {/* Header */}
            <div className={`pb-6 border-b border-slate-100 ${isRTL ? 'text-right' : ''}`}>
              <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{t('reports.findingDetail')}</span>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:x" className="text-xl" />
                </button>
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{selectedFinding.id}</h2>
              <p className="text-sm text-slate-500">{selectedFinding.category} {t('reports.reviewAnalysis')}</p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto py-6 space-y-10 hide-scrollbar">
              {/* Issue Summary */}
              <section className={isRTL ? 'text-right' : ''}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('reports.issueSummary')}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{selectedFinding.description}</p>

                {/* Priority Action Box */}
                {selectedFinding.severity === 'critical' && (
                  <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                    <div className={`flex items-center gap-2 text-rose-700 font-bold text-xs mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <Icon icon="lucide:alert-circle" />
                      {t('reports.priorityActionRequired')}
                    </div>
                    <p className="text-[11px] text-rose-600">{t('reports.mandatoryFixRequired')}</p>
                  </div>
                )}
              </section>

              {/* Remediation Plan */}
              <section className={isRTL ? 'text-right' : ''}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('reports.remediationPlan')}</h3>
                <div className="space-y-4">
                  <div className={`flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">01</div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{t('reports.identifyUsers')}</p>
                      <p className="text-[10px] text-slate-500">{t('reports.identifyUsersDesc')}</p>
                    </div>
                  </div>
                  <div className={`flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold shrink-0">02</div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{t('reports.enforcePolicy')}</p>
                      <p className="text-[10px] text-slate-500">{t('reports.enforcePolicyDesc')}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Evidence Artifacts */}
              <section className={isRTL ? 'text-right' : ''}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t('reports.evidenceArtifacts')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:file" className="text-emerald-500" />
                    <span className="text-[10px] font-bold truncate">iam_log_v2.pdf</span>
                  </div>
                  <div className={`p-3 border border-slate-100 rounded-lg flex items-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:image" className="text-blue-500" />
                    <span className="text-[10px] font-bold truncate">screenshot.png</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className={`pt-6 border-t border-slate-100 flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button className="flex-1 bg-slate-100 text-slate-900 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer">
                {t('reports.shareReport')}
              </button>
              <button className={`flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                {t('reports.editFinding')} <Icon icon="lucide:edit-3" />
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
