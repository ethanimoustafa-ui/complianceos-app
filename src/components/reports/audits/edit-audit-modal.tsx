'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useAuditStore } from '@/stores/audit-store'
import { useTeamStore } from '@/stores/team-store'
import { useAuthStore } from '@/stores/auth-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useTranslation, type TranslationKey } from '@/i18n'
import type { Audit, AuditAuthority, ReviewSchedule, RegulatoryBodyId } from '@/types'
import { pushToast } from '@/stores/toast-store'
import { ApiClientError } from '@/lib/api-client'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview } from '@/lib/review-schedule'
import { useFrameworkConfigStore, frameworkIconTextClass } from '@/stores/framework-config-store'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { EditableSelect } from '@/components/ui/editable-select'

// Surface the FIRST Zod issue from a 400 (e.g. "title: …") instead of a generic
// fallback, so the user knows exactly which field to fix. Falls back to the
// supplied message for network / unknown failures.
function apiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) {
    const details = e.details as Array<{ message?: string; path?: Array<string | number> }> | undefined
    const first = Array.isArray(details) ? details[0] : undefined
    if (first?.message) {
      const path = Array.isArray(first.path) && first.path.length > 0 ? `${first.path.join('.')}: ` : ''
      return `${path}${first.message}`
    }
    return e.message
  }
  return e instanceof Error && e.message ? e.message : fallback
}

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.string().min(1, 'Audit type is required'),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  dueDate: z.string().min(1, 'Due date is required'),
  assigneeId: z.string().min(1, 'Lead author is required'),
  description: z.string().optional(),
  // AuditCategory widened to string — accept any opaque id (default seed or user-added).
  category: z.string().optional(),
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
  const { t, isRTL } = useTranslation()
  const { update, isMutating } = useAuditStore()
  const { members } = useTeamStore()
  // W43: member.department is a department UUID — resolve it to a name
  // (the picker rendered "Khalid Al-Harbi - d07fc34b-…" otherwise).
  const departments = useDepartmentStore((s) => s.departments)
  const deptName = (id: string | undefined) =>
    (id && departments.find((d) => d.id === id)?.name) || ''
  const currentUser = useAuthStore((state) => state.user)
  // Select stable framework list, then derive with useMemo. Filtering or
  // lookups inside the Zustand selector produce new objects each render
  // and trigger infinite loops via getServerSnapshot.
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const enabledCorrespondence = useMemo(
    () => frameworks.filter((f) => f.enabled && f.correspondenceBased),
    [frameworks]
  )
  // Editable audit categories
  const auditCategoryItems = useAuditCategoryStore((s) => s.categories)
  const addAuditCategory = useAuditCategoryStore((s) => s.add)
  const updateAuditCategory = useAuditCategoryStore((s) => s.update)
  const removeAuditCategory = useAuditCategoryStore((s) => s.remove)

  // Always include the authority of the audit being edited, even if it was
  // since disabled — users shouldn't lose their selection mid-edit.
  const auditTypes = useMemo(() => {
    const existingType =
      audit && audit.type !== 'internal'
        ? frameworks.find((f) => f.id === audit.type)
        : undefined
    return [
      { id: 'internal', label: t('auditDetail.internalAuditType'), icon: 'lucide:clipboard-check', iconClass: 'text-blue-600' },
      ...enabledCorrespondence.map((fw) => ({
        id: fw.id,
        label: isRTL ? fw.nameAr : fw.name,
        icon: fw.icon,
        iconClass: frameworkIconTextClass(fw.iconColor),
      })),
      ...(existingType && !enabledCorrespondence.some((f) => f.id === existingType.id)
        ? [{
            id: existingType.id,
            label: isRTL ? existingType.nameAr : existingType.name,
            icon: existingType.icon,
            iconClass: frameworkIconTextClass(existingType.iconColor),
          }]
        : []),
    ]
  }, [audit, frameworks, enabledCorrespondence, t, isRTL])
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
      setSchedule(audit.reviewSchedule ?? { cadence: 'yearly', dayOfMonth: 1 })
      if (audit.frameworkIds) setFrameworkIds(audit.frameworkIds)
    }
  }, [audit, reset])

  const handleTypeSelect = (type: string) => {
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

      // W47: cadence is the authoritative frequency input (same as create).
      const cadenceToFrequency: Record<string, AuditFormData['frequency']> = {
        yearly: 'annual',
        'semi-annual': 'semi_annual',
        quarterly: 'quarterly',
        monthly: 'monthly',
        adhoc: 'ad_hoc',
      }
      const updatedAudit = await update(audit.id, {
        title: data.title,
        type: data.type as AuditAuthority,
        status: data.status,
        dueDate: computeNextReview(schedule),
        description: data.description,
        category: data.category,
        frequency: cadenceToFrequency[schedule.cadence] ?? data.frequency,
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
          : audit.assignee,
      })
      onSuccess?.(updatedAudit)
      handleClose()
    } catch (error) {
      console.error('Failed to update audit:', error)
      // Surface the failure (the store rolls back / re-throws but never toasts)
      // so the user knows the change didn't save; modal stays open to retry.
      pushToast(apiErrorMessage(error, t('errors.auditModals.updateFailed' as TranslationKey)), 'error')
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
    // W43: lg (not xl) — match AddAuditModal.
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
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
                    <EditableSelect
                      locked
                      value={field.value}
                      onChange={(id) => field.onChange(id)}
                      items={[
                        { id: 'pending', label: t('auditDetail.pending') },
                        { id: 'in_progress', label: t('auditDetail.inProgress') },
                        { id: 'completed', label: t('auditDetail.completed') },
                        { id: 'overdue', label: t('auditDetail.overdue') },
                      ]}
                      isRTL={isRTL}
                    />
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
                    <EditableSelect
                      locked
                      value={field.value || null}
                      onChange={(id) => field.onChange(id || undefined)}
                      items={[
                        { id: 'critical', label: t('auditDetail.priorityCritical') },
                        { id: 'high', label: t('auditDetail.priorityHigh') },
                        { id: 'medium', label: t('auditDetail.priorityMedium') },
                        { id: 'low', label: t('auditDetail.priorityLow') },
                      ]}
                      placeholder={t('auditDetail.selectPriority')}
                      isRTL={isRTL}
                    />
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
                    <EditableSelect
                      locked
                      value={field.value || null}
                      onChange={(id) => field.onChange(id)}
                      items={[
                        ...(currentUser
                          ? [{ id: currentUser.id, label: `${currentUser.name} ${t('auditDetail.youSuffix')}` }]
                          : []),
                        ...members
                          .filter((m) => m.id !== currentUser?.id)
                          .map((member) => {
                            const dept = deptName(member.department)
                            return {
                              id: member.id,
                              label: dept ? `${member.name} — ${dept}` : member.name,
                            }
                          }),
                      ]}
                      placeholder={t('auditDetail.selectLeadAuthor')}
                      isRTL={isRTL}
                    />
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

              <div className="col-span-2">
                <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" selfAssessmentOnly />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
            {t('common.cancel')}
          </Button>
          <LoadingButton
            variant="primary"
            loading={isMutating}
            loadingLabel={t('auditDetail.saving')}
            onClick={handleSubmit(onSubmit)}
          >
            {t('auditDetail.saveChanges')}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
