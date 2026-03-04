'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useAuditStore } from '@/stores/audit-store'
import { useTeamStore } from '@/stores/team-store'
import { useAuthStore } from '@/stores/auth-store'
import { useTranslation } from '@/i18n'
import type { Audit, AuditCategory, AuditFrequency, AuditPriority } from '@/types'

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.enum(['internal', 'sama', 'sharia']),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  dueDate: z.string().min(1, 'Due date is required'),
  assigneeId: z.string().min(1, 'Lead author is required'),
  description: z.string().optional(),
  category: z.enum(['security_compliance', 'financial_compliance', 'regulatory_compliance', 'operational_compliance', 'hr_compliance', 'sharia_compliance']).optional(),
  frequency: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'ad_hoc']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
})

type AuditFormData = z.infer<typeof auditSchema>

interface EditAuditModalProps {
  isOpen: boolean
  onClose: () => void
  audit: Audit | null
  onSuccess?: (audit: Audit) => void
  calculatedProgress?: number
}

export function EditAuditModal({ isOpen, onClose, audit, onSuccess, calculatedProgress }: EditAuditModalProps) {
  const { t } = useTranslation()
  const { update, isLoading } = useAuditStore()
  const { members } = useTeamStore()
  const currentUser = useAuthStore((state) => state.user)

  const auditTypes = [
    { id: 'internal' as const, label: t('auditDetail.internalAuditType'), icon: 'lucide:clipboard-check', color: 'blue' },
    { id: 'sama' as const, label: t('auditDetail.samaAuditType'), icon: 'lucide:landmark', color: 'emerald' },
    { id: 'sharia' as const, label: t('auditDetail.shariaAuditType'), icon: 'lucide:moon', color: 'amber' },
  ]
  const [selectedType, setSelectedType] = useState<'internal' | 'sama' | 'sharia'>('internal')

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema),
    defaultValues: {
      title: '',
      type: 'internal',
      status: 'pending',
      dueDate: '',
      assigneeId: '',
      description: '',
      category: undefined,
      frequency: undefined,
      priority: undefined,
    },
  })

  useEffect(() => {
    if (audit) {
      reset({
        title: audit.title,
        type: audit.type,
        status: audit.status,
        dueDate: audit.dueDate,
        assigneeId: audit.assignee?.id || '',
        description: audit.description || '',
        category: audit.category,
        frequency: audit.frequency,
        priority: audit.priority,
      })
      setSelectedType(audit.type)
    }
  }, [audit, reset])

  const handleTypeSelect = (type: 'internal' | 'sama' | 'sharia') => {
    setSelectedType(type)
    setValue('type', type)
  }

  const onSubmit = async (data: AuditFormData) => {
    if (!audit) return

    try {
      // Find the selected assignee from team members or current user
      let selectedAssignee = members.find((m) => m.id === data.assigneeId)
      if (!selectedAssignee && currentUser && currentUser.id === data.assigneeId) {
        selectedAssignee = {
          ...currentUser,
          status: 'active' as const,
          joinedAt: new Date().toISOString(),
        }
      }

      const updatedAudit = await update(audit.id, {
        title: data.title,
        type: data.type,
        status: data.status,
        dueDate: data.dueDate,
        description: data.description,
        category: data.category,
        frequency: data.frequency,
        priority: data.priority,
        assignee: selectedAssignee
          ? {
              id: selectedAssignee.id,
              name: selectedAssignee.name,
              email: selectedAssignee.email,
              role: selectedAssignee.role,
              department: selectedAssignee.department,
              workload: selectedAssignee.workload,
            }
          : audit.assignee,
      })
      onSuccess?.(updatedAudit)
      handleClose()
    } catch (error) {
      console.error('Failed to update audit:', error)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!audit) return null

  // Display progress (calculated from tasks if available, otherwise from audit)
  const displayProgress = calculatedProgress ?? audit.progress

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{t('auditDetail.editAuditTitle')}</h2>
              <p className="text-sm text-slate-500">{t('auditDetail.editAuditSubtitle')}</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Audit Type Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                {t('auditDetail.auditTypeLabel')}
              </label>
              <div className="grid grid-cols-3 gap-4">
                {auditTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={cn(
                      'p-4 border rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer',
                      selectedType === type.id
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                    )}
                  >
                    <Icon
                      icon={type.icon}
                      className={cn(
                        'text-3xl',
                        type.color === 'blue' && 'text-blue-600',
                        type.color === 'emerald' && 'text-emerald-600',
                        type.color === 'amber' && 'text-amber-600'
                      )}
                    />
                    <span className="text-sm font-bold text-slate-900">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.auditTitleLabel')}
                </label>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder={t('auditDetail.auditTitlePlaceholder')}
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.title ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.title && (
                  <p className="text-rose-500 text-xs mt-1">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.dueDateLabel')}
                </label>
                <Controller
                  name="dueDate"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="date"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.dueDate ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.dueDate && (
                  <p className="text-rose-500 text-xs mt-1">{errors.dueDate.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.statusLabel')}
                </label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="pending">{t('auditDetail.pending')}</option>
                      <option value="in_progress">{t('auditDetail.inProgress')}</option>
                      <option value="completed">{t('auditDetail.completed')}</option>
                      <option value="overdue">{t('auditDetail.overdue')}</option>
                    </select>
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.categoryLabel')}
                </label>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{t('auditDetail.selectCategory')}</option>
                      <option value="security_compliance">{t('auditDetail.categorySecurityCompliance')}</option>
                      <option value="financial_compliance">{t('auditDetail.categoryFinancialCompliance')}</option>
                      <option value="regulatory_compliance">{t('auditDetail.categoryRegulatoryCompliance')}</option>
                      <option value="operational_compliance">{t('auditDetail.categoryOperationalCompliance')}</option>
                      <option value="hr_compliance">{t('auditDetail.categoryHrCompliance')}</option>
                      <option value="sharia_compliance">{t('auditDetail.categoryShariahCompliance')}</option>
                    </select>
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.frequencyLabel')}
                </label>
                <Controller
                  name="frequency"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{t('auditDetail.selectFrequency')}</option>
                      <option value="annual">{t('auditDetail.frequencyAnnual')}</option>
                      <option value="semi_annual">{t('auditDetail.frequencySemiAnnual')}</option>
                      <option value="quarterly">{t('auditDetail.frequencyQuarterly')}</option>
                      <option value="monthly">{t('auditDetail.frequencyMonthly')}</option>
                      <option value="ad_hoc">{t('auditDetail.frequencyAdHoc')}</option>
                    </select>
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.priority')}
                </label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">{t('auditDetail.selectPriority')}</option>
                      <option value="critical">{t('auditDetail.priorityCritical')}</option>
                      <option value="high">{t('auditDetail.priorityHigh')}</option>
                      <option value="medium">{t('auditDetail.priorityMedium')}</option>
                      <option value="low">{t('auditDetail.priorityLow')}</option>
                    </select>
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.leadAuthorLabel')}
                </label>
                <Controller
                  name="assigneeId"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.assigneeId ? 'border-rose-300' : 'border-slate-200'
                      )}
                    >
                      <option value="">{t('auditDetail.selectLeadAuthor')}</option>
                      {currentUser && (
                        <option value={currentUser.id}>{currentUser.name} {t('auditDetail.youSuffix')}</option>
                      )}
                      {members
                        .filter((m) => m.id !== currentUser?.id)
                        .map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name} - {member.department}
                          </option>
                        ))}
                    </select>
                  )}
                />
                {errors.assigneeId && (
                  <p className="text-rose-500 text-xs mt-1">{errors.assigneeId.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.progressAutoCalculated')}
                </label>
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl">
                  <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${displayProgress}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700 min-w-[3rem] text-right">
                    {displayProgress}%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {t('auditDetail.progressCalculatedFromTasks')}
                </p>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.scopeDescription')}
                </label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={3}
                      placeholder={t('auditDetail.scopePlaceholder')}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
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
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('auditDetail.saving')}
              </>
            ) : (
              t('auditDetail.saveChanges')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
