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
import { ListSkeleton } from '@/components/ui/skeleton'
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

  // Zustand store - single source of truth
  const {
    observations,
    create: createObservation,
    update: updateObservation,
    delete: deleteObservation,
    removeDocument,
    uploadDocument: uploadObservationDocument,
    setSelected: setStoreSelected,
  } = useObservationStore()

  // Get current user for creator assignment
  const user = useAuthStore((state) => state.user)
  const pushToast = useToastStore((s) => s.pushToast)

  // First-fetch detector (Wave-2 Agent E): show skeleton while the very first
  // GET is in flight and the list is still empty. Refetches keep stale data
  // visible (so the user never sees a flash of empty).
  const isLoading = useObservationStore((s) => s.isLoading)
  const lastFetched = useObservationStore((s) => s.lastFetched)
  const showSkeleton = isLoading && observations.length === 0 && lastFetched === null

  // Hydrate server-state on mount (Fix-1). Without this the observation list
  // is empty after a page reload because Zustand starts cold.
  const fetchObservations = useObservationStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchObservations()
  }, [fetchObservations])

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

  // Filter observations
  const filteredObservations = useMemo(() => {
    return observations.filter((obs) => {
      // O7 / W37: archive filter. A row is "archived" when it has an archived_at
      // timestamp OR is Closed — closed (verified) observations belong in the
      // Archive, not the active list. Default hides them; 'archived' shows only them.
      const isArchivedRow = Boolean(obs.archivedAt) || obs.status === 'closed'
      const matchesArchive = archiveFilter === 'archived' ? isArchivedRow : !isArchivedRow

      // Search filter (title, subtitle, reference)
      const matchesSearch =
        searchQuery === '' ||
        obs.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (obs.subTitle && obs.subTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (obs.reference && obs.reference.toLowerCase().includes(searchQuery.toLowerCase()))

      // Source filter
      const matchesSource = sourceFilter === 'all' || obs.source === sourceFilter

      // Severity filter
      const matchesSeverity = severityFilter === 'all' || obs.severity === severityFilter

      // Status filter
      const matchesStatus = statusFilter === 'all' || obs.status === statusFilter

      // Remediation due date filter - show observations due on or before selected date
      const matchesDueDate =
        !dueDateFilter ||
        (obs.dueDate && obs.dueDate <= dueDateFilter)

      // Plan submission due date filter - show observations due on or before selected date
      const matchesSubmissionDueDate =
        !submissionDueDateFilter ||
        (obs.remediationSubmissionDueDate && obs.remediationSubmissionDueDate <= submissionDueDateFilter)

      return matchesArchive && matchesSearch && matchesSource && matchesSeverity && matchesStatus && matchesDueDate && matchesSubmissionDueDate
    })
  }, [observations, archiveFilter, searchQuery, sourceFilter, severityFilter, statusFilter, dueDateFilter, submissionDueDateFilter])

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
  useEffect(() => {
    if (!deepLinkId || isDetailModalOpen) return
    const obs = observations.find(o => o.id === deepLinkId)
    if (obs) handleRowClick(obs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, observations])

  // W38: deep-link to an unknown / hard-deleted observation — surface a
  // "Not found" panel instead of silently rendering the list. The ?id= param
  // is preserved (per spec) until the user clicks back to the list.
  const deepLinkNotFound =
    !!deepLinkId &&
    lastFetched !== null &&
    !isLoading &&
    !observations.some((o) => o.id === deepLinkId)

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
              await uploadObservationDocument(created.reference || created.id, att.file, user, false)
            } catch (uploadErr) {
              // Non-fatal: the observation was created; the document can be
              // re-uploaded from the detail view.
              console.error('Failed to upload create-time attachment:', uploadErr)
            }
          }
        }
      }
      setIsAddModalOpen(false)
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
    } catch (error) {
      console.error('Failed to update observation:', error)
    }
  }

  // US-10: delete requires confirmation dialog (type DELETE)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)

  const handleDeleteClick = (observationId: string) => {
    const obs = observations.find((o) => o.id === observationId)
    if (!obs) return
    setDeleteTarget({ id: observationId, title: obs.title })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteObservation(deleteTarget.id)
      pushToast(t('observations.deleteSuccess' as import('@/i18n').TranslationKey), 'success')
    } catch (error) {
      console.error('Failed to delete observation:', error)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Calculate stats from observations
  const observationStats: ObservationStatsData = useMemo(() => {
    const now = new Date()
    const openCritical = observations.filter(
      (o) => o.severity === 'critical' && o.status !== 'closed'
    ).length
    const overdue = observations.filter((o) => {
      if (o.status === 'closed') return false
      const dueDate = new Date(o.dueDate)
      return dueDate < now
    }).length
    const inRemediation = observations.filter(
      (o) => o.status === 'in_progress'
    ).length
    const drafting = observations.filter(
      (o) => o.status === 'open'
    ).length
    const closedThisQuarter = observations.filter((o) => {
      if (o.status !== 'closed') return false
      // Simple quarter check - closed observations
      return true
    }).length

    return {
      total: observations.length,
      openCritical,
      overdue,
      inRemediation,
      drafting,
      closedThisQuarter,
      quarterlyTarget: 30,
    }
  }, [observations])

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
  }

  // Export observations with localization
  const handleExport = () => {
    const baseFilename = isRTL ? 'ملاحظات' : 'observations'
    const dateStr = new Date().toISOString().split('T')[0]
    exportObservations(filteredObservations, `${baseFilename}-${dateStr}`, t, isRTL)
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
          {/* Export Button */}
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
        <ObservationStats stats={observationStats} />

        {/* Filters and List */}
        <div className="bg-white/80 backdrop-blur-sm border border-slate-100 rounded-3xl p-6">
          <ObservationFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sourceFilter={sourceFilter}
            onSourceChange={setSourceFilter}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            dueDateFilter={dueDateFilter}
            onDueDateChange={setDueDateFilter}
            submissionDueDateFilter={submissionDueDateFilter}
            onSubmissionDueDateChange={setSubmissionDueDateFilter}
            archiveFilter={archiveFilter}
            onArchiveFilterChange={setArchiveFilter}
            onClearFilters={handleClearFilters}
          />

          {showSkeleton ? (
            <ListSkeleton rows={5} columns={5} className="mt-4" />
          ) : (
            <ObservationTable
              observations={filteredObservations}
              onRowClick={handleRowClick}
              currentPage={currentPage}
              totalItems={filteredObservations.length}
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
