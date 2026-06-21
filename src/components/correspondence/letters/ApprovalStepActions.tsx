'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { canApproveLetter } from '@/lib/permissions'
import { callerMeetsStepRole } from '@/lib/letter-approval-roles'
import { useAuthStore } from '@/stores/auth-store'
import { useLetterStore } from '@/stores/letter-store'

// Approval Step Actions Component
export function ApprovalStepActions({
  letterId,
  step,
  approverName,
  stepRole,
}: {
  letterId: string
  step: number
  approverName: string
  /** The chain step's role title (e.g. "Department Head") — gates by tier. */
  stepRole?: string
}) {
  const { t, isRTL } = useTranslation()
  const store = useLetterStore()
  const isMutating = useLetterStore((s) => s.isMutating)
  const user = useAuthStore((s) => s.user)
  // Subscribe to backend permission keys so the gate re-renders the instant a
  // 'workflow:advance' grant changes (canApproveLetter reads them via getState()).
  useAuthStore((s) => s.permissions)
  // Ownership model: read the letter's creator id from the store so the gate can
  // compare it against the auth user — the per-step Approve/Reject buttons mirror
  // the server's canDriveWorkflow(ctx, created_by) on /approve-step + /reject-step.
  const letter = useLetterStore((s) => s.byId[letterId])
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  // W40: rejecting REQUIRES a reason (spec story 6) — first click without one
  // opens the notes box with a hint instead of firing an empty rejection.
  const [rejectNeedsReason, setRejectNeedsReason] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  // Ownership model: the per-step verdict is gated on workflow:advance OR being
  // the letter's creator (NOT the generic 'edit' that officers hold). Hidden —
  // not disabled — for everyone the server would 403. See the FLAG in the
  // approve-step route re: chain-role enforcement (not enforced here either).
  // Separation of duties: the per-step Approve/Reject also require the caller's
  // role to satisfy THIS step's role (mirrors the approve-step/reject-step routes).
  const canApprove = canApproveLetter(user, letter) && callerMeetsStepRole(user?.role, stepRole)

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
        {/* Approve/Reject only show for the step's actual approver — hidden, not
            disabled, for everyone else (the user shouldn't see a button they
            can't use). The busy state still disables them while a save is in flight. */}
        {canApprove && (
          <>
            <button
              onClick={handleApprove}
              disabled={isBusy}
              aria-busy={busy === 'approve' || undefined}
              className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {busy === 'approve' && <Icon icon="lucide:loader-2" className="animate-spin text-xs" />}
              {t('letters.approveStep')}
            </button>
            <button
              onClick={handleReject}
              disabled={isBusy}
              aria-busy={busy === 'reject' || undefined}
              className="flex-1 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {busy === 'reject' && <Icon icon="lucide:loader-2" className="animate-spin text-xs" />}
              {t('letters.rejectStep')}
            </button>
            {/* Notes feed the approve/reject flow — only the approver needs it. */}
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              title={t('letters.addNotes')}
            >
              <Icon icon="lucide:message-square" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
