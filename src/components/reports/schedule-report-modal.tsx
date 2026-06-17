'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useReportStore } from '@/stores/report-store'
import type { Report, ReportType, ReportFormat, ReportPeriod } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'
import { pushToast } from '@/stores/toast-store'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

// Simple email shape check for the comma-separated recipients field.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const reportSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  type: z.enum(['compliance', 'audit', 'risk', 'observation', 'sama', 'custom']),
  format: z.enum(['pdf', 'excel', 'word', 'csv']),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'custom']),
  // Validation messages carry i18n keys (resolved to copy via t() at render).
  recipients: z
    .string()
    .min(1, 'errors.required')
    .refine(
      (val) =>
        val
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
          .every((r) => EMAIL_RE.test(r)),
      'errors.reports.recipientsInvalid'
    ),
  scheduledFor: z.string().optional(),
})

type ReportFormData = z.infer<typeof reportSchema>

interface ScheduleReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (report: Report) => void
}

const reportTypes: { id: ReportType; label: string; icon: string }[] = [
  { id: 'compliance', label: 'Compliance', icon: 'lucide:shield-check' },
  { id: 'audit', label: 'Audit', icon: 'lucide:clipboard-check' },
  { id: 'risk', label: 'Risk', icon: 'lucide:alert-triangle' },
  { id: 'observation', label: 'Observation', icon: 'lucide:eye' },
  { id: 'sama', label: 'SAMA', icon: 'lucide:landmark' },
  { id: 'custom', label: 'Custom', icon: 'lucide:settings' },
]

const reportFormats: { id: ReportFormat; label: string; icon: string }[] = [
  { id: 'pdf', label: 'PDF', icon: 'lucide:file-text' },
  { id: 'excel', label: 'Excel', icon: 'lucide:file-spreadsheet' },
  { id: 'word', label: 'Word', icon: 'lucide:file' },
  { id: 'csv', label: 'CSV', icon: 'lucide:file-code' },
]

const reportPeriods: { id: ReportPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annual' },
  { id: 'custom', label: 'Custom Range' },
]

export function ScheduleReportModal({ isOpen, onClose, onSuccess }: ScheduleReportModalProps) {
  const { create, isLoading } = useReportStore()
  const { t } = useTranslation()
  const [selectedType, setSelectedType] = useState<ReportType>('compliance')
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf')

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ReportFormData>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      name: '',
      type: 'compliance',
      format: 'pdf',
      period: 'monthly',
      recipients: '',
      scheduledFor: '',
    },
  })

  const handleTypeSelect = (type: ReportType) => {
    setSelectedType(type)
    setValue('type', type)
  }

  const handleFormatSelect = (format: ReportFormat) => {
    setSelectedFormat(format)
    setValue('format', format)
  }

  const onSubmit = async (data: ReportFormData) => {
    try {
      const reportData = {
        name: data.name,
        type: data.type,
        format: data.format,
        period: data.period,
        status: 'scheduled' as const,
        recipients: data.recipients.split(',').map((r) => r.trim()),
        scheduledFor: data.scheduledFor,
      }

      const newReport = await create(reportData)
      onSuccess?.(newReport)
      handleClose()
    } catch (error) {
      console.error('Failed to schedule report:', error)
      // Surface the failure and keep the modal open so the user can retry.
      pushToast({ key: 'errors.reports.scheduleFailed' }, 'error')
    }
  }

  const handleClose = () => {
    reset()
    setSelectedType('compliance')
    setSelectedFormat('pdf')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Schedule Report</h2>
              <p className="text-sm text-slate-500">
                Configure and schedule automated report generation.
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Report Type */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Report Type
              </label>
              <div className="grid grid-cols-3 gap-3">
                {reportTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={cn(
                      'p-3 border-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer',
                      selectedType === type.id
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-emerald-400'
                    )}
                  >
                    <Icon icon={type.icon} className="text-xl text-slate-600" />
                    <span className="text-sm font-bold text-slate-900">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Report Name */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Report Name
              </label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    placeholder="e.g., Q1 Compliance Status Report"
                    className={cn(
                      'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                      errors.name ? 'border-rose-300' : 'border-slate-200'
                    )}
                  />
                )}
              />
              {errors.name && (
                <p className="text-rose-500 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Format & Period */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                  Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {reportFormats.map((format) => (
                    <button
                      key={format.id}
                      type="button"
                      onClick={() => handleFormatSelect(format.id)}
                      className={cn(
                        'p-3 border-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer',
                        selectedFormat === format.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:border-emerald-400'
                      )}
                    >
                      <Icon icon={format.icon} className="text-lg text-slate-600" />
                      <span className="text-xs font-bold text-slate-900">{format.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Reporting Period
                </label>
                <Controller
                  name="period"
                  control={control}
                  render={({ field }) => (
                    <EditableSelect
                      locked
                      value={field.value}
                      onChange={(id) => field.onChange(id)}
                      items={reportPeriods.map((period) => ({ id: period.id, label: period.label }))}
                    />
                  )}
                />
              </div>
            </div>

            {/* Recipients & Schedule */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Recipients (comma separated)
                </label>
                <Controller
                  name="recipients"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="email1@company.com, email2@company.com"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.recipients ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.recipients && (
                  <p className="text-rose-500 text-xs mt-1">
                    {t(errors.recipients.message as TranslationKey)}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Schedule For (optional)
                </label>
                <Controller
                  name="scheduledFor"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="datetime-local"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleSubmit(onSubmit)} disabled={isLoading}>
            <Icon icon="lucide:play" />
            Generate Now
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Icon icon="lucide:calendar" />
                Schedule Report
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
