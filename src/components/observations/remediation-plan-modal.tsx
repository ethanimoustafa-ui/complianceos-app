'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

interface RemediationPlanModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (plan: { title: string; description: string; dueDate: string }) => void
  observationDueDate?: string
}

export function RemediationPlanModal({
  isOpen,
  onClose,
  onSubmit,
  observationDueDate,
}: RemediationPlanModalProps) {
  const { t, isRTL } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    // Validate
    if (!title.trim()) {
      setError(t('observations.detail.remediationTitleRequired'))
      return
    }
    if (!description.trim()) {
      setError(t('observations.detail.remediationDescriptionRequired'))
      return
    }
    if (!dueDate) {
      setError(t('observations.detail.remediationDueDateRequired'))
      return
    }

    // Validate due date is before observation due date
    if (observationDueDate) {
      const planDate = new Date(dueDate)
      const obsDate = new Date(observationDueDate)
      if (planDate >= obsDate) {
        setError(t('observations.detail.remediationDueDateMustBeBefore'))
        return
      }
    }

    onSubmit({ title: title.trim(), description: description.trim(), dueDate })
    handleClose()
  }

  const handleClose = () => {
    setTitle('')
    setDescription('')
    setDueDate('')
    setError('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="p-6">
        <div className={`flex items-center gap-3 mb-6`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Icon icon="lucide:clipboard-check" className="text-emerald-600 text-xl" />
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <h2 className="text-lg font-bold text-slate-900">
              {t('observations.detail.submitRemediationPlan')}
            </h2>
            <p className="text-sm text-slate-500">
              {t('observations.detail.submitRemediationPlanDescription')}
            </p>
          </div>
        </div>

        {error && (
          <div className={`mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-sm text-rose-700`}>
            <Icon icon="lucide:alert-circle" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.remediationTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError('')
              }}
              placeholder={t('observations.detail.remediationTitlePlaceholder')}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>

          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.remediationDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setError('')
              }}
              placeholder={t('observations.detail.remediationDescriptionPlaceholder')}
              rows={4}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${isRTL ? 'text-right' : ''}`}
            />
          </div>

          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.planDueDate')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                setError('')
              }}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
            {observationDueDate && (
              <p className={`text-xs text-slate-400 mt-1 ${isRTL ? 'text-right' : ''}`}>
                {t('observations.detail.mustBeBeforeObservationDue', { date: observationDueDate })}
              </p>
            )}
          </div>
        </div>

        <div className={`flex gap-3 mt-6`}>
          <Button variant="ghost" onClick={handleClose} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} className="flex-1">
            {t('common.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
