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
import type { Audit, AuditAuthority, AuditCategory, ReviewSchedule, RegulatoryBodyId, AuditTemplate, AuditFrequency, FrequencySchedule, TemplateAttachment } from '@/types'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview } from '@/lib/review-schedule'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useEntityTemplateStore } from '@/stores/entity-template-store'
import { useFrameworkConfigStore, frameworkIconTextClass } from '@/stores/framework-config-store'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { FieldLabel } from '@/components/ui/field-label'
import { FileUpload, type UploadedFile } from '@/components/ui/file-upload'
import { formatBytes } from '@/lib/format'
import { pushToast } from '@/stores/toast-store'

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

// Template mode relaxes the audit-only requirements: a template has no assignee
// and no live status. Everything else (title, category, cadence, frameworks) is
// shared with the audit create flow.
const auditTemplateSchema = auditSchema.extend({
  assigneeId: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']).optional(),
})

// AuditFrequency ↔ ReviewCadence bridges. The cadence picker is the form's only
// schedule input; templates persist an AuditFrequency + FrequencySchedule.
const CADENCE_TO_FREQUENCY: Record<string, AuditFrequency> = {
  yearly: 'annual', 'semi-annual': 'semi_annual', quarterly: 'quarterly', monthly: 'monthly', adhoc: 'ad_hoc',
}
const FREQUENCY_TO_CADENCE: Record<string, ReviewSchedule['cadence']> = {
  annual: 'yearly', semi_annual: 'semi-annual', quarterly: 'quarterly', monthly: 'monthly', ad_hoc: 'adhoc',
}

// Derive a ReviewSchedule (cadence picker value) from a template's stored
// frequency + frequencySchedule so selecting/editing a template seeds the
// cadence — previously the picker stayed at its default and silently discarded
// the template's frequency on submit.
function scheduleFromFrequency(
  frequency: AuditFrequency | undefined,
  fs: { dayOfMonth?: number; adhocDate?: string } | undefined,
): ReviewSchedule {
  const cadence = FREQUENCY_TO_CADENCE[frequency ?? 'annual'] ?? 'yearly'
  if (cadence === 'adhoc') return { cadence, adhocDate: fs?.adhocDate ?? '' }
  return { cadence, dayOfMonth: fs?.dayOfMonth ?? 1 }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface AddAuditModalProps {
  isOpen: boolean
  onClose: () => void
  // W54: may return a promise (list refetch) — the submit spinner awaits it.
  onSuccess?: (audit: Audit) => void | Promise<unknown>
  initialValues?: Partial<AuditFormData> & {
    // W48: reschedule carries the full picture forward.
    reviewSchedule?: ReviewSchedule
    frameworkIds?: RegulatoryBodyId[]
  }
  // Owner: Settings "Audit Templates" reuses THIS rich modal (template dropdown,
  // cadence, frameworks + a real file upload) instead of a stripped-down form.
  // In 'template' mode the modal saves an AuditTemplate (to the same store
  // Settings lists) rather than creating an audit.
  mode?: 'audit' | 'template'
  /** Edit target when `mode === 'template'`. */
  template?: AuditTemplate
  /** Fired after a template is created/updated (so the caller can close). */
  onTemplateSaved?: () => void
}

export function AddAuditModal({ isOpen, onClose, onSuccess, initialValues, mode = 'audit', template, onTemplateSaved }: AddAuditModalProps) {
  const { t, isRTL } = useTranslation()
  const isTemplate = mode === 'template'
  const { create, isMutating } = useAuditStore()
  const { members } = useTeamStore()
  // W43: member.department is a department UUID — resolve it to a name
  // (the picker rendered "Khalid Al-Harbi - d07fc34b-…" otherwise).
  const departments = useDepartmentStore((s) => s.departments)
  const deptName = (id: string | undefined) =>
    (id && departments.find((d) => d.id === id)?.name) || ''
  const currentUser = useAuthStore((state) => state.user)
  const { templates: auditTemplates, incrementUsage } = useAuditTemplateStore()
  // Template-mode persistence targets the SAME store Settings → Audit Templates
  // lists, so a saved template shows up there immediately (owner request).
  const createAuditTemplate = useAuditTemplateStore((s) => s.create)
  const updateAuditTemplate = useAuditTemplateStore((s) => s.update)
  // Reference documents for template mode — persisted inside the template's
  // frequency_schedule jsonb (see FrequencySchedule.attachments).
  const [attachments, setAttachments] = useState<TemplateAttachment[]>([])
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  // M2: entity-template store for saving current form as a reusable template.
  // Entity-template store kept for backward-compat: existing `et-` templates
  // still list/rename/delete here. New "save as template" now writes to the
  // audit_templates store (see handleSaveAuditTemplate) so it shows in Settings.
  const { fetchByType: fetchAuditEntityTemplates, renameTemplate: renameAuditEntityTemplate, deleteTemplate: deleteAuditEntityTemplate } = useEntityTemplateStore()
  // W45: saved entity templates surface IN the Select Template dropdown
  // (policy-modal parity) — previously they were saved but never listed.
  // Select the stable map, derive with useMemo — `?? []` inside the selector
  // mints a new array every render (getSnapshot infinite-loop signature).
  const entityTemplatesByType = useEntityTemplateStore((s) => s.byType)
  const auditEntityTemplates = useMemo(
    () => entityTemplatesByType['audit'] ?? [],
    [entityTemplatesByType],
  )
  const [showSaveAuditTemplateForm, setShowSaveAuditTemplateForm] = useState(false)
  const [auditTemplateNameInput, setAuditTemplateNameInput] = useState('')
  const [isSavingAuditTemplate, setIsSavingAuditTemplate] = useState(false)
  useEffect(() => {
    if (isOpen) {
      void fetchAuditEntityTemplates('audit')
      // W49: hydrate categories so a prefilled category (reschedule) renders
      // its label instead of a raw UUID.
      void useAuditCategoryStore.getState().fetchAll()
    }
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
  // W54: spans create + usage tracking + the caller's refetch.
  const [submitBusy, setSubmitBusy] = useState(false)
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
    // Template mode validates with the relaxed schema (assignee/status optional)
    // but the form's field type stays AuditFormData — cast so zodResolver keeps
    // returning Resolver<AuditFormData>.
    resolver: zodResolver((isTemplate ? auditTemplateSchema : auditSchema) as typeof auditSchema),
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
      // W48: cadence + frameworks carry forward on reschedule.
      if (initialValues.reviewSchedule) setSchedule(initialValues.reviewSchedule)
      if (initialValues.frameworkIds) setFrameworkIds(initialValues.frameworkIds)
    }
  }, [initialValues, isOpen, reset])

  // Template mode: prefill from the edit target, or blank-reset on create.
  useEffect(() => {
    if (!isTemplate || !isOpen) return
    if (template) {
      reset({
        title: template.defaultTitle || template.name || '',
        type: template.auditType || 'internal',
        status: 'pending',
        assigneeId: '',
        scope: '',
        description: template.defaultDescription || '',
        category: template.category,
        frequency: template.frequency,
        priority: template.priority,
      })
      setSelectedType(template.auditType || 'internal')
      setSchedule(scheduleFromFrequency(template.frequency, template.frequencySchedule))
      setFrameworkIds(template.framework ? [template.framework] : [])
      setAttachments(template.frequencySchedule?.attachments ?? [])
    } else {
      reset({
        title: '', type: 'internal', status: 'pending', assigneeId: '',
        scope: '', description: '', category: undefined, frequency: undefined, priority: undefined,
      })
      setSelectedType('internal')
      setSchedule({ cadence: 'yearly', dayOfMonth: 1 })
      setFrameworkIds([])
      setAttachments([])
    }
    setSelectedTemplateId('')
  }, [isTemplate, template, isOpen, reset])

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) return
    // W45: user-saved entity templates (prefixed ids) apply their saved fields.
    if (templateId.startsWith('et-')) {
      const et = auditEntityTemplates.find((x) => `et-${x.id}` === templateId)
      if (!et) return
      const f = et.fields as Partial<{
        title: string; type: string; category: string; priority: string; frequency: string; description: string
      }>
      if (f.title) setValue('title', f.title)
      if (f.description !== undefined) setValue('description', f.description ?? '')
      if (f.category) setValue('category', f.category as AuditCategory)
      if (f.priority) setValue('priority', f.priority as AuditFormData['priority'])
      if (f.frequency) {
        setValue('frequency', f.frequency as AuditFormData['frequency'])
        setSchedule(scheduleFromFrequency(f.frequency as AuditFrequency, undefined))
      }
      if (f.type) {
        setSelectedType(f.type)
        setValue('type', f.type)
      }
      return
    }
    const tmpl = auditTemplates.find((t) => t.id === templateId)
    if (!tmpl) return
    setValue('title', tmpl.defaultTitle)
    setValue('description', tmpl.defaultDescription)
    // Category: unified templates store the audit-category id directly (matches a
    // dropdown option). Legacy seeded templates store a hyphenated enum → fall
    // back to the underscore form only when there's no direct match.
    const directMatch = auditCategoryItems.some((c) => c.id === tmpl.category)
    setValue('category', (directMatch ? tmpl.category : tmpl.category.replace(/-/g, '_')) as AuditCategory)
    setValue('priority', tmpl.priority)
    setValue('frequency', tmpl.frequency)
    // W47-fix: seed the cadence picker from the template so the created audit's
    // frequency + schedule reflect the template instead of the picker default
    // (the picker is the authoritative frequency at submit; an unseeded picker
    // silently discarded the template's frequency).
    setSchedule(scheduleFromFrequency(tmpl.frequency, tmpl.frequencySchedule))
    setSelectedType(tmpl.auditType)
    setValue('type', tmpl.auditType)
  }

  const handleTypeSelect = (type: string) => {
    setSelectedType(type)
    setValue('type', type)
  }

  // Template mode: persist an AuditTemplate (create or edit) into the same
  // store Settings lists, then let the caller close.
  const saveTemplate = async (data: AuditFormData) => {
    setIsSavingTemplate(true)
    try {
      const frequency = CADENCE_TO_FREQUENCY[schedule.cadence] ?? data.frequency ?? 'annual'
      const frequencySchedule: FrequencySchedule = {
        ...(schedule.cadence === 'adhoc'
          ? { adhocDate: schedule.adhocDate }
          : { dayOfMonth: schedule.dayOfMonth ?? 1 }),
        ...(template?.frequencySchedule?.templateIcon
          ? { templateIcon: template.frequencySchedule.templateIcon }
          : {}),
        attachments,
      }
      const payload = {
        name: data.title,
        nameAr: undefined,
        auditType: data.type as AuditAuthority,
        category: (data.category ?? 'custom') as AuditTemplate['category'],
        priority: (data.priority ?? 'medium') as AuditTemplate['priority'],
        frequency,
        frequencySchedule,
        defaultTitle: data.title,
        // The API requires a non-empty description — fall back to the title.
        defaultDescription: data.description?.trim() || data.title,
        defaultChecklistItems: template?.defaultChecklistItems ?? [],
        defaultTeamRoles: template?.defaultTeamRoles ?? [],
        framework: (frameworkIds[0] as RegulatoryBodyId | undefined) ?? template?.framework,
        status: 'active' as const,
      }
      if (template) await updateAuditTemplate(template.id, payload)
      else await createAuditTemplate(payload)
      pushToast(
        t((template ? 'settings.templateUpdated' : 'settings.templateCreated') as TranslationKey),
        'success',
      )
      onTemplateSaved?.()
      handleClose()
    } catch {
      pushToast(t('settings.templateSaveFailed' as TranslationKey), 'error')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const onSubmit = async (data: AuditFormData) => {
    if (isTemplate) {
      await saveTemplate(data)
      return
    }
    // W54: one busy flag spans the WHOLE sequence (create + usage tracking +
    // the caller's refetch) — the store's isMutating drops as soon as the
    // POST resolves, leaving a visible spinner-less gap before close.
    setSubmitBusy(true)
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

      // W45: the form has no separate frequency control — derive it from the
      // review-schedule cadence so the detail page's Frequency field sticks.
      const cadenceToFrequency: Record<string, AuditFormData['frequency']> = {
        yearly: 'annual',
        'semi-annual': 'semi_annual',
        quarterly: 'quarterly',
        monthly: 'monthly',
        adhoc: 'ad_hoc',
      }
      const auditData = {
        title: data.title,
        type: data.type as AuditAuthority,
        status: data.status,
        dueDate: computeNextReview(schedule),
        progress: 0,
        description: data.description,
        category: data.category,
        // W47: the cadence picker is the AUTHORITATIVE frequency input — a
        // template-prefilled form value must not override the user's cadence.
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
      // W45: usage tracking only applies to legacy seeded templates —
      // entity-template ids carry the `et-` prefix.
      if (selectedTemplateId && !selectedTemplateId.startsWith('et-')) incrementUsage(selectedTemplateId)
      // W54: await the caller's follow-up (list refetch) so the spinner
      // covers it instead of the UI shifting a beat after close.
      await Promise.resolve(onSuccess?.(newAudit))
      handleClose()
    } catch (error) {
      console.error('Failed to create audit:', error)
    } finally {
      setSubmitBusy(false)
    }
  }

  const handleClose = () => {
    reset()
    setSelectedType(initialValues?.type || 'internal')
    setSelectedTemplateId('')
    setSchedule({ cadence: 'yearly', dayOfMonth: 1 })
    setFrameworkIds([])
    setAttachments([])
    setShowSaveAuditTemplateForm(false)
    setAuditTemplateNameInput('')
    onClose()
  }

  // Append newly-dropped files (as data URLs) to the template's attachments.
  const handleFilesAdded = async (incoming: UploadedFile[]) => {
    const added = await Promise.all(
      incoming
        .filter((f) => f.file)
        .map(async (f) => ({ name: f.name, size: f.size, dataUrl: await readFileAsDataUrl(f.file!) })),
    )
    if (added.length) setAttachments((prev) => [...prev, ...added])
  }

  // "Save as template" from the create-audit dropdown footer. Persists to the
  // SAME audit_templates store Settings lists (was entity_templates, which never
  // surfaced in Settings — owner: saved templates must show up there).
  async function handleSaveAuditTemplate() {
    if (!auditTemplateNameInput.trim()) return
    setIsSavingAuditTemplate(true)
    try {
      const v = getValues()
      const frequency = CADENCE_TO_FREQUENCY[schedule.cadence] ?? v.frequency ?? 'annual'
      const frequencySchedule: FrequencySchedule =
        schedule.cadence === 'adhoc'
          ? { adhocDate: schedule.adhocDate }
          : { dayOfMonth: schedule.dayOfMonth ?? 1 }
      await createAuditTemplate({
        name: auditTemplateNameInput.trim(),
        auditType: selectedType as AuditAuthority,
        category: (v.category ?? 'custom') as AuditTemplate['category'],
        priority: (v.priority ?? 'medium') as AuditTemplate['priority'],
        frequency,
        frequencySchedule,
        defaultTitle: v.title || auditTemplateNameInput.trim(),
        // The API requires a non-empty description — fall back to the name.
        defaultDescription: v.description?.trim() || v.title || auditTemplateNameInput.trim(),
        defaultChecklistItems: [],
        defaultTeamRoles: [],
        framework: frameworkIds[0] as RegulatoryBodyId | undefined,
        status: 'active',
      })
      pushToast(t('settings.templateCreated' as TranslationKey), 'success')
      setAuditTemplateNameInput('')
      setShowSaveAuditTemplateForm(false)
    } catch {
      pushToast(t('settings.templateSaveFailed' as TranslationKey), 'error')
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
              <h2 className="text-2xl font-bold font-display text-slate-900">
                {isTemplate
                  ? t((template ? 'settings.editTemplate' : 'settings.createNewTemplate') as TranslationKey)
                  : t('auditDetail.createAuditTitle')}
              </h2>
              <p className="text-sm text-slate-500">
                {isTemplate ? t('settings.buildReusableTemplate' as TranslationKey) : t('auditDetail.createAuditSubtitle')}
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Template Selection — hidden in template mode (you're creating a
                template, not cloning from an existing one). */}
            {!isTemplate && (
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                {t('settings.selectTemplate')}
              </label>
              <EditableSelect
                value={selectedTemplateId || null}
                onChange={(id) => handleTemplateSelect(id)}
                items={[
                  { id: '', label: t('settings.noTemplate'), isDefault: true },
                  ...auditTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.name, isDefault: true })),
                  // W45: user-saved templates (footer "Save as template")
                  // appear here immediately after saving. W49: rename/delete
                  // exposed per saved template (policy parity) — the select's
                  // built-in per-row spinner covers the async calls.
                  ...auditEntityTemplates.map((et) => ({ id: `et-${et.id}`, label: et.name })),
                ]}
                onEdit={async (id, label) => {
                  if (!id.startsWith('et-')) return
                  await renameAuditEntityTemplate(id.slice(3), 'audit', label)
                }}
                onDelete={async (id) => {
                  if (!id.startsWith('et-')) return
                  await deleteAuditEntityTemplate(id.slice(3), 'audit')
                  if (selectedTemplateId === id) setSelectedTemplateId('')
                }}
                isRTL={isRTL}
                // W48 (owner): "Save as template" lives IN the dropdown
                // (policy parity), not next to the submit buttons. Hidden in
                // template mode (the whole modal already saves a template).
                footerSlot={isTemplate ? undefined : (
                  showSaveAuditTemplateForm ? (
                    <div className="flex items-center gap-1.5 p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        className="flex-1 min-w-0 h-8 rounded-md border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder={t('regulatoryUpdates.templateNamePlaceholder' as any)}
                        value={auditTemplateNameInput}
                        onChange={(e) => setAuditTemplateNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveAuditTemplate()
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            setShowSaveAuditTemplateForm(false)
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveAuditTemplate()}
                        disabled={isSavingAuditTemplate || !auditTemplateNameInput.trim()}
                        className="p-1.5 text-emerald-600 hover:text-emerald-700 disabled:opacity-40 cursor-pointer"
                        title={t('regulatoryUpdates.saveTemplateConfirm' as any)}
                      >
                        <Icon icon={isSavingAuditTemplate ? 'lucide:loader-2' : 'lucide:check'} className={`text-sm ${isSavingAuditTemplate ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowSaveAuditTemplateForm(false); setAuditTemplateNameInput('') }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-sm" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowSaveAuditTemplateForm(true) }}
                      className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                    >
                      <Icon icon="lucide:save" className="text-sm" />
                      {t('regulatoryUpdates.saveAsTemplate' as any)}
                    </button>
                  )
                )}
              />
            </div>
            )}

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
                <FieldLabel required className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {t('auditDetail.auditTitleLabel')}
                </FieldLabel>
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

              {!isTemplate && (
                <div>
                  <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                    {t('reviewSchedule.computedNextReview')}
                  </label>
                  <div className="px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium">
                    {computeNextReview(schedule)}
                  </div>
                </div>
              )}

              {!isTemplate && (
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
              )}

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

              {!isTemplate && (
                <div>
                  <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                    {t('auditDetail.leadAuthorLabel')}<span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span>
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
              )}

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  {isTemplate ? t('settings.descriptionEnglish') : t('auditDetail.scopeDescription')}
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

              {/* Reference documents — template mode only. Persisted as data URLs
                  inside the template's frequency_schedule jsonb (owner: uploaded
                  files must stick to the template). */}
              {isTemplate && (
                <div className="col-span-2">
                  <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                    {t('settings.referenceDocuments' as TranslationKey)}
                  </label>
                  <FileUpload
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                    multiple
                    files={[]}
                    onChange={(fs) => void handleFilesAdded(fs)}
                    helperText={t('settings.referenceDocumentsHint' as TranslationKey)}
                  />
                  {attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {attachments.map((a, i) => (
                        <div key={`${a.name}-${i}`} className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <Icon icon="lucide:file-text" className="text-slate-400 text-lg shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{a.name}</p>
                            <p className="text-xs text-slate-400">{formatBytes(a.size)}</p>
                          </div>
                          <a
                            href={a.dataUrl}
                            download={a.name}
                            className="p-1 text-slate-400 hover:text-emerald-600"
                            aria-label={t('common.download' as TranslationKey)}
                          >
                            <Icon icon="lucide:download" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            aria-label={t('common.delete')}
                          >
                            <Icon icon="lucide:x" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer — W48: actions only; "Save as template" moved into the
            Select Template dropdown (policy parity). */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isMutating || isSavingTemplate}>
            {t('common.cancel')}
          </Button>
          <LoadingButton
            variant="primary"
            loading={isTemplate ? isSavingTemplate : (submitBusy || isMutating)}
            loadingLabel={isTemplate ? t('common.saving') : t('auditDetail.creating')}
            onClick={handleSubmit(onSubmit)}
          >
            {isTemplate ? t('regulatoryUpdates.saveAsTemplate' as TranslationKey) : t('auditDetail.createAudit')}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
