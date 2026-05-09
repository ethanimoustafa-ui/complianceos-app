'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { ObservationStatus, ClosureRequest, ClosureReview } from '@/types'

export interface ClosureStatusProps {
  status: ObservationStatus
  closureRequest: ClosureRequest | null | undefined
  closureReview: ClosureReview | null | undefined
  canRequestClosure: boolean
  canReviewClosure: boolean
  onRequestClosure: (notes?: string) => void
  onReviewClosure: (approved: boolean, notes?: string) => void
  isRTL: boolean
}

export const ClosureStatus = memo(function ClosureStatus({
  status,
  closureRequest,
  closureReview,
  canRequestClosure,
  canReviewClosure,
  onRequestClosure,
  onReviewClosure,
}: ClosureStatusProps) {
  const { t } = useTranslation()
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [requestNotes, setRequestNotes] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  // Show "Request Closure" button when status is in_progress and user can request
  const showRequestButton = status === 'in_progress' && canRequestClosure && !closureRequest

  // Show closure review section when status is resolved (Pending Review) and user can review
  const showReviewSection = status === 'resolved' && closureRequest && canReviewClosure

  // Show closure request info when status is resolved (pending review)
  const showPendingInfo = status === 'resolved' && closureRequest

  // Show closure result when status is closed
  const showClosedInfo = status === 'closed' && closureReview

  const handleRequestSubmit = () => {
    onRequestClosure(requestNotes || undefined)
    setShowRequestForm(false)
    setRequestNotes('')
  }

  const handleReviewSubmit = (approved: boolean) => {
    onReviewClosure(approved, reviewNotes || undefined)
    setShowReviewForm(false)
    setReviewNotes('')
  }

  // Don't render anything if observation is open
  if (status === 'open') return null

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.closureStatus')}
      </h4>

      {/* Request Closure Button */}
      {showRequestButton && !showRequestForm && (
        <button
          onClick={() => setShowRequestForm(true)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors`}
        >
          <Icon icon="lucide:check-circle" className="text-lg" />
          {t('observations.detail.requestClosure')}
        </button>
      )}

      {/* Request Closure Form */}
      {showRequestForm && (
        <div className="space-y-3">
          <textarea
            value={requestNotes}
            onChange={(e) => setRequestNotes(e.target.value)}
            placeholder={t('observations.detail.closureNotesPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
          <div className={`flex gap-2`}>
            <button
              onClick={handleRequestSubmit}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('observations.detail.submitRequest')}
            </button>
            <button
              onClick={() => {
                setShowRequestForm(false)
                setRequestNotes('')
              }}
              className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Pending Closure Info */}
      {showPendingInfo && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2`}>
            <span className="px-2 py-1 bg-amber-500 text-white text-[10px] font-black rounded uppercase">
              {t('observations.detail.pendingReview')}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">
              {t('observations.detail.closureRequestedBy', { name: closureRequest.requestedByName || 'User' })}
            </p>
            {closureRequest.notes && (
              <p className="text-sm text-slate-700 mt-2">{closureRequest.notes}</p>
            )}
          </div>

          {/* Review Buttons (for leader/manager) */}
          {showReviewSection && !showReviewForm && (
            <div className={`flex gap-2`}>
              <button
                onClick={() => setShowReviewForm(true)}
                className="flex-1 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
              >
                {t('observations.detail.reviewClosure')}
              </button>
            </div>
          )}

          {/* Review Form */}
          {showReviewForm && (
            <div className="space-y-3 mt-3">
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={t('observations.detail.reviewNotesPlaceholder')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
              <div className={`flex gap-2`}>
                <button
                  onClick={() => handleReviewSubmit(true)}
                  className="flex-1 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  {t('observations.detail.approveClosure')}
                </button>
                <button
                  onClick={() => handleReviewSubmit(false)}
                  className="flex-1 px-3 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors"
                >
                  {t('observations.detail.rejectClosure')}
                </button>
              </div>
              <button
                onClick={() => {
                  setShowReviewForm(false)
                  setReviewNotes('')
                }}
                className="w-full px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Closed Status Info */}
      {showClosedInfo && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2`}>
            <span className="px-2 py-1 bg-emerald-500 text-white text-[10px] font-black rounded uppercase">
              {t('observations.detail.verifiedClosed')}
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-xs text-emerald-700">
              {t('observations.detail.closureApprovedBy', { name: closureReview.reviewedByName || 'Reviewer' })}
            </p>
            {closureReview.notes && (
              <p className="text-sm text-emerald-800 mt-2">{closureReview.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* In Progress - no closure request yet */}
      {status === 'in_progress' && !canRequestClosure && !closureRequest && (
        <p className="text-xs text-slate-400 italic text-center">
          {t('observations.detail.workInProgress')}
        </p>
      )}
    </div>
  )
})
