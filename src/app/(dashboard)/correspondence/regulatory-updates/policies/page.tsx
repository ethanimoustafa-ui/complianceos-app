'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { NoResultsEmptyState, NoDataEmptyState } from '@/components/ui/empty-state'
import { usePolicyStore } from '@/stores/policy-store'
import { CardSkeleton } from '@/components/ui/skeleton'
import { RegDocCard } from '@/components/correspondence/regulatory-updates/RegDocCard'
import { RegDocFilterBar } from '@/components/correspondence/regulatory-updates/RegDocFilterBar'
import { StatCard } from '@/components/correspondence/regulatory-updates/rules/StatCard'
import { PolicyDetailsContent } from '@/components/correspondence/regulatory-updates/policies/PolicyDetailsContent'
import { DeletePolicyModal } from '@/components/correspondence/regulatory-updates/policies/DeletePolicyModal'
import { RegisterPolicyModal } from '@/components/correspondence/regulatory-updates/policies/RegisterPolicyModal'
import { EditPolicyModal } from '@/components/correspondence/regulatory-updates/policies/EditPolicyModal'
import type { PolicyStatus, PolicyCategory } from '@/types'
import { paginate } from '@/lib/pagination'
import { useDepartmentStore } from '@/stores/department-store'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { exportPoliciesLocalized } from '@/lib/export'
import { Gate } from '@/components/auth/gate'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { matchesFrameworkQuery } from '@/components/ui/framework-chips'
import { downloadPdf } from '@/lib/pdf-client'
import type { TranslationKey } from '@/i18n'
import { ExportMenu } from '@/components/ui/export-menu'

// Toast component (kept inline — single-use, three-second display).
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
  const { t, tCount, isRTL } = useTranslation()
  const {
    policies, selectedPolicy, update,
    setSelected, reviewAlerts, checkAndUpdateStatuses,
    fetchAll: fetchAllPolicies,
    fetchById: fetchPolicyById,
    archivePolicy, unarchivePolicy,
    archiveFilter, setArchiveFilter,
  } = usePolicyStore()

  // Hydrate from the API on mount — otherwise the page renders the empty
  // initial Zustand state and never sees server-side rows (reload-survival
  // bug). Pulled in by Fix-B; mirrors the pattern in /reports/audits.
  useEffect(() => { fetchAllPolicies() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Framework names (static seed metadata) for framework-aware search.
  const allFrameworks = useFrameworkConfigStore((s) => s.frameworks)

  // Wave-2 Agent E: first-fetch skeleton.
  const policiesLoading = usePolicyStore((s) => s.isLoading)
  const policiesLastFetched = usePolicyStore((s) => s.lastFetched)
  const showPoliciesSkeleton =
    policiesLoading && policies.length === 0 && policiesLastFetched === null

  // P2 (W30): skeleton on filter-chip switch.
  // Track whether a filter-triggered refetch is in flight so the list shows
  // skeleton rows instead of flashing the stale dataset between fetch start
  // and completion.
  const [isFilterRefetching, setIsFilterRefetching] = useState(false)
  const showFilterSkeleton = isFilterRefetching && policiesLoading
  // Clear the filter-refetching flag once the store settles (isLoading → false).
  useEffect(() => {
    if (!policiesLoading) setIsFilterRefetching(false)
  }, [policiesLoading])
  const { user: currentUser } = useAuthStore()

  // Pre-warm the dependent stores so the modals (templates, categories,
  // departments, team) render their dropdowns without an empty-state flash.
  const fetchAllPolicyTemplates = usePolicyTemplateStore((s) => s.fetchAll)
  const fetchAllPolicyCategories = usePolicyCategoryStore((s) => s.fetchAll)
  useEffect(() => {
    fetchAllPolicyTemplates()
    fetchAllPolicyCategories()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const searchParams = useSearchParams()
  const router = useRouter()
  const [deepLinkTab, setDeepLinkTab] = useState<'overview' | 'workflow' | 'activity' | undefined>(undefined)

  // BUG-P04 fix: Deep-link from URL params (?policyId=...&tab=workflow)
  // Re-run whenever policies or searchParams change so the modal opens even
  // if policies finish loading after the component mounts.
  useEffect(() => {
    const policyId = searchParams.get('policyId')
    const tab = searchParams.get('tab')
    if (policyId && policies.length > 0) {
      const match = policies.find((p) => p.id === policyId)
      if (match) {
        setSelected(match)
        if (tab === 'workflow' || tab === 'activity' || tab === 'overview') {
          setDeepLinkTab(tab)
        }
      }
    }
  }, [searchParams, policies]) // eslint-disable-line react-hooks/exhaustive-deps

  const [policySearchQuery, setPolicySearchQuery] = useState('')
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState<PolicyCategory | 'all'>('all')
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatus | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // P6 (W29): refetch whenever the archive filter changes so the API applies
  // the correct archived_at predicate (active / archived / all).
  useEffect(() => { fetchAllPolicies(true) }, [archiveFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  const PAGE_SIZE = 10
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [newlyCreatedIds, setNewlyCreatedIds] = useState<string[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Check and update overdue/requires-review on mount.
  useEffect(() => { checkAndUpdateStatuses() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wave-19.3 / P18-BUG-1 — the list GET (`/api/policies`) omits nested
  // children (activity_log, versions, workflow_steps, attachments, evidence).
  // When the detail modal opens, fetch the detail GET so the Activity /
  // Version History / Workflow tabs hydrate from the server instead of
  // rendering the empty branch.
  const selectedPolicyId = selectedPolicy?.id
  useEffect(() => {
    if (selectedPolicyId) fetchPolicyById(selectedPolicyId)
  }, [selectedPolicyId, fetchPolicyById])

  const alerts = useMemo(() => reviewAlerts(), [policies]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPolicies = useMemo(() => {
    return policies
      .filter((policy) => {
        // Framework-aware search: a framework name (EN/AR) or id matches every
        // policy tagged with it — the cards already render the chips.
        const matchesSearch =
          policy.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
          policy.description.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
          matchesFrameworkQuery(policy.frameworkIds, allFrameworks, policySearchQuery)
        const matchesCategory = policyCategoryFilter === 'all' || policy.category === policyCategoryFilter
        const matchesStatus = policyStatusFilter === 'all' || policy.status === policyStatusFilter
        // P6 (W29): client-side archive filter (belt-and-suspenders with API filter).
        const matchesArchive =
          archiveFilter === 'all' ? true :
          archiveFilter === 'archived' ? !!policy.archivedAt :
          !policy.archivedAt
        return matchesSearch && matchesCategory && matchesStatus && matchesArchive
      })
      .sort((a, b) => {
        if (!a.nextReviewDate) return 1
        if (!b.nextReviewDate) return -1
        return a.nextReviewDate.localeCompare(b.nextReviewDate)
      })
  }, [policies, policySearchQuery, policyCategoryFilter, policyStatusFilter, archiveFilter, allFrameworks])

  // Reset to page 1 when filters change.
  useEffect(() => { setCurrentPage(1) }, [policySearchQuery, policyCategoryFilter, policyStatusFilter, archiveFilter])

  const { items: paginatedPolicies, totalPages } = useMemo(
    () => paginate(filteredPolicies, currentPage, PAGE_SIZE),
    [filteredPolicies, currentPage]
  )

  // Wave-19 / Q2 — Expired StatCard predicate is:
  //   (status === 'expired' OR isExpired === true)
  //   AND status NOT IN ('archived', 'renewed')
  // The `isExpired` half catches idle, past-due rows whose persisted `status`
  // hasn't been flipped yet (the trigger in migration 055 maintains the
  // `policies.is_expired` column; the daily pg_cron job catches rows that no
  // UPDATE has touched). The status-exclusion half stops archived/renewed
  // rows from being counted as Expired forever.
  const policyStats = useMemo(() => ({
    total: policies.length,
    approved: policies.filter((p) => p.status === 'approved').length,
    underReview: policies.filter((p) => p.status === 'under-review').length,
    draft: policies.filter((p) => p.status === 'draft').length,
    expired: policies.filter(
      (p) =>
        (p.status === 'expired' || p.isExpired === true) &&
        p.status !== ('archived' as PolicyStatus) &&
        p.status !== ('renewed' as PolicyStatus),
    ).length,
  }), [policies])

  const handleExportPdf = useCallback(async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const dateStr = new Date().toISOString().split('T')[0]
      await downloadPdf(
        {
          template: 'policy-report',
          locale: isRTL ? 'ar' : 'en',
          options: { engine: 'latex' },
          data: {
            organization: 'الشركة المتحدة للخدمات المالية',
            generatedBy: currentUser?.name ?? '',
            date: dateStr,
            policies: filteredPolicies.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              status: p.status,
              version: p.version,
              owner: p.owner?.name,
              lastReviewDate: p.lastReviewDate,
              nextReviewDate: p.nextReviewDate,
              approvalTier: p.approvalTier,
              isExpired: p.isExpired,
            })),
          },
        },
        `Policy-Register-${dateStr}.pdf`,
      )
    } catch (err) {
      console.error('Failed to export policies PDF:', err)
    } finally {
      setPdfBusy(false)
    }
  }, [pdfBusy, filteredPolicies, isRTL, currentUser])

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4`}>
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={'lucide:arrow-left'} className="text-base" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('regulatoryUpdates.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('regulatoryUpdates.subtitle')}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2`}>
              <Icon icon="lucide:refresh-cw" className="text-emerald-600" />
              {t('observations.regulatoryUpdates')}
            </span>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg`}>
            <Link href="/correspondence/regulatory-updates/rules" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:scale" className="text-sm" />
              {t('regulatoryUpdates.tabs.rules')}
            </Link>
            <Link href="/correspondence/regulatory-updates/policies" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 bg-white text-slate-900 shadow-sm')}>
              <Icon icon="lucide:file-text" className="text-sm" />
              {t('regulatoryUpdates.tabs.policies')}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          {/* Export Menu — CSV + PDF */}
          <Gate perm="Export Compliance Data">
            <ExportMenu
              options={[
                {
                  label: t('common.exportCsv'),
                  icon: 'lucide:table',
                  onSelect: () => {
                    const depts = useDepartmentStore.getState().departments
                    const resolveDept = (id: string | undefined) =>
                      id ? depts.find((d) => d.id === id)?.name ?? '' : ''
                    exportPoliciesLocalized(filteredPolicies, 'policies', t, isRTL, resolveDept)
                  },
                },
                {
                  label: t('common.exportPdf'),
                  icon: 'lucide:file-text',
                  onSelect: handleExportPdf,
                  loading: pdfBusy,
                },
              ]}
            />
          </Gate>
          <Gate perm="Approve Policy Reviews">
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Icon icon="lucide:plus" />
              {t('policies.createPolicy')}
            </Button>
          </Gate>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Review Alert Banner */}
        {alerts.length > 0 && (
          <div className={`mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3`}>
            <Icon icon="lucide:bell" className="text-amber-500 text-xl shrink-0" />
            <div>
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

        {/* P6 (W29): Archive filter — Active / Archived / All */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('policies.archivePolicy').replace(' Policy', '')}:</span>
          {(['active', 'archived', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setArchiveFilter(f); setIsFilterRefetching(true); fetchAllPolicies(true) }}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-bold transition-colors border',
                archiveFilter === f
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {f === 'active' ? t('common.filterActive') : f === 'archived' ? t('common.filterArchived') : t('common.filterAll')}
            </button>
          ))}
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
          resultLabelKey="policies.policiesFound"
          rightSlot={
            <Link
              href="/correspondence/registry"
              className={`px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-sm`}
            >
              <Icon icon="lucide:book-open" className="text-slate-500 text-sm" />
              {t('correspondence.viewRegistry')}
            </Link>
          }
          t={t}
          tCount={tCount}
          isRTL={isRTL}
        />

        {/* Policy Cards */}
        {showPoliciesSkeleton || showFilterSkeleton ? (
          <CardSkeleton count={4} className="grid-cols-1" />
        ) : filteredPolicies.length === 0 ? (
          (policySearchQuery || policyCategoryFilter !== 'all' || policyStatusFilter !== 'all' || archiveFilter !== 'active') ? (
            <NoResultsEmptyState
              onClearFilters={() => {
                setPolicySearchQuery('')
                setPolicyCategoryFilter('all')
                setPolicyStatusFilter('all')
                setArchiveFilter('active')
              }}
            />
          ) : (
            <NoDataEmptyState
              title={t('emptyStates.policies.title')}
              description={t('emptyStates.policies.description')}
              ctaLabel={t('emptyStates.policies.cta')}
              onAdd={() => setIsCreateModalOpen(true)}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              {paginatedPolicies.map((p) => (
                <RegDocCard
                  key={p.id}
                  variant="policy"
                  policy={p}
                  onClick={() => { setSelected(p); router.replace(`?policyId=${p.id}`) }}
                  isNew={newlyCreatedIds.includes(p.id)}
                  t={t}
                  isRTL={isRTL}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredPolicies.length)} of {filteredPolicies.length}
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-left" className="text-slate-600 text-sm" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={cn('w-8 h-8 rounded-lg text-xs font-bold transition-colors',
                        page === currentPage ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}>
                      {page}
                    </button>
                  ))}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-right" className="text-slate-600 text-sm" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Policy Details Modal */}
      <Modal
        isOpen={selectedPolicy !== null}
        onClose={() => { setSelected(null); router.replace('?') }}
        title={selectedPolicy?.name ?? t('policies.policyDetails')}
        size="xl"
      >
        {selectedPolicy && (
          <PolicyDetailsContent
            policy={selectedPolicy}
            initialTab={deepLinkTab}
            onClose={() => { setSelected(null); setDeepLinkTab(undefined); router.replace('?') }}
            onSubmitForReview={() => showToast(t('policies.submitForReviewToast'))}
            onApprove={() => showToast(t('policies.approveToast'))}
            onInitiateReview={() => showToast(t('policies.initiateReviewToast'))}
            onDeleteOpen={() => setIsDeleteModalOpen(true)}
            onEditOpen={() => setIsEditModalOpen(true)}
            onArchive={() => {
              // P6 (W29): use archivePolicy which PATCHes archived_at (not status).
              void archivePolicy(selectedPolicy.id, currentUser?.name ?? 'Unknown').then(() => {
                showToast(t('policies.archivedToast'))
                setSelected(null)
              })
            }}
            onUnarchive={() => {
              // P6 (W29): use unarchivePolicy which clears archived_at.
              void unarchivePolicy(selectedPolicy.id, currentUser?.name ?? 'Unknown').then(() => {
                showToast(t('policies.unarchivedToast'))
                setSelected(null)
              })
            }}
            showToast={showToast}
            t={t}
            isRTL={isRTL}
          />
        )}
      </Modal>

      {/* Delete Policy Modal */}
      <DeletePolicyModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        targetId={selectedPolicy?.id ?? null}
        onDeleted={(msg) => { setIsDeleteModalOpen(false); setSelected(null); showToast(msg) }}
        t={t}
      />

      {/* Register Policy Modal — Wave-18 cleanup wired this in place of the
          legacy inline create form. */}
      <RegisterPolicyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(msg, newId) => {
          setNewlyCreatedIds((prev) => [...prev, newId])
          showToast(msg)
        }}
        t={t}
        isRTL={isRTL}
      />

      {/* Edit Policy Modal — Wave-18 cleanup wired this in place of the legacy
          inline edit form. */}
      <EditPolicyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        policy={selectedPolicy}
        onSaved={(msg) => showToast(msg)}
        t={t}
        isRTL={isRTL}
      />

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
