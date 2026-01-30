'use client'

import { useState, useEffect, memo } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Observation } from './observation-types'
import { useObservationStore } from '@/stores/observation-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'
import { canTransferLeadership, canReviewRemediation, canUploadDocument } from '@/lib/permissions'
import { TransferLeadershipModal } from './transfer-leadership-modal'
import { FileUploadModal, getFileType } from './file-upload-modal'
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

  const { addComment, editComment, deleteComment, addChecklistItem, editChecklistItem, toggleChecklistItem, removeChecklistItem, transferLeadership, reviewRemediationPlan, addDocument, selectedObservation: storeObservation } = useObservationStore()
  const user = useAuthStore((state) => state.user)
  const { members } = useTeamStore()

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
      setLocalRemediationDocs(source.remediationPlan?.documents || [])
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

  // Derived data
  const displayAssignees = observation.assignees?.length
    ? observation.assignees
    : observation.team?.length
      ? observation.team
      : observation.assignee
        ? [observation.assignee]
        : []

  const leader = members.find(m => m.id === observation.leaderId) ||
    observation.assignees?.find(a => a.id === observation.leaderId)

  const remediationDocIds = new Set(localRemediationDocs.map(d => d.id))
  const regularDocuments = localDocuments.filter(doc => !remediationDocIds.has(doc.id))

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className={`flex flex-col lg:flex-row h-[80vh] -m-6 ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
        {/* Main Section */}
        <div className="flex-1 p-8 overflow-y-auto hide-scrollbar bg-white">
          <div className={`flex items-center gap-3 mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
            />
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
          />

          <RelatedDocuments
            documents={regularDocuments}
            canUpload={canUploadDocument(user, observation)}
            onUpload={() => setShowUploadModal(true)}
            isRTL={isRTL}
          />

          <ActivityTimeline timeline={storeObservation?.timeline || observation.timeline || []} isRTL={isRTL} />
        </div>
      </div>

      {/* Transfer Leadership Modal */}
      <TransferLeadershipModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        onTransfer={handleTransferLeadership}
        assignees={observation.assignees || observation.team || []}
        currentLeaderId={observation.leaderId}
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
