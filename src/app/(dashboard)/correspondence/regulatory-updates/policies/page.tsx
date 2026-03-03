'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { NoResultsEmptyState } from '@/components/ui/empty-state'
import { usePolicyStore } from '@/stores/policy-store'
import { RegDocCard } from '@/components/reg-doc/RegDocCard'
import { RegDocFilterBar } from '@/components/reg-doc/RegDocFilterBar'
import type { Policy, PolicyStatus, PolicyCategory, PolicyApprovalTier } from '@/types'

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

const OWNERS = [
  { name: 'Sarah Connor', avatar: 'Sarah', department: 'Compliance' },
  { name: 'Felix Henderson', avatar: 'Felix', department: 'IT Security' },
  { name: 'Michael Scott', avatar: 'Michael', department: 'Legal' },
  { name: 'David Wallace', avatar: 'David', department: 'Risk Management' },
  { name: 'Ahmed Al-Rashid', avatar: 'Ahmed', department: 'Compliance' },
]

export default function RegulatoryUpdatesPoliciesPage() {
  const { t, isRTL } = useTranslation()
  const {
    policies, selectedPolicy, create, submitForReview, approve, initiateReview,
    setSelected, reviewAlerts,
  } = usePolicyStore()

  const [policySearchQuery, setPolicySearchQuery] = useState('')
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState<PolicyCategory | 'all'>('all')
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatus | 'all'>('all')
  const [isCreatePolicyModalOpen, setIsCreatePolicyModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<PolicyCategory | ''>('')
  const [formTier, setFormTier] = useState<PolicyApprovalTier | ''>('')
  const [formVersion, setFormVersion] = useState('v1.0')
  const [formNextReview, setFormNextReview] = useState('')
  const [formOwnerIdx, setFormOwnerIdx] = useState(0)
  const [formDescription, setFormDescription] = useState('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const alerts = useMemo(() => reviewAlerts(), [policies])

  const filteredPolicies = useMemo(() => {
    return policies.filter((policy) => {
      const matchesSearch =
        policy.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
        policy.description.toLowerCase().includes(policySearchQuery.toLowerCase())
      const matchesCategory = policyCategoryFilter === 'all' || policy.category === policyCategoryFilter
      const matchesStatus = policyStatusFilter === 'all' || policy.status === policyStatusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [policies, policySearchQuery, policyCategoryFilter, policyStatusFilter])

  const policyStats = useMemo(() => ({
    total: policies.length,
    approved: policies.filter((p) => p.status === 'approved').length,
    underReview: policies.filter((p) => p.status === 'under-review').length,
    draft: policies.filter((p) => p.status === 'draft').length,
    expired: policies.filter((p) => p.status === 'expired').length,
  }), [policies])

  function handleCreate() {
    if (!formName || !formCategory || !formTier || !formNextReview) return
    const owner = OWNERS[formOwnerIdx]
    create({
      name: formName,
      description: formDescription,
      status: 'draft',
      category: formCategory as PolicyCategory,
      version: formVersion || 'v1.0',
      approvalTier: formTier as PolicyApprovalTier,
      owner,
      lastReviewDate: '',
      nextReviewDate: formNextReview,
      reviewCycleDays: 365,
      versionHistory: [
        { version: formVersion || 'v1.0', date: new Date().toISOString().split('T')[0], author: owner.name, changes: 'Initial draft' },
      ],
      workflowTimeline: [
        { step: 'Draft Created', date: new Date().toISOString().split('T')[0], user: owner.name, status: 'current' },
        { step: 'Review', date: '', user: '', status: 'pending' },
        { step: 'Final Approval', date: '', user: '', status: 'pending' },
      ],
    })
    showToast(t('policies.policyCreated'))
    setIsCreatePolicyModalOpen(false)
    // Reset form
    setFormName('')
    setFormCategory('')
    setFormTier('')
    setFormVersion('v1.0')
    setFormNextReview('')
    setFormOwnerIdx(0)
    setFormDescription('')
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Review Alert Banner */}
        {alerts.length > 0 && (
          <div className={`mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Icon icon="lucide:bell" className="text-amber-500 text-xl shrink-0" />
            <div className={isRTL ? 'text-right' : ''}>
              <p className="text-sm font-bold text-amber-800">
                {t('policies.reviewAlertTitle', { count: String(alerts.length) })}
              </p>
              <p className="text-xs text-amber-600">{t('policies.reviewAlertBody')}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <StatCard label={t('policies.totalPolicies')} value={policyStats.total} subtext={t('policies.documents')} borderColor="slate" />
          <StatCard label={t('policies.approved')} value={policyStats.approved} subtext={t('policies.active')} borderColor="emerald" valueColor="emerald" />
          <StatCard label={t('policies.underReview')} value={policyStats.underReview} subtext={t('policies.pending')} borderColor="amber" valueColor="amber" />
          <StatCard label={t('policies.draft')} value={policyStats.draft} subtext={t('policies.inProgress')} borderColor="slate" />
          <StatCard label={t('policies.expired')} value={policyStats.expired} subtext={t('policies.needsReview')} borderColor="rose" valueColor="rose" />
        </div>

        {/* Filter Bar */}
        <RegDocFilterBar
          variant="policy"
          searchQuery={policySearchQuery}
          onSearchChange={setPolicySearchQuery}
          categoryFilter={policyCategoryFilter}
          onCategoryChange={setPolicyCategoryFilter}
          statusFilter={policyStatusFilter}
          onStatusChange={setPolicyStatusFilter}
          resultCount={filteredPolicies.length}
          resultLabel={t('policies.policiesFound')}
          rightSlot={
            <Link
              href="/correspondence/registry"
              className={`px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-sm ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:book-open" className="text-slate-500 text-sm" />
              {t('correspondence.viewRegistry')}
            </Link>
          }
          t={t}
          isRTL={isRTL}
        />

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
            {filteredPolicies.map((p) => (
              <RegDocCard
                key={p.id}
                variant="policy"
                policy={p}
                onClick={() => setSelected(p)}
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
        onClose={() => setSelected(null)}
        title={t('policies.policyDetails')}
        size="xl"
      >
        {selectedPolicy && (
          <PolicyDetailsContent
            policy={selectedPolicy}
            onClose={() => setSelected(null)}
            onSubmitForReview={() => { submitForReview(selectedPolicy.id); showToast(t('policies.submitForReviewToast')); setSelected(null) }}
            onApprove={() => { approve(selectedPolicy.id); showToast(t('policies.approveToast')); setSelected(null) }}
            onInitiateReview={() => { initiateReview(selectedPolicy.id); showToast(t('policies.initiateReviewToast')); setSelected(null) }}
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
          <p className="text-sm text-slate-500 -mt-2">{t('policies.createPolicySubtitle')}</p>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <Input
                label={`${t('policies.policyName')} *`}
                placeholder={t('policies.policyNamePlaceholder')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')} *</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as PolicyCategory | '')}
                >
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')} *</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formTier}
                  onChange={(e) => setFormTier(e.target.value as PolicyApprovalTier | '')}
                >
                  <option value="">{t('policies.selectApprovalTier')}</option>
                  <option value="board">{t('policies.approvalTierBoard')}</option>
                  <option value="management-sharia">{t('policies.approvalTierManagementSharia')}</option>
                  <option value="agm">{t('policies.approvalTierAGM')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('policies.version')}
                  placeholder="v1.0"
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                />
                <Input
                  label={`${t('policies.nextReview')} *`}
                  type="date"
                  value={formNextReview}
                  onChange={(e) => setFormNextReview(e.target.value)}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectOwner')}</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formOwnerIdx}
                  onChange={(e) => setFormOwnerIdx(Number(e.target.value))}
                >
                  {OWNERS.map((o, idx) => (
                    <option key={idx} value={idx}>{o.name} — {o.department}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')}</label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  placeholder={t('policies.descriptionPlaceholder')}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.uploadDocument')}</label>
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
            <Button variant="ghost" onClick={() => setIsCreatePolicyModalOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={handleCreate}
              disabled={!formName || !formCategory || !formTier || !formNextReview}
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label, value, subtext, borderColor, valueColor,
}: {
  label: string; value: number; subtext: string
  borderColor: 'slate' | 'amber' | 'emerald' | 'rose'
  valueColor?: 'amber' | 'emerald' | 'rose'
}) {
  const borderColors = { slate: 'border-l-slate-400', amber: 'border-l-amber-400', emerald: 'border-l-emerald-500', rose: 'border-l-rose-500' }
  const valueColors = { amber: 'text-amber-600', emerald: 'text-emerald-600', rose: 'text-rose-600' }
  return (
    <Card className={`p-6 border-l-4 ${borderColors[borderColor]} hover:-translate-y-1 transition-transform`}>
      <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${valueColor ? valueColors[valueColor] : 'text-slate-900'}`}>{value}</span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </Card>
  )
}

function PolicyDetailsContent({
  policy, onClose, onSubmitForReview, onApprove, onInitiateReview, showToast, t, isRTL,
}: {
  policy: Policy
  onClose: () => void
  onSubmitForReview: () => void
  onApprove: () => void
  onInitiateReview: () => void
  showToast: (msg: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}) {
  const statusColors: Record<PolicyStatus, string> = {
    draft: 'bg-slate-100 text-slate-600',
    'under-review': 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-rose-100 text-rose-700',
  }
  const statusLabel: Record<PolicyStatus, string> = {
    draft: t('policies.statusDraft'),
    'under-review': t('policies.statusUnderReview'),
    approved: t('policies.statusApproved'),
    expired: t('policies.statusExpired'),
  }

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
      {/* Left Column */}
      <div className="flex-1 space-y-6">
        <div className={`flex items-start gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
            <div className={`flex items-center gap-3 mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h2 className="text-xl font-bold font-display text-slate-900">{policy.name}</h2>
              <span className={cn('px-2.5 py-1 text-xs font-bold rounded-full', statusColors[policy.status])}>
                {statusLabel[policy.status]}
              </span>
            </div>
            <p className="text-sm text-slate-500">{policy.version} • {policy.id}</p>
          </div>
        </div>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('policies.description')}</h3>
          <p className="text-sm leading-relaxed text-slate-600">{policy.description}</p>
        </section>

        <section className={isRTL ? 'text-right' : ''}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('policies.versionHistory')}</h3>
          <div className="space-y-3">
            {policy.versionHistory.map((entry, idx) => (
              <div key={idx} className={`p-3 bg-slate-50 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}>
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
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('policies.approvalWorkflow')}</h3>
          <div className="space-y-2">
            {policy.workflowTimeline.map((step, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-4 p-3 rounded-xl border',
                  step.status === 'completed' ? 'bg-emerald-50/50 border-emerald-100' :
                  step.status === 'current' ? 'bg-amber-50/50 border-amber-100' :
                  'bg-white border-slate-100',
                  isRTL ? 'flex-row-reverse' : ''
                )}
              >
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                  step.status === 'completed' ? 'bg-emerald-500' :
                  step.status === 'current' ? 'border-2 border-amber-400 bg-amber-50' :
                  'border-2 border-slate-200'
                )}>
                  {step.status === 'completed' && <Icon icon="lucide:check" className="text-white text-xs" />}
                </div>
                <div className={cn('flex-1', isRTL ? 'text-right' : '')}>
                  <p className="text-sm font-bold text-slate-700">{step.step}</p>
                  <p className="text-[10px] text-slate-400">{step.user} {step.date && `• ${step.date}`}</p>
                </div>
                <span className={cn('text-[10px] font-bold uppercase',
                  step.status === 'completed' ? 'text-emerald-600' :
                  step.status === 'current' ? 'text-amber-600' :
                  'text-slate-300'
                )}>
                  {step.status === 'completed' ? t('policies.workflowCompleted') :
                   step.status === 'current' ? t('policies.workflowCurrent') :
                   t('policies.workflowPending')}
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
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">{t('policies.approvalTier')}</h3>
          <p className="text-sm font-bold text-slate-700">
            {policy.approvalTier === 'board' ? t('policies.approvalTierBoard') :
             policy.approvalTier === 'management-sharia' ? t('policies.approvalTierManagementSharia') :
             t('policies.approvalTierAGM')}
          </p>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">{t('policies.reviewSchedule')}</h3>
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.lastReview')}</p>
              <p className="text-sm font-bold text-slate-700">{policy.lastReviewDate || '—'}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.nextReview')}</p>
              <p className="text-sm font-bold text-slate-700">{policy.nextReviewDate}</p>
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
          <Button variant="primary" className="w-full" onClick={() => showToast(t('policies.editPolicyToast'))}>
            <Icon icon="lucide:edit" className="w-4 h-4" />
            {t('policies.editPolicy')}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => showToast(t('policies.downloadPdfToast'))}>
            <Icon icon="lucide:download" className="w-4 h-4" />
            {t('policies.downloadPdf')}
          </Button>
          {policy.status === 'draft' && (
            <Button variant="outline" className="w-full" onClick={onSubmitForReview}>
              <Icon icon="lucide:send" className="w-4 h-4" />
              {t('policies.submitForReview')}
            </Button>
          )}
          {policy.status === 'under-review' && (
            <Button variant="outline" className="w-full" onClick={onApprove}>
              <Icon icon="lucide:check-circle" className="w-4 h-4" />
              {t('policies.approve')}
            </Button>
          )}
          {policy.status === 'expired' && (
            <Button variant="outline" className="w-full text-amber-600 border-amber-200 hover:bg-amber-50" onClick={onInitiateReview}>
              <Icon icon="lucide:refresh-cw" className="w-4 h-4" />
              {t('policies.initiateReview')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
