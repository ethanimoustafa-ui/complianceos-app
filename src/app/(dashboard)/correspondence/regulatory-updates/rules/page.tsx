'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { NoResultsEmptyState } from '@/components/ui/empty-state'
import { useCircularStore } from '@/stores/circular-store'
import { RegDocCard } from '@/components/correspondence/regulatory-updates/RegDocCard'
import { RegDocFilterBar } from '@/components/correspondence/regulatory-updates/RegDocFilterBar'
import type { CircularAuthority } from '@/types'
import { exportRulesLocalized } from '@/lib/export'
import { Gate } from '@/components/auth/gate'
import { paginate } from '@/lib/pagination'

import { StatCard } from '@/components/correspondence/regulatory-updates/rules/StatCard'
import { RegisterCircularModal } from '@/components/correspondence/regulatory-updates/rules/RegisterCircularModal'
import { BusinessOwnerModal } from '@/components/correspondence/regulatory-updates/rules/BusinessOwnerModal'
import { DeleteConfirmModal } from '@/components/correspondence/regulatory-updates/rules/DeleteConfirmModal'
import { EditCircularModal } from '@/components/correspondence/regulatory-updates/rules/EditCircularModal'
import { CircularDetailsContent } from '@/components/correspondence/regulatory-updates/rules/CircularDetailsContent'

// ── Toast ─────────────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

function RegulatoryUpdatesRulesPageContent() {
  const { t, isRTL } = useTranslation()
  const { circulars, selectedCircular, setSelected } = useCircularStore()
  const searchParams = useSearchParams()

  // Hydrate server-state on mount (Fix-1).
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchCirculars()
  }, [fetchCirculars])

  const [searchQuery, setSearchQuery] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState<CircularAuthority | 'all'>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isBOModalOpen, setIsBOModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => setToastMessage(message), [])

  useEffect(() => { setCurrentPage(1) }, [searchQuery, authorityFilter, departmentFilter])

  useEffect(() => {
    const deepLinkId = searchParams.get('id')
    if (deepLinkId && circulars.length > 0) {
      const target = circulars.find(c => c.id === deepLinkId)
      if (target) setSelected(target)
    }
  }, [searchParams, circulars, setSelected])

  const filteredCirculars = useMemo(() => {
    return circulars.filter((c) => {
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.reference.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesAuthority = authorityFilter === 'all' || c.authority === authorityFilter
      const matchesDept =
        departmentFilter === 'all' ||
        c.departments.some((d) => d.toLowerCase() === departmentFilter.toLowerCase())
      return matchesSearch && matchesAuthority && matchesDept
    })
  }, [circulars, searchQuery, authorityFilter, departmentFilter])

  const { items: paginatedCirculars, totalPages } = useMemo(
    () => paginate(filteredCirculars, currentPage, PAGE_SIZE),
    [filteredCirculars, currentPage]
  )

  const stats = useMemo(
    () => ({
      total: circulars.length,
      inProgress: circulars.filter((c) => c.status === 'in-progress').length,
      completed: circulars.filter((c) => c.status === 'completed').length,
      overdue: circulars.filter((c) => c.status === 'overdue').length,
    }),
    [circulars]
  )

  return (
    // Fix 2: Add rtl class to root container (mirrors policies page)
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
            <Link href="/correspondence/regulatory-updates/rules" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 bg-white text-slate-900 shadow-sm')}>
              <Icon icon="lucide:scale" className="text-sm" />
              {t('regulatoryUpdates.tabs.rules')}
            </Link>
            <Link href="/correspondence/regulatory-updates/policies" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:file-text" className="text-sm" />
              {t('regulatoryUpdates.tabs.policies')}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          <button
            type="button"
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
            title={t('regulatoryUpdates.exportRules' as any)}
            onClick={() => exportRulesLocalized(filteredCirculars, 'rules', t, isRTL)}
          >
            <Icon icon="lucide:download-cloud" className="text-lg" />
          </button>
          <Gate perm="Manage Audit Findings">
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsAddModalOpen(true)}
            >
              <Icon icon="lucide:plus" />
              {t('regulatoryUpdates.registerNewCircular')}
            </Button>
          </Gate>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label={t('regulatoryUpdates.totalActiveRules')} value={stats.total} subtext={t('regulatoryUpdates.circulars')} borderColor="slate" />
          <StatCard label={t('regulatoryUpdates.inImplementation')} value={stats.inProgress} subtext={t('regulatoryUpdates.ongoing')} borderColor="amber" valueColor="amber" />
          <StatCard label={t('regulatoryUpdates.implementedYTD')} value={stats.completed} subtext={t('regulatoryUpdates.compliant')} borderColor="emerald" valueColor="emerald" />
          <StatCard label={t('regulatoryUpdates.overdueActions')} value={stats.overdue} subtext={t('regulatoryUpdates.critical')} borderColor="rose" valueColor="rose" />
        </div>

        {/* Filter Bar */}
        <RegDocFilterBar
          variant="circular"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          authorityFilter={authorityFilter}
          onAuthorityChange={setAuthorityFilter}
          departmentFilter={departmentFilter}
          onDepartmentChange={setDepartmentFilter}
          resultCount={filteredCirculars.length}
          resultLabel={t('regulatoryUpdates.circularsFound')}
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
          isRTL={isRTL}
        />

        {/* List */}
        {filteredCirculars.length === 0 ? (
          <NoResultsEmptyState
            onClearFilters={() => {
              setSearchQuery('')
              setAuthorityFilter('all')
              setDepartmentFilter('all')
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              {paginatedCirculars.map((c) => (
                <RegDocCard
                  key={c.id}
                  variant="circular"
                  circular={c}
                  onClick={() => setSelected(c)}
                  t={t}
                  isRTL={isRTL}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredCirculars.length)} of {filteredCirculars.length}
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-left" className="text-slate-600 text-sm" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={cn('w-8 h-8 rounded-lg text-xs font-bold transition-colors',
                        page === currentPage ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}>
                      {page}
                    </button>
                  ))}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-right" className="text-slate-600 text-sm" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Register New Circular Modal ─────────────────────────────────────── */}
      <RegisterCircularModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={(msg) => { setIsAddModalOpen(false); showToast(msg) }}
        t={t}
      />

      {/* ── Circular Details Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={selectedCircular !== null}
        onClose={() => setSelected(null)}
        size="xl"
        title={selectedCircular?.title ?? ''}
      >
        {selectedCircular && (
          <CircularDetailsContent
            circular={selectedCircular}
            onClose={() => setSelected(null)}
            onOpenBOModal={() => setIsBOModalOpen(true)}
            onEditOpen={() => setIsEditModalOpen(true)}
            onDeleteOpen={(id) => { setDeleteTargetId(id); setIsDeleteConfirmOpen(true) }}
            t={t}
            isRTL={isRTL}
          />
        )}
      </Modal>

      {/* ── BO Assignment Modal ────────────────────────────────────────────── */}
      <BusinessOwnerModal
        isOpen={isBOModalOpen}
        onClose={() => setIsBOModalOpen(false)}
        circular={selectedCircular}
        onAssigned={(msg) => { setIsBOModalOpen(false); showToast(msg) }}
        t={t}
      />

      {/* ── Edit Circular Modal ────────────────────────────────────────────── */}
      {selectedCircular && (
        <EditCircularModal
          circular={selectedCircular}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => { setIsEditModalOpen(false); showToast(t('regulatoryUpdates.circularEditRequested')) }}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <DeleteConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => { setIsDeleteConfirmOpen(false); setDeleteTargetId(null) }}
        targetId={deleteTargetId ?? selectedCircular?.id ?? null}
        onDeleted={(msg) => { setIsDeleteConfirmOpen(false); setDeleteTargetId(null); showToast(msg) }}
        t={t}
      />

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}

export default function RegulatoryUpdatesRulesPage() {
  return (
    <Suspense>
      <RegulatoryUpdatesRulesPageContent />
    </Suspense>
  )
}
