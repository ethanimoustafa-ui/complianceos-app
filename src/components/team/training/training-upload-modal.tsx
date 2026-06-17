'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload'
import { useTranslation, type TranslationKey } from '@/i18n'
import type { SaudizationMetrics, TrainingOverviewStats } from '@/types'

interface TrainingUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: {
    saudization?: Partial<SaudizationMetrics>
    overviewStats?: Partial<TrainingOverviewStats>
  }) => void
}

type Stage = 'file-select' | 'confirm'

interface ParsedData {
  totalEmployees: number
  saudiEmployees: number
  saudizationRate: number
  trainingRequired: number
  trainingCompleted: number
  completionRate: number
}

const defaultParsed: ParsedData = {
  totalEmployees: 450,
  saudiEmployees: 172,
  saudizationRate: 38.2,
  trainingRequired: 450,
  trainingCompleted: 351,
  completionRate: 78,
}

export function TrainingUploadModal({ isOpen, onClose, onConfirm }: TrainingUploadModalProps) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<Stage>('file-select')
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [categories, setCategories] = useState({
    saudization: false,
    trainingList: false,
    employeeDetails: false,
  })
  const [parsed, setParsed] = useState<ParsedData>(defaultParsed)
  const [editing, setEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<keyof ParsedData, string>>({} as Record<keyof ParsedData, string>)

  const atLeastOneSelected = categories.saudization || categories.trainingList || categories.employeeDetails

  const toggleEdit = () => {
    if (!editing) {
      const ev = {} as Record<keyof ParsedData, string>
      for (const key of Object.keys(parsed) as (keyof ParsedData)[]) {
        ev[key] = String(parsed[key])
      }
      setEditValues(ev)
    }
    setEditing(e => !e)
  }

  const handleUploadAndParse = () => {
    setParsed(defaultParsed)
    setEditing(false)
    setStage('confirm')
  }

  const handleConfirmAndSave = () => {
    const finalData = editing
      ? Object.fromEntries(
          Object.entries(editValues).map(([k, v]) => [k, parseFloat(v) || 0])
        ) as unknown as ParsedData
      : parsed
    onConfirm({
      saudization: {
        totalEmployees: finalData.totalEmployees,
        saudiEmployees: finalData.saudiEmployees,
        actual: finalData.saudizationRate,
        lastDataSource: 'file-upload',
        lastUpdated: new Date().toISOString(),
      },
      overviewStats: {
        overallCompletion: finalData.completionRate,
        coursesAssigned: finalData.trainingRequired,
      },
    })
    handleClose()
  }

  const handleClose = () => {
    setStage('file-select')
    setFiles([])
    setCategories({ saudization: false, trainingList: false, employeeDetails: false })
    setParsed(defaultParsed)
    setEditing(false)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('training.uploadFileTitle' as TranslationKey)}
      subtitle={t('training.uploadFileSubtitle' as TranslationKey)}
      size="lg"
    >
      {stage === 'file-select' && (
        <div className="space-y-6">
          <FileUpload
            accept=".xlsx,.xls,.csv,.pdf,.doc,.docx"
            multiple
            files={files}
            onChange={setFiles}
          />

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              {t('training.selectDataType' as TranslationKey)}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={categories.saudization}
                  onChange={(e) => setCategories((p) => ({ ...p, saudization: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  {t('training.saudizationMetricsCheckbox' as TranslationKey)}
                </span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={categories.trainingList}
                  onChange={(e) => setCategories((p) => ({ ...p, trainingList: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  {t('training.trainingListCheckbox' as TranslationKey)}
                </span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={categories.employeeDetails}
                  onChange={(e) => setCategories((p) => ({ ...p, employeeDetails: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  {t('training.employeeDetailsCheckbox' as TranslationKey)}
                </span>
              </label>
            </div>
            {!atLeastOneSelected && (
              <p className="text-xs text-rose-500 mt-2">
                {t('errors.misc.selectDataTypeToUpload' as TranslationKey)}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleClose}>
              {t('common.cancel' as TranslationKey)}
            </Button>
            <Button
              onClick={handleUploadAndParse}
              disabled={files.length === 0 || !atLeastOneSelected}
            >
              <Icon icon="lucide:upload" className="text-lg" />
              {t('training.uploadAndParse' as TranslationKey)}
            </Button>
          </div>
        </div>
      )}

      {stage === 'confirm' && (
        <div className="space-y-6">
          <p className="text-sm font-semibold text-slate-700">
            {t('training.parsedDataPreview' as TranslationKey)}
          </p>

          <div className="grid grid-cols-2 gap-4">
            {([
              ['totalEmployees', 'training.totalEmployeesLabel'],
              ['saudiEmployees', 'training.saudiEmployeesLabel'],
              ['saudizationRate', 'training.saudizationRateLabel'],
              ['trainingRequired', 'training.trainingRequiredLabel'],
              ['trainingCompleted', 'training.trainingCompletedLabel'],
              ['completionRate', 'training.completionRateLabel'],
            ] as const).map(([field, labelKey]) => (
              <div key={field} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-medium text-slate-500 mb-1">
                  {t(labelKey as TranslationKey)}
                </p>
                {editing ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editValues[field] ?? ''}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <p className="text-lg font-bold text-slate-900">
                    {field === 'saudizationRate' || field === 'completionRate'
                      ? `${parsed[field]}%`
                      : parsed[field]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Icon icon="lucide:alert-triangle" className="text-amber-600 text-lg mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">{t('training.verifyNumbers' as TranslationKey)}</p>
              <p className="text-xs mt-0.5 text-amber-700">
                {t('training.aiParsingComingSoon' as TranslationKey)}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleClose}>
              {t('common.cancel' as TranslationKey)}
            </Button>
            <Button
              variant="outline"
              onClick={toggleEdit}
            >
              <Icon icon="lucide:pencil" className="text-lg" />
              {t('training.editManually' as TranslationKey)}
            </Button>
            <Button onClick={handleConfirmAndSave}>
              <Icon icon="lucide:check" className="text-lg" />
              {t('training.confirmAndSave' as TranslationKey)}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
