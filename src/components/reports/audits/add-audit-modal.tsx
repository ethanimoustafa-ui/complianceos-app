'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { useTranslation, type TranslationKey } from '@/i18n'
import type { Audit, AuditAuthority, AuditCategory, AuditFrequency, AuditPriority, ReviewSchedule, RegulatoryBodyId } from '@/types'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview } from '@/lib/review-schedule'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useFrameworkConfigStore, frameworkIconTextClass } from '@/stores/framework-config-store'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { EditableSelect } from '@/components/ui/editable-select'

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.string().min(1, 'Audit type is required'),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  assigneeId: z.string().min(1, 'Lead author is required'),
  scope: z.string().optional(),
  description: z.string().optional(),
  // AuditCategory widened to string — accept any opaque id (default seed or
  // user-added). Empty string still treated as "no category".
  category: z.string().optional(),
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
  // Editable audit categories
  const auditCategoryItems = useAuditCategoryStore((s) => s.categories)
  const addAuditCategory = useAuditCategoryStore((s) => s.add)
  const updateAuditCategory = useAuditCategoryStore((s) => s.update)
  const removeAuditCategory = useAuditCategoryStore((s) => s.remove)
  // Select the stable `frameworks` array reference, then derive with useMemo.
  // Zustand selectors must return referentially stable values — filtering inline
  // produces a new array each render and triggers getServerSnapshot warnings
  // plus infinite update loops.
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const enabledCorrespondence = useMemo(
    () => frameworks.filter((f) => f.enabled && f.correspondenceBased),
    [frameworks]
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  // Dynamic audit-type cards: a fixed "Internal" option plus every enabled
  // correspondence-based framework configured in settings.
  const auditTypes = useMemo(
    () => [
      { id: 'internal', label: t('auditDetail.internalAuditType'), icon: 'lucide:clipboard-check', iconClass: 'text-blue-600' },
      ...enabledCorrespondence.map((fw) => ({
        id: fw.id,
        label: isRTL ? fw.nameAr : fw.name,
        icon: fw.icon,
        iconClass: frameworkIconTextClass(fw.iconColor),
      })),
    ],
    [enabledCorrespondence, t, isRTL]
  )
  const [selectedType, setSelectedType] = useState<string>('internal')
  const [schedule, setSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>([])

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

  const handleTypeSelect = (type: string) => {
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
        type: data.type as AuditAuthority,
        status: data.status,
        dueDate: computeNextReview(schedule),
        progress: 0,
        description: data.description,
        category: data.category,
        frequency: data.frequency,
        priority: data.priority,
        reviewSchedule: schedule,
        frameworkIds,
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
    setFrameworkIds([])
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

            {/* Audit Type Selection — dynamic from enabled correspondence authorities */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                {t('auditDetail.auditTypeLabel')}
              </label>
              {auditTypes.length === 1 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {t('auditDetail.noAuthoritiesEnabled' as TranslationKey)}
                </p>
              ) : null}
              <div className="grid grid-cols-4 gap-3">
                {auditTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={cn(
                      'p-3 border rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer',
                      selectedType === type.id
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                    )}
                  >
                    <Icon icon={type.icon} className={cn('text-2xl', type.iconClass)} />
                    <span className="text-xs font-bold text-slate-900">{type.label}</span>
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
                    <EditableSelect
                      value={field.value || null}
                      onChange={(id) => field.onChange(id || undefined)}
                      items={auditCategoryItems}
                      placeholder={t('auditDetail.selectCategory')}
                      onAdd={(label, labelAr) => addAuditCategory(label, labelAr)}
                      onEdit={(id, label, labelAr) => updateAuditCategory(id, { label, labelAr })}
                      onDelete={(id) => removeAuditCategory(id)}
                      isRTL={isRTL}
                    />
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

              <div className="col-span-2">
                <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" selfAssessmentOnly />
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
