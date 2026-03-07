'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation, type TranslationKey } from '@/i18n'
import type { SaudizationMetrics, TrainingOverviewStats } from '@/types'

interface TrainingManualEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: {
    saudization: Partial<SaudizationMetrics>
    overviewStats: Partial<TrainingOverviewStats>
  }) => void
  currentSaudization: SaudizationMetrics
  currentOverviewStats: TrainingOverviewStats
}

export function TrainingManualEntryModal({ isOpen, onClose, onConfirm, currentSaudization, currentOverviewStats }: TrainingManualEntryModalProps) {
  const { t } = useTranslation()

  const [totalEmployees, setTotalEmployees] = useState('')
  const [saudiEmployees, setSaudiEmployees] = useState('')
  const [saudizationTarget, setSaudizationTarget] = useState('')
  const [overallCompletion, setOverallCompletion] = useState('')
  const [coursesAssigned, setCoursesAssigned] = useState('')
  const [trainingCompleted, setTrainingCompleted] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTotalEmployees(currentSaudization.totalEmployees > 0 ? String(currentSaudization.totalEmployees) : '')
      setSaudiEmployees(currentSaudization.saudiEmployees > 0 ? String(currentSaudization.saudiEmployees) : '')
      setSaudizationTarget(currentSaudization.target > 0 ? String(currentSaudization.target) : '')
      setOverallCompletion(currentOverviewStats.overallCompletion != null ? String(currentOverviewStats.overallCompletion) : '')
      setCoursesAssigned(currentOverviewStats.coursesAssigned != null ? String(currentOverviewStats.coursesAssigned) : '')
      setTrainingCompleted('')
    }
  }, [isOpen, currentSaudization, currentOverviewStats])

  const handleSave = () => {
    const total = parseInt(totalEmployees) || 0
    const saudi = parseInt(saudiEmployees) || 0
    onConfirm({
      saudization: {
        totalEmployees: total,
        saudiEmployees: saudi,
        target: parseFloat(saudizationTarget) || 0,
        actual: total > 0 ? Math.round((saudi / total) * 100) : 0,
        lastDataSource: 'manual',
        lastUpdated: new Date().toISOString(),
      },
      overviewStats: {
        overallCompletion: parseFloat(overallCompletion) || 0,
        coursesAssigned: parseInt(coursesAssigned) || 0,
      },
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('training.manualEntryTitle' as TranslationKey)}
      subtitle={t('training.manualEntrySubtitle' as TranslationKey)}
      size="md"
    >
      <div className="space-y-4">
        <Input
          type="number"
          label={t('training.totalEmployeesLabel' as TranslationKey)}
          value={totalEmployees}
          onChange={(e) => setTotalEmployees(e.target.value)}
          placeholder="0"
          min={0}
        />
        <Input
          type="number"
          label={t('training.saudiEmployeesLabel' as TranslationKey)}
          value={saudiEmployees}
          onChange={(e) => setSaudiEmployees(e.target.value)}
          placeholder="0"
          min={0}
        />
        <Input
          type="number"
          label={t('training.saudizationTarget' as TranslationKey)}
          value={saudizationTarget}
          onChange={(e) => setSaudizationTarget(e.target.value)}
          placeholder="0"
          min={0}
          max={100}
        />
        <Input
          type="number"
          label={t('training.overallCompletionPercent' as TranslationKey)}
          value={overallCompletion}
          onChange={(e) => setOverallCompletion(e.target.value)}
          placeholder="0"
          min={0}
          max={100}
        />
        <Input
          type="number"
          label={t('training.coursesAssigned' as TranslationKey)}
          value={coursesAssigned}
          onChange={(e) => setCoursesAssigned(e.target.value)}
          placeholder="0"
          min={0}
        />
        <Input
          type="number"
          label={t('training.trainingCompletedLabel' as TranslationKey)}
          value={trainingCompleted}
          onChange={(e) => setTrainingCompleted(e.target.value)}
          placeholder="0"
          min={0}
        />

        <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <Icon icon="lucide:info" className="text-slate-500 text-lg mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600">
            {t('training.detailsNotAvailable' as TranslationKey)}
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel' as TranslationKey)}
          </Button>
          <Button onClick={handleSave}>
            <Icon icon="lucide:save" className="text-lg" />
            {t('common.save' as TranslationKey)}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
