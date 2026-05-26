'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Observation } from './observation-types'
import { useObservationStore } from '@/stores/observation-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'
import { canTransferLeadership, canReviewRemediation, canUploadDocument, canRequestClosure, canReviewClosure } from '@/lib/permissions'
import { TransferLeadershipModal } from './transfer-leadership-modal'
import { FileUploadModal, getFileType } from './file-upload-modal'
import { renderFieldLabel } from '@/lib/timeline-message'
import {
  ChecklistSection,
  CommentsSection,
  SidebarSeverity,
  DeadlineCountdown,
  AssignedTeam,
  ObservationLeader,
  RemediationStatus,
  RelatedDocuments,
  ActivityTimeline,
  ClosureStatus,
} from './detail'

interface ObservationDetailModalProps {
  observation: Observation | null
  isOpen: boolean
  onClose: () => void
  onChecklistToggle?: (observationId: string, checklistItemId: string, completed: boolean) => void
}

// Local checklist item type
interface LocalChecklistItem {
  id: string
  text: string
  completed: boolean
}

// Local comment type
interface LocalComment {
  id: string
  authorId: string
  author: { name: string; avatar: string }
  text: string
  createdAt: string
  isEdited?: boolean
  editedAt?: string
}

export const ObservationDetailModal = memo(function ObservationDetailModal({
  observation,
  isOpen,
  onClose,
  onChecklistToggle,
}: ObservationDetailModalProps) {
  const { t, isRTL, language } = useTranslation()

  // Local state for checklist and comments - synced from prop, updated locally
  const [localChecklist, setLocalChecklist] = useState<LocalChecklistItem[]>([])
  const [localComments, setLocalComments] = useState<LocalComment[]>([])

  // W24-4: version history
  interface VersionEntry {
    id: string
    date: string
    author: string
    text_en: string
    text_ar: string
    field_changes: Array<{ field: string; from: string; to: string }> | null
  }
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>([])
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)

  const fetchVersionHistory = useCallback(async (obsId: string) => {
    try {
      const res = await fetch(`/api/observations/${obsId}/versions?pageSize=50`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json() as { data?: { items?: VersionEntry[] } }
      setVersionHistory(json?.data?.items ?? [])
    } catch {
      // silently ignore — feature degrades gracefully
    }
  }, [])

  const store = useObservationStore()
  const {
    addComment, editComment, deleteComment,
    addChecklistItem, editChecklistItem, toggleChecklistItem, removeChecklistItem,
    transferLeadership, reviewRemediationPlan, addDocument, requestClosure, reviewClosure,
    fetchById, selectedObservation: storeObservation,
  } = store
  // `isDetailLoaded(id)` mirrors the policy/circular stores — true only after
  // the detail GET resolves. Read defensively so the modal still compiles if
  // the store helper hasn't shipped yet (then we fall back to the local
  // hydration flag).
  const isDetailLoadedFn = (store as unknown as { isDetailLoaded?: (id: string) => boolean }).isDetailLoaded
  const user = useAuthStore((state) => state.user)
  const { members } = useTeamStore()

  // WAVE2-A: when the modal opens, hydrate the observation's nested children
  // (checklist, updates/comments, documents, remediation plan, closure
  // request/review, timeline) from the server. List `fetchAll()` doesn't
  // return these fields — without this fetch the modal renders empty arrays
  // and the user sees "no items" after every refresh even though the rows
  // exist in the database.
  const [isHydrating, setIsHydrating] = useState(false)
  useEffect(() => {
    if (!isOpen || !observation?.id) return
    let cancelled = false
    setIsHydrating(true)
    void fetchById(observation.id).finally(() => {
      if (!cancelled) setIsHydrating(false)
    })
    void fetchVersionHistory(observation.id)
    return () => {
      cancelled = true
    }
  }, [isOpen, observation?.id, fetchById, fetchVersionHistory])

  // Composite "detail loaded?" flag: prefer the store helper if present,
  // otherwise fall back to the local fetch state.
  const detailLoaded = observation?.id
    ? (isDetailLoadedFn ? isDetailLoadedFn(observation.id) : !isHydrating)
    : false

  // Modal states
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Local documents state
  const [localDocuments, setLocalDocuments] = useState<{ id: string; name: string; type: 'pdf' | 'image' | 'doc' }[]>([])
  const [localRemediationDocs, setLocalRemediationDocs] = useState<{ id: string; name: string; type: 'pdf' | 'image' | 'doc' }[]>([])

  // Sync checklist, comments, and documents from storeObservation (preferred) or observation prop
  // Re-syncs when storeObservation updates (e.g., after leadership transfer)
  useEffect(() => {
    const source = storeObservation || observation
    if (source && isOpen) {
      setLocalChecklist(source.checklist || [])
      // Read comments from storeObservation (ObservationWithComments) which has the comments field
      setLocalComments(
        storeObservation?.comments?.map((c) => ({
          id: c.id,
          authorId: c.author?.id || '',
          author: { name: c.author?.name || '', avatar: c.author?.avatar || c.author?.name || '' },
          text: c.content,  // Map 'content' to 'text'
          createdAt: c.createdAt,
          isEdited: false,  // Comment type doesn't have isEdited
          editedAt: undefined,
        })) || []
      )
      setLocalDocuments(source.documents || [])
      // O6c: only reset remediationDocs when the source actually has remediation plan data.
      // Avoid clearing localRemediationDocs when store updates don't include nested plan data
      // (e.g., after a leadership transfer where remediationPlan is not re-fetched).
      if (source.remediationPlan?.documents !== undefined) {
        setLocalRemediationDocs(source.remediationPlan.documents)
      } else if (!storeObservation) {
        // First sync from observation prop — reset is safe
        setLocalRemediationDocs([])
      }
      // If storeObservation exists but has no remediationPlan, keep previous localRemediationDocs
    }
  }, [storeObservation, observation?.id, isOpen])

  // Checklist handlers
  const handleAddChecklistItem = async (text: string) => {
    if (!observation) return
    const newItem: LocalChecklistItem = {
      id: crypto.randomUUID(),
      text,
      completed: false,
    }
    setLocalChecklist((prev) => [...prev, newItem])
    await addChecklistItem(observation.id, text, user || undefined)
  }

  const handleRemoveChecklistItem = async (itemId: string) => {
    if (!observation) return
    const item = localChecklist.find(i => i.id === itemId)
    setLocalChecklist((prev) => prev.filter((item) => item.id !== itemId))
    await removeChecklistItem(observation.id, itemId, item?.text, user || undefined)
  }

  const handleEditChecklistItem = async (itemId: string, newText: string) => {
    if (!observation) return
    // Update local state immediately for responsiveness
    setLocalChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, text: newText } : item
      )
    )
    // Call store action to update state and add timeline entry
    await editChecklistItem(observation.id, itemId, newText, user || undefined)
  }

  const handleChecklistItemToggle = async (itemId: string, currentState: boolean) => {
    if (!observation) return
    const newCompleted = !currentState
    // Update local state immediately for responsiveness
    setLocalChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, completed: newCompleted } : item
      )
    )
    // Call store action to update state and add timeline entry
    await toggleChecklistItem(observation.id, itemId, newCompleted, user || undefined)
    // Also call the prop handler if provided
    if (onChecklistToggle) {
      onChecklistToggle(observation.id, itemId, newCompleted)
    }
  }

  // Comment handlers
  const handleAddComment = async (content: string) => {
    if (!observation || !user) return
    const newComment: LocalComment = {
      id: crypto.randomUUID(),
      authorId: user.id,
      author: { name: user.name, avatar: user.avatar || user.name },
      text: content,
      createdAt: t('observations.detail.justNow'),
    }
    setLocalComments((prev) => [...prev, newComment])
    await addComment(observation.id, content, user)
  }

  const handleEditComment = async (commentId: string, newText: string) => {
    if (!observation || !user) return
    setLocalComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, text: newText, isEdited: true, editedAt: new Date().toISOString() }
          : c
      )
    )
    await editComment(observation.id, commentId, newText, user)
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!observation || !user) return
    setLocalComments((prev) => prev.filter((c) => c.id !== commentId))
    await deleteComment(observation.id, commentId, user)
  }

  // Leadership transfer
  const handleTransferLeadership = async (newLeaderId: string, newLeaderName: string) => {
    if (!observation || !user) return
    await transferLeadership(observation.id, newLeaderId, newLeaderName, user)
    setShowTransferModal(false)
  }

  // Remediation plan review
  const handleReviewRemediationPlan = async (approved: boolean, notes?: string) => {
    if (!observation || !user) return
    await reviewRemediationPlan(observation.id, approved, user, notes)
  }

  // Closure request
  const handleRequestClosure = async (notes?: string) => {
    if (!observation || !user) return
    await requestClosure(observation.id, user, notes)
  }

  // Closure review
  const handleReviewClosure = async (approved: boolean, notes?: string) => {
    if (!observation || !user) return
    await reviewClosure(observation.id, approved, user, notes)
  }

  // File upload
  const handleFileUpload = async (files: File[], addToRemediationPlan: boolean) => {
    if (!observation || !user || files.length === 0) return
    for (const file of files) {
      const fileType = getFileType(file.name)
      const newDoc = {
        id: crypto.randomUUID(),
        name: file.name,
        type: fileType,
      }
      setLocalDocuments((prev) => [...prev, newDoc])
      if (addToRemediationPlan) {
        setLocalRemediationDocs((prev) => [...prev, newDoc])
      }
      await addDocument(observation.id, { name: file.name, type: fileType }, user, addToRemediationPlan)
    }
    setShowUploadModal(false)
  }

  if (!observation) return null

  // O6b: prefer storeObservation (optimistic) over the prop for live-updated fields.
  const liveObs = storeObservation || observation

  // Derived data
  const displayAssignees = liveObs.assignees?.length
    ? liveObs.assignees
    : liveObs.team?.length
      ? liveObs.team
      : liveObs.assignee
        ? [liveObs.assignee]
        : []

  const leader = members.find(m => m.id === liveObs.leaderId) ||
    liveObs.assignees?.find(a => a.id === liveObs.leaderId)

  const remediationDocIds = new Set(localRemediationDocs.map(d => d.id))
  const regularDocuments = localDocuments.filter(doc => !remediationDocIds.has(doc.id))

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className={`flex flex-col lg:flex-row h-[80vh] -m-6`}>
        {/* Main Section */}
        <div className="flex-1 p-8 overflow-y-auto hide-scrollbar bg-white">
          <div className={`flex items-center gap-3 mb-6`}>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400"
            >
              <Icon icon={'lucide:arrow-left'} className="text-xl" />
            </button>
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                {observation.title}
              </h2>
              {observation.subTitle ? (
                <p className="text-sm text-slate-500 mt-1">{observation.subTitle}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-8">
            {/* Finding Overview */}
            <section>
              <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-3`}>
                {t('observations.detail.findingOverview')}
              </h3>
              <p className={`text-sm text-slate-600 leading-relaxed`}>
                {observation.description}
              </p>
            </section>

            {/* Remediation Checklist */}
            <ChecklistSection
              items={localChecklist}
              onAdd={handleAddChecklistItem}
              onEdit={handleEditChecklistItem}
              onRemove={handleRemoveChecklistItem}
              onToggle={handleChecklistItemToggle}
              isRTL={isRTL}
            />

            {/* Updates & Discussion */}
            <CommentsSection
              comments={localComments}
              user={user}
              onAdd={handleAddComment}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              isRTL={isRTL}
              isLoaded={detailLoaded}
            />

            {/* Version History — W24-4 */}
            <section>
              <h3 className={`text-xs font-black uppercase text-slate-400 tracking-widest mb-3`}>
                {t('observations.detail.versionHistory' as import('@/i18n').TranslationKey)}
              </h3>
              {versionHistory.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {t('observations.detail.noVersionHistory' as import('@/i18n').TranslationKey)}
                </p>
              ) : (
                <div className="space-y-2">
                  {versionHistory.map((ver, idx) => {
                    const isOpen = expandedVersion === ver.id
                    const hasDiff = (ver.field_changes ?? []).length > 0
                    const summary = language === 'ar' ? ver.text_ar : ver.text_en
                    const displayNum = versionHistory.length - idx
                    return (
                      <div key={ver.id}>
                        <button
                          onClick={() => setExpandedVersion(isOpen ? null : ver.id)}
                          className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
                        >
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">
                            v{displayNum}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700">{summary}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {ver.date} • {ver.author}
                            </p>
                          </div>
                          <Icon
                            icon={isOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                            className="text-slate-400 text-sm shrink-0 mt-0.5"
                          />
                        </button>
                        {isOpen && hasDiff && (
                          <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                            <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                              <span>{t('observations.detail.fieldChanged' as import('@/i18n').TranslationKey)}</span>
                              <span>{t('observations.detail.changedFrom' as import('@/i18n').TranslationKey)}</span>
                              <span>{t('observations.detail.changedTo' as import('@/i18n').TranslationKey)}</span>
                            </div>
                            {(ver.field_changes ?? []).map((diff, i) => (
                              <div key={`${diff.field}-${i}`} className="grid grid-cols-3 gap-1 text-[10px]">
                                <span className="font-bold text-slate-600">{renderFieldLabel(diff.field, t)}</span>
                                <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                                <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {isOpen && !hasDiff && (
                          <div className="bg-slate-50 rounded-xl p-3 mt-1">
                            <p className="text-xs text-slate-400">{summary}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className={`w-full lg:w-80 bg-slate-50 border-t lg:border-t-0 ${isRTL ? 'lg:border-r lg:border-l-0' : 'lg:border-l'} border-slate-200 p-8 space-y-8 shrink-0 overflow-y-auto hide-scrollbar`}>
          <SidebarSeverity severity={observation.severity} isRTL={isRTL} />

          <DeadlineCountdown
            submissionDueDate={observation.remediationSubmissionDueDate}
            completionDueDate={observation.dueDate}
            planStatus={observation.remediationPlan?.status}
            isRTL={isRTL}
          />

          {displayAssignees.length > 0 ? (
            <AssignedTeam assignees={displayAssignees} isRTL={isRTL} />
          ) : null}

          <ObservationLeader
            leader={leader ? { id: leader.id || '', name: leader.name, avatar: leader.avatar } : null}
            canTransfer={canTransferLeadership(user, observation)}
            onTransfer={() => setShowTransferModal(true)}
            isRTL={isRTL}
          />

          <RemediationStatus
            plan={observation.remediationPlan}
            canReview={canReviewRemediation(user, observation)}
            onReview={handleReviewRemediationPlan}
            documents={localRemediationDocs}
            isRTL={isRTL}
            isLoaded={detailLoaded}
          />

          <ClosureStatus
            status={storeObservation?.status || observation.status}
            closureRequest={storeObservation?.closureRequest || observation.closureRequest}
            closureReview={storeObservation?.closureReview || observation.closureReview}
            canRequestClosure={canRequestClosure(user, observation)}
            canReviewClosure={canReviewClosure(user, observation)}
            onRequestClosure={handleRequestClosure}
            onReviewClosure={handleReviewClosure}
            isRTL={isRTL}
          />

          <RelatedDocuments
            documents={regularDocuments}
            canUpload={canUploadDocument(user, observation)}
            onUpload={() => setShowUploadModal(true)}
            isRTL={isRTL}
            isLoaded={detailLoaded}
          />

          <ActivityTimeline
            timeline={storeObservation?.timeline || observation.timeline || []}
            isRTL={isRTL}
            isLoaded={detailLoaded}
          />
        </div>
      </div>

      {/* Transfer Leadership Modal */}
      <TransferLeadershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onTransfer={handleTransferLeadership}
        assignees={liveObs.assignees || liveObs.team || []}
        currentLeaderId={liveObs.leaderId}
      />

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onConfirm={handleFileUpload}
      />
    </Modal>
  )
})
