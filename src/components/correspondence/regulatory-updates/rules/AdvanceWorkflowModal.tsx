'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'
import type { Circular } from '@/types'

async function notifyAuthority(circ: Circular) {
  const subject = `CAP Submission: ${circ.reference} — ${circ.title}`
  const body = `Dear Authority,\n\nPlease find enclosed the Corrective Action Plan and Remediation Evidence for circular ${circ.reference}.\n\nRegards`
  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)

  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const capFolder = zip.folder('CAP Documents')
    const remFolder = zip.folder('Remediation Evidence')

    ;(circ.capAttachments ?? []).forEach(att => {
      if (att.dataUrl) capFolder?.file(att.name, att.dataUrl.split(',')[1], { base64: true })
    })
    ;(circ.remediationAttachments ?? []).forEach(att => {
      if (att.dataUrl) remFolder?.file(att.name, att.dataUrl.split(',')[1], { base64: true })
    })

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${circ.reference}-evidence.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('ZIP generation failed', err)
  }
}

type Props = {
  isOpen: boolean
  stepId: string
  stepLabel: string
  circularId: string
  onClose: () => void
  isRTL: boolean
  t: (key: any, params?: Record<string, string>) => string
}

export function AdvanceWorkflowModal({ isOpen, stepId, stepLabel, circularId, onClose, isRTL, t }: Props) {
  const { circulars, advanceWorkflowStep } = useCircularStore()
  const [advanceNotes, setAdvanceNotes] = useState('')

  const freshCircular = circulars.find(c => c.id === circularId)
  const confirmStep = freshCircular?.workflowSteps?.find(s => s.id === stepId)
  const actionLabel = confirmStep
    ? (isRTL ? confirmStep.actionLabelAr : confirmStep.actionLabel)
    : t('regulatoryUpdates.advanceStep')
  const requiresNotes = confirmStep?.requiresNotes ?? false

  function handleClose() {
    setAdvanceNotes('')
    onClose()
  }

  function handleStepAction() {
    if (!confirmStep || !freshCircular) return
    // Capture refs before clearing/closing.
    const circ = freshCircular
    const step = confirmStep
    const notes = advanceNotes || undefined

    // Side-effects (mailto + zip download) and the advance call all run in
    // the background. Close-on-click so the modal feels instant; the store
    // applies an optimistic step transition and rolls back on failure.
    if (step.actionType === 'notify-bo') {
      const subject = t('regulatoryUpdates.notifyBoPhase1Subject', { reference: circ.reference })
      const body = t('regulatoryUpdates.notifyBoPhase1Body', {
        reference: circ.reference,
        title: circ.title,
        deadline: circ.capDeadline ?? '—',
      })
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
    } else if (step.actionType === 'notify-authority') {
      void notifyAuthority(circ).catch(() => {})
    }
    setAdvanceNotes('')
    onClose()
    void Promise.resolve(advanceWorkflowStep(circ.id, step.id, notes)).catch(() => {})
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={actionLabel} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          <span className="font-bold">{stepLabel}</span>
        </p>
        {confirmStep?.actionType === 'notify-bo' ? (
          <p className="text-sm text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            {t('regulatoryUpdates.notifyBoModalHint')}
          </p>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {requiresNotes ? t('common.notes') : t('regulatoryUpdates.stepNotes')}
              {requiresNotes && <span className="text-rose-500 ml-1">*</span>}
            </label>
            <textarea
              className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
              value={advanceNotes}
              onChange={(e) => setAdvanceNotes(e.target.value)}
              placeholder={requiresNotes ? t('regulatoryUpdates.notesRequired') : t('regulatoryUpdates.stepNotes')}
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleStepAction}
            disabled={requiresNotes && !advanceNotes.trim()}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
