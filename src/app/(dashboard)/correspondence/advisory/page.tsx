'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { NoDataEmptyState, NoResultsEmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useTeamStore } from '@/stores/team-store'
import { useAuthStore } from '@/stores/auth-store'
import { exportAdvisoryLocalized } from '@/lib/export'
import type { AdvisoryRequest, AdvisoryStatus, AdvisoryPriority, BusinessUnit } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { EntityGate } from '@/components/auth/gate'
import { paginate } from '@/lib/pagination'
import { formatLocalizedDate } from '@/lib/format-date'

type TimeFrequency = 'week' | 'month' | 'quarter' | 'semi_annual' | 'annual' | 'fiscal'

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

export default function AdvisoryPage() {
  const { t, isRTL, language } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Stores
  const advisoryStore = useAdvisoryStore()
  const teamStore = useTeamStore()
  const authStore = useAuthStore()
  // Round-3 follow-up: the "Business Unit" picker now sources from the
  // department store so the same single source of truth feeds every dropdown
  // in the app. The advisory record's field is still called `businessUnit`
  // (legacy schema) but stores a department id.
  const departments = useDepartmentStore((s) => s.departments)
  const addDepartment = useDepartmentStore((s) => s.addDepartment)
  const updateDepartment = useDepartmentStore((s) => s.updateDepartment)
  const removeDepartment = useDepartmentStore((s) => s.removeDepartment)

  // Wave-2 Agent E: first-fetch skeleton.
  const advisoryLoading = useAdvisoryStore((s) => s.isLoading)
  const advisoryLastFetched = useAdvisoryStore((s) => s.lastFetched)
  // W42: gate mutating buttons (Mark Complete / Delete) against double-fire.
  const advisoryMutating = useAdvisoryStore((s) => s.isMutating)
  const showAdvisorySkeleton =
    advisoryLoading && advisoryStore.advisoryRequests.length === 0 && advisoryLastFetched === null

  // Hydrate server-state on mount — without this, refreshing the page
  // shows an empty list because Zustand starts cold (Fix-1).
  const fetchAdvisory = useAdvisoryStore((s) => s.fetchAll)
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  const fetchDepartments = useDepartmentStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchAdvisory()
    void fetchTeam()
    void fetchDepartments()
  }, [fetchAdvisory, fetchTeam, fetchDepartments])

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Advisory states
  const [isNewAdvisoryOpen, setIsNewAdvisoryOpen] = useState(false)
  const [isAdvisoryDetailOpen, setIsAdvisoryDetailOpen] = useState(false)
  const [selectedAdvisory, setSelectedAdvisory] = useState<AdvisoryRequest | null>(null)
  const [advisorySearchTerm, setAdvisorySearchTerm] = useState('')
  const [advisoryStatusFilter, setAdvisoryStatusFilter] = useState<AdvisoryStatus | ''>('')
  const [advisoryPriorityFilter, setAdvisoryPriorityFilter] = useState<AdvisoryPriority | ''>('')
  const [advisoryBusinessUnitFilter, setAdvisoryBusinessUnitFilter] = useState<BusinessUnit | ''>('')
  const [advisoryFrequencyFilter, setAdvisoryFrequencyFilter] = useState<TimeFrequency | ''>('')
  const [advisoryPage, setAdvisoryPage] = useState(1)
  const advisoryPageSize = 10

  // Advisory form state
  const [newAdvSubject, setNewAdvSubject] = useState('')
  const [newAdvBusinessUnit, setNewAdvBusinessUnit] = useState<BusinessUnit | ''>('')
  const [newAdvPriority, setNewAdvPriority] = useState<AdvisoryPriority | ''>('')
  const [newAdvDescription, setNewAdvDescription] = useState('')
  const [newAdvRequestedBy, setNewAdvRequestedBy] = useState<string>(authStore.user?.name || '')
  const [newAdvAssignedTo, setNewAdvAssignedTo] = useState<string>('')

  // Advisory detail state
  const [newNoteContent, setNewNoteContent] = useState('')
  const [isDeleteAdvisoryOpen, setIsDeleteAdvisoryOpen] = useState(false)
  // H4: Load More for advisory notes thread (default 5 visible)
  const [notesVisible, setNotesVisible] = useState(5)
  // A1: skeleton loading while discussion thread fetches on modal open
  const [notesLoading, setNotesLoading] = useState(false)
  // A2: spinner on Create button while POST completes
  const [createAdvisoryBusy, setCreateAdvisoryBusy] = useState(false)
  // A3: temp optimistic note id for pending state
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [addNoteBusy, setAddNoteBusy] = useState(false)

  // Advisory reassign
  const [reassignTarget, setReassignTarget] = useState('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Helper function to get date range for frequency filter
  const getDateRangeForFrequency = (frequency: TimeFrequency): { start: Date, end: Date } => {
    const now = new Date()
    const start = new Date()

    switch (frequency) {
      case 'week':
        start.setDate(now.getDate() - 7)
        break
      case 'month':
        start.setMonth(now.getMonth() - 1)
        break
      case 'quarter':
        start.setMonth(now.getMonth() - 3)
        break
      case 'semi_annual':
        start.setMonth(now.getMonth() - 6)
        break
      case 'annual':
        start.setFullYear(now.getFullYear() - 1)
        break
      case 'fiscal':
        // Fiscal year starts April 1
        start.setMonth(3, 1)
        start.setHours(0, 0, 0, 0)
        if (now.getMonth() < 3) start.setFullYear(now.getFullYear() - 1)
        break
    }
    return { start, end: now }
  }

  // Filter advisory requests from store
  const filteredAdvisory = useMemo(() => {
    const filtered = advisoryStore.advisoryRequests.filter(req => {
      const matchesSearch = req.subject.toLowerCase().includes(advisorySearchTerm.toLowerCase()) ||
                            req.description.toLowerCase().includes(advisorySearchTerm.toLowerCase())
      const matchesStatus = !advisoryStatusFilter || req.status === advisoryStatusFilter
      const matchesPriority = !advisoryPriorityFilter || req.priority === advisoryPriorityFilter
      const matchesBusinessUnit = !advisoryBusinessUnitFilter || req.businessUnit === advisoryBusinessUnitFilter
      const matchesFrequency = !advisoryFrequencyFilter ||
        (() => {
          const { start, end } = getDateRangeForFrequency(advisoryFrequencyFilter)
          const reqDate = new Date(req.requestedDate)
          return reqDate >= start && reqDate <= end
        })()
      return matchesSearch && matchesStatus && matchesPriority && matchesBusinessUnit && matchesFrequency
    })
    return filtered
  }, [advisoryStore.advisoryRequests, advisorySearchTerm, advisoryStatusFilter, advisoryPriorityFilter, advisoryBusinessUnitFilter, advisoryFrequencyFilter])

  // Paginated advisory results
  const { items: paginatedAdvisory, totalPages: advisoryTotalPages } = useMemo(
    () => paginate(filteredAdvisory, advisoryPage, advisoryPageSize),
    [filteredAdvisory, advisoryPage, advisoryPageSize]
  )

  // Reset page on filter change
  useEffect(() => {
    setAdvisoryPage(1)
  }, [advisorySearchTerm, advisoryStatusFilter, advisoryPriorityFilter, advisoryBusinessUnitFilter, advisoryFrequencyFilter])

  // W42: clamp the page when the filtered result shrinks beneath it (e.g. a
  // delete on the last page) — previously the user landed on a blank page.
  useEffect(() => {
    if (advisoryPage > advisoryTotalPages && advisoryTotalPages >= 1) {
      setAdvisoryPage(advisoryTotalPages)
    }
  }, [advisoryPage, advisoryTotalPages])

  // Deep-link: auto-open advisory when ?id= is present.
  // J1 fix: guard with isAdvisoryDetailOpen so the effect does NOT refire
  // when advisoryRequests reconciles after fetchAll — without this guard the
  // modal would reopen immediately after the user closes it because the URL
  // still carries ?id= and the dep array change triggers the effect again.
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id || isAdvisoryDetailOpen) return
    const advisory = advisoryStore.advisoryRequests.find(r => r.id === id)
    if (advisory) handleViewAdvisory(advisory)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, advisoryStore.advisoryRequests, isAdvisoryDetailOpen])

  // Advisory status config
  const advisoryStatusConfig: Record<AdvisoryStatus, { bg: string; text: string; labelKey: string }> = {
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', labelKey: 'common.pending' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'advisory.inProgress' },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', labelKey: 'common.completed' },
  }

  // Advisory priority config
  const advisoryPriorityConfig: Record<AdvisoryPriority, { bg: string; text: string; labelKey: string }> = {
    low: { bg: 'bg-slate-100', text: 'text-slate-600', labelKey: 'advisory.low' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-700', labelKey: 'advisory.medium' },
    high: { bg: 'bg-rose-100', text: 'text-rose-700', labelKey: 'advisory.high' },
  }

  // Business unit display label — checks the department store first, falls
  // back to the legacy i18n keys (advisories created before the department
  // migration), and finally to the raw id so user-added departments stay
  // readable even before they get a translation.
  const legacyBusinessUnitKeys: Record<string, string> = {
    corporate_banking: 'advisory.corporateBanking',
    compliance: 'advisory.compliance',
    it: 'advisory.it',
    risk_management: 'advisory.riskManagement',
    finance: 'advisory.finance',
    operations: 'advisory.operations',
    hr: 'advisory.hr',
  }
  const renderBusinessUnit = (id: string): string => {
    const fromStore = departments.find((d) => d.id === id)
    if (fromStore) return isRTL && fromStore.nameAr ? fromStore.nameAr : fromStore.name
    const legacyKey = legacyBusinessUnitKeys[id]
    if (legacyKey) return t(legacyKey as TranslationKey)
    return id
  }

  const handleViewAdvisory = useCallback((advisory: AdvisoryRequest) => {
    setSelectedAdvisory(advisory)
    setIsAdvisoryDetailOpen(true)
    setNotesVisible(5)
    // J1 fix: strip ?id= immediately on open (not on close) so the deep-link
    // useEffect never re-fires after fetchAll reconciles the advisoryRequests
    // array (which previously caused the modal to reopen right after close).
    if (searchParams.get('id')) {
      router.replace(pathname)
    }
    // A1: show skeleton while the thread fetches from server.
    setNotesLoading(true)
    void useAdvisoryStore.getState().fetchById(advisory.id).then((fresh) => {
      if (fresh) setSelectedAdvisory(fresh)
    }).catch(() => { /* best-effort hydrate */ }).finally(() => {
      setNotesLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, pathname])

  // Close handler — URL is already stripped on open (J1 fix in handleViewAdvisory),
  // so no URL manipulation needed here.
  const handleCloseAdvisoryDetail = useCallback(() => {
    setIsAdvisoryDetailOpen(false)
    setNewNoteContent('')
    setNotesLoading(false)
    setPendingNoteId(null)
  }, [])

  // A2 fix: assignedTo is stored as a UUID; resolve to display name from team store.
  // Falls back to the raw value so pre-fix rows (stored as name strings) still render.
  const resolveAssigneeName = useCallback((assignedTo: string | undefined): string | undefined => {
    if (!assignedTo) return undefined
    const member = teamStore.members.find((m) => m.id === assignedTo)
    return member ? member.name : assignedTo
  }, [teamStore.members])

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4`}>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('correspondence.title' as TranslationKey)}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('correspondence.subtitle' as TranslationKey)}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters' as TranslationKey)}
            </Link>
            <Link href="/correspondence/regulatory-updates" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates' as TranslationKey)}
            </Link>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker' as TranslationKey)}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg`}>
            <Link href="/correspondence/feed" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/feed') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:mail" className="text-base" />
              {t('correspondence.tabs.correspondence' as TranslationKey)}
            </Link>
            <Link href="/correspondence/advisory" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/advisory') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:message-circle-question" className="text-base" />
              {t('correspondence.tabs.advisory' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          <EntityGate action="create" entity="advisory">
            <button
              onClick={() => setIsNewAdvisoryOpen(true)}
              className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
            >
              <Icon icon="lucide:plus" />
              {t('advisory.newRequest' as TranslationKey)}
            </button>
          </EntityGate>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        <div className="space-y-6">
          {/* Advisory Header */}
          <div className={`flex justify-between items-center`}>
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-lg font-bold font-display text-slate-900">{t('advisory.title')}</h2>
              <p className="text-sm text-slate-500">{t('advisory.subtitle')}</p>
            </div>
            <div className={`flex gap-3`}>
              <span className="text-xs font-bold text-slate-500">
                {filteredAdvisory.length} {t('advisory.requests')}
              </span>
            </div>
          </div>

          {/* Advisory Filters */}
          <div className="glass-card rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2">
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                  {t('common.search')}
                </label>
                <div className="relative">
                  <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`} />
                  <input
                    type="text"
                    value={advisorySearchTerm}
                    onChange={(e) => setAdvisorySearchTerm(e.target.value)}
                    placeholder={t('advisory.searchPlaceholder')}
                    className={`w-full ${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                </div>
              </div>
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                  {t('common.status')}
                </label>
                <EditableSelect
                  locked
                  value={advisoryStatusFilter || null}
                  onChange={(id) => setAdvisoryStatusFilter(id as AdvisoryStatus | '')}
                  items={[
                    { id: '', label: t('correspondence.allStatuses') },
                    { id: 'pending', label: t('common.pending') },
                    { id: 'in_progress', label: t('advisory.inProgress') },
                    { id: 'completed', label: t('common.completed') },
                  ]}
                  placeholder={t('correspondence.allStatuses')}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                  {t('advisory.priority')}
                </label>
                <EditableSelect
                  locked
                  value={advisoryPriorityFilter || null}
                  onChange={(id) => setAdvisoryPriorityFilter(id as AdvisoryPriority | '')}
                  items={[
                    { id: '', label: t('advisory.allPriorities') },
                    { id: 'low', label: t('advisory.low') },
                    { id: 'medium', label: t('advisory.medium') },
                    { id: 'high', label: t('advisory.high') },
                  ]}
                  placeholder={t('advisory.allPriorities')}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                  {t('advisory.businessUnit')}
                </label>
                <EditableSelect
                  value={advisoryBusinessUnitFilter || null}
                  onChange={(id) => setAdvisoryBusinessUnitFilter(id as BusinessUnit | '')}
                  items={[
                    { id: '', label: t('advisory.allUnits') },
                    ...departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault })),
                  ]}
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
                  onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                  onDelete={(id) => removeDepartment(id)}
                  placeholder={t('advisory.allUnits')}
                  isRTL={isRTL}
                />
              </div>
            </div>
            {/* Second row for timeframe filter */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                  {t('advisory.timeframe')}
                </label>
                <EditableSelect
                  locked
                  value={advisoryFrequencyFilter || null}
                  onChange={(id) => setAdvisoryFrequencyFilter(id as TimeFrequency | '')}
                  items={[
                    { id: '', label: t('advisory.allTimeframes') },
                    { id: 'week', label: t('advisory.thisWeek') },
                    { id: 'month', label: t('advisory.thisMonth') },
                    { id: 'quarter', label: t('advisory.thisQuarter') },
                    { id: 'semi_annual', label: t('advisory.lastSixMonths') },
                    { id: 'annual', label: t('advisory.thisYear') },
                    { id: 'fiscal', label: t('advisory.fiscalYear') },
                  ]}
                  placeholder={t('advisory.allTimeframes')}
                  isRTL={isRTL}
                />
              </div>
            </div>
            {(advisorySearchTerm || advisoryStatusFilter || advisoryPriorityFilter || advisoryBusinessUnitFilter || advisoryFrequencyFilter) && (
              <div className={`flex gap-3 mt-4`}>
                <button
                  onClick={() => {
                    setAdvisorySearchTerm('')
                    setAdvisoryStatusFilter('')
                    setAdvisoryPriorityFilter('')
                    setAdvisoryBusinessUnitFilter('')
                    setAdvisoryFrequencyFilter('')
                  }}
                  className={`px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer`}
                >
                  <Icon icon="lucide:x" className="text-lg" />
                  {t('correspondence.clearFilters')}
                </button>
              </div>
            )}
          </div>

          {/* Advisory Requests List */}
          <div className="space-y-4">
            {showAdvisorySkeleton && <CardSkeleton count={4} />}
            {!showAdvisorySkeleton && paginatedAdvisory.map((advisory) => {
              const statusConfig = advisoryStatusConfig[advisory.status]
              const priorityConfig = advisoryPriorityConfig[advisory.priority]
              return (
                <div
                  key={advisory.id}
                  className="glass-card rounded-2xl p-6 hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => handleViewAdvisory(advisory)}
                >
                  <div className={`flex justify-between items-start`}>
                    <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                      <div className={`flex items-center gap-3 mb-2`}>
                        <span className="text-xs font-bold text-slate-400">{advisory.ref}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                          {t(statusConfig.labelKey as TranslationKey)}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${priorityConfig.bg} ${priorityConfig.text}`}>
                          {t(priorityConfig.labelKey as TranslationKey)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mb-1">{advisory.subject}</h3>
                      <p className="text-sm text-slate-500 line-clamp-2">{advisory.description}</p>
                      <div className={`flex items-center gap-4 mt-3`}>
                        <span className={`text-xs text-slate-500 flex items-center gap-1`}>
                          <Icon icon="lucide:building-2" className="text-slate-400" />
                          {renderBusinessUnit(advisory.businessUnit)}
                        </span>
                        <span className={`text-xs text-slate-500 flex items-center gap-1`}>
                          <Icon icon="lucide:user" className="text-slate-400" />
                          {advisory.requestedBy}
                        </span>
                        <span className={`text-xs text-slate-500 flex items-center gap-1`}>
                          <Icon icon="lucide:calendar" className="text-slate-400" />
                          {formatLocalizedDate(advisory.requestedDate, language, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        {advisory.notes.length > 0 && (
                          <span className={`text-xs text-blue-600 flex items-center gap-1`}>
                            <Icon icon="lucide:message-circle" className="text-blue-500" />
                            {advisory.notes.length} {t('advisory.notes')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`flex items-center gap-2`}>
                      {advisory.assignedTo && (
                        <div className={`flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg`}>
                          <Icon icon="lucide:user-check" className="text-emerald-600 text-sm" />
                          <span className="text-xs font-bold text-emerald-700">{resolveAssigneeName(advisory.assignedTo)}</span>
                        </div>
                      )}
                      <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="text-slate-400 text-xl" />
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredAdvisory.length === 0 && (
              <div className="glass-card rounded-2xl overflow-hidden">
                {(advisorySearchTerm || advisoryStatusFilter || advisoryPriorityFilter || advisoryBusinessUnitFilter || advisoryFrequencyFilter) ? (
                  <NoResultsEmptyState
                    onClearFilters={() => {
                      setAdvisorySearchTerm('')
                      setAdvisoryStatusFilter('')
                      setAdvisoryPriorityFilter('')
                      setAdvisoryBusinessUnitFilter('')
                      setAdvisoryFrequencyFilter('')
                    }}
                    searchTerm={advisorySearchTerm || undefined}
                  />
                ) : (
                  <NoDataEmptyState
                    title={t('emptyStates.advisory.title')}
                    description={t('emptyStates.advisory.description')}
                    ctaLabel={t('emptyStates.advisory.cta')}
                    onAdd={() => setIsNewAdvisoryOpen(true)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Pagination & Export */}
          {filteredAdvisory.length > 0 && (
            <div className={`flex justify-between items-center`}>
              <div className={`flex items-center gap-2`}>
                <button
                  onClick={() => setAdvisoryPage(p => Math.max(1, p - 1))}
                  disabled={advisoryPage <= 1}
                  className="px-3 py-1.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  {isRTL ? <Icon icon="lucide:chevron-right" /> : <Icon icon="lucide:chevron-left" />}
                </button>
                <span className="text-sm text-slate-600">
                  {advisoryPage} / {advisoryTotalPages}
                </span>
                <button
                  onClick={() => setAdvisoryPage(p => Math.min(advisoryTotalPages, p + 1))}
                  disabled={advisoryPage >= advisoryTotalPages}
                  className="px-3 py-1.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  {isRTL ? <Icon icon="lucide:chevron-left" /> : <Icon icon="lucide:chevron-right" />}
                </button>
                <span className="text-xs text-slate-400 ml-2">
                  ({filteredAdvisory.length} {t('advisory.requests')})
                </span>
              </div>
              <button
                onClick={() => {
                  exportAdvisoryLocalized(filteredAdvisory, 'advisory-requests', t, isRTL)
                  showToast(t('correspondence.exportToCsv'))
                }}
                className={`px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-2 cursor-pointer`}
              >
                <Icon icon="lucide:download" className="text-lg" />
                {t('correspondence.exportToCsv')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* New Advisory Request Modal */}
      <Modal
        isOpen={isNewAdvisoryOpen}
        onClose={() => setIsNewAdvisoryOpen(false)}
        title={t('advisory.newRequest')}
        subtitle={t('advisory.createNewRequest')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('common.subject')}<span className="text-rose-500"> *</span>
            </label>
            <input
              type="text"
              value={newAdvSubject}
              onChange={(e) => setNewAdvSubject(e.target.value)}
              placeholder={t('advisory.subjectPlaceholder')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                {t('advisory.businessUnit')}<span className="text-rose-500"> *</span>
              </label>
              <EditableSelect
                value={newAdvBusinessUnit || null}
                onChange={(id) => setNewAdvBusinessUnit(id as BusinessUnit)}
                items={departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
                onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                onDelete={(id) => removeDepartment(id)}
                placeholder={t('advisory.selectUnit')}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                {t('advisory.priority')}<span className="text-rose-500"> *</span>
              </label>
              <EditableSelect
                locked
                value={newAdvPriority || null}
                onChange={(id) => setNewAdvPriority(id as AdvisoryPriority | '')}
                items={[
                  { id: 'low', label: t('advisory.low') },
                  { id: 'medium', label: t('advisory.medium') },
                  { id: 'high', label: t('advisory.high') },
                ]}
                placeholder={t('advisory.selectPriority')}
                isRTL={isRTL}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                {t('advisory.requestedBy' as TranslationKey)} <span className="text-slate-400 font-normal normal-case lowercase">({t('common.optional')})</span>
              </label>
              <input
                type="text"
                value={newAdvRequestedBy}
                onChange={(e) => setNewAdvRequestedBy(e.target.value)}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
                {t('advisory.assignedTo' as TranslationKey)} <span className="text-slate-400 font-normal normal-case lowercase">({t('common.optional')})</span>
              </label>
              {/* A2 fix: use m.id (UUID) not m.name so assigned_to passes Uuid validation */}
              <EditableSelect
                value={newAdvAssignedTo || null}
                onChange={(id) => setNewAdvAssignedTo(id)}
                items={teamStore.members.map((m) => ({ id: m.id, label: m.name }))}
                placeholder="—"
                isRTL={isRTL}
              />
            </div>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('advisory.description')}<span className="text-rose-500"> *</span>
            </label>
            <textarea
              rows={4}
              value={newAdvDescription}
              onChange={(e) => setNewAdvDescription(e.target.value)}
              placeholder={t('advisory.descriptionPlaceholder')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 mt-6`}>
            <button
              disabled={createAdvisoryBusy}
              aria-busy={createAdvisoryBusy || undefined}
              onClick={async () => {
                if (!newAdvSubject || !newAdvBusinessUnit || !newAdvPriority || !newAdvDescription) {
                  showToast(t('correspondence.fillRequiredFields'))
                  return
                }
                setCreateAdvisoryBusy(true)
                try {
                  await advisoryStore.create({
                    subject: newAdvSubject,
                    description: newAdvDescription,
                    businessUnit: newAdvBusinessUnit as BusinessUnit,
                    status: 'pending',
                    priority: newAdvPriority as AdvisoryPriority,
                    requestedBy: newAdvRequestedBy || authStore.user?.name || 'Unknown',
                    assignedTo: newAdvAssignedTo || undefined,
                    requestedDate: new Date().toISOString().split('T')[0],
                  })
                  setNewAdvSubject('')
                  setNewAdvBusinessUnit('')
                  setNewAdvPriority('')
                  setNewAdvDescription('')
                  setNewAdvRequestedBy(authStore.user?.name || '')
                  setNewAdvAssignedTo('')
                  setIsNewAdvisoryOpen(false)
                  showToast(t('advisory.requestSubmitted'))
                } finally {
                  setCreateAdvisoryBusy(false)
                }
              }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60`}
            >
              <Icon icon={createAdvisoryBusy ? 'lucide:loader-2' : 'lucide:send'} className={`text-lg ${createAdvisoryBusy ? 'animate-spin' : ''}`} />
              {t('advisory.submitRequest')}
            </button>
            <button
              onClick={() => setIsNewAdvisoryOpen(false)}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Advisory Detail Modal */}
      <Modal
        isOpen={isAdvisoryDetailOpen}
        onClose={handleCloseAdvisoryDetail}
        title={selectedAdvisory?.subject || t('advisory.requestDetails')}
        subtitle={selectedAdvisory ? `REF: ${selectedAdvisory.ref}` : undefined}
        size="lg"
      >
        {selectedAdvisory && (
          <div className="space-y-6">
            {/* Status and Priority */}
            <div className={`flex gap-3`}>
              <span className={`px-3 py-1 text-xs font-bold rounded-full ${advisoryStatusConfig[selectedAdvisory.status].bg} ${advisoryStatusConfig[selectedAdvisory.status].text}`}>
                {t(advisoryStatusConfig[selectedAdvisory.status].labelKey as TranslationKey)}
              </span>
              <span className={`px-3 py-1 text-xs font-bold rounded-full ${advisoryPriorityConfig[selectedAdvisory.priority].bg} ${advisoryPriorityConfig[selectedAdvisory.priority].text}`}>
                {t(advisoryPriorityConfig[selectedAdvisory.priority].labelKey as TranslationKey)} {t('advisory.priority')}
              </span>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('advisory.businessUnit')}</p>
                <p className="text-sm font-bold text-slate-900">{renderBusinessUnit(selectedAdvisory.businessUnit)}</p>
              </div>
              <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('advisory.requestedBy')}</p>
                <p className="text-sm font-bold text-slate-900">{selectedAdvisory.requestedBy}</p>
              </div>
              <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('advisory.requestDate')}</p>
                <p className="text-sm font-bold text-slate-900">{formatLocalizedDate(selectedAdvisory.requestedDate, language)}</p>
              </div>
              {selectedAdvisory.assignedTo && (
                <div className={`bg-emerald-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                  <p className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('advisory.assignedTo')}</p>
                  <p className="text-sm font-bold text-slate-900">{resolveAssigneeName(selectedAdvisory.assignedTo)}</p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">{t('advisory.description')}</p>
              <p className="text-sm text-slate-700">{selectedAdvisory.description}</p>
            </div>

            {/* Notes Thread */}
            <div>
              <h4 className={`text-sm font-bold text-slate-900 mb-3 flex items-center gap-2`}>
                <Icon icon="lucide:message-circle" className="text-slate-400" />
                {t('advisory.discussionThread')} ({selectedAdvisory.notes.length})
              </h4>
              {/* A1: skeleton loading while thread fetches on first open */}
              {notesLoading ? (
                <div className="space-y-3" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`bg-slate-50 p-4 rounded-lg border-l-4 border-slate-200 ${isRTL ? 'text-right border-l-0 border-r-4' : ''}`}>
                      <div className={`flex justify-between items-start mb-2`}>
                        <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
                        <div className="h-2 w-20 bg-slate-200 rounded animate-pulse" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-full bg-slate-200 rounded animate-pulse" />
                        <div className="h-2.5 w-4/5 bg-slate-200 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedAdvisory.notes.length > 0 ? (
                <div className="space-y-3">
                  {selectedAdvisory.notes.slice(0, notesVisible).map((note) => (
                    <div
                      key={note.id}
                      className={`bg-slate-50 p-4 rounded-lg border-l-4 border-emerald-500 ${isRTL ? 'text-right border-l-0 border-r-4' : ''} ${note.id === pendingNoteId ? 'opacity-60' : ''}`}
                    >
                      <div className={`flex justify-between items-start mb-2`}>
                        <span className="text-xs font-bold text-slate-900">
                          {note.author}
                          {note.id === pendingNoteId && (
                            <Icon icon="lucide:loader-2" className="inline ml-2 animate-spin text-slate-400" />
                          )}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {note.id === pendingNoteId
                            ? '…'
                            : formatLocalizedDate(note.timestamp, language, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">{note.content}</p>
                    </div>
                  ))}
                  {/* H4: Load More for advisory notes */}
                  {selectedAdvisory.notes.length > notesVisible && (
                    <button
                      type="button"
                      onClick={() => setNotesVisible((n) => n + 5)}
                      className={`text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer ${isRTL ? 'text-right w-full' : ''}`}
                    >
                      {t('common.loadMore')} ({selectedAdvisory.notes.length - notesVisible} {t('common.more')})
                    </button>
                  )}
                </div>
              ) : (
                <p className={`text-sm text-slate-400 ${isRTL ? 'text-right' : ''}`}>{t('advisory.noNotes')}</p>
              )}

              {/* Add Note */}
              <div className="mt-4">
                <textarea
                  rows={2}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder={t('advisory.addNotePlaceholder')}
                  className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                />
                <button
                  disabled={addNoteBusy}
                  aria-busy={addNoteBusy || undefined}
                  onClick={async () => {
                    if (!newNoteContent.trim() || addNoteBusy) return
                    const content = newNoteContent.trim()
                    const author = authStore.user?.name || 'Unknown'
                    // A3: optimistic insert — add a pending note immediately before the request
                    const tempId = `temp-note-${Date.now()}`
                    const optimisticNote = {
                      id: tempId,
                      author,
                      content,
                      timestamp: new Date().toISOString(),
                    }
                    setPendingNoteId(tempId)
                    setSelectedAdvisory((prev) => prev ? { ...prev, notes: [...prev.notes, optimisticNote] } : prev)
                    setNewNoteContent('')
                    setAddNoteBusy(true)
                    try {
                      await advisoryStore.addNote(selectedAdvisory.id, { author, content })
                      // Reconcile: replace optimistic entry with the server's real note
                      const fresh = useAdvisoryStore.getState().byId[selectedAdvisory.id]
                      if (fresh) setSelectedAdvisory(fresh)
                      setPendingNoteId(null)
                      showToast(t('advisory.noteAdded'))
                    } catch {
                      // Revert optimistic note on failure
                      setSelectedAdvisory((prev) =>
                        prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== tempId) } : prev,
                      )
                      setPendingNoteId(null)
                      showToast(t('advisory.noteAddFailed' as TranslationKey))
                    } finally {
                      setAddNoteBusy(false)
                    }
                  }}
                  className={`mt-2 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60`}
                >
                  <Icon icon={addNoteBusy ? 'lucide:loader-2' : 'lucide:plus'} className={addNoteBusy ? 'animate-spin' : ''} />
                  {t('advisory.addNote')}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className={`flex gap-3 pt-4 border-t border-slate-200`}>
              {selectedAdvisory.status !== 'completed' && (
                <EntityGate action="edit" entity="advisory">
                  <button
                    onClick={() => {
                      advisoryStore.updateStatus(selectedAdvisory.id, 'completed')
                      setSelectedAdvisory({ ...selectedAdvisory, status: 'completed' })
                      handleCloseAdvisoryDetail()
                      showToast(t('advisory.statusUpdated'))
                    }}
                    disabled={advisoryMutating}
                    aria-busy={advisoryMutating || undefined}
                    className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60`}
                  >
                    <Icon icon={advisoryMutating ? 'lucide:loader-2' : 'lucide:check-circle'} className={`text-lg ${advisoryMutating ? 'animate-spin' : ''}`} />
                    {t('advisory.markComplete')}
                  </button>
                  <div className={`flex items-center gap-2 min-w-[200px]`}>
                    <EditableSelect
                      value={reassignTarget || null}
                      onChange={(assignee) => {
                        if (assignee) {
                          setReassignTarget('')
                          advisoryStore.reassign(selectedAdvisory.id, assignee)
                          setSelectedAdvisory({ ...selectedAdvisory, assignedTo: assignee })
                          showToast(t('advisory.assignmentUpdated'))
                        }
                      }}
                      items={teamStore.members.filter((m) => m.status === 'active').map((m) => ({ id: m.id, label: m.name }))}
                      placeholder={t('advisory.selectAssignee')}
                      isRTL={isRTL}
                    />
                  </div>
                </EntityGate>
              )}
              {/* W42: gated client-side too — the API enforces 'delete'
                  server-side, so don't render a button that can only 403. */}
              <EntityGate action="delete" entity="advisory">
                <button
                  onClick={() => setIsDeleteAdvisoryOpen(true)}
                  disabled={advisoryMutating}
                  className="px-6 bg-rose-100 text-rose-700 py-3 rounded-lg font-bold hover:bg-rose-200 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {t('common.delete')}
                </button>
              </EntityGate>
              <button
                onClick={handleCloseAdvisoryDetail}
                className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Advisory Confirmation */}
      <DeleteConfirmationDialog
        isOpen={isDeleteAdvisoryOpen}
        onClose={() => setIsDeleteAdvisoryOpen(false)}
        onConfirm={() => {
          if (selectedAdvisory) {
            advisoryStore.delete(selectedAdvisory.id)
            setSelectedAdvisory(null)
            handleCloseAdvisoryDetail()
            setIsDeleteAdvisoryOpen(false)
            showToast(t('advisory.requestDeleted'))
          }
        }}
        itemName={selectedAdvisory?.subject}
        itemType="advisory request"
      />
    </div>
  )
}
