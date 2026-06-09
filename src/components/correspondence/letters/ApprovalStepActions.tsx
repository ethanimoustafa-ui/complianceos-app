'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { useCan } from '@/lib/permissions'
import { useLetterStore } from '@/stores/letter-store'

// Approval Step Actions Component
export function ApprovalStepActions({
  letterId,
  step,
  approverName,
}: {
  letterId: string
  step: 1 | 2 | 3
  approverName: string
}) {
  const { t, isRTL } = useTranslation()
  const store = useLetterStore()
  const isMutating = useLetterStore((s) => s.isMutating)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  // W40: rejecting REQUIRES a reason (spec story 6) — first click without one
  // opens the notes box with a hint instead of firing an empty rejection.
  const [rejectNeedsReason, setRejectNeedsReason] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const canApprove = useCan('Approve SAMA Letters')

  const handleApprove = async () => {
    // Round 4 Phase 6: store derives approver name from auth user; legacy
    // `approverName` arg dropped. The local `approverName` prop stays for
    // display purposes elsewhere in the component.
    void approverName
    setBusy('approve')
    try {
      await store.approveStep(letterId, step, notes || undefined)
      setNotes('')
      setShowNotes(false)
    } finally {
      setBusy(null)
    }
  }

  const handleReject = async () => {
    if (!notes.trim()) {
      setShowNotes(true)
      setRejectNeedsReason(true)
      return
    }
    setRejectNeedsReason(false)
    setBusy('reject')
    try {
      await store.rejectStep(letterId, step, notes)
      setNotes('')
      setShowNotes(false)
    } finally {
      setBusy(null)
    }
  }

  const isBusy = busy !== null || isMutating

  return (
    <div className={`ml-9 space-y-2 ${isRTL ? 'mr-9 ml-0' : ''}`}>
      {showNotes && (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('letters.addNotes')}
            rows={2}
            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
          />
          {rejectNeedsReason && !notes.trim() && (
            <p className="text-[10px] text-rose-600 font-medium">
              {t('letters.rejectReasonRequired')}
            </p>
          )}
        </>
      )}
      <div className={`flex gap-2`}>
        <button
          onClick={handleApprove}
          disabled={!canApprove || isBusy}
          aria-busy={busy === 'approve' || undefined}
          title={canApprove ? '' : t('rbac.deniedTooltip')}
          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {busy === 'approve' && <Icon icon="lucide:loader-2" className="animate-spin text-xs" />}
          {t('letters.approveStep')}
        </button>
        <button
          onClick={handleReject}
          disabled={!canApprove || isBusy}
          aria-busy={busy === 'reject' || undefined}
          title={canApprove ? '' : t('rbac.deniedTooltip')}
          className="flex-1 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {busy === 'reject' && <Icon icon="lucide:loader-2" className="animate-spin text-xs" />}
          {t('letters.rejectStep')}
        </button>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          title={t('letters.addNotes')}
        >
          <Icon icon="lucide:message-square" />
        </button>
      </div>
    </div>
  )
}
