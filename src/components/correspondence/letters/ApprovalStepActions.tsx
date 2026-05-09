'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { useCan } from '@/lib/permissions'
import { useSAMALetterStore } from '@/stores/sama-letter-store'

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
  const store = useSAMALetterStore()
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const canApprove = useCan('Approve SAMA Letters')

  const handleApprove = () => {
    // Round 4 Phase 6: store derives approver name from auth user; legacy
    // `approverName` arg dropped. The local `approverName` prop stays for
    // display purposes elsewhere in the component.
    void approverName
    store.approveStep(letterId, step, notes || undefined)
    setNotes('')
    setShowNotes(false)
  }

  const handleReject = () => {
    store.rejectStep(letterId, step, notes)
    setNotes('')
    setShowNotes(false)
  }

  return (
    <div className={`ml-9 space-y-2 ${isRTL ? 'mr-9 ml-0' : ''}`}>
      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('samaLetters.addNotes')}
          rows={2}
          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
        />
      )}
      <div className={`flex gap-2`}>
        <button
          onClick={handleApprove}
          disabled={!canApprove}
          title={canApprove ? '' : t('rbac.deniedTooltip')}
          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('samaLetters.approveStep')}
        </button>
        <button
          onClick={handleReject}
          disabled={!canApprove}
          title={canApprove ? '' : t('rbac.deniedTooltip')}
          className="flex-1 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('samaLetters.rejectStep')}
        </button>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          title={t('samaLetters.addNotes')}
        >
          <Icon icon="lucide:message-square" />
        </button>
      </div>
    </div>
  )
}
