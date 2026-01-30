'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { exportObservations } from '@/lib/export'
import { RoleGuard } from '@/components/auth/role-guard'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { useObservationStore } from '@/stores/observation-store'
import { useAuthStore } from '@/stores/auth-store'
import { ObservationStats } from '@/components/observations/observation-stats'
import type { ObservationStatsData } from '@/components/observations/observation-stats'
import { ObservationFilters } from '@/components/observations/observation-filters'
import { ObservationTable } from '@/components/observations/observation-table'
import { ObservationDetailModal } from '@/components/observations/observation-detail-modal'
import { AddObservationModal } from '@/components/observations/add-observation-modal'
import type { ObservationFormData } from '@/components/observations/add-observation-modal'
import { EditObservationModal } from '@/components/observations/edit-observation-modal'
import type {
  Observation,
  ObservationSource,
  ObservationSeverity,
  ObservationStatus,
} from '@/components/observations/observation-types'

export default function ObservationsPage() {
  const { t, isRTL } = useTranslation()

  // Zustand store - single source of truth
  const {
    observations,
    create: createObservation,
    update: updateObservation,
    delete: deleteObservation,
    removeDocument,
    setSelected: setStoreSelected,
  } = useObservationStore()

  // Get current user for creator assignment
  const user = useAuthStore((state) => state.user)

  // State for modals
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [observationToEdit, setObservationToEdit] = useState<Observation | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [observationToDelete, setObservationToDelete] = useState<string | null>(null)

  // State for filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<ObservationSource | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<ObservationSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ObservationStatus | 'all'>('all')
  const [dueDateFilter, setDueDateFilter] = useState('')
  const [submissionDueDateFilter, setSubmissionDueDateFilter] = useState('')

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter observations
  const filteredObservations = useMemo(() => {
    return observations.filter((obs) => {
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

      return matchesSearch && matchesSource && matchesSeverity && matchesStatus && matchesDueDate && matchesSubmissionDueDate
    })
  }, [observations, searchQuery, sourceFilter, severityFilter, statusFilter, dueDateFilter, submissionDueDateFilter])

  // Handle row click
  const handleRowClick = (observation: Observation) => {
    setSelectedObservation(observation)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStoreSelected(observation as any) // Sync with store for timeline updates
    setIsDetailModalOpen(true)
  }

  // Handle add observation - calls Zustand store
  const handleAddObservation = async (data: ObservationFormData) => {
    try {
      await createObservation({
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
        // Map uploaded files to document format
        documents: data.attachments?.map(file => ({
          id: file.id || crypto.randomUUID(),
          name: file.name,
          type: file.type.includes('pdf') ? 'pdf' as const : file.type.includes('image') ? 'image' as const : 'doc' as const,
        })) || [],
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
      setIsEditModalOpen(false)
      setObservationToEdit(null)
    } catch (error) {
      console.error('Failed to update observation:', error)
    }
  }

  // Handle delete click
  const handleDeleteClick = (observationId: string) => {
    setObservationToDelete(observationId)
    setIsDeleteDialogOpen(true)
  }

  // Handle delete confirm - calls Zustand store
  const handleDeleteConfirm = async () => {
    if (observationToDelete) {
      try {
        await deleteObservation(observationToDelete)
        setIsDeleteDialogOpen(false)
        setObservationToDelete(null)
      } catch (error) {
        console.error('Failed to delete observation:', error)
      }
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
  const hasActiveFilters = searchQuery !== '' || sourceFilter !== 'all' || severityFilter !== 'all' || statusFilter !== 'all' || dueDateFilter !== '' || submissionDueDateFilter !== ''

  // Clear all filters
  const handleClearFilters = () => {
    setSearchQuery('')
    setSourceFilter('all')
    setSeverityFilter('all')
    setStatusFilter('all')
    setDueDateFilter('')
    setSubmissionDueDateFilter('')
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
        <div className="flex items-center gap-8">
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
              href="/sama-letters"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('observations.samaLetters')}
            </Link>
            <Link
              href="/regulatory-updates"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:crosshair" className="text-emerald-600" />
              {t('observations.title')}
            </span>
          </div>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* System Health */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span>{t('observations.systemHealth')}</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          {/* Export Button */}
          <RoleGuard requiredPermission="export" hidden>
            <Button
              variant="outline"
              onClick={handleExport}
              className={`hidden md:flex ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:download" />
              {t('common.exportCsv')}
            </Button>
          </RoleGuard>

          {/* Add Observation Button */}
          <RoleGuard requiredPermission="observation:create" hidden>
            <Button
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              className="shadow-lg shadow-emerald-100"
            >
              <Icon icon="lucide:plus" />
              {t('observations.addObservation')}
            </Button>
          </RoleGuard>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
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
          />

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

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setObservationToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        itemType={t('observations.observation')}
        itemName={observations.find((o) => o.id === observationToDelete)?.title}
      />
    </>
  )
}
