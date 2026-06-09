'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { LoadingButton } from '@/components/ui/loading-button'
import type { ObservationStatus, ClosureRequest, ClosureReview } from '@/types'

export interface ClosureStatusProps {
  status: ObservationStatus
  closureRequest: ClosureRequest | null | undefined
  closureReview: ClosureReview | null | undefined
  canRequestClosure: boolean
  canReviewClosure: boolean
  /** Gate: closure can only be requested once the remediation plan is approved. */
  remediationApproved: boolean
  onRequestClosure: (notes?: string) => Promise<void> | void
  onReviewClosure: (approved: boolean, notes?: string) => Promise<void> | void
  onReopen?: () => Promise<void> | void
  isRTL: boolean
}

export const ClosureStatus = memo(function ClosureStatus({
  status,
  closureRequest,
  closureReview,
  canRequestClosure,
  canReviewClosure,
  remediationApproved,
  onRequestClosure,
  onReviewClosure,
  onReopen,
}: ClosureStatusProps) {
  const { t } = useTranslation()
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [requestNotes, setRequestNotes] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [reviewingClosure, setReviewingClosure] = useState<'approve' | 'reject' | null>(null)
  const [reopening, setReopening] = useState(false)

  // BUG-O08 fix: show Request Closure for open AND in_progress.
  // W37: closure is gated on an APPROVED remediation plan — the work must be
  // verified before it can be closed. (The leader is no longer blocked from
  // requesting; the reviewer of the closure is still a separate gate below.)
  // 'remediated' (plan approved, awaiting closure) is the primary state from
  // which closure is requested.
  const isActive = status === 'open' || status === 'in_progress' || status === 'remediated'
  const showRequestButton = isActive && canRequestClosure && !closureRequest && remediationApproved
  // Explain WHY the button is hidden when the plan isn't approved yet.
  const showNeedsApprovedPlanHint =
    isActive && canRequestClosure && !closureRequest && !remediationApproved

  const showReviewSection = status === 'resolved' && closureRequest && canReviewClosure
  const showPendingInfo = status === 'resolved' && closureRequest
  const showClosedInfo = status === 'closed' && closureReview

  const handleRequestSubmit = async () => {
    setSubmittingRequest(true)
    try {
      await onRequestClosure(requestNotes || undefined)
      setShowRequestForm(false)
      setRequestNotes('')
    } finally {
      setSubmittingRequest(false)
    }
  }

  const handleReviewSubmit = async (approved: boolean) => {
    setReviewingClosure(approved ? 'approve' : 'reject')
    try {
      await onReviewClosure(approved, reviewNotes || undefined)
      setShowReviewForm(false)
      setReviewNotes('')
    } finally {
      setReviewingClosure(null)
    }
  }

  // BUG-O09 fix: reopen
  const handleReopen = async () => {
    if (!onReopen) return
    setReopening(true)
    try {
      await onReopen()
    } finally {
      setReopening(false)
    }
  }

  return (
    <div>
      <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
        {t('observations.detail.closureStatus')}
      </h4>

      {showRequestButton && !showRequestForm && (
        <button
          onClick={() => setShowRequestForm(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Icon icon="lucide:check-circle" className="text-lg" />
          {t('observations.detail.requestClosure')}
        </button>
      )}

      {showNeedsApprovedPlanHint && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <Icon icon="lucide:lock" className="text-slate-400 text-sm mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500">{t('observations.detail.closureNeedsApprovedPlan')}</p>
        </div>
      )}

      {showRequestForm && (
        <div className="space-y-3">
          <textarea
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
            placeholder={t('observations.detail.closureNotesPlaceholder')}
            disabled={submittingRequest}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
            rows={3}
          />
          <div className="flex gap-2">
            <LoadingButton variant="primary" onClick={handleRequestSubmit} loading={submittingRequest} className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700">
              {t('observations.detail.submitRequest')}
            </LoadingButton>
            <button onClick={() => { setShowRequestForm(false); setRequestNotes('') }} disabled={submittingRequest} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {showPendingInfo && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-amber-500 text-white text-[10px] font-black rounded uppercase">
              {t('observations.detail.pendingReview')}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">
              {t('observations.detail.closureRequestedBy', { name: closureRequest.requestedByName || 'User' })}
            </p>
            {closureRequest.notes && <p className="text-sm text-slate-700 mt-2">{closureRequest.notes}</p>}
          </div>

          {showReviewSection && !showReviewForm && (
            <div className="flex gap-2">
              <button onClick={() => setShowReviewForm(true)} className="flex-1 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">
                {t('observations.detail.reviewClosure')}
              </button>
            </div>
          )}

          {showReviewForm && (
            <div className="space-y-3 mt-3">
              <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder={t('observations.detail.reviewNotesPlaceholder')} disabled={reviewingClosure !== null} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60" rows={2} />
              <div className="flex gap-2">
                <LoadingButton variant="primary" onClick={() => handleReviewSubmit(true)} loading={reviewingClosure === 'approve'} disabled={reviewingClosure !== null} className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                  {t('observations.detail.approveClosure')}
                </LoadingButton>
                <LoadingButton variant="primary" onClick={() => handleReviewSubmit(false)} loading={reviewingClosure === 'reject'} disabled={reviewingClosure !== null} className="flex-1 h-8 text-xs bg-rose-600 hover:bg-rose-700">
                  {t('observations.detail.rejectClosure')}
                </LoadingButton>
              </div>
              <button onClick={() => { setShowReviewForm(false); setReviewNotes('') }} disabled={reviewingClosure !== null} className="w-full px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-50">
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {showClosedInfo && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-emerald-500 text-white text-[10px] font-black rounded uppercase">
              {t('observations.detail.verifiedClosed')}
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-700">
              {t('observations.detail.closureApprovedBy', { name: closureReview.reviewedByName || 'Reviewer' })}
            </p>
            {closureReview.notes && <p className="text-sm text-emerald-800 mt-2">{closureReview.notes}</p>}
          </div>
          {onReopen && (
            <LoadingButton variant="primary" onClick={handleReopen} loading={reopening} className="w-full h-8 text-xs bg-slate-600 hover:bg-slate-700">
              <Icon icon="lucide:rotate-ccw" className="text-sm mr-1" />
              {t('observations.detail.reopenObservation')}
            </LoadingButton>
          )}
        </div>
      )}

      {status === 'closed' && !showClosedInfo && onReopen && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-slate-500 text-white text-[10px] font-black rounded uppercase">{t('observations.detail.closed')}</span>
          </div>
          <LoadingButton variant="primary" onClick={handleReopen} loading={reopening} className="w-full h-8 text-xs bg-slate-600 hover:bg-slate-700">
            <Icon icon="lucide:rotate-ccw" className="text-sm mr-1" />
            Reopen Observation
          </LoadingButton>
        </div>
      )}

      {status === 'in_progress' && !canRequestClosure && !closureRequest && (
        <p className="text-xs text-slate-400 italic text-center">
          {t('observations.detail.workInProgress')}
        </p>
      )}
    </div>
  )
})
