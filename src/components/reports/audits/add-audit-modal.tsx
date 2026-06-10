'use client'

import { useState, useEffect, useMemo } from 'react'
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
import type { Audit, AuditAuthority, AuditCategory, ReviewSchedule, RegulatoryBodyId } from '@/types'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview } from '@/lib/review-schedule'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useEntityTemplateStore } from '@/stores/entity-template-store'
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
  const { create, isMutating } = useAuditStore()
  const { members } = useTeamStore()
  // W43: member.department is a department UUID — resolve it to a name
  // (the picker rendered "Khalid Al-Harbi - d07fc34b-…" otherwise).
  const departments = useDepartmentStore((s) => s.departments)
  const deptName = (id: string | undefined) =>
    (id && departments.find((d) => d.id === id)?.name) || ''
  const currentUser = useAuthStore((state) => state.user)
  const { templates: auditTemplates, incrementUsage } = useAuditTemplateStore()
  // M2: entity-template store for saving current form as a reusable template.
  const { fetchByType: fetchAuditEntityTemplates, saveTemplate: saveAuditEntityTemplate } = useEntityTemplateStore()
  const [showSaveAuditTemplateForm, setShowSaveAuditTemplateForm] = useState(false)
  const [auditTemplateNameInput, setAuditTemplateNameInput] = useState('')
  const [isSavingAuditTemplate, setIsSavingAuditTemplate] = useState(false)
  useEffect(() => {
    if (isOpen) void fetchAuditEntityTemplates('audit')
  }, [isOpen, fetchAuditEntityTemplates])
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
    getValues,
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
    setShowSaveAuditTemplateForm(false)
    setAuditTemplateNameInput('')
    onClose()
  }

  // M2: save current form values as a reusable entity template.
  async function handleSaveAuditTemplate() {
    if (!auditTemplateNameInput.trim()) return
    setIsSavingAuditTemplate(true)
    try {
      const currentValues = getValues()
      await saveAuditEntityTemplate('audit', auditTemplateNameInput.trim(), undefined, {
        title: currentValues.title ?? '',
        type: selectedType,
        category: currentValues.category,
        priority: currentValues.priority,
        frequency: currentValues.frequency,
        description: currentValues.description ?? '',
      })
      setAuditTemplateNameInput('')
      setShowSaveAuditTemplateForm(false)
    } finally {
      setIsSavingAuditTemplate(false)
    }
  }

  return (
    // W43: lg (not xl) — the 2-col grid floated in whitespace at xl width.
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
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
              <EditableSelect
                locked
                value={selectedTemplateId || null}
                onChange={(id) => handleTemplateSelect(id)}
                items={[
                  { id: '', label: t('settings.noTemplate') },
                  ...auditTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.name })),
                ]}
                isRTL={isRTL}
              />
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

        {/* Footer — W43: one compact row (save-as-template left, actions
            right) instead of the stacked layout where the template input
            stretched across the whole (xl) modal width. */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
          {/* M2: Save current form as entity template */}
          {showSaveAuditTemplateForm ? (
            <div className="flex items-center gap-2 max-w-sm flex-1">
              <input
                type="text"
                autoFocus
                className="flex-1 min-w-0 h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder={t('regulatoryUpdates.templateNamePlaceholder' as any)}
                value={auditTemplateNameInput}
                onChange={(e) => setAuditTemplateNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveAuditTemplate()
                  if (e.key === 'Escape') setShowSaveAuditTemplateForm(false)
                }}
              />
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                onClick={() => void handleSaveAuditTemplate()}
                disabled={isSavingAuditTemplate || !auditTemplateNameInput.trim()}
              >
                {isSavingAuditTemplate ? (
                  <Icon icon="lucide:loader-2" className="animate-spin text-sm" />
                ) : (
                  t('regulatoryUpdates.saveTemplateConfirm' as any)
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setShowSaveAuditTemplateForm(false); setAuditTemplateNameInput('') }}
                className="text-slate-400 hover:text-slate-600"
              >
                <Icon icon="lucide:x" className="text-sm" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveAuditTemplateForm(true)}
              className="text-xs text-slate-500 hover:text-emerald-700 flex items-center gap-1.5 transition-colors"
            >
              <Icon icon="lucide:save" className="text-[13px]" />
              {t('regulatoryUpdates.saveAsTemplate' as any)}
            </button>
          )}
          <div className="flex justify-end gap-3 shrink-0">
            <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
              {t('common.cancel')}
            </Button>
            <LoadingButton
              variant="primary"
              loading={isMutating}
              loadingLabel={t('auditDetail.creating')}
              onClick={handleSubmit(onSubmit)}
            >
              {t('auditDetail.createAudit')}
            </LoadingButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
