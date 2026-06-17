'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { exportObservations } from '@/lib/export'
import { Gate } from '@/components/auth/gate'
import { useObservationStore } from '@/stores/observation-store'
import { useToastStore } from '@/stores/toast-store'
import { ListSkeleton, CardSkeleton, Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth-store'
import { ObservationStats } from '@/components/observations/observation-stats'
import type { ObservationStatsData } from '@/components/observations/observation-stats'
import { ObservationFilters } from '@/components/observations/observation-filters'
import { ObservationTable } from '@/components/observations/observation-table'
import { ObservationDetailModal } from '@/components/observations/observation-detail-modal'
import { AddObservationModal } from '@/components/observations/add-observation-modal'
import type { ObservationFormData } from '@/components/observations/add-observation-modal'
import { EditObservationModal } from '@/components/observations/edit-observation-modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { api } from '@/lib/api-client'
import { useDashboardSummary } from '@/hooks/useDashboardSummary'
import { downloadPdf } from '@/lib/pdf-client'
import type {
  Observation,
  ObservationSource,
  ObservationSeverity,
  ObservationStatus,
} from '@/components/observations/observation-types'

export default function ObservationsPage() {
  const { t, isRTL } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Zustand store — mutators + the tracker-local server fetch. The tracker no
  // longer renders the shared `observations` array; it fetches its OWN
  // server-paginated, server-filtered page via fetchPage (the shared array stays
  // archive_filter:'all' for the dashboard / calendar / compliance-review
  // consumers that depend on closed/archived rows). Scalability follow-up to
  // Part 2: archive filtering + pagination now happen in Postgres.
  const {
    create: createObservation,
    update: updateObservation,
    delete: deleteObservation,
    removeDocument,
    uploadDocument: uploadObservationDocument,
    setSelected: setStoreSelected,
    fetchPage,
    fetchById,
  } = useObservationStore()

  // Get current user for creator assignment
  const user = useAuthStore((state) => state.user)
  const pushToast = useToastStore((s) => s.pushToast)

  // Org-wide observation KPIs for the metrics strip come from the precomputed
  // rollup (one indexed read) instead of counting the (now page-scoped) array.
  const summary = useDashboardSummary()

  // State for modals
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [observationToEdit, setObservationToEdit] = useState<Observation | null>(null)
  // O6: no confirm dialog — delete fires directly on click.

  // State for filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<ObservationSource | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<ObservationSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ObservationStatus | 'all'>('all')
  const [dueDateFilter, setDueDateFilter] = useState('')
  const [submissionDueDateFilter, setSubmissionDueDateFilter] = useState('')
  // O7: archive filter. 'active' = not archived (default); 'archived' = archived only.
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived'>('active')

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Tracker-owned server fetch: the list is fetched per page with server-side
  // archive/status/severity/source/search filters (the store's fetchPage does
  // NOT mutate the shared observations array). Date filters stay client-side
  // over the returned page (the API has no date-range filter yet).
  const [rows, setRows] = useState<Observation[]>([])
  const [total, setTotal] = useState(0)
  const [trackerLoading, setTrackerLoading] = useState(true)
  const [trackerFetched, setTrackerFetched] = useState(false)
  const [refetchNonce, setRefetchNonce] = useState(0)
  const refetchTracker = () => setRefetchNonce((n) => n + 1)
  const showSkeleton = trackerLoading && rows.length === 0 && !trackerFetched

  useEffect(() => {
    let cancelled = false
    setTrackerLoading(true)
    // Debounce only the text search so typing doesn't fire a request per keystroke.
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetchPage({
            page: currentPage,
            pageSize: itemsPerPage,
            archive_filter: archiveFilter,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            severity: severityFilter !== 'all' ? severityFilter : undefined,
            source: sourceFilter !== 'all' ? sourceFilter : undefined,
            q: searchQuery || undefined,
          })
          if (cancelled) return
          setRows(res.items)
          setTotal(res.total)
          setTrackerFetched(true)
        } catch (err) {
          if (!cancelled) {
            console.error('Failed to fetch observations page:', err)
            setTrackerFetched(true)
          }
        } finally {
          if (!cancelled) setTrackerLoading(false)
        }
      })()
    }, searchQuery ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [currentPage, archiveFilter, statusFilter, severityFilter, sourceFilter, searchQuery, refetchNonce, fetchPage])

  // Archive / search / source / severity / status are now applied server-side
  // (via fetchPage). Only the date-range filters remain client-side, over the
  // current server page `rows`.
  const filteredObservations = useMemo(() => {
    return rows.filter((obs) => {
      const matchesDueDate =
        !dueDateFilter || (obs.dueDate && obs.dueDate <= dueDateFilter)
      const matchesSubmissionDueDate =
        !submissionDueDateFilter ||
        (obs.remediationSubmissionDueDate && obs.remediationSubmissionDueDate <= submissionDueDateFilter)
      return matchesDueDate && matchesSubmissionDueDate
    })
  }, [rows, dueDateFilter, submissionDueDateFilter])

  // Handle row click
  const handleRowClick = (observation: Observation) => {
    setSelectedObservation(observation)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStoreSelected(observation as any) // Sync with store for timeline updates
    setIsDetailModalOpen(true)
  }

  // Deep-link: auto-open detail modal when ?id= is present.
  // W38: only auto-open while the modal is CLOSED — without this guard, any
  // list refetch (new `observations` array identity) re-ran the effect and the
  // modal reopened itself after the user closed it.
  const deepLinkId = searchParams.get('id')
  // W38: the deep-linked observation may be on another server page or archived,
  // so resolve it from the current page first and fall back to fetchById. The
  // guard reads (not depends on) isDetailModalOpen so closing the modal doesn't
  // re-run and reopen it.
  const [deepLinkNotFound, setDeepLinkNotFound] = useState(false)
  useEffect(() => {
    if (!deepLinkId) {
      setDeepLinkNotFound(false)
      return
    }
    if (isDetailModalOpen) return
    let cancelled = false
    void (async () => {
      const onPage = rows.find((o) => o.id === deepLinkId)
      if (onPage) {
        if (!cancelled) handleRowClick(onPage)
        return
      }
      const fetched = await fetchById(deepLinkId)
      if (cancelled) return
      if (fetched) handleRowClick(fetched)
      else setDeepLinkNotFound(true)
    })()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, rows])

  const clearDeepLink = () => router.replace('/correspondence/observations')

  // Handle add observation - calls Zustand store
  const handleAddObservation = async (data: ObservationFormData) => {
    try {
      // W37: don't register metadata-only document rows at create time (they
      // produced non-viewable docs). Create the observation first, then upload
      // the real attachment bytes via uploadDocument so they're openable.
      const created = await createObservation({
        title: data.title,
        subTitle: data.subTitle,
        description: data.description,
        source: data.source,
        severity: data.severity,
        status: 'open',
        dueDate: data.dueDate,
        department: data.department || 'Compliance',
        reference: data.reference || '',
        assignees: data.assignees && data.assignees.length > 0 ? data.assignees : undefined,
        documents: [],
        checklist: [],
        updates: [],
        timeline: [
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            dateKey: 'today',
            description: `${user?.name || 'Unknown'} created this observation`,
            descriptionAr: `أنشأ ${user?.name || 'غير معروف'} هذه الملاحظة`,
            descriptionKey: 'observations.detail.timeline.observationCreated',
            descriptionParams: { name: user?.name || 'Unknown' },
            userId: user?.id,
            userName: user?.name,
            userAvatar: user?.avatar,
            actionType: 'created',
          },
        ],
        remediationSubmissionDueDate: data.remediationSubmissionDueDate,
      }, user || undefined) // Pass user as creator

      // Upload the real attachment bytes now that the observation exists.
      if (user && data.attachments && data.attachments.length > 0) {
        for (const att of data.attachments) {
          if (att.file) {
            try {
              // skipTimeline=true: these are creation-time uploads, so they
              // must NOT appear as separate post-creation timeline entries.
              await uploadObservationDocument(created.reference || created.id, att.file, user, false, true)
            } catch (uploadErr) {
              // Non-fatal: the observation was created; the document can be
              // re-uploaded from the detail view.
              console.error('Failed to upload create-time attachment:', uploadErr)
            }
          }
        }
      }
      setIsAddModalOpen(false)
      refetchTracker()
    } catch (error) {
      console.error('Failed to create observation:', error)
    }
  }

  // Handle edit observation
  const handleEditObservation = (observation: Observation) => {
    setObservationToEdit(observation)
    setIsEditModalOpen(true)
  }

  // Handle edit save - calls Zustand store with user for activity tracking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEditSave = async (observationId: string, updates: any) => {
    try {
      // Track removed documents for timeline
      if (user && observationToEdit?.documents && updates.documents) {
        const currentDocIds = new Set(updates.documents.map((d: { id: string }) => d.id))
        const removedDocs = observationToEdit.documents.filter(
          (doc) => !currentDocIds.has(doc.id)
        )
        // Call removeDocument for each removed document to create timeline entries
        for (const doc of removedDocs) {
          await removeDocument(observationId, doc.id, doc.name, user)
        }
      }

      await updateObservation(observationId, updates, user || undefined)

      // O7: persist assignees to DB via /assign endpoint.
      // The PATCH route only handles scalar columns; assignees live in
      // observation_assignees and require a separate write. Without this call,
      // team-member changes are local-only and vanish on the next page reload.
      if (updates.assignees !== undefined) {
        try {
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          await api.post(`/observations/${observationId}/assign`, {
            assignees: (updates.assignees as Array<{ id?: string; name: string; role?: string }>).map((a) => ({
              user_id: a.id && UUID_RE.test(a.id) ? a.id : null,
              name: a.name,
              role: a.role || null,
            })),
          })
        } catch (assignErr) {
          // Non-fatal: local state already reflects the change via updateObservation.
          console.warn('Failed to persist assignees', assignErr)
        }
      }

      setIsEditModalOpen(false)
      setObservationToEdit(null)
      refetchTracker()
    } catch (error) {
      console.error('Failed to update observation:', error)
    }
  }

  // US-10: delete requires confirmation dialog (type DELETE)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  const handleDeleteClick = (observationId: string) => {
    const obs = rows.find((o) => o.id === observationId)
    if (!obs) return
    setDeleteTarget({ id: observationId, title: obs.title })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteObservation(deleteTarget.id)
      pushToast(t('observations.deleteSuccess' as import('@/i18n').TranslationKey), 'success')
      refetchTracker()
    } catch (error) {
      console.error('Failed to delete observation:', error)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Metrics strip from the precomputed rollup (org-wide, correct at scale, and
  // independent of the current page). Also fixes the old client placeholder
  // where "closedThisQuarter" counted ALL closed observations.
  const obsSummary = summary.data?.observations
  const observationStats: ObservationStatsData = {
    total: obsSummary?.total ?? 0,
    openCritical: obsSummary?.openCritical ?? 0,
    overdue: obsSummary?.overdueCount ?? 0,
    inRemediation: obsSummary?.inRemediation ?? 0,
    drafting: obsSummary?.drafting ?? 0,
    closedThisQuarter: obsSummary?.closedThisQuarter ?? 0,
    quarterlyTarget: 30,
  }

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' || sourceFilter !== 'all' || severityFilter !== 'all' || statusFilter !== 'all' || dueDateFilter !== '' || submissionDueDateFilter !== '' || archiveFilter !== 'active'

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('')
    setSourceFilter('all')
    setSeverityFilter('all')
    setStatusFilter('all')
    setDueDateFilter('')
    setSubmissionDueDateFilter('')
    setArchiveFilter('active')
    setCurrentPage(1)
  }

  // PDF export state
  const [pdfBusy, setPdfBusy] = useState(false)

  const handleExportPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const res = await fetchPage({
        page: 1,
        pageSize: 500,
        archive_filter: archiveFilter,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        q: searchQuery || undefined,
      })
      const dateStr = new Date().toISOString().split('T')[0]
      await downloadPdf(
        {
          template: 'observation-list',
          locale: isRTL ? 'ar' : 'en',
          options: { engine: 'latex' },
          data: {
            organization: 'الشركة المتحدة للخدمات المالية',
            generatedBy: user?.name ?? '',
            date: dateStr,
            subtitle: archiveFilter !== 'active'
              ? archiveFilter === 'archived' ? 'Archived Observations' : 'All Observations'
              : undefined,
            observations: res.items.map((o) => ({
              reference: o.reference,
              title: o.title,
              severity: o.severity,
              source: o.source,
              status: o.status,
              assignee: o.assignees?.[0]?.name ?? o.assignee?.name,
              dueDate: o.dueDate,
              isOverdue: (o as { isOverdue?: boolean }).isOverdue,
            })),
          },
        },
        `Observations-Report-${dateStr}.pdf`,
      )
    } catch (err) {
      console.error('Failed to export observations PDF:', err)
    } finally {
      setPdfBusy(false)
    }
  }

  // Export observations with localization (CSV)
  const handleExport = async () => {
    const baseFilename = isRTL ? 'ملاحظات' : 'observations'
    const dateStr = new Date().toISOString().split('T')[0]
    // The table is server-paginated; export grabs the full filtered set (up to
    // the server's pageSize cap of 100) so the CSV isn't limited to one page.
    try {
      const res = await fetchPage({
        page: 1,
        pageSize: 100,
        archive_filter: archiveFilter,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        q: searchQuery || undefined,
      })
      exportObservations(res.items, `${baseFilename}-${dateStr}`, t, isRTL)
    } catch (err) {
      console.error('Failed to export observations:', err)
    }
  }

  return (
    <>
      {/* Custom Header with Add Observation button */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="text-base" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {t('observations.title')}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('observations.subtitle')}
            </p>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block" />

          {/* Quick Links */}
          <div className="hidden lg:flex gap-2">
            <Link
              href="/correspondence/letters"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters')}
            </Link>
            <Link
              href="/correspondence/regulatory-updates"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2`}
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2`}>
              <Icon icon="lucide:crosshair" className="text-emerald-600" />
              {t('regulatoryUpdates.observationsTracker')}
            </span>
          </div>
        </div>

        <div className={`flex items-center gap-4`}>
          {/* Export CSV Button */}
          <Gate perm="Export Compliance Data">
            <Button
              variant="outline"
              onClick={handleExport}
              className={`hidden md:flex`}
            >
              <Icon icon="lucide:download" />
              {t('common.exportCsv')}
            </Button>
          </Gate>

          {/* Export PDF Button */}
          <Gate perm="Export Compliance Data">
            <Button
              variant="outline"
              onClick={handleExportPdf}
              loading={pdfBusy}
              className={`hidden md:flex`}
            >
              <Icon icon="lucide:file-text" />
              {t('letters.exportPdf' as import('@/i18n').TranslationKey)}
            </Button>
          </Gate>

          {/* Add Observation Button */}
          <Gate perm="Manage Audit Findings">
            <Button
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              className="shadow-lg shadow-emerald-100"
            >
              <Icon icon="lucide:plus" />
              {t('observations.addObservation')}
            </Button>
          </Gate>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        {/* W38: deep-link target missing (deleted or bad link) — "Not found". */}
        {deepLinkNotFound && (
          <div className="mb-6 bg-white border border-rose-100 rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mb-4">
              <Icon icon="lucide:file-x" className="text-2xl text-rose-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {t('observations.notFoundTitle')}
            </h3>
            <p className="text-sm text-slate-500 mb-1">{t('observations.notFoundBody')}</p>
            <p className="text-xs font-mono text-slate-400 mb-4">{deepLinkId}</p>
            <Button variant="outline" onClick={clearDeepLink}>
              <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="w-4 h-4" />
              {t('observations.backToList')}
            </Button>
          </div>
        )}

        {/* Metrics Strip */}
        {summary.isLoading && !summary.data ? (
          <CardSkeleton className="gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/80 backdrop-blur-sm border border-slate-100 p-6 rounded-2xl"
              >
                <div className="flex justify-between items-start mb-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
                <Skeleton className="h-3 w-2/3 mb-2" />
                <Skeleton className="h-6 w-1/3" />
              </div>
            ))}
          </CardSkeleton>
        ) : (
          <ObservationStats stats={observationStats} />
        )}

        {/* Filters and List */}
        <div className="bg-white/80 backdrop-blur-sm border border-slate-100 rounded-3xl p-6">
          <ObservationFilters
            searchQuery={searchQuery}
            onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
            sourceFilter={sourceFilter}
            onSourceChange={(v) => { setSourceFilter(v); setCurrentPage(1) }}
            severityFilter={severityFilter}
            onSeverityChange={(v) => { setSeverityFilter(v); setCurrentPage(1) }}
            statusFilter={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}
            dueDateFilter={dueDateFilter}
            onDueDateChange={setDueDateFilter}
            submissionDueDateFilter={submissionDueDateFilter}
            onSubmissionDueDateChange={setSubmissionDueDateFilter}
            archiveFilter={archiveFilter}
            onArchiveFilterChange={(v) => { setArchiveFilter(v); setCurrentPage(1) }}
            onClearFilters={handleClearFilters}
          />

          {showSkeleton ? (
            <ListSkeleton rows={5} columns={5} className="mt-4" />
          ) : (
            <ObservationTable
              observations={filteredObservations}
              onRowClick={handleRowClick}
              currentPage={currentPage}
              totalItems={total}
              onPageChange={setCurrentPage}
              itemsPerPage={itemsPerPage}
              onClearFilters={handleClearFilters}
              onAddObservation={() => setIsAddModalOpen(true)}
              onEdit={handleEditObservation}
              onDelete={handleDeleteClick}
              hasFilters={hasActiveFilters}
            />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <ObservationDetailModal
        observation={selectedObservation}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedObservation(null)
          setStoreSelected(null) // Clear store's selected observation
          // W38: drop the ?id= deep-link param so the modal doesn't reopen on
          // the next list refetch and the URL returns to the plain list.
          if (deepLinkId) clearDeepLink()
        }}
      />

      {/* Add Observation Modal */}
      <AddObservationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddObservation}
      />

      {/* Edit Observation Modal */}
      <EditObservationModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setObservationToEdit(null)
        }}
        // Cast to match the expected type from the modal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        observation={observationToEdit as any}
        onSave={handleEditSave}
      />

      <DeleteConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        itemName={deleteTarget?.title}
        itemType="observation"
        description={deleteTarget ? `This will permanently delete the observation '${deleteTarget.title}' and all its comments, documents, remediation plans, and activity. This cannot be undone.` : undefined}
        requireConfirmation
        confirmationWord="DELETE"
      />
    </>
  )
}
