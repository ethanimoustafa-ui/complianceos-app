'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

type Priority = 'critical' | 'high' | 'medium' | 'low'
type Status = 'in_progress' | 'completed' | 'overdue'
type TabValue = 'rules' | 'policies'
type PolicyStatus = 'draft' | 'under_review' | 'approved' | 'expired'
type PolicyCategory = 'compliance' | 'it' | 'operations' | 'risk' | 'hr' | 'finance'
type ArticleRiskLevel = 'critical' | 'high' | 'medium' | 'low'
type ArticleComplianceStatus = 'compliant' | 'in_progress' | 'non_compliant' | 'not_started'

interface Article {
  id: number
  articleNumber: string
  title: string
  description?: string
  riskLevel: ArticleRiskLevel
  responsibleDepartment: string
  complianceStatus: ArticleComplianceStatus
  assignedTo?: string
  notes?: string
}

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

interface Policy {
  id: number
  name: string
  description: string
  status: PolicyStatus
  category: PolicyCategory
  version: string
  owner: { name: string; avatar: string; department: string }
  lastReview: string
  nextReview: string
  approvedDate?: string
  versionHistory: { version: string; date: string; author: string; changes: string }[]
  workflowTimeline: { step: string; date: string; user: string; status: 'completed' | 'current' | 'pending' }[]
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

const mockArticles: Article[] = [
  {
    id: 1,
    articleNumber: 'Art. 1',
    title: 'Disclosure Requirements',
    description: 'ESG impact disclosure for investment portfolios',
    riskLevel: 'critical',
    responsibleDepartment: 'Finance',
    complianceStatus: 'in_progress',
    assignedTo: 'Sarah Connor',
  },
  {
    id: 2,
    articleNumber: 'Art. 2.1',
    title: 'Reporting Standards',
    description: 'Alignment with GRI standards',
    riskLevel: 'high',
    responsibleDepartment: 'Compliance',
    complianceStatus: 'not_started',
  },
  {
    id: 3,
    articleNumber: 'Art. 3',
    title: 'Internal Controls',
    description: 'Risk management framework updates',
    riskLevel: 'medium',
    responsibleDepartment: 'Risk',
    complianceStatus: 'compliant',
    assignedTo: 'Ahmed Al-Rashid',
  },
  {
    id: 4,
    articleNumber: 'Art. 4',
    title: 'Documentation Requirements',
    description: 'Policy documentation and record keeping',
    riskLevel: 'low',
    responsibleDepartment: 'Legal',
    complianceStatus: 'compliant',
  },
]

const policiesData: Policy[] = [
  {
    id: 1,
    name: 'AML Policy',
    description: 'Anti-Money Laundering policy covering customer due diligence, suspicious activity reporting, and regulatory compliance requirements.',
    status: 'approved',
    category: 'compliance',
    version: 'v2.3',
    owner: { name: 'Sarah Connor', avatar: 'Sarah', department: 'Compliance' },
    lastReview: '2024-08-15',
    nextReview: '2025-08-15',
    approvedDate: '2024-08-20',
    versionHistory: [
      { version: 'v2.3', date: '2024-08-20', author: 'Sarah Connor', changes: 'Updated suspicious activity thresholds' },
      { version: 'v2.2', date: '2024-02-10', author: 'Michael Scott', changes: 'Added PEP screening requirements' },
      { version: 'v2.1', date: '2023-09-05', author: 'Sarah Connor', changes: 'Revised CDD procedures' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-07-01', user: 'Sarah Connor', status: 'completed' },
      { step: 'Legal Review', date: '2024-07-15', user: 'David Wallace', status: 'completed' },
      { step: 'Compliance Review', date: '2024-08-01', user: 'Ahmed Al-Rashid', status: 'completed' },
      { step: 'Final Approval', date: '2024-08-20', user: 'Executive Committee', status: 'completed' },
    ],
  },
  {
    id: 2,
    name: 'Information Security Policy',
    description: 'Enterprise-wide information security policy covering data protection, access controls, and incident response procedures.',
    status: 'under_review',
    category: 'it',
    version: 'v1.8',
    owner: { name: 'Felix Henderson', avatar: 'Felix', department: 'IT Security' },
    lastReview: '2024-01-10',
    nextReview: '2025-01-10',
    versionHistory: [
      { version: 'v1.8', date: '2024-10-01', author: 'Felix Henderson', changes: 'Added cloud security controls' },
      { version: 'v1.7', date: '2024-01-10', author: 'Felix Henderson', changes: 'Updated incident response procedures' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-09-15', user: 'Felix Henderson', status: 'completed' },
      { step: 'Technical Review', date: '2024-09-25', user: 'IT Team', status: 'completed' },
      { step: 'Compliance Review', date: '2024-10-05', user: 'Sarah Connor', status: 'current' },
      { step: 'Final Approval', date: '', user: 'Executive Committee', status: 'pending' },
    ],
  },
  {
    id: 3,
    name: 'Data Privacy Policy',
    description: 'Comprehensive data privacy policy aligned with PDPL requirements covering personal data processing, consent management, and data subject rights.',
    status: 'approved',
    category: 'compliance',
    version: 'v3.0',
    owner: { name: 'Michael Scott', avatar: 'Michael', department: 'Legal' },
    lastReview: '2024-06-20',
    nextReview: '2025-06-20',
    approvedDate: '2024-06-25',
    versionHistory: [
      { version: 'v3.0', date: '2024-06-25', author: 'Michael Scott', changes: 'Major revision for PDPL compliance' },
      { version: 'v2.5', date: '2023-12-01', author: 'Michael Scott', changes: 'Updated consent requirements' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-05-01', user: 'Michael Scott', status: 'completed' },
      { step: 'Legal Review', date: '2024-05-20', user: 'David Wallace', status: 'completed' },
      { step: 'DPO Review', date: '2024-06-10', user: 'Privacy Officer', status: 'completed' },
      { step: 'Final Approval', date: '2024-06-25', user: 'Board', status: 'completed' },
    ],
  },
  {
    id: 4,
    name: 'Business Continuity Plan',
    description: 'Business continuity and disaster recovery plan outlining procedures for maintaining operations during disruptions.',
    status: 'draft',
    category: 'operations',
    version: 'v1.0',
    owner: { name: 'Kelly Kapoor', avatar: 'Kelly', department: 'Operations' },
    lastReview: '',
    nextReview: '2025-03-01',
    versionHistory: [
      { version: 'v1.0', date: '2024-10-15', author: 'Kelly Kapoor', changes: 'Initial draft' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-10-15', user: 'Kelly Kapoor', status: 'current' },
      { step: 'Technical Review', date: '', user: 'IT Team', status: 'pending' },
      { step: 'Management Review', date: '', user: 'Operations Head', status: 'pending' },
      { step: 'Final Approval', date: '', user: 'Executive Committee', status: 'pending' },
    ],
  },
  {
    id: 5,
    name: 'Vendor Management Policy',
    description: 'Third-party vendor management policy covering due diligence, contract requirements, and ongoing monitoring.',
    status: 'expired',
    category: 'risk',
    version: 'v2.1',
    owner: { name: 'David Wallace', avatar: 'David', department: 'Risk Management' },
    lastReview: '2023-06-15',
    nextReview: '2024-06-15',
    approvedDate: '2023-06-20',
    versionHistory: [
      { version: 'v2.1', date: '2023-06-20', author: 'David Wallace', changes: 'Added cloud vendor requirements' },
      { version: 'v2.0', date: '2022-06-10', author: 'David Wallace', changes: 'Major revision' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2023-05-01', user: 'David Wallace', status: 'completed' },
      { step: 'Risk Review', date: '2023-05-20', user: 'Risk Team', status: 'completed' },
      { step: 'Legal Review', date: '2023-06-05', user: 'Legal Team', status: 'completed' },
      { step: 'Final Approval', date: '2023-06-20', user: 'Executive Committee', status: 'completed' },
    ],
  },
  {
    id: 6,
    name: 'Customer Due Diligence',
    description: 'KYC and customer due diligence policy for onboarding and ongoing monitoring of customer relationships.',
    status: 'approved',
    category: 'compliance',
    version: 'v2.5',
    owner: { name: 'Ahmed Al-Rashid', avatar: 'Ahmed', department: 'Compliance' },
    lastReview: '2024-09-01',
    nextReview: '2025-09-01',
    approvedDate: '2024-09-10',
    versionHistory: [
      { version: 'v2.5', date: '2024-09-10', author: 'Ahmed Al-Rashid', changes: 'Enhanced EDD requirements' },
      { version: 'v2.4', date: '2024-03-15', author: 'Ahmed Al-Rashid', changes: 'Updated risk scoring' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-08-01', user: 'Ahmed Al-Rashid', status: 'completed' },
      { step: 'Compliance Review', date: '2024-08-15', user: 'Sarah Connor', status: 'completed' },
      { step: 'Legal Review', date: '2024-08-25', user: 'Legal Team', status: 'completed' },
      { step: 'Final Approval', date: '2024-09-10', user: 'Compliance Committee', status: 'completed' },
    ],
  },
]

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-in slide-in-from-bottom-4">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

export default function RegulatoryUpdatesPage() {
  const { t, isRTL } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabValue>('rules')
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)

  // Policy tab state
  const [policySearchQuery, setPolicySearchQuery] = useState('')
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState<PolicyCategory | 'all'>('all')
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatus | 'all'>('all')
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [isCreatePolicyModalOpen, setIsCreatePolicyModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const filteredRules = rulesData.filter((rule) => {
    const matchesSearch =
      rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.reference.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDepartment =
      departmentFilter === 'all' ||
      rule.departments.some((d) => d.toLowerCase() === departmentFilter.toLowerCase())
    return matchesSearch && matchesDepartment
  })

  const filteredPolicies = policiesData.filter((policy) => {
    const matchesSearch =
      policy.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
      policy.description.toLowerCase().includes(policySearchQuery.toLowerCase())
    const matchesCategory = policyCategoryFilter === 'all' || policy.category === policyCategoryFilter
    const matchesStatus = policyStatusFilter === 'all' || policy.status === policyStatusFilter
    return matchesSearch && matchesCategory && matchesStatus
  })

  const ruleStats = {
    total: rulesData.length,
    inProgress: rulesData.filter((r) => r.status === 'in_progress').length,
    completed: rulesData.filter((r) => r.status === 'completed').length,
    overdue: rulesData.filter((r) => r.status === 'overdue').length,
  }

  const policyStats = {
    total: policiesData.length,
    approved: policiesData.filter((p) => p.status === 'approved').length,
    underReview: policiesData.filter((p) => p.status === 'under_review').length,
    draft: policiesData.filter((p) => p.status === 'draft').length,
    expired: policiesData.filter((p) => p.status === 'expired').length,
  }

  const policyStatusConfig: Record<PolicyStatus, { label: string; color: string; bgColor: string }> = {
    draft: { label: t('policies.statusDraft'), color: 'text-slate-600', bgColor: 'bg-slate-100' },
    under_review: { label: t('policies.statusUnderReview'), color: 'text-amber-600', bgColor: 'bg-amber-100' },
    approved: { label: t('policies.statusApproved'), color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
    expired: { label: t('policies.statusExpired'), color: 'text-rose-600', bgColor: 'bg-rose-100' },
  }

  const policyCategoryConfig: Record<PolicyCategory, { label: string; icon: string }> = {
    compliance: { label: t('policies.categoryCompliance'), icon: 'lucide:shield' },
    it: { label: t('policies.categoryIT'), icon: 'lucide:server' },
    operations: { label: t('policies.categoryOperations'), icon: 'lucide:settings' },
    risk: { label: t('policies.categoryRisk'), icon: 'lucide:alert-triangle' },
    hr: { label: t('policies.categoryHR'), icon: 'lucide:users' },
    finance: { label: t('policies.categoryFinance'), icon: 'lucide:dollar-sign' },
  }

  return (
    <>
      {/* Custom Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('regulatoryUpdates.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('regulatoryUpdates.subtitle')}
            </p>
          </div>

          {/* Tab Toggle */}
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => setActiveTab('rules')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'rules'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('regulatoryUpdates.tabs.rules')}
            </button>
            <button
              onClick={() => setActiveTab('policies')}
              className={cn(
                'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                activeTab === 'policies'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {t('regulatoryUpdates.tabs.policies')}
            </button>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2"></div>

          <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link
              href="/sama-letters"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('navigation.samaLetters')}
            </Link>
            <Link
              href="/observations"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span>{t('regulatoryUpdates.rulePulse')}</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            </div>
          </div>

          {activeTab === 'rules' ? (
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsAddRuleModalOpen(true)}
            >
              <Icon icon="lucide:plus" />
              {t('regulatoryUpdates.registerNewRule')}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsCreatePolicyModalOpen(true)}
            >
              <Icon icon="lucide:plus" />
              {t('policies.createPolicy')}
            </Button>
          )}
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Rules Tab Content */}
        {activeTab === 'rules' && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                label={t('regulatoryUpdates.totalActiveRules')}
                value={ruleStats.total}
                subtext={t('regulatoryUpdates.circulars')}
                borderColor="slate"
              />
              <StatCard
                label={t('regulatoryUpdates.inImplementation')}
                value={ruleStats.inProgress}
                subtext={t('regulatoryUpdates.ongoing')}
                borderColor="amber"
                valueColor="amber"
              />
              <StatCard
                label={t('regulatoryUpdates.implementedYTD')}
                value={ruleStats.completed}
                subtext={t('regulatoryUpdates.compliant')}
                borderColor="emerald"
                valueColor="emerald"
              />
              <StatCard
                label={t('regulatoryUpdates.overdueActions')}
                value={ruleStats.overdue}
                subtext={t('regulatoryUpdates.critical')}
                borderColor="rose"
                valueColor="rose"
              />
            </div>

            {/* List Controls */}
            <div className={`flex items-center justify-between mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="relative">
                  <Icon
                    icon="lucide:search"
                    className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                  />
                  <input
                    type="text"
                    placeholder={t('regulatoryUpdates.searchCirculars')}
                    className={`${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className={`px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 ${isRTL ? 'text-right' : ''}`}
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="all">{t('regulatoryUpdates.allDepartments')}</option>
                  <option value="compliance">{t('regulatoryUpdates.compliance')}</option>
                  <option value="it">{t('regulatoryUpdates.itCyber')}</option>
                  <option value="finance">{t('regulatoryUpdates.finance')}</option>
                  <option value="risk">{t('regulatoryUpdates.risk')}</option>
                  <option value="legal">{t('regulatoryUpdates.legal')}</option>
                  <option value="security">{t('regulatoryUpdates.security')}</option>
                </select>
              </div>
              <div className={`flex items-center gap-2 text-xs font-bold text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span>{t('regulatoryUpdates.sortBy')}</span>
                <button className={`flex items-center gap-1 hover:text-emerald-600 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                  {t('regulatoryUpdates.deadline')}
                  <Icon icon="lucide:chevron-down" />
                </button>
              </div>
            </div>

            {/* Rules Card List */}
            <div className="grid grid-cols-1 gap-4">
              {filteredRules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onClick={() => setSelectedRule(rule)} t={t} isRTL={isRTL} />
              ))}
            </div>
          </>
        )}

        {/* Policies Tab Content */}
        {activeTab === 'policies' && (
          <>
            {/* Policy Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
              <StatCard
                label={t('policies.totalPolicies')}
                value={policyStats.total}
                subtext={t('policies.documents')}
                borderColor="slate"
              />
              <StatCard
                label={t('policies.approved')}
                value={policyStats.approved}
                subtext={t('policies.active')}
                borderColor="emerald"
                valueColor="emerald"
              />
              <StatCard
                label={t('policies.underReview')}
                value={policyStats.underReview}
                subtext={t('policies.pending')}
                borderColor="amber"
                valueColor="amber"
              />
              <StatCard
                label={t('policies.draft')}
                value={policyStats.draft}
                subtext={t('policies.inProgress')}
                borderColor="slate"
              />
              <StatCard
                label={t('policies.expired')}
                value={policyStats.expired}
                subtext={t('policies.needsReview')}
                borderColor="rose"
                valueColor="rose"
              />
            </div>

            {/* Policy Filters */}
            <div className={`flex items-center justify-between mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="relative">
                  <Icon
                    icon="lucide:search"
                    className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                  />
                  <input
                    type="text"
                    placeholder={t('policies.searchPolicies')}
                    className={`${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`}
                    value={policySearchQuery}
                    onChange={(e) => setPolicySearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className={`px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 ${isRTL ? 'text-right' : ''}`}
                  value={policyCategoryFilter}
                  onChange={(e) => setPolicyCategoryFilter(e.target.value as PolicyCategory | 'all')}
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
                  className={`px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 ${isRTL ? 'text-right' : ''}`}
                  value={policyStatusFilter}
                  onChange={(e) => setPolicyStatusFilter(e.target.value as PolicyStatus | 'all')}
                >
                  <option value="all">{t('policies.allStatuses')}</option>
                  <option value="draft">{t('policies.statusDraft')}</option>
                  <option value="under_review">{t('policies.statusUnderReview')}</option>
                  <option value="approved">{t('policies.statusApproved')}</option>
                  <option value="expired">{t('policies.statusExpired')}</option>
                </select>
              </div>
              <div className={`text-xs font-bold text-slate-500 ${isRTL ? 'text-right' : ''}`}>
                {filteredPolicies.length} {t('policies.policiesFound')}
              </div>
            </div>

            {/* Policy Cards */}
            <div className="grid grid-cols-1 gap-4">
              {filteredPolicies.map((policy) => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  onClick={() => setSelectedPolicy(policy)}
                  statusConfig={policyStatusConfig}
                  categoryConfig={policyCategoryConfig}
                  t={t}
                  isRTL={isRTL}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add New Rule Modal */}
      <Modal
        isOpen={isAddRuleModalOpen}
        onClose={() => setIsAddRuleModalOpen(false)}
        title={t('regulatoryUpdates.registerNewSamaRule')}
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">
            {t('regulatoryUpdates.enterCircularDetails')}
          </p>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <Input label={t('regulatoryUpdates.ruleTitle')} placeholder={t('regulatoryUpdates.ruleTitlePlaceholder')} />
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('regulatoryUpdates.samaReference')} placeholder={t('regulatoryUpdates.samaReferencePlaceholder')} />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('regulatoryUpdates.priorityLevel')}
                  </label>
                  <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                    <option>{t('regulatoryUpdates.critical')}</option>
                    <option>{t('regulatoryUpdates.high')}</option>
                    <option>{t('regulatoryUpdates.medium')}</option>
                    <option>{t('regulatoryUpdates.low')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('regulatoryUpdates.issuanceDate')} type="date" />
                <Input label={t('regulatoryUpdates.implementationDeadline')} type="date" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.affectedDepartments')}
                </label>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  {[
                    t('regulatoryUpdates.complianceLegal'),
                    t('regulatoryUpdates.riskManagement'),
                    t('regulatoryUpdates.informationTechnology'),
                    t('regulatoryUpdates.finance')
                  ].map((dept) => (
                    <label key={dept} className={`flex items-center gap-3 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <input
                        type="checkbox"
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.uploadCircularPdf')}
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer">
                  <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {t('regulatoryUpdates.dropFileHere')} <span className="text-emerald-600 font-bold">{t('regulatoryUpdates.browse')}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={() => setIsAddRuleModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsAddRuleModalOpen(false)}
            >
              {t('regulatoryUpdates.initiateTracker')}
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
        {selectedRule && <RuleDetailsContent rule={selectedRule} onClose={() => setSelectedRule(null)} t={t} isRTL={isRTL} />}
      </Modal>

      {/* Policy Details Modal */}
      <Modal
        isOpen={selectedPolicy !== null}
        onClose={() => setSelectedPolicy(null)}
        title={t('policies.policyDetails')}
        size="xl"
      >
        {selectedPolicy && (
          <PolicyDetailsContent
            policy={selectedPolicy}
            onClose={() => setSelectedPolicy(null)}
            statusConfig={policyStatusConfig}
            categoryConfig={policyCategoryConfig}
            showToast={showToast}
            t={t}
            isRTL={isRTL}
          />
        )}
      </Modal>

      {/* Create Policy Modal */}
      <Modal
        isOpen={isCreatePolicyModalOpen}
        onClose={() => setIsCreatePolicyModalOpen(false)}
        title={t('policies.createNewPolicy')}
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">
            {t('policies.createPolicySubtitle')}
          </p>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <Input
                label={t('policies.policyName')}
                placeholder={t('policies.policyNamePlaceholder')}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('policies.selectCategory')}
                </label>
                <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                  <option value="">{t('policies.selectCategory')}</option>
                  <option value="compliance">{t('policies.categoryCompliance')}</option>
                  <option value="it">{t('policies.categoryIT')}</option>
                  <option value="operations">{t('policies.categoryOperations')}</option>
                  <option value="risk">{t('policies.categoryRisk')}</option>
                  <option value="hr">{t('policies.categoryHR')}</option>
                  <option value="finance">{t('policies.categoryFinance')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('policies.selectStatus')}
                </label>
                <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                  <option value="draft">{t('policies.statusDraft')}</option>
                  <option value="under_review">{t('policies.statusUnderReview')}</option>
                  <option value="approved">{t('policies.statusApproved')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label={t('policies.version')} placeholder="v1.0" defaultValue="v1.0" />
                <Input label={t('policies.nextReview')} type="date" />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('policies.selectOwner')}
                </label>
                <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                  <option value="">{t('policies.selectOwner')}</option>
                  <option value="sarah">Sarah Connor - Compliance</option>
                  <option value="felix">Felix Henderson - IT Security</option>
                  <option value="michael">Michael Scott - Legal</option>
                  <option value="david">David Wallace - Risk Management</option>
                  <option value="ahmed">Ahmed Al-Rashid - Compliance</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('policies.description')}
                </label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[120px] resize-none"
                  placeholder={t('policies.descriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('policies.uploadDocument')}
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer">
                  <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {t('policies.dropFileHere')} <span className="text-emerald-600 font-bold">{t('policies.browse')}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={() => setIsCreatePolicyModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => {
                showToast(t('policies.policyCreated'))
                setIsCreatePolicyModalOpen(false)
              }}
            >
              {t('policies.createPolicy')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
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

function RuleCard({ rule, onClick, t, isRTL }: { rule: Rule; onClick: () => void; t: any; isRTL: boolean }) {
  const priorityStyles = {
    critical: { bg: 'bg-rose-50', textPriority: 'text-rose-600', textLevel: 'text-rose-700' },
    high: { bg: 'bg-amber-50', textPriority: 'text-amber-600', textLevel: 'text-amber-700' },
    medium: { bg: 'bg-blue-50', textPriority: 'text-blue-600', textLevel: 'text-blue-700' },
    low: { bg: 'bg-slate-100', textPriority: 'text-slate-400', textLevel: 'text-slate-500' },
  }

  const priorityLabels = {
    critical: t('regulatoryUpdates.critical'),
    high: t('regulatoryUpdates.high'),
    medium: t('regulatoryUpdates.medium'),
    low: t('regulatoryUpdates.low'),
  }

  const departmentLabels: Record<string, string> = {
    'FINANCE': t('regulatoryUpdates.finance'),
    'RISK': t('regulatoryUpdates.risk'),
    'IT': t('regulatoryUpdates.itCyber'),
    'SECURITY': t('regulatoryUpdates.security'),
    'COMPLIANCE': t('regulatoryUpdates.compliance'),
    'LEGAL': t('regulatoryUpdates.legal'),
  }

  const style = priorityStyles[rule.priority]
  const isCompleted = rule.status === 'completed'
  const isOverdue = rule.status === 'overdue'

  return (
    <div
      onClick={onClick}
      className={`bg-white/80 backdrop-blur border border-slate-100 p-6 rounded-2xl flex items-center justify-between cursor-pointer group hover:border-emerald-500 hover:bg-white transition-all ${
        isCompleted && 'opacity-70'
      } ${isRTL ? 'flex-row-reverse' : ''}`}
    >
      <div className={`flex items-center gap-6 flex-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex flex-col items-center justify-center p-3 ${style.bg} rounded-xl w-20`}>
          <span className={`text-[10px] font-bold ${style.textPriority} uppercase`}>{t('regulatoryUpdates.priority')}</span>
          <span className={`text-xs font-black ${style.textLevel}`}>
            {priorityLabels[rule.priority].toUpperCase()}
          </span>
        </div>
        <div className={`space-y-1 ${isRTL ? 'text-right' : ''}`}>
          <h4 className="text-base font-bold text-slate-900">{rule.title}</h4>
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className="text-xs font-medium text-slate-500">REF: {rule.reference}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
            <div className={`flex gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
              {rule.departments.map((dept) => (
                <span
                  key={dept}
                  className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded"
                >
                  {departmentLabels[dept] || dept}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`flex items-center gap-12 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-48 space-y-2">
          <div className={`flex justify-between text-[10px] font-bold ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className="text-slate-500 uppercase">{t('regulatoryUpdates.implementationProgress')}</span>
            <span className="text-emerald-600">{rule.progress}%</span>
          </div>
          <div className={`h-2 ${isCompleted ? 'bg-emerald-100' : 'bg-slate-100'} rounded-full overflow-hidden`}>
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${rule.progress}%` }}
            ></div>
          </div>
        </div>
        <div className={isRTL ? 'text-left' : 'text-right'}>
          {isCompleted ? (
            <>
              <p className="text-xs font-bold text-emerald-600 mb-1">{t('regulatoryUpdates.completed')}</p>
              <p className="text-[10px] text-slate-400">{t('regulatoryUpdates.done')}: {rule.dueDate}</p>
            </>
          ) : isOverdue ? (
            <>
              <p className="text-xs font-bold text-rose-500 mb-1">
                {Math.abs(rule.daysLeft!)} {t('regulatoryUpdates.daysOverdue')}
              </p>
              <p className="text-[10px] text-slate-400">{t('regulatoryUpdates.due')}: {rule.dueDate}</p>
            </>
          ) : (
            <>
              <p
                className={`text-xs font-bold mb-1 ${
                  rule.daysLeft! <= 7 ? 'text-rose-500' : 'text-slate-600'
                }`}
              >
                {rule.daysLeft} {t('regulatoryUpdates.daysLeft')}
              </p>
              <p className="text-[10px] text-slate-400">{t('regulatoryUpdates.due')}: {rule.dueDate}</p>
            </>
          )}
        </div>
        {isCompleted ? (
          <Icon icon="lucide:check-circle" className="text-emerald-500 text-xl" />
        ) : (
          <Icon
            icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'}
            className="text-slate-300 group-hover:text-emerald-500 transition-colors text-xl"
          />
        )}
      </div>
    </div>
  )
}

function PolicyCard({
  policy,
  onClick,
  statusConfig,
  categoryConfig,
  t,
  isRTL,
}: {
  policy: Policy
  onClick: () => void
  statusConfig: Record<PolicyStatus, { label: string; color: string; bgColor: string }>
  categoryConfig: Record<PolicyCategory, { label: string; icon: string }>
  t: any
  isRTL: boolean
}) {
  const status = statusConfig[policy.status]
  const category = categoryConfig[policy.category]

  return (
    <div
      onClick={onClick}
      className={`bg-white/80 backdrop-blur border border-slate-100 p-6 rounded-2xl flex items-center justify-between cursor-pointer group hover:border-emerald-500 hover:bg-white transition-all ${isRTL ? 'flex-row-reverse' : ''}`}
    >
      <div className={`flex items-center gap-6 flex-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
          <Icon icon={category.icon} className="text-xl text-slate-600" />
        </div>
        <div className={`space-y-1 ${isRTL ? 'text-right' : ''}`}>
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h4 className="text-base font-bold text-slate-900">{policy.name}</h4>
            <span className={`px-2 py-0.5 ${status.bgColor} ${status.color} text-[10px] font-bold rounded-full`}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{policy.description}</p>
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className="text-[10px] font-bold text-slate-400">{category.label}</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
            <span className="text-[10px] font-bold text-emerald-600">{policy.version}</span>
          </div>
        </div>
      </div>

      <div className={`flex items-center gap-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${policy.owner.avatar}`}
            className="w-8 h-8 rounded-full border border-slate-200"
            alt={policy.owner.name}
          />
          <div className={isRTL ? 'text-right' : ''}>
            <p className="text-xs font-bold text-slate-700">{policy.owner.name}</p>
            <p className="text-[10px] text-slate-400">{policy.owner.department}</p>
          </div>
        </div>
        <div className={isRTL ? 'text-left' : 'text-right'}>
          <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.nextReview')}</p>
          <p className="text-xs font-bold text-slate-700">{policy.nextReview || '-'}</p>
        </div>
        <Icon
          icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'}
          className="text-slate-300 group-hover:text-emerald-500 transition-colors text-xl"
        />
      </div>
    </div>
  )
}

function PolicyDetailsContent({
  policy,
  onClose,
  statusConfig,
  categoryConfig,
  showToast,
  t,
  isRTL,
}: {
  policy: Policy
  onClose: () => void
  statusConfig: Record<PolicyStatus, { label: string; color: string; bgColor: string }>
  categoryConfig: Record<PolicyCategory, { label: string; icon: string }>
  showToast: (msg: string) => void
  t: any
  isRTL: boolean
}) {
  const status = statusConfig[policy.status]
  const category = categoryConfig[policy.category]

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
      {/* Left Column */}
      <div className="flex-1 space-y-6">
        <div className={`flex items-start gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="w-14 h-14 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Icon icon={category.icon} className="text-2xl text-emerald-600" />
          </div>
          <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center gap-3 mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h2 className="text-xl font-bold font-display text-slate-900">{policy.name}</h2>
              <span className={`px-2.5 py-1 ${status.bgColor} ${status.color} text-xs font-bold rounded-full`}>
                {status.label}
              </span>
            </div>
            <p className="text-sm text-slate-500">{policy.version} • {category.label}</p>
          </div>
        </div>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {t('policies.description')}
          </h3>
          <p className="text-sm leading-relaxed text-slate-600">{policy.description}</p>
        </section>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {t('policies.versionHistory')}
          </h3>
          <div className="space-y-3">
            {policy.versionHistory.map((entry, idx) => (
              <div
                key={idx}
                className={`p-3 bg-slate-50 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}
              >
                <div className={`flex items-center justify-between mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-xs font-bold text-emerald-600">{entry.version}</span>
                  <span className="text-[10px] text-slate-400">{entry.date}</span>
                </div>
                <p className="text-xs text-slate-600">{entry.changes}</p>
                <p className="text-[10px] text-slate-400 mt-1">{t('policies.by')} {entry.author}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
            {t('policies.approvalWorkflow')}
          </h3>
          <div className="space-y-2">
            {policy.workflowTimeline.map((step, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-4 p-3 rounded-xl border ${
                  step.status === 'completed'
                    ? 'bg-emerald-50/50 border-emerald-100'
                    : step.status === 'current'
                    ? 'bg-amber-50/50 border-amber-100'
                    : 'bg-white border-slate-100'
                } ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    step.status === 'completed'
                      ? 'bg-emerald-500'
                      : step.status === 'current'
                      ? 'border-2 border-amber-400 bg-amber-50'
                      : 'border-2 border-slate-200'
                  }`}
                >
                  {step.status === 'completed' && (
                    <Icon icon="lucide:check" className="text-white text-xs" />
                  )}
                </div>
                <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                  <p className="text-sm font-bold text-slate-700">{step.step}</p>
                  <p className="text-[10px] text-slate-400">
                    {step.user} {step.date && `• ${step.date}`}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase ${
                    step.status === 'completed'
                      ? 'text-emerald-600'
                      : step.status === 'current'
                      ? 'text-amber-600'
                      : 'text-slate-300'
                  }`}
                >
                  {step.status === 'completed'
                    ? t('policies.workflowCompleted')
                    : step.status === 'current'
                    ? t('policies.workflowCurrent')
                    : t('policies.workflowPending')}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Right Column */}
      <div className={`w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-6 ${isRTL ? 'md:-mr-6 md:ml-0' : ''}`}>
        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">{t('policies.policyOwner')}</h3>
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${policy.owner.avatar}`}
              className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
              alt={policy.owner.name}
            />
            <div className={isRTL ? 'text-right' : ''}>
              <p className="text-sm font-bold text-slate-900">{policy.owner.name}</p>
              <p className="text-xs text-slate-500">{policy.owner.department}</p>
            </div>
          </div>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">{t('policies.reviewSchedule')}</h3>
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.lastReview')}</p>
              <p className="text-sm font-bold text-slate-700">{policy.lastReview || '-'}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.nextReview')}</p>
              <p className="text-sm font-bold text-slate-700">{policy.nextReview}</p>
            </div>
            {policy.approvedDate && (
              <div className="p-3 bg-white rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.approvedDate')}</p>
                <p className="text-sm font-bold text-emerald-600">{policy.approvedDate}</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-slate-200">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => showToast(t('policies.editPolicyToast'))}
          >
            <Icon icon="lucide:edit" className="w-4 h-4" />
            {t('policies.editPolicy')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => showToast(t('policies.downloadPdfToast'))}
          >
            <Icon icon="lucide:download" className="w-4 h-4" />
            {t('policies.downloadPdf')}
          </Button>
          {policy.status === 'draft' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => showToast(t('policies.submitForReviewToast'))}
            >
              <Icon icon="lucide:send" className="w-4 h-4" />
              {t('policies.submitForReview')}
            </Button>
          )}
          {policy.status === 'under_review' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => showToast(t('policies.approveToast'))}
            >
              <Icon icon="lucide:check-circle" className="w-4 h-4" />
              {t('policies.approve')}
            </Button>
          )}
          {policy.status === 'expired' && (
            <Button
              variant="outline"
              className="w-full text-amber-600 border-amber-200 hover:bg-amber-50"
              onClick={() => showToast(t('policies.initiateReviewToast'))}
            >
              <Icon icon="lucide:refresh-cw" className="w-4 h-4" />
              {t('policies.initiateReview')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function RuleDetailsContent({ rule, onClose, t, isRTL }: { rule: Rule; onClose: () => void; t: any; isRTL: boolean }) {
  const [articlesData, setArticlesData] = useState<Article[]>(mockArticles)
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [isAddArticleFormOpen, setIsAddArticleFormOpen] = useState(false)
  const [newArticle, setNewArticle] = useState({
    articleNumber: '',
    title: '',
    description: '',
    riskLevel: 'medium' as ArticleRiskLevel,
    responsibleDepartment: '',
    complianceStatus: 'not_started' as ArticleComplianceStatus,
    assignedTo: '',
  })

  const handleAddArticle = () => {
    if (!newArticle.articleNumber || !newArticle.title || !newArticle.responsibleDepartment) return
    const article: Article = {
      id: Date.now(),
      ...newArticle,
    }
    setArticlesData([...articlesData, article])
    setNewArticle({
      articleNumber: '',
      title: '',
      description: '',
      riskLevel: 'medium',
      responsibleDepartment: '',
      complianceStatus: 'not_started',
      assignedTo: '',
    })
    setIsAddArticleFormOpen(false)
  }

  const handleUpdateArticle = () => {
    if (!editingArticle) return
    setArticlesData(articlesData.map(a => a.id === editingArticle.id ? editingArticle : a))
    setEditingArticle(null)
  }

  const handleRemoveArticle = (id: number) => {
    setArticlesData(articlesData.filter(a => a.id !== id))
    setEditingArticle(null)
  }

  const checklistItems = [
    { label: t('regulatoryUpdates.initialGapAnalysis'), status: 'completed' },
    { label: t('regulatoryUpdates.draftingDisclosurePolicy'), status: 'in_progress' },
    { label: t('regulatoryUpdates.internalAuditReview'), status: 'pending' },
    { label: t('regulatoryUpdates.finalImplementation'), status: 'pending' },
  ]

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
      {/* Left Column: Details */}
      <div className="flex-1 space-y-6">
        <div className={`flex items-start gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Icon icon="lucide:file-text" className="text-3xl" />
          </div>
          <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
            <h2 className="text-xl font-bold font-display text-slate-900">{rule.title}</h2>
            <p className="text-sm text-slate-500">REF: {rule.reference}</p>
          </div>
        </div>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('regulatoryUpdates.overview')}
          </h3>
          <p className="text-sm leading-relaxed text-slate-600">
            This regulation mandates all financial institutions to provide detailed disclosures
            regarding Environmental, Social, and Governance (ESG) impact on their operations and
            investment portfolios. Requires alignment with international GRI standards.
          </p>
        </section>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('regulatoryUpdates.implementationChecklist')}
          </h3>
          <div className="space-y-3">
            {checklistItems.map((item, index) => (
              <ChecklistItem key={index} label={item.label} status={item.status as 'completed' | 'in_progress' | 'pending'} t={t} isRTL={isRTL} />
            ))}
          </div>
        </section>

        {/* Article Breakdown Section */}
        <section className={isRTL ? 'text-right' : ''}>
          <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {t('regulatoryUpdates.articleBreakdown')}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAddArticleFormOpen(!isAddArticleFormOpen)}
              className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon={isAddArticleFormOpen ? 'lucide:x' : 'lucide:plus'} className="text-sm" />
              <span className="text-xs">{isAddArticleFormOpen ? t('common.cancel') : t('regulatoryUpdates.addArticle')}</span>
            </Button>
          </div>

          {/* Add Article Form */}
          {isAddArticleFormOpen && (
            <div className="p-4 bg-white border border-slate-200 rounded-xl mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('regulatoryUpdates.articleNumber')}
                  placeholder={t('regulatoryUpdates.articleNumberPlaceholder')}
                  value={newArticle.articleNumber}
                  onChange={(e) => setNewArticle({ ...newArticle, articleNumber: e.target.value })}
                />
                <Input
                  label={t('regulatoryUpdates.articleTitle')}
                  placeholder={t('regulatoryUpdates.articleTitlePlaceholder')}
                  value={newArticle.title}
                  onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.articleDescription')}
                </label>
                <textarea
                  className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                  rows={2}
                  placeholder={t('regulatoryUpdates.articleDescription')}
                  value={newArticle.description}
                  onChange={(e) => setNewArticle({ ...newArticle, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('regulatoryUpdates.riskLevel')}
                  </label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                    value={newArticle.riskLevel}
                    onChange={(e) => setNewArticle({ ...newArticle, riskLevel: e.target.value as ArticleRiskLevel })}
                  >
                    <option value="critical">{t('regulatoryUpdates.critical')}</option>
                    <option value="high">{t('regulatoryUpdates.high')}</option>
                    <option value="medium">{t('regulatoryUpdates.medium')}</option>
                    <option value="low">{t('regulatoryUpdates.low')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('regulatoryUpdates.responsibleDepartment')}
                  </label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                    value={newArticle.responsibleDepartment}
                    onChange={(e) => setNewArticle({ ...newArticle, responsibleDepartment: e.target.value })}
                  >
                    <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                    <option value="Compliance">{t('regulatoryUpdates.compliance')}</option>
                    <option value="Finance">{t('regulatoryUpdates.finance')}</option>
                    <option value="Risk">{t('regulatoryUpdates.risk')}</option>
                    <option value="Legal">{t('regulatoryUpdates.legal')}</option>
                    <option value="IT">{t('regulatoryUpdates.itCyber')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('regulatoryUpdates.complianceStatus')}
                  </label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                    value={newArticle.complianceStatus}
                    onChange={(e) => setNewArticle({ ...newArticle, complianceStatus: e.target.value as ArticleComplianceStatus })}
                  >
                    <option value="not_started">{t('regulatoryUpdates.notStarted')}</option>
                    <option value="in_progress">{t('regulatoryUpdates.inProgress')}</option>
                    <option value="compliant">{t('regulatoryUpdates.compliant')}</option>
                    <option value="non_compliant">{t('regulatoryUpdates.nonCompliant')}</option>
                  </select>
                </div>
                <Input
                  label={t('regulatoryUpdates.assignedTo')}
                  placeholder={t('regulatoryUpdates.assignedTo')}
                  value={newArticle.assignedTo}
                  onChange={(e) => setNewArticle({ ...newArticle, assignedTo: e.target.value })}
                />
              </div>
              <div className={`flex justify-end gap-2 pt-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Button variant="ghost" size="sm" onClick={() => setIsAddArticleFormOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" size="sm" onClick={handleAddArticle}>
                  {t('regulatoryUpdates.addArticle')}
                </Button>
              </div>
            </div>
          )}

          {/* Articles List */}
          <div className="space-y-3">
            {articlesData.map((article) => (
              <ArticleBreakdownItem
                key={article.id}
                article={article}
                onEdit={setEditingArticle}
                t={t}
                isRTL={isRTL}
              />
            ))}
          </div>

          {/* Edit Article Form */}
          {editingArticle && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className={`p-6 border-b border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                  <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <h3 className="text-lg font-bold text-slate-900">{t('regulatoryUpdates.editArticle')}</h3>
                    <button
                      onClick={() => setEditingArticle(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Icon icon="lucide:x" className="text-lg" />
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label={t('regulatoryUpdates.articleNumber')}
                      placeholder={t('regulatoryUpdates.articleNumberPlaceholder')}
                      value={editingArticle.articleNumber}
                      onChange={(e) => setEditingArticle({ ...editingArticle, articleNumber: e.target.value })}
                    />
                    <Input
                      label={t('regulatoryUpdates.articleTitle')}
                      placeholder={t('regulatoryUpdates.articleTitlePlaceholder')}
                      value={editingArticle.title}
                      onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('regulatoryUpdates.articleDescription')}
                    </label>
                    <textarea
                      className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                      rows={2}
                      placeholder={t('regulatoryUpdates.articleDescription')}
                      value={editingArticle.description || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {t('regulatoryUpdates.riskLevel')}
                      </label>
                      <select
                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                        value={editingArticle.riskLevel}
                        onChange={(e) => setEditingArticle({ ...editingArticle, riskLevel: e.target.value as ArticleRiskLevel })}
                      >
                        <option value="critical">{t('regulatoryUpdates.critical')}</option>
                        <option value="high">{t('regulatoryUpdates.high')}</option>
                        <option value="medium">{t('regulatoryUpdates.medium')}</option>
                        <option value="low">{t('regulatoryUpdates.low')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {t('regulatoryUpdates.responsibleDepartment')}
                      </label>
                      <select
                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                        value={editingArticle.responsibleDepartment}
                        onChange={(e) => setEditingArticle({ ...editingArticle, responsibleDepartment: e.target.value })}
                      >
                        <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                        <option value="Compliance">{t('regulatoryUpdates.compliance')}</option>
                        <option value="Finance">{t('regulatoryUpdates.finance')}</option>
                        <option value="Risk">{t('regulatoryUpdates.risk')}</option>
                        <option value="Legal">{t('regulatoryUpdates.legal')}</option>
                        <option value="IT">{t('regulatoryUpdates.itCyber')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {t('regulatoryUpdates.complianceStatus')}
                      </label>
                      <select
                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                        value={editingArticle.complianceStatus}
                        onChange={(e) => setEditingArticle({ ...editingArticle, complianceStatus: e.target.value as ArticleComplianceStatus })}
                      >
                        <option value="not_started">{t('regulatoryUpdates.notStarted')}</option>
                        <option value="in_progress">{t('regulatoryUpdates.inProgress')}</option>
                        <option value="compliant">{t('regulatoryUpdates.compliant')}</option>
                        <option value="non_compliant">{t('regulatoryUpdates.nonCompliant')}</option>
                      </select>
                    </div>
                    <Input
                      label={t('regulatoryUpdates.assignedTo')}
                      placeholder={t('regulatoryUpdates.assignedTo')}
                      value={editingArticle.assignedTo || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, assignedTo: e.target.value })}
                    />
                  </div>
                </div>
                <div className={`p-6 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveArticle(editingArticle.id)}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    <Icon icon="lucide:trash-2" className="text-sm" />
                    <span>{t('common.delete')}</span>
                  </Button>
                  <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button variant="ghost" size="sm" onClick={() => setEditingArticle(null)}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleUpdateArticle}>
                      {t('common.saveChanges')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
            {t('regulatoryUpdates.internalNotes')}
          </h3>
          <textarea
            className={`w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
            rows={3}
            placeholder={t('regulatoryUpdates.addInternalComments')}
          ></textarea>
          <div className={`flex mt-2 ${isRTL ? 'justify-start' : 'justify-end'}`}>
            <button className="text-xs font-bold text-emerald-600 cursor-pointer">{t('regulatoryUpdates.postNote')}</button>
          </div>
        </section>
      </div>

      {/* Right Column: Stats & Timeline */}
      <div className={`w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-6 ${isRTL ? 'md:-mr-6 md:ml-0' : ''}`}>
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
                  ? t('regulatoryUpdates.compliant')
                  : rule.status === 'overdue'
                  ? t('regulatoryUpdates.daysOverdue')
                  : t('regulatoryUpdates.daysLeft')}
              </p>
            </div>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            {t('regulatoryUpdates.urgency')}:{' '}
            {rule.status === 'overdue' || rule.daysLeft! <= 7 ? t('regulatoryUpdates.critical').toUpperCase() : t('regulatoryUpdates.moderate')}
          </p>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4">{t('regulatoryUpdates.documentation')}</h3>
          <div className="space-y-2">
            <div className={`flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-500 transition-colors cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:file-text" className="text-rose-500" />
              <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-slate-700 truncate">SAMA_ESG_2024.pdf</p>
                <p className="text-[10px] text-slate-400">2.4 MB</p>
              </div>
            </div>
          </div>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-4">{t('regulatoryUpdates.activityFeed')}</h3>
          <div className="space-y-4">
            <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0`}></div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-[11px] font-bold text-slate-800">Gap Analysis Approved</p>
                <p className="text-[10px] text-slate-500">Sarah C. - 2h ago</p>
              </div>
            </div>
            <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0`}></div>
              <div className={isRTL ? 'text-right' : ''}>
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
  t,
  isRTL,
}: {
  label: string
  status: 'completed' | 'in_progress' | 'pending'
  t: any
  isRTL: boolean
}) {
  const statusStyles = {
    completed: {
      bg: 'bg-emerald-50/50 border-emerald-100',
      icon: (
        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
          <Icon icon="lucide:check" className="text-white text-xs" />
        </div>
      ),
      label: t('regulatoryUpdates.completed'),
      labelColor: 'text-emerald-600',
      textColor: 'text-slate-700 font-bold',
    },
    in_progress: {
      bg: 'bg-white border-slate-200',
      icon: <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-50"></div>,
      label: t('regulatoryUpdates.inProgress'),
      labelColor: 'text-amber-600',
      textColor: 'text-slate-700 font-medium',
    },
    pending: {
      bg: 'bg-white border-slate-200',
      icon: <div className="w-6 h-6 rounded-full border-2 border-slate-100"></div>,
      label: t('regulatoryUpdates.pending'),
      labelColor: 'text-slate-300',
      textColor: 'text-slate-400 font-medium',
    },
  }

  const style = statusStyles[status]

  return (
    <div className={`flex items-center justify-between p-4 ${style.bg} rounded-xl border ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        {style.icon}
        <span className={`text-sm ${style.textColor}`}>{label}</span>
      </div>
      <span className={`text-[10px] ${style.labelColor} font-bold uppercase`}>{style.label}</span>
    </div>
  )
}

function ArticleBreakdownItem({
  article,
  onEdit,
  t,
  isRTL,
}: {
  article: Article
  onEdit: (article: Article) => void
  t: (key: string) => string
  isRTL: boolean
}) {
  const riskConfig = {
    critical: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700' },
    high: { bg: 'bg-orange-50', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
    medium: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
    low: { bg: 'bg-slate-50', text: 'text-slate-600', badge: 'bg-slate-100 text-slate-600' },
  }

  const statusConfig = {
    compliant: { icon: 'lucide:check-circle', color: 'text-emerald-500', label: 'regulatoryUpdates.compliant' },
    in_progress: { icon: 'lucide:loader', color: 'text-amber-500', label: 'regulatoryUpdates.inProgress' },
    non_compliant: { icon: 'lucide:x-circle', color: 'text-rose-500', label: 'regulatoryUpdates.nonCompliant' },
    not_started: { icon: 'lucide:circle-dashed', color: 'text-slate-400', label: 'regulatoryUpdates.notStarted' },
  }

  const riskLabels: Record<ArticleRiskLevel, string> = {
    critical: t('regulatoryUpdates.critical'),
    high: t('regulatoryUpdates.high'),
    medium: t('regulatoryUpdates.medium'),
    low: t('regulatoryUpdates.low'),
  }

  const risk = riskConfig[article.riskLevel]
  const status = statusConfig[article.complianceStatus]

  return (
    <div className={`p-4 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors ${risk.bg}`}>
      {/* Article header with number, title, and edit button */}
      <div className={`flex items-start justify-between mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <span className={`text-sm font-bold ${risk.text}`}>{article.articleNumber}</span>
          <span className="text-slate-300">-</span>
          <span className="text-sm font-bold text-slate-800">{article.title}</span>
        </div>
        <button
          onClick={() => onEdit(article)}
          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
        >
          <Icon icon="lucide:pencil" className="text-sm" />
        </button>
      </div>

      {/* Description */}
      {article.description && (
        <p className={`text-xs text-slate-500 mb-3 ${isRTL ? 'text-right' : ''}`}>
          {article.description}
        </p>
      )}

      {/* Risk level badge, department, and compliance status */}
      <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${risk.badge}`}>
          {riskLabels[article.riskLevel].toUpperCase()}
        </span>
        <span className="px-2 py-1 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600">
          {article.responsibleDepartment}
        </span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon={status.icon} className={`text-sm ${status.color}`} />
          <span className={`text-[10px] font-bold ${status.color}`}>
            {t(status.label)}
          </span>
        </div>
      </div>

      {/* Assigned to */}
      {article.assignedTo && (
        <div className={`mt-3 pt-3 border-t border-slate-100 ${isRTL ? 'text-right' : ''}`}>
          <span className="text-[10px] text-slate-400">{t('regulatoryUpdates.assignedTo')}: </span>
          <span className="text-[10px] font-bold text-slate-600">{article.assignedTo}</span>
        </div>
      )}
    </div>
  )
}
