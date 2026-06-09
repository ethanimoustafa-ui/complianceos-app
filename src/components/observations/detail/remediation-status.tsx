'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RemediationPlan, RemediationPlanStatus } from '@/types'

interface Document {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RemediationStatusProps {
  plan: RemediationPlan | null | undefined
  /** Reviewer (leader/manager/admin) — may approve/reject a submitted plan. */
  canReview: boolean
  /** Submitter (assignee/leader/admin) — may create/edit/submit the plan. */
  canSubmitPlan?: boolean
  onReview: (approved: boolean, notes?: string) => Promise<void> | void
  /** Open the modal to create a brand-new plan. */
  onCreatePlan?: () => void
  /** Open the modal to edit a draft / revise a rejected plan. */
  onEditPlan?: () => void
  /** Submit the current draft as-is (no edits) for review. */
  onSubmitPlan?: () => Promise<void> | void
  /** Resolve + open a stored document in a new tab. */
  onOpenDocument?: (documentId: string) => Promise<void> | void
  /** Delete a stored document (gated by upload permission). */
  onDeleteDocument?: (documentId: string, documentName: string) => Promise<void> | void
  documents: Document[]
  isRTL: boolean
  /** Render skeleton when the detail GET hasn't resolved yet. */
  isLoaded?: boolean
}

const STATUS_COLORS: Record<RemediationPlanStatus, string> = {
  draft: 'bg-slate-500',
  submitted: 'bg-amber-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-rose-500',
}

function DocumentLinks({
  documents,
  onOpenDocument,
  onDeleteDocument,
}: {
  documents: Document[]
  onOpenDocument?: (id: string) => Promise<void> | void
  onDeleteDocument?: (id: string, name: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [opening, setOpening] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  if (documents.length === 0) return null

  const handleOpen = async (id: string) => {
    if (!onOpenDocument) return
    setOpening(id)
    try {
      await onOpenDocument(id)
    } finally {
      setOpening(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!onDeleteDocument) return
    setDeleting(id)
    try {
      await onDeleteDocument(id, name)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase">{t('observations.detail.planDocuments')}</p>
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-1 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:border-amber-400 transition-all"
        >
          <button
            type="button"
            onClick={() => handleOpen(doc.id)}
            disabled={!onOpenDocument || opening !== null}
            className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer disabled:opacity-70 disabled:cursor-default"
            title={t('observations.detail.openDocument')}
          >
            <Icon
              icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
              className="text-amber-600 shrink-0"
            />
            <span className="text-[10px] font-bold text-amber-800 truncate flex-1">{doc.name}</span>
            <Icon
              icon={opening === doc.id ? 'lucide:loader-2' : 'lucide:external-link'}
              className={`text-amber-500 shrink-0 ${opening === doc.id ? 'animate-spin' : ''}`}
            />
          </button>
          {onDeleteDocument && (
            <button
              type="button"
              onClick={() => handleDelete(doc.id, doc.name)}
              disabled={deleting !== null}
              className="p-1 text-amber-400 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default shrink-0"
              title={t('observations.detail.deleteDocument')}
              aria-label={t('observations.detail.deleteDocument')}
            >
              <Icon
                icon={deleting === doc.id ? 'lucide:loader-2' : 'lucide:trash-2'}
                className={deleting === doc.id ? 'animate-spin' : ''}
              />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export const RemediationStatus = memo(function RemediationStatus({
  plan,
  canReview,
  canSubmitPlan = false,
  onReview,
  onCreatePlan,
  onEditPlan,
  onSubmitPlan,
  onOpenDocument,
  onDeleteDocument,
  documents,
  isLoaded = true,
}: RemediationStatusProps) {
  const { t } = useTranslation()
  const [reviewing, setReviewing] = useState<'approve' | 'reject' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')

  const status = plan?.status
  const isDraft = status === 'draft'
  const isSubmitted = status === 'submitted'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  // Reviewer can act only on a submitted plan.
  const showReviewActions = canReview && isSubmitted

  const handleReview = async (approved: boolean) => {
    setReviewing(approved ? 'approve' : 'reject')
    try {
      await onReview(approved, reviewNotes.trim() || undefined)
      setShowReject(false)
      setReviewNotes('')
    } finally {
      setReviewing(null)
    }
  }

  const handleSubmitDraft = async () => {
    if (!onSubmitPlan) return
    setSubmitting(true)
    try {
      await onSubmitPlan()
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoaded) {
    return (
      <div>
        <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
          {t('observations.detail.remediationPlan')}
        </h4>
        <div className="space-y-2" data-testid="observation-remediation-skeleton" aria-busy="true">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
        {t('observations.detail.remediationPlan')}
      </h4>

      {/* ── No plan yet ─────────────────────────────────────────────── */}
      {!plan ? (
        <div className="space-y-3">
          {documents.length > 0 ? (
            // Flagged remediation docs can exist before a plan row (e.g. a plan
            // write failed after upload). Surface them so they're never stranded.
            <DocumentLinks documents={documents} onOpenDocument={onOpenDocument} onDeleteDocument={onDeleteDocument} />
          ) : (
            <p className="text-xs text-slate-400 italic text-center">{t('observations.detail.noPlanDocuments')}</p>
          )}
          {canSubmitPlan && onCreatePlan && (
            <button
              onClick={onCreatePlan}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Icon icon="lucide:plus-circle" className="text-sm" />
              {t('observations.detail.createRemediationPlan')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 ${STATUS_COLORS[plan.status]} text-white text-[10px] font-black rounded uppercase`}>
              {t(`observations.detail.remediationStatus.${plan.status}`)}
            </span>
          </div>

          {/* Plan card */}
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-900">{plan.title}</p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-3">{plan.description}</p>
          </div>

          {/* Plan documents (viewable) */}
          <DocumentLinks documents={documents} onOpenDocument={onOpenDocument} onDeleteDocument={onDeleteDocument} />

          {/* Review verdict notes (approved/rejected) */}
          {plan.reviewNotes && (isApproved || isRejected) ? (
            <div className={`${isRejected ? 'bg-rose-50' : 'bg-emerald-50'} rounded-lg p-2`}>
              <p className={`text-xs ${isRejected ? 'text-rose-700' : 'text-emerald-700'}`}>
                <span className="font-bold">{t('observations.detail.reviewNotes')}:</span> {plan.reviewNotes}
              </p>
            </div>
          ) : null}

          {/* ── Submitter actions ───────────────────────────────────── */}
          {canSubmitPlan && isDraft && (
            <div className="flex gap-2">
              {onEditPlan && (
                <button
                  onClick={onEditPlan}
                  className="flex-1 h-8 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  {t('common.edit')}
                </button>
              )}
              {onSubmitPlan && (
                <LoadingButton
                  variant="primary"
                  onClick={handleSubmitDraft}
                  loading={submitting}
                  disabled={submitting}
                  className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                >
                  {t('observations.detail.submitForReview')}
                </LoadingButton>
              )}
            </div>
          )}

          {canSubmitPlan && isRejected && onEditPlan && (
            <button
              onClick={onEditPlan}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Icon icon="lucide:rotate-ccw" className="text-sm" />
              {t('observations.detail.reviseResubmit')}
            </button>
          )}

          {/* Pending-review hint for the submitter when they can't review */}
          {isSubmitted && !canReview && (
            <p className="text-xs text-slate-400 italic text-center">
              {t('observations.detail.remediationPendingReviewHint')}
            </p>
          )}

          {/* Awaiting-submission hint for a reviewer looking at someone's draft */}
          {isDraft && !canSubmitPlan && canReview && (
            <p className="text-xs text-slate-400 italic text-center">
              {t('observations.detail.remediationDraftHint')}
            </p>
          )}

          {/* ── Reviewer actions ────────────────────────────────────── */}
          {showReviewActions && (
            <div className="space-y-2">
              {showReject && (
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={t('observations.detail.reviewNotesPlaceholder')}
                  disabled={reviewing !== null}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none disabled:opacity-60"
                />
              )}
              <div className="flex gap-2">
                <LoadingButton
                  variant="primary"
                  onClick={() => handleReview(true)}
                  loading={reviewing === 'approve'}
                  disabled={reviewing !== null}
                  className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                >
                  {t('observations.detail.approvePlan')}
                </LoadingButton>
                {showReject ? (
                  <LoadingButton
                    variant="primary"
                    onClick={() => handleReview(false)}
                    loading={reviewing === 'reject'}
                    disabled={reviewing !== null}
                    className="flex-1 h-8 text-xs bg-rose-600 hover:bg-rose-700"
                  >
                    {t('observations.detail.confirmReject')}
                  </LoadingButton>
                ) : (
                  <button
                    onClick={() => setShowReject(true)}
                    className="flex-1 h-8 text-xs font-bold rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    {t('observations.detail.rejectPlan')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
