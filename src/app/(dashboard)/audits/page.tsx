'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

// Types
interface AuditFinding {
  id: string
  name: string
  category: string
  severity: 'critical' | 'medium' | 'low'
  owner: { name: string; avatar: string }
  status: 'remediation' | 'resolved' | 'verified'
}

interface AuditLog {
  id: number
  timestamp: string
  audit: string
  action: string
  description: string
  status: 'completed' | 'pending' | 'info' | 'failed'
  user: string
}

// Sample data
const auditFindings: AuditFinding[] = [
  {
    id: 'AU-9021',
    name: 'ISO 27001 Access Control Review',
    category: 'Cloud Infrastructure',
    severity: 'critical',
    owner: { name: 'Sarah Connor', avatar: 'Sarah' },
    status: 'remediation',
  },
  {
    id: 'AU-8834',
    name: 'GDPR Data Encryption Audit',
    category: 'Data Privacy',
    severity: 'medium',
    owner: { name: 'Michael Scott', avatar: 'Michael' },
    status: 'resolved',
  },
  {
    id: 'AU-8712',
    name: 'Quarterly Financial Controls',
    category: 'Finance',
    severity: 'low',
    owner: { name: 'Felix H.', avatar: 'Felix' },
    status: 'verified',
  },
]

const auditLogs: AuditLog[] = [
  { id: 1, timestamp: '2024-12-15 15:42:18', audit: 'ISO 27001 Access Control', action: 'Audit Opened', description: 'Audit session initiated by Sarah Connor', status: 'completed', user: 'Sarah' },
  { id: 2, timestamp: '2024-12-15 15:35:45', audit: 'GDPR Data Encryption', action: 'Comment Added', description: 'Added compliance note regarding encryption standards', status: 'info', user: 'Michael' },
  { id: 3, timestamp: '2024-12-15 15:22:33', audit: 'SOC 2 Type II Review', action: 'File Uploaded', description: 'Uploaded evidence file: security_report_v3.pdf', status: 'completed', user: 'Felix' },
  { id: 4, timestamp: '2024-12-15 15:08:12', audit: 'PCI DSS Compliance', action: 'Status Changed', description: 'Changed status from In Progress to Under Review', status: 'pending', user: 'Emma' },
  { id: 5, timestamp: '2024-12-15 14:58:47', audit: 'ISO 27001 Access Control', action: 'Finding Added', description: 'Added critical finding: MFA not enforced on admin accounts', status: 'completed', user: 'Sarah' },
  { id: 6, timestamp: '2024-12-15 14:42:29', audit: 'Financial Controls Quarterly', action: 'Audit Created', description: 'Created new audit for Q4 2024 financial controls', status: 'completed', user: 'John' },
  { id: 7, timestamp: '2024-12-15 14:28:15', audit: 'GDPR Data Encryption', action: 'Assigned To', description: 'Assigned audit to Michael Scott for review', status: 'completed', user: 'Admin' },
  { id: 8, timestamp: '2024-12-15 14:15:08', audit: 'HIPAA Privacy Assessment', action: 'Risk Assessment', description: 'Completed risk assessment with high priority items flagged', status: 'completed', user: 'Sophia' },
]

const riskDistribution = [
  { label: 'Data Privacy', percentage: 35, color: 'bg-emerald-500' },
  { label: 'Internal Access', percentage: 22, color: 'bg-amber-400' },
  { label: 'Infrastructure', percentage: 18, color: 'bg-rose-500' },
  { label: 'Regulatory Compliance', percentage: 25, color: 'bg-blue-500' },
]

const complianceTrend = [
  { month: 'JUL', value: 70 },
  { month: 'AUG', value: 75 },
  { month: 'SEP', value: 82 },
  { month: 'OCT', value: 68 },
  { month: 'NOV', value: 88 },
  { month: 'DEC', value: 84 },
  { month: 'JAN', value: 94 },
  { month: 'FEB', value: 78 },
  { month: 'MAR', value: 85 },
  { month: 'APR', value: 72 },
  { month: 'MAY', value: 90 },
  { month: 'JUN', value: 92 },
]

export default function AuditsPage() {
  const [activeTab, setActiveTab] = useState<'executive' | 'detailed'>('executive')
  const [filterPeriod, setFilterPeriod] = useState('Last 12 Months')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showBreakdownModal, setShowBreakdownModal] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<AuditFinding | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)

  // Log filters
  const [searchQuery, setSearchQuery] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('all')
  const [auditNameFilter, setAuditNameFilter] = useState('all')
  const [dateRangeFilter, setDateRangeFilter] = useState('month')
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.audit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.action.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesAction = actionTypeFilter === 'all' || log.action === actionTypeFilter
    const matchesAudit = auditNameFilter === 'all' || log.audit === auditNameFilter
    return matchesSearch && matchesAction && matchesAudit
  })

  const clearFilters = () => {
    setSearchQuery('')
    setActionTypeFilter('all')
    setAuditNameFilter('all')
    setDateRangeFilter('month')
  }

  const handleFindingClick = (finding: AuditFinding) => {
    setSelectedFinding(finding)
    setShowDrawer(true)
  }

  return (
    <>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">Audit Reports</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Analytics & Findings</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('executive')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === 'executive'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Executive View
            </button>
            <button
              onClick={() => setActiveTab('detailed')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === 'detailed'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Detailed Logs
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-2 border border-slate-200 rounded-lg"
            >
              <Icon icon="lucide:filter" className="text-slate-400" />
              <span>{filterPeriod}</span>
              <Icon icon="lucide:chevron-down" className={`text-slate-400 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {['Last 3 Months', 'Last 6 Months', 'Last 12 Months', 'Fiscal Year 2023'].map((period) => (
                  <button
                    key={period}
                    onClick={() => {
                      setFilterPeriod(period)
                      setShowFilterDropdown(false)
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors font-medium border-b border-slate-100 last:border-b-0 ${
                      filterPeriod === period
                        ? 'text-emerald-600 bg-emerald-50/30 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="primary" className="shadow-lg shadow-emerald-100">
            <Icon icon="lucide:download" />
            Export CSV
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto custom-scrollbar p-8 space-y-8">
        {/* Analytics Overview */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard
            icon="lucide:activity"
            iconColor="emerald"
            label="Compliance Score"
            value="94.2%"
            sublabel="Healthy"
            badge="+12% vs LY"
            badgeColor="emerald"
          />
          <StatCard
            icon="lucide:alert-triangle"
            iconColor="rose"
            label="Open Findings"
            value="08"
            sublabel="Requiring Action"
            badge="High Risk"
            badgeColor="rose"
          />
          <StatCard
            icon="lucide:check-circle"
            iconColor="blue"
            label="Audits Passed"
            value="24"
            sublabel="Current Year"
          />
          <StatCard
            icon="lucide:clock"
            iconColor="slate"
            label="MTTR"
            value="4.2d"
            sublabel="Time to Resolve"
          />
        </section>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trend Chart */}
          <Card className="lg:col-span-2 p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-lg font-bold font-display text-slate-900">Compliance Trend</h2>
                <p className="text-xs text-slate-500">Historical performance for the selected period</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-100"></div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Target</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Actual</span>
                </div>
              </div>
            </div>
            <div className="h-64 w-full flex items-end justify-between px-2 pb-4 border-b border-slate-100">
              {complianceTrend.map((item, index) => (
                <div key={item.month} className="group relative flex-1 mx-1 min-w-[32px] flex flex-col items-center gap-1">
                  <div className="relative w-full h-48 flex items-end">
                    <div className="bg-slate-100 h-full w-full rounded-t-md opacity-50 absolute bottom-0"></div>
                    <div
                      className="bg-emerald-500 w-full rounded-t-md absolute bottom-0 shadow-lg shadow-emerald-500/10 transition-all duration-500"
                      style={{ height: `${item.value}%` }}
                    ></div>
                  </div>
                  <span className={`text-[9px] font-bold text-center mt-2 ${index === 6 ? 'text-slate-600 font-black' : 'text-slate-400'}`}>
                    {item.month}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Risk Distribution */}
          <Card className="p-8 flex flex-col">
            <h2 className="text-lg font-bold font-display text-slate-900 mb-6">Risk Distribution</h2>
            <div className="space-y-6 flex-1">
              {riskDistribution.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="text-slate-900">{item.percentage}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percentage}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowBreakdownModal(true)}
              className="w-full mt-8 py-3 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-xl group flex items-center justify-center gap-2"
            >
              View Full Breakdown
              <Icon icon="lucide:external-link" className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </Card>
        </div>

        {/* Tab Content */}
        {activeTab === 'executive' ? (
          <ExecutiveView
            findings={auditFindings}
            onFindingClick={handleFindingClick}
          />
        ) : (
          <DetailedLogsView
            logs={filteredLogs}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            actionTypeFilter={actionTypeFilter}
            setActionTypeFilter={setActionTypeFilter}
            auditNameFilter={auditNameFilter}
            setAuditNameFilter={setAuditNameFilter}
            dateRangeFilter={dateRangeFilter}
            setDateRangeFilter={setDateRangeFilter}
            clearFilters={clearFilters}
            expandedLogId={expandedLogId}
            setExpandedLogId={setExpandedLogId}
          />
        )}
      </div>

      {/* Risk Breakdown Modal */}
      <Modal isOpen={showBreakdownModal} onClose={() => setShowBreakdownModal(false)} title="Detailed Risk Breakdown" size="lg">
        <div className="space-y-6">
          <p className="text-xs text-slate-500">Comprehensive analysis across all security vectors</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Vectors</h3>
              <div className="space-y-4">
                <RiskBreakdownItem label="Cloud Infrastructure" percentage={42.5} color="emerald" description="Includes VPC, IAM, and Storage buckets" />
                <RiskBreakdownItem label="User Management" percentage={28.1} color="amber" description="MFA compliance and orphan accounts" />
                <RiskBreakdownItem label="Data Encryption" percentage={15.4} color="blue" description="At-rest and in-transit coverage" />
              </div>
            </div>
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
        <div className="mt-6 pt-6 border-t border-slate-100 flex gap-3">
          <Button variant="outline" onClick={() => setShowBreakdownModal(false)}>Dismiss</Button>
          <Button variant="primary" className="flex-1">
            <Icon icon="lucide:file-text" />
            Generate Detailed Report PDF
          </Button>
        </div>
      </Modal>

      {/* Finding Detail Drawer */}
      <div className={`fixed top-0 right-0 h-full w-[400px] bg-white border-l border-slate-200 shadow-2xl z-50 transition-transform duration-300 ${showDrawer ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedFinding && (
          <div className="flex flex-col h-full">
            <div className="p-8 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Finding Detail</span>
                <button onClick={() => setShowDrawer(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <Icon icon="lucide:x" className="text-xl" />
                </button>
              </div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{selectedFinding.id}</h2>
              <p className="text-sm text-slate-500">Access Control Review Analysis</p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Issue Summary</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Several administrative accounts were found without Multi-Factor Authentication (MFA) enabled. This violates section A.9 of ISO 27001 standards regarding user access management.
                </p>
                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                  <div className="flex items-center gap-2 text-rose-700 font-bold text-xs mb-2">
                    <Icon icon="lucide:alert-circle" />
                    Priority Action Required
                  </div>
                  <p className="text-[11px] text-rose-600">Mandatory fix required within 48 hours to avoid non-compliance certification risks.</p>
                </div>
              </section>

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

            <div className="p-8 border-t border-slate-100">
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1">Share Report</Button>
                <Button variant="dark" className="flex-1">
                  Edit Finding <Icon icon="lucide:edit-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      {showDrawer && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowDrawer(false)} />}
    </>
  )
}

// Stat Card Component
function StatCard({
  icon,
  iconColor,
  label,
  value,
  sublabel,
  badge,
  badgeColor,
}: {
  icon: string
  iconColor: 'emerald' | 'rose' | 'blue' | 'slate'
  label: string
  value: string
  sublabel: string
  badge?: string
  badgeColor?: 'emerald' | 'rose'
}) {
  const iconColorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  const badgeColorClasses = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  }

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 ${iconColorClasses[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-xl" />
        </div>
        {badge && badgeColor && (
          <span className={`text-[10px] font-black ${badgeColorClasses[badgeColor]}`}>{badge}</span>
        )}
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black font-display text-slate-900">{value}</span>
        <span className="text-xs text-slate-400 font-medium">{sublabel}</span>
      </div>
    </Card>
  )
}

// Executive View Component
function ExecutiveView({
  findings,
  onFindingClick
}: {
  findings: AuditFinding[]
  onFindingClick: (finding: AuditFinding) => void
}) {
  const severityStyles = {
    critical: 'bg-rose-100 text-rose-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-emerald-100 text-emerald-700',
  }
  const statusStyles = {
    remediation: { dot: 'bg-amber-500', text: 'Remediation' },
    resolved: { dot: 'bg-emerald-500', text: 'Resolved' },
    verified: { dot: 'bg-emerald-500', text: 'Verified' },
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-lg font-bold font-display text-slate-900">Recent Audit Findings</h2>
        <div className="flex gap-2">
          <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">4 Critical</span>
          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">12 Total</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Name</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Severity</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Owner</th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-8 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {findings.map((finding) => (
              <tr
                key={finding.id}
                className="group transition-colors hover:bg-slate-50/50 cursor-pointer"
                onClick={() => onFindingClick(finding)}
              >
                <td className="px-8 py-5 text-xs font-bold text-slate-400">#{finding.id}</td>
                <td className="px-8 py-5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">{finding.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-tighter">{finding.category}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <span className={`px-2.5 py-1 ${severityStyles[finding.severity]} text-[9px] font-black rounded-lg uppercase`}>
                    {finding.severity}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${finding.owner.avatar}`}
                      className="w-6 h-6 rounded-full"
                      alt={finding.owner.name}
                    />
                    <span className="text-xs font-medium text-slate-700">{finding.owner.name}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusStyles[finding.status].dot}`}></div>
                    <span className="text-xs font-bold text-slate-600">{statusStyles[finding.status].text}</span>
                  </div>
                </td>
                <td className="px-8 py-5 text-right">
                  <div className="flex items-center justify-end text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-bold">Details</span>
                    <Icon icon="lucide:chevron-right" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-8 py-4 bg-slate-50/50 flex justify-center border-t border-slate-100">
        <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
          Load More Findings
        </button>
      </div>
    </Card>
  )
}

// Detailed Logs View Component
function DetailedLogsView({
  logs,
  searchQuery,
  setSearchQuery,
  actionTypeFilter,
  setActionTypeFilter,
  auditNameFilter,
  setAuditNameFilter,
  dateRangeFilter,
  setDateRangeFilter,
  clearFilters,
  expandedLogId,
  setExpandedLogId,
}: {
  logs: AuditLog[]
  searchQuery: string
  setSearchQuery: (value: string) => void
  actionTypeFilter: string
  setActionTypeFilter: (value: string) => void
  auditNameFilter: string
  setAuditNameFilter: (value: string) => void
  dateRangeFilter: string
  setDateRangeFilter: (value: string) => void
  clearFilters: () => void
  expandedLogId: number | null
  setExpandedLogId: (id: number | null) => void
}) {
  const statusStyles = {
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
    failed: { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
    info: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  }

  const actionTypes = ['Audit Opened', 'Audit Closed', 'Comment Added', 'File Uploaded', 'Audit Created', 'Status Changed', 'Assigned To', 'Finding Added', 'Risk Assessment']
  const auditNames = ['ISO 27001 Access Control', 'GDPR Data Encryption', 'SOC 2 Type II Review', 'PCI DSS Compliance', 'Financial Controls Quarterly', 'HIPAA Privacy Assessment']

  return (
    <div className="space-y-6">
      {/* Log Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Search Activity</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by audit name, action..."
                className="w-full px-4 py-2 pl-10 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
              <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Action Type</label>
            <select
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            >
              <option value="all">All Actions</option>
              {actionTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Audit Name</label>
            <select
              value={auditNameFilter}
              onChange={(e) => setAuditNameFilter(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            >
              <option value="all">All Audits</option>
              {auditNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Date Range</label>
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2 items-center">
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
          <span className="text-xs text-slate-500">Showing {logs.length} activity logs</span>
        </div>
      </Card>

      {/* Audit Activity Logs Table */}
      <Card className="overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold font-display text-slate-900">Audit Activity Logs</h2>
            <p className="text-xs text-slate-500">Comprehensive timeline of all audit-related actions</p>
          </div>
          <Badge variant="success" size="sm">Live Tracking</Badge>
        </div>
        <div className="overflow-x-auto">
          <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors">
                    Timestamp <Icon icon="lucide:arrow-up-down" className="text-[10px] inline ml-1 opacity-30" />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors">
                    Audit Name <Icon icon="lucide:arrow-up-down" className="text-[10px] inline ml-1 opacity-30" />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors">
                    Action Type <Icon icon="lucide:arrow-up-down" className="text-[10px] inline ml-1 opacity-30" />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-100 transition-colors">
                    Status <Icon icon="lucide:arrow-up-down" className="text-[10px] inline ml-1 opacity-30" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      className={`group hover:bg-slate-50/50 cursor-pointer transition-colors ${expandedLogId === log.id ? 'bg-slate-50' : ''}`}
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    >
                      <td className="px-6 py-4 text-xs text-slate-600 font-medium">{log.timestamp}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-900">{log.audit}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 ${statusStyles[log.status].bg} ${statusStyles[log.status].text} text-[9px] font-black rounded-lg uppercase`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{log.description}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${statusStyles[log.status].dot}`}></div>
                          <span className="text-xs font-bold text-slate-600 capitalize">{log.status}</span>
                        </div>
                      </td>
                    </tr>
                    {expandedLogId === log.id && (
                      <tr key={`${log.id}-details`}>
                        <td colSpan={5} className="px-6 py-0">
                          <div className="bg-slate-50 rounded-lg p-6 space-y-4 mb-2">
                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">User</p>
                                <div className="flex items-center gap-2">
                                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user}`} className="w-6 h-6 rounded-full" alt="User" />
                                  <span className="text-sm font-bold text-slate-900">{log.user}</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Action ID</p>
                                <p className="text-sm font-mono text-slate-900">ACT-{1000 + log.id}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                                <p className="text-sm text-slate-900">{Math.floor(Math.random() * 5) + 1} minutes</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Related Docs</p>
                                <p className="text-sm text-slate-900">{Math.floor(Math.random() * 3) + 1} files</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Full Context</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{log.description}. This action was performed as part of the {log.audit} audit process and has been logged for compliance tracking purposes.</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button variant="outline" size="sm">View Audit Details</Button>
                              <Button variant="primary" size="sm">Export Log Entry</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-8 py-4 bg-slate-50/50 flex justify-between items-center border-t border-slate-100">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing {logs.length} activity entries</span>
          <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Load More Logs</button>
        </div>
      </Card>
    </div>
  )
}

// Risk Breakdown Item Component
function RiskBreakdownItem({
  label,
  percentage,
  color,
  description,
}: {
  label: string
  percentage: number
  color: 'emerald' | 'amber' | 'blue'
  description: string
}) {
  const colorClasses = {
    emerald: 'text-emerald-600 bg-emerald-500',
    amber: 'text-amber-500 bg-amber-400',
    blue: 'text-blue-500 bg-blue-500',
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <span className={`text-xs font-bold ${colorClasses[color].split(' ')[0]}`}>{percentage}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full">
        <div className={`h-full ${colorClasses[color].split(' ')[1]} rounded-full`} style={{ width: `${percentage}%` }}></div>
      </div>
      <p className="text-[10px] text-slate-400">{description}</p>
    </div>
  )
}
