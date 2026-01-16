'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

type Priority = 'critical' | 'high' | 'medium' | 'low'
type Status = 'in_progress' | 'completed' | 'overdue'

interface Rule {
  id: number
  title: string
  reference: string
  priority: Priority
  departments: string[]
  progress: number
  daysLeft: number | null
  dueDate: string
  status: Status
}

const rulesData: Rule[] = [
  {
    id: 1,
    title: 'ESG Disclosure & Reporting Framework',
    reference: 'SAMA/448/2024',
    priority: 'critical',
    departments: ['FINANCE', 'RISK'],
    progress: 45,
    daysLeft: 6,
    dueDate: 'Oct 25, 2024',
    status: 'in_progress',
  },
  {
    id: 2,
    title: 'Open Banking API Security Standards V2',
    reference: 'SAMA/102/2024',
    priority: 'high',
    departments: ['IT', 'SECURITY'],
    progress: 82,
    daysLeft: 22,
    dueDate: 'Nov 10, 2024',
    status: 'in_progress',
  },
  {
    id: 3,
    title: 'Consumer Protection Board Update',
    reference: 'SAMA/091/2024',
    priority: 'low',
    departments: ['COMPLIANCE'],
    progress: 100,
    daysLeft: null,
    dueDate: 'Oct 12, 2024',
    status: 'completed',
  },
  {
    id: 4,
    title: 'Anti-Money Laundering Guidelines Update',
    reference: 'SAMA/334/2024',
    priority: 'critical',
    departments: ['COMPLIANCE', 'LEGAL'],
    progress: 30,
    daysLeft: -3,
    dueDate: 'Oct 13, 2024',
    status: 'overdue',
  },
  {
    id: 5,
    title: 'Cloud Computing Security Requirements',
    reference: 'SAMA/221/2024',
    priority: 'medium',
    departments: ['IT', 'SECURITY'],
    progress: 60,
    daysLeft: 45,
    dueDate: 'Dec 01, 2024',
    status: 'in_progress',
  },
]

export default function RegulatoryUpdatesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)

  const filteredRules = rulesData.filter((rule) => {
    const matchesSearch =
      rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.reference.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDepartment =
      departmentFilter === 'all' ||
      rule.departments.some((d) => d.toLowerCase() === departmentFilter.toLowerCase())
    return matchesSearch && matchesDepartment
  })

  const stats = {
    total: rulesData.length,
    inProgress: rulesData.filter((r) => r.status === 'in_progress').length,
    completed: rulesData.filter((r) => r.status === 'completed').length,
    overdue: rulesData.filter((r) => r.status === 'overdue').length,
  }

  return (
    <>
      {/* Custom Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">Regulatory Updates</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              New Rules Tracker
            </p>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2"></div>

          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2">
              <Icon icon="lucide:mail" className="text-emerald-500" />
              SAMA Letters
            </button>
            <button className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg transition-all border border-emerald-600 flex items-center gap-2">
              <Icon icon="lucide:refresh-cw" className="text-white" />
              Regulatory Updates
            </button>
            <button className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2">
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              Observations Tracker
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
            <div className="px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Rule Pulse</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          </div>

          <Button
            variant="primary"
            className="shadow-lg shadow-emerald-100"
            onClick={() => setIsAddRuleModalOpen(true)}
          >
            <Icon icon="lucide:plus" />
            Register New Rule
          </Button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto custom-scrollbar p-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Total Active Rules"
            value={stats.total}
            subtext="Circulars"
            borderColor="slate"
          />
          <StatCard
            label="In Implementation"
            value={stats.inProgress}
            subtext="Ongoing"
            borderColor="amber"
            valueColor="amber"
          />
          <StatCard
            label="Implemented (YTD)"
            value={stats.completed}
            subtext="Compliant"
            borderColor="emerald"
            valueColor="emerald"
          />
          <StatCard
            label="Overdue Actions"
            value={stats.overdue}
            subtext="Critical"
            borderColor="rose"
            valueColor="rose"
          />
        </div>

        {/* List Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-4">
            <div className="relative">
              <Icon
                icon="lucide:search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search circulars..."
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              <option value="compliance">Compliance</option>
              <option value="it">IT / Cyber</option>
              <option value="finance">Finance</option>
              <option value="risk">Risk</option>
              <option value="legal">Legal</option>
              <option value="security">Security</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>Sort by:</span>
            <button className="flex items-center gap-1 hover:text-emerald-600">
              Deadline
              <Icon icon="lucide:chevron-down" />
            </button>
          </div>
        </div>

        {/* Rules Card List */}
        <div className="grid grid-cols-1 gap-4">
          {filteredRules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} onClick={() => setSelectedRule(rule)} />
          ))}
        </div>
      </div>

      {/* Add New Rule Modal */}
      <Modal
        isOpen={isAddRuleModalOpen}
        onClose={() => setIsAddRuleModalOpen(false)}
        title="Register New SAMA Rule"
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">
            Enter details from the circular to begin tracking
          </p>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <Input label="Rule Title" placeholder="e.g. ESG Disclosure Reporting" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="SAMA Reference" placeholder="SAMA/XXX/2024" />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Priority Level
                  </label>
                  <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                    <option>Critical</option>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Issuance Date" type="date" />
                <Input label="Implementation Deadline" type="date" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Affected Departments
                </label>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  {['Compliance & Legal', 'Risk Management', 'Information Technology', 'Finance'].map(
                    (dept) => (
                      <label key={dept} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm">{dept}</span>
                      </label>
                    )
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Upload Circular PDF
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer">
                  <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    Drop file here or <span className="text-emerald-600 font-bold">browse</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setIsAddRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsAddRuleModalOpen(false)}
            >
              Initiate Tracker
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rule Details Modal */}
      <Modal
        isOpen={selectedRule !== null}
        onClose={() => setSelectedRule(null)}
        size="xl"
      >
        {selectedRule && <RuleDetailsContent rule={selectedRule} onClose={() => setSelectedRule(null)} />}
      </Modal>
    </>
  )
}

// Component definitions
function StatCard({
  label,
  value,
  subtext,
  borderColor,
  valueColor,
}: {
  label: string
  value: number
  subtext: string
  borderColor: 'slate' | 'amber' | 'emerald' | 'rose'
  valueColor?: 'amber' | 'emerald' | 'rose'
}) {
  const borderColors = {
    slate: 'border-l-slate-400',
    amber: 'border-l-amber-400',
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
  }

  const valueColors = {
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  }

  return (
    <Card className={`p-6 border-l-4 ${borderColors[borderColor]} hover:-translate-y-1 transition-transform`}>
      <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${valueColor ? valueColors[valueColor] : 'text-slate-900'}`}>
          {value}
        </span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </Card>
  )
}

function RuleCard({ rule, onClick }: { rule: Rule; onClick: () => void }) {
  const priorityStyles = {
    critical: { bg: 'bg-rose-50', textPriority: 'text-rose-600', textLevel: 'text-rose-700' },
    high: { bg: 'bg-amber-50', textPriority: 'text-amber-600', textLevel: 'text-amber-700' },
    medium: { bg: 'bg-blue-50', textPriority: 'text-blue-600', textLevel: 'text-blue-700' },
    low: { bg: 'bg-slate-100', textPriority: 'text-slate-400', textLevel: 'text-slate-500' },
  }

  const style = priorityStyles[rule.priority]
  const isCompleted = rule.status === 'completed'
  const isOverdue = rule.status === 'overdue'

  return (
    <div
      onClick={onClick}
      className={`bg-white/80 backdrop-blur border border-slate-100 p-6 rounded-2xl flex items-center justify-between cursor-pointer group hover:border-emerald-500 hover:bg-white transition-all ${
        isCompleted && 'opacity-70'
      }`}
    >
      <div className="flex items-center gap-6 flex-1">
        <div className={`flex flex-col items-center justify-center p-3 ${style.bg} rounded-xl w-20`}>
          <span className={`text-[10px] font-bold ${style.textPriority} uppercase`}>Priority</span>
          <span className={`text-xs font-black ${style.textLevel}`}>
            {rule.priority.toUpperCase()}
          </span>
        </div>
        <div className="space-y-1">
          <h4 className="text-base font-bold text-slate-900">{rule.title}</h4>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">REF: {rule.reference}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
            <div className="flex gap-1">
              {rule.departments.map((dept) => (
                <span
                  key={dept}
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded"
                >
                  {dept}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-12">
        <div className="w-48 space-y-2">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-slate-500 uppercase">Implementation Progress</span>
            <span className="text-emerald-600">{rule.progress}%</span>
          </div>
          <div className={`h-2 ${isCompleted ? 'bg-emerald-100' : 'bg-slate-100'} rounded-full overflow-hidden`}>
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${rule.progress}%` }}
            ></div>
          </div>
        </div>
        <div className="text-right">
          {isCompleted ? (
            <>
              <p className="text-xs font-bold text-emerald-600 mb-1">COMPLETED</p>
              <p className="text-[10px] text-slate-400">Done: {rule.dueDate}</p>
            </>
          ) : isOverdue ? (
            <>
              <p className="text-xs font-bold text-rose-500 mb-1">
                {Math.abs(rule.daysLeft!)} Days Overdue
              </p>
              <p className="text-[10px] text-slate-400">Due: {rule.dueDate}</p>
            </>
          ) : (
            <>
              <p
                className={`text-xs font-bold mb-1 ${
                  rule.daysLeft! <= 7 ? 'text-rose-500' : 'text-slate-600'
                }`}
              >
                {rule.daysLeft} Days Left
              </p>
              <p className="text-[10px] text-slate-400">Due: {rule.dueDate}</p>
            </>
          )}
        </div>
        {isCompleted ? (
          <Icon icon="lucide:check-circle" className="text-emerald-500 text-xl" />
        ) : (
          <Icon
            icon="lucide:chevron-right"
            className="text-slate-300 group-hover:text-emerald-500 transition-colors text-xl"
          />
        )}
      </div>
    </div>
  )
}

function RuleDetailsContent({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const checklistItems = [
    { label: 'Initial Gap Analysis', status: 'completed' },
    { label: 'Drafting Disclosure Policy', status: 'in_progress' },
    { label: 'Internal Audit Review', status: 'pending' },
    { label: 'Final Implementation', status: 'pending' },
  ]

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Left Column: Details */}
      <div className="flex-1 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Icon icon="lucide:file-text" className="text-3xl" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold font-display text-slate-900">{rule.title}</h2>
            <p className="text-sm text-slate-500">REF: {rule.reference}</p>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            Overview
          </h3>
          <p className="text-sm leading-relaxed text-slate-600">
            This regulation mandates all financial institutions to provide detailed disclosures
            regarding Environmental, Social, and Governance (ESG) impact on their operations and
            investment portfolios. Requires alignment with international GRI standards.
          </p>
        </section>

        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            Implementation Checklist
          </h3>
          <div className="space-y-3">
            {checklistItems.map((item, index) => (
              <ChecklistItem key={index} label={item.label} status={item.status as 'completed' | 'in_progress' | 'pending'} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            Internal Notes
          </h3>
          <textarea
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            rows={3}
            placeholder="Add internal comments or observations..."
          ></textarea>
          <div className="flex justify-end mt-2">
            <button className="text-xs font-bold text-emerald-600">Post Note</button>
          </div>
        </section>
      </div>

      {/* Right Column: Stats & Timeline */}
      <div className="w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-6">
        <div className="text-center space-y-4">
          <div
            className={`inline-flex items-center justify-center p-6 rounded-full border-4 ${
              rule.status === 'overdue'
                ? 'bg-rose-100 border-rose-200 text-rose-600'
                : rule.status === 'completed'
                ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                : rule.daysLeft! <= 7
                ? 'bg-rose-100 border-rose-200 text-rose-600'
                : 'bg-amber-100 border-amber-200 text-amber-600'
            }`}
          >
            <div className="text-center">
              <p className="text-2xl font-black">
                {rule.status === 'completed'
                  ? '100%'
                  : rule.status === 'overdue'
                  ? Math.abs(rule.daysLeft!)
                  : rule.daysLeft!.toString().padStart(2, '0')}
              </p>
              <p className="text-[10px] font-bold uppercase">
                {rule.status === 'completed'
                  ? 'Complete'
                  : rule.status === 'overdue'
                  ? 'Days Over'
                  : 'Days Left'}
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Urgency:{' '}
            {rule.status === 'overdue' || rule.daysLeft! <= 7 ? 'CRITICAL' : 'MODERATE'}
          </p>
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4">Documentation</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-500 transition-colors cursor-pointer">
              <Icon icon="lucide:file-text" className="text-rose-500" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">SAMA_ESG_2024.pdf</p>
                <p className="text-[10px] text-slate-400">2.4 MB</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4">Activity Feed</h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></div>
              <div>
                <p className="text-[11px] font-bold text-slate-800">Gap Analysis Approved</p>
                <p className="text-[10px] text-slate-500">Sarah C. - 2h ago</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"></div>
              <div>
                <p className="text-[11px] font-bold text-slate-800">Rule Registered</p>
                <p className="text-[10px] text-slate-500">System - 3 days ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChecklistItem({
  label,
  status,
}: {
  label: string
  status: 'completed' | 'in_progress' | 'pending'
}) {
  const statusStyles = {
    completed: {
      bg: 'bg-emerald-50/50 border-emerald-100',
      icon: (
        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
          <Icon icon="lucide:check" className="text-white text-xs" />
        </div>
      ),
      label: 'COMPLETED',
      labelColor: 'text-emerald-600',
      textColor: 'text-slate-700 font-bold',
    },
    in_progress: {
      bg: 'bg-white border-slate-200',
      icon: <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-50"></div>,
      label: 'IN PROGRESS',
      labelColor: 'text-amber-600',
      textColor: 'text-slate-700 font-medium',
    },
    pending: {
      bg: 'bg-white border-slate-200',
      icon: <div className="w-6 h-6 rounded-full border-2 border-slate-100"></div>,
      label: 'PENDING',
      labelColor: 'text-slate-300',
      textColor: 'text-slate-400 font-medium',
    },
  }

  const style = statusStyles[status]

  return (
    <div className={`flex items-center justify-between p-4 ${style.bg} rounded-xl border`}>
      <div className="flex items-center gap-4">
        {style.icon}
        <span className={`text-sm ${style.textColor}`}>{label}</span>
      </div>
      <span className={`text-[10px] ${style.labelColor} font-bold uppercase`}>{style.label}</span>
    </div>
  )
}
