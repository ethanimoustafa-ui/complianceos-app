'use client'

import { useState, useEffect, memo } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Observation } from './observation-types'
import { useObservationStore } from '@/stores/observation-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'
import { canTransferLeadership, canReviewRemediation, canSubmitRemediation, canUploadDocument, canRequestClosure, canReviewClosure } from '@/lib/permissions'
// C(#31): scroll to + glow a checklist item the user clicked on the calendar.
import { useDeepLinkHighlight } from '@/hooks/useDeepLink'
import { TransferLeadershipModal } from './transfer-leadership-modal'
import { FileUploadModal } from './file-upload-modal'
import { RemediationPlanModal, type RemediationPlanInitial } from './remediation-plan-modal'

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
  const { t, isRTL } = useTranslation()

  // Local state for checklist and comments - synced from prop, updated locally
  const [localChecklist, setLocalChecklist] = useState<LocalChecklistItem[]>([])
  const [localComments, setLocalComments] = useState<LocalComment[]>([])

  // O6: version history UI hidden (table kept for audit; endpoint still live).
  // fetchVersionHistory intentionally removed — the API route /versions is
  // preserved for audit tooling but the modal no longer renders the section.

  const store = useObservationStore()
  const {
    addComment, editComment, deleteComment,
    addChecklistItem, editChecklistItem, toggleChecklistItem, removeChecklistItem, setChecklistItemDeadline,
    transferLeadership, saveRemediationPlan, reviewRemediationPlan, uploadDocument, getDocumentUrl, removeDocument, requestClosure, reviewClosure, reopen,
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
    return () => {
      cancelled = true
    }
  }, [isOpen, observation?.id, fetchById])

  // Composite "detail loaded?" flag: prefer the store helper if present,
  // otherwise fall back to the local fetch state.
  const detailLoaded = observation?.id
    ? (isDetailLoadedFn ? isDetailLoadedFn(observation.id) : !isHydrating)
    : false

  // C(#31): once the modal's checklist has rendered, glow the deep-linked item.
  useDeepLinkHighlight(isOpen && detailLoaded && localChecklist.length > 0)

  // Modal states
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showRemediationPlanModal, setShowRemediationPlanModal] = useState(false)
  // When set, the remediation modal edits/revises this plan; null = create new.
  const [remediationModalInitial, setRemediationModalInitial] = useState<RemediationPlanInitial | null>(null)

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
      // BUG 3: prefer the server-persisted is_remediation flag on doc rows so
      // remediation docs survive a full refresh; fall back to plan.documents for
      // in-session optimistic adds.
      const flaggedRemediationDocs = (source.documents || [])
        .filter((d) => (d as { isRemediation?: boolean }).isRemediation)
        .map((d) => ({ id: d.id, name: d.name, type: d.type }))
      if (flaggedRemediationDocs.length > 0) {
        setLocalRemediationDocs(flaggedRemediationDocs)
      } else if (source.remediationPlan?.documents !== undefined) {
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
    // Refresh from server so the synced useEffect picks up the confirmed comment
    void fetchById(observation.id)
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

  // Leadership transfer — close the modal immediately. The transfer is
  // optimistic (the sidebar leader updates in the background; the store reverts
  // and toasts on failure), so there's no reason to keep the dialog open.
  const handleTransferLeadership = async (newLeaderId: string, newLeaderName: string) => {
    if (!observation || !user) return
    setShowTransferModal(false)
    await transferLeadership(observation.id, newLeaderId, newLeaderName, user)
  }

  // Remediation plan review (approve / reject by leader / manager / admin)
  const handleReviewRemediationPlan = async (approved: boolean, notes?: string) => {
    if (!observation || !user) return
    await reviewRemediationPlan(observation.id, approved, user, notes)
  }

  // Open the plan modal in create mode.
  const openCreatePlan = () => {
    setRemediationModalInitial(null)
    setShowRemediationPlanModal(true)
  }

  // Open the plan modal in edit / revise mode for the current plan.
  const openEditPlan = () => {
    const p = (storeObservation || observation)?.remediationPlan
    if (!p) return
    setRemediationModalInitial({
      planId: p.id,
      title: p.title,
      description: p.description,
      dueDate: p.dueDate,
      status: p.status,
      reviewNotes: p.reviewNotes,
      documents: localRemediationDocs,
    })
    setShowRemediationPlanModal(true)
  }

  // Upload one attached remediation file (real bytes → bucket, flagged
  // is_remediation). Rejects on failure so the modal can keep the form open.
  const handleUploadPlanFile = async (file: File) => {
    if (!observation || !user) return
    await uploadDocument(observation.id, file, user, true)
  }

  // Persist the plan (create / edit / submit) after the files are uploaded.
  const handleSavePlan = async (
    plan: { title: string; description: string; dueDate: string },
    status: 'draft' | 'submitted',
  ) => {
    if (!observation || !user) return
    await saveRemediationPlan(
      observation.id,
      { planId: remediationModalInitial?.planId, ...plan },
      status,
      user,
    )
    void fetchById(observation.id)
  }

  // Submit an existing draft as-is (no edits) for review.
  const handleSubmitDraft = async () => {
    if (!observation || !user) return
    const p = (storeObservation || observation)?.remediationPlan
    if (!p) return
    await saveRemediationPlan(
      observation.id,
      { planId: p.id, title: p.title, description: p.description, dueDate: p.dueDate },
      'submitted',
      user,
    )
    void fetchById(observation.id)
  }

  // Open a stored document in a new tab via a freshly-minted signed URL.
  const handleOpenDocument = async (documentId: string) => {
    if (!observation) return
    const url = await getDocumentUrl(observation.id, documentId)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Delete a stored document (DELETE /evidence + storage). Rejects on failure so
  // the row's delete spinner can clear and the store toast surfaces.
  const handleDeleteDocument = async (documentId: string, documentName: string) => {
    if (!observation || !user) return
    await removeDocument(observation.id, documentId, documentName, user)
    void fetchById(observation.id)
  }

  // Closure request
  const handleRequestClosure = async (notes?: string) => {
    if (!observation || !user) return
    await fetchById(observation.id)
    await requestClosure(observation.id, user, notes)
  }

  // Closure review — refresh byId first so reviewClosure sends a fresh If-Match token
  const handleReviewClosure = async (approved: boolean, notes?: string) => {
    if (!observation || !user) return
    await fetchById(observation.id)
    await reviewClosure(observation.id, approved, user, notes)
  }

  // Reopen a closed observation (US-08)
  const handleReopen = async () => {
    if (!observation) return
    await fetchById(observation.id)
    await reopen(observation.id)
  }

  // File upload (general related documents — real bytes → bucket, not flagged
  // as remediation; remediation documents are attached via the plan modal).
  const handleFileUpload = async (files: File[]) => {
    if (!observation || !user || files.length === 0) return
    for (const file of files) {
      await uploadDocument(observation.id, file, user, false)
    }
    void fetchById(observation.id)
    setShowUploadModal(false)
  }

  if (!observation) return null

  // O6b: prefer storeObservation (optimistic) over the prop for live-updated fields.
  const liveObs = storeObservation || observation

  // O4: an observation is "closed" (remediated) when archived_at is set.
  // Prefer archived_at as the signal (W28 O7 added this column) over status
  // alone, because status alone could be 'closed' without archiving.
  const isClosed = Boolean(liveObs.archivedAt) || liveObs.status === 'closed'

  // W39: membership mirror of the server gate — only people added to the
  // observation (leader / assignees; admin oversees) get input affordances.
  const isMember = canSubmitRemediation(user, liveObs)

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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold font-display text-slate-900">
                  {observation.title}
                </h2>
                {/* O4: closed badge — shown when the observation has been remediated */}
                {isClosed && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 border border-emerald-300 rounded-full text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                    <Icon icon="lucide:check-circle-2" className="text-xs" />
                    {t('observations.statusOptions.closed' as import('@/i18n').TranslationKey)}
                  </span>
                )}
              </div>
              {observation.subTitle ? (
                <p className="text-sm text-slate-500 mt-1">{observation.subTitle}</p>
              ) : null}
            </div>
          </div>

          {/* W38: the generic top-of-modal skeleton stack was removed — the
              header + Finding Overview render instantly from list-row data, so
              it stacked placeholder bars ON TOP of already-visible content.
              Deferred sections (comments, documents, remediation, closure)
              carry their own isLoaded-gated skeletons. */}
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

            {/* Remediation Checklist — read-only when closed (O4) or for
                non-members (W39: the server rejects non-member writes). */}
            <ChecklistSection
              items={localChecklist}
              onAdd={isClosed || !isMember ? (() => {}) : handleAddChecklistItem}
              onEdit={isClosed || !isMember ? undefined : handleEditChecklistItem}
              onRemove={isClosed || !isMember ? (() => {}) : handleRemoveChecklistItem}
              onToggle={isClosed || !isMember ? (() => {}) : handleChecklistItemToggle}
              onSetDeadline={isClosed || !isMember ? undefined : (itemId, deadline) => setChecklistItemDeadline(observation.id, itemId, deadline, user || undefined)}
              parentDeadline={liveObs?.dueDate ?? observation?.dueDate}
              isRTL={isRTL}
              readOnly={isClosed || !isMember}
              loading={!detailLoaded}
            />

            {/* Updates & Discussion — read-only when closed (O4) or for
                non-members (W39). */}
            <CommentsSection
              comments={localComments}
              user={user}
              onAdd={handleAddComment}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              isRTL={isRTL}
              isLoaded={detailLoaded}
              readOnly={isClosed || !isMember}
            />

            {/* O6: Version History section hidden per W28 spec.
                The observation_versions table and /versions API endpoint are
                preserved for audit tooling — only the UI block is removed. */}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className={`w-full lg:w-80 bg-slate-50 border-t lg:border-t-0 ${isRTL ? 'lg:border-r lg:border-l-0' : 'lg:border-l'} border-slate-200 p-8 space-y-8 shrink-0 overflow-y-auto hide-scrollbar`}>
          <SidebarSeverity severity={observation.severity} isRTL={isRTL} />

          {/* O1: completed (closed/archived) observations have no live deadline.
              Read from liveObs so an in-session plan transition flips the
              countdown's date/label like every other panel. */}
          {!isClosed && (
            <DeadlineCountdown
              submissionDueDate={liveObs.remediationSubmissionDueDate}
              completionDueDate={liveObs.dueDate}
              planStatus={liveObs.remediationPlan?.status}
              isRTL={isRTL}
            />
          )}

          {displayAssignees.length > 0 ? (
            <AssignedTeam assignees={displayAssignees} isRTL={isRTL} />
          ) : null}

          <ObservationLeader
            leader={leader ? { id: leader.id || '', name: leader.name, avatar: leader.avatar } : null}
            canTransfer={!isClosed && canTransferLeadership(user, liveObs)}
            onTransfer={() => setShowTransferModal(true)}
            isRTL={isRTL}
          />

          <RemediationStatus
            plan={liveObs.remediationPlan}
            // W39 (product rule): the observation LEADER approves/rejects the
            // plan submission — including one they submitted themselves.
            canReview={!isClosed && canReviewRemediation(user, liveObs)}
            canSubmitPlan={!isClosed && canSubmitRemediation(user, liveObs)}
            onReview={handleReviewRemediationPlan}
            onCreatePlan={openCreatePlan}
            onEditPlan={openEditPlan}
            onSubmitPlan={handleSubmitDraft}
            onOpenDocument={handleOpenDocument}
            onDeleteDocument={!isClosed && canUploadDocument(user, liveObs) ? handleDeleteDocument : undefined}
            documents={localRemediationDocs}
            isRTL={isRTL}
            isLoaded={detailLoaded}
          />

          <ClosureStatus
            status={liveObs.status}
            closureRequest={liveObs.closureRequest}
            closureReview={liveObs.closureReview}
            canRequestClosure={!isClosed && canRequestClosure(user, liveObs)}
            // W39 (product rule): closure verdicts belong to the leader —
            // including on their own request.
            canReviewClosure={canReviewClosure(user, liveObs)}
            remediationApproved={liveObs.remediationPlan?.status === 'approved'}
            onRequestClosure={handleRequestClosure}
            onReviewClosure={handleReviewClosure}
            onReopen={handleReopen}
            isRTL={isRTL}
          />

          <RelatedDocuments
            documents={regularDocuments}
            canUpload={!isClosed && canUploadDocument(user, liveObs)}
            onUpload={() => setShowUploadModal(true)}
            onOpenDocument={handleOpenDocument}
            onDeleteDocument={!isClosed && canUploadDocument(user, liveObs) ? handleDeleteDocument : undefined}
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

      {/* File Upload Modal — mounted only while open so its form state resets. */}
      {showUploadModal && (
        <FileUploadModal
          isOpen
          onClose={() => setShowUploadModal(false)}
          onConfirm={handleFileUpload}
        />
      )}

      {/* Remediation Plan Modal (create / edit / revise) — mounted only while
          open so the initializers seed the form for the current target plan. */}
      {showRemediationPlanModal && (
        <RemediationPlanModal
          isOpen
          onClose={() => setShowRemediationPlanModal(false)}
          onUploadFile={handleUploadPlanFile}
          onSavePlan={handleSavePlan}
          onDeleteExistingDocument={handleDeleteDocument}
          observationDueDate={observation?.dueDate}
          initialPlan={remediationModalInitial}
        />
      )}
    </Modal>
  )
})
