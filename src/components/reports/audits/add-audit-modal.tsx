'use client'

import { useState, useEffect } from 'react'
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
import type { Audit, AuditCategory, AuditFrequency, AuditPriority, ReviewSchedule } from '@/types'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview } from '@/lib/review-schedule'
import { useAuditTemplateStore } from '@/stores/audit-template-store'

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.enum(['internal', 'sama', 'sharia']),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  dueDate: z.string().min(1, 'Due date is required'),
  assigneeId: z.string().min(1, 'Lead author is required'),
  scope: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(['security_compliance', 'financial_compliance', 'regulatory_compliance', 'operational_compliance', 'hr_compliance', 'sharia_compliance']).optional(),
  frequency: z.enum(['annual', 'semi_annual', 'quarterly', 'monthly', 'ad_hoc']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
})

type AuditFormData = z.infer<typeof auditSchema>

interface AddAuditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (audit: Audit) => void
  initialValues?: Partial<AuditFormData>
}

export function AddAuditModal({ isOpen, onClose, onSuccess, initialValues }: AddAuditModalProps) {
  const { t, isRTL } = useTranslation()
  const { create, isLoading } = useAuditStore()
  const { members } = useTeamStore()
  const currentUser = useAuthStore((state) => state.user)
  const { templates: auditTemplates, incrementUsage } = useAuditTemplateStore()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  const auditTypes = [
    { id: 'internal' as const, label: t('auditDetail.internalAuditType'), icon: 'lucide:clipboard-check', color: 'blue' },
    { id: 'sama' as const, label: t('auditDetail.samaAuditType'), icon: 'lucide:landmark', color: 'emerald' },
    { id: 'sharia' as const, label: t('auditDetail.shariaAuditType'), icon: 'lucide:moon', color: 'amber' },
  ]
  const [selectedType, setSelectedType] = useState<'internal' | 'sama' | 'sharia'>('internal')
  const [schedule, setSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })

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
      scope: '',
      description: '',
      category: undefined,
      frequency: undefined,
      priority: undefined,
    },
  })

  useEffect(() => {
    if (initialValues) {
      reset({
        title: initialValues.title || '',
        type: initialValues.type || 'internal',
        status: initialValues.status || 'pending',
        dueDate: initialValues.dueDate || '',
        assigneeId: initialValues.assigneeId || '',
        scope: initialValues.scope || '',
        description: initialValues.description || '',
        category: initialValues.category,
        frequency: initialValues.frequency,
        priority: initialValues.priority,
      })
      if (initialValues.type) {
        setSelectedType(initialValues.type)
      }
    }
  }, [initialValues, isOpen, reset])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) return
    const tmpl = auditTemplates.find((t) => t.id === templateId)
    if (!tmpl) return
    setValue('title', tmpl.defaultTitle)
    setValue('description', tmpl.defaultDescription)
    setValue('category', tmpl.category.replace(/-/g, '_') as AuditCategory)
    setValue('priority', tmpl.priority)
    setValue('frequency', tmpl.frequency)
    setSelectedType(tmpl.auditType)
    setValue('type', tmpl.auditType)
  }

  const handleTypeSelect = (type: 'internal' | 'sama' | 'sharia') => {
    setSelectedType(type)
    setValue('type', type)
  }

  const onSubmit = async (data: AuditFormData) => {
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

      const auditData = {
        title: data.title,
        type: data.type,
        status: data.status,
        dueDate: computeNextReview(schedule),
        progress: 0,
        description: data.description,
        category: data.category,
        frequency: data.frequency,
        priority: data.priority,
        reviewSchedule: schedule,
        assignee: selectedAssignee
          ? {
              id: selectedAssignee.id,
              name: selectedAssignee.name,
              email: selectedAssignee.email,
              role: selectedAssignee.role,
              department: selectedAssignee.department,
              workload: selectedAssignee.workload,
            }
          : {
              id: data.assigneeId,
              name: 'Unknown',
              email: '',
              role: 'officer' as const,
              department: '',
              workload: 0,
            },
      }

      const newAudit = await create(auditData)
      if (selectedTemplateId) incrementUsage(selectedTemplateId)
      onSuccess?.(newAudit)
      handleClose()
    } catch (error) {
      console.error('Failed to create audit:', error)
    }
  }

  const handleClose = () => {
    reset()
    setSelectedType(initialValues?.type || 'internal')
    setSelectedTemplateId('')
    setSchedule({ cadence: 'yearly', dayOfMonth: 1 })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{t('auditDetail.createAuditTitle')}</h2>
              <p className="text-sm text-slate-500">
                {t('auditDetail.createAuditSubtitle')}
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Template Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                {t('settings.selectTemplate')}
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">{t('settings.noTemplate')}</option>
                {auditTemplates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
                ))}
              </select>
            </div>

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
                  {t('reviewSchedule.computedNextReview')}
                </label>
                <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium">
                  {computeNextReview(schedule)}
                </div>
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

              <div className="col-span-2">
                <ReviewSchedulePicker value={schedule} onChange={setSchedule} t={t} isRTL={isRTL} />
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
                {t('auditDetail.creating')}
              </>
            ) : (
              t('auditDetail.createAudit')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
