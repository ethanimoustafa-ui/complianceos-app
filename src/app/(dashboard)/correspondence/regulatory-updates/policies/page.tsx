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
import { NoResultsEmptyState } from '@/components/ui/empty-state'

type PolicyStatus = 'draft' | 'under_review' | 'approved' | 'expired'
type PolicyCategory = 'compliance' | 'it' | 'operations' | 'risk' | 'hr' | 'finance'

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

export default function RegulatoryUpdatesPoliciesPage() {
  const { t, isRTL } = useTranslation()
  const [policySearchQuery, setPolicySearchQuery] = useState('')
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState<PolicyCategory | 'all'>('all')
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatus | 'all'>('all')
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [isCreatePolicyModalOpen, setIsCreatePolicyModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const filteredPolicies = policiesData.filter((policy) => {
    const matchesSearch =
      policy.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
      policy.description.toLowerCase().includes(policySearchQuery.toLowerCase())
    const matchesCategory = policyCategoryFilter === 'all' || policy.category === policyCategoryFilter
    const matchesStatus = policyStatusFilter === 'all' || policy.status === policyStatusFilter
    return matchesSearch && matchesCategory && matchesStatus
  })

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
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="text-base" />
          </Link>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('regulatoryUpdates.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('regulatoryUpdates.subtitle')}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/sama-letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('observations.samaLetters')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:refresh-cw" className="text-emerald-600" />
              {t('observations.regulatoryUpdates')}
            </span>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link href="/correspondence/regulatory-updates/rules" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 text-slate-500 hover:text-slate-700', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:scale" className="text-sm" />
              {t('regulatoryUpdates.tabs.rules')}
            </Link>
            <Link href="/correspondence/regulatory-updates/policies" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 bg-white text-slate-900 shadow-sm', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:file-text" className="text-sm" />
              {t('regulatoryUpdates.tabs.policies')}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button
            variant="primary"
            className="shadow-lg shadow-emerald-100"
            onClick={() => setIsCreatePolicyModalOpen(true)}
          >
            <Icon icon="lucide:plus" />
            {t('policies.createPolicy')}
          </Button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
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
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className={`text-xs font-bold text-slate-500 ${isRTL ? 'text-right' : ''}`}>
              {filteredPolicies.length} {t('policies.policiesFound')}
            </span>
            <Link
              href="/correspondence/registry"
              className={`px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-sm ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:book-open" className="text-slate-500 text-sm" />
              {t('correspondence.viewRegistry')}
            </Link>
          </div>
        </div>

        {/* Policy Cards */}
        {filteredPolicies.length === 0 ? (
          <NoResultsEmptyState
            onClearFilters={() => {
              setPolicySearchQuery('')
              setPolicyCategoryFilter('all')
              setPolicyStatusFilter('all')
            }}
          />
        ) : (
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
        )}
      </div>

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
    </div>
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
          icon="lucide:chevron-right"
          className={cn("text-slate-300 group-hover:text-emerald-500 transition-colors text-xl", isRTL && "flip-x")}
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
