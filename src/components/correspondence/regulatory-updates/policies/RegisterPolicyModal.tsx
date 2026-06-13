'use client'
// Wave-18 cleanup — Register Policy modal (feature-parity port).
//
// Replaces the inline create flow that lived in `policies/page.tsx`. Every
// affordance from the legacy inline form is preserved: template picker,
// owner+department editable-selects, affected-departments multi-select,
// review-schedule picker, upload zone, tier-driven default workflow.
//
// FORENSIC: keeping this state local to the modal mirrors the Rules-page
// `RegisterCircularModal` and prevents the page from re-rendering as the
// user types into form fields (P10 noise reduction).

import { useEffect, useRef, useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { EditableSelect } from '@/components/ui/editable-select'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview, cadenceToReviewCycleDays } from '@/lib/review-schedule'
import { api } from '@/lib/api-client'
import { usePolicyStore } from '@/stores/policy-store'
import { AddTierModal, ACTION_TYPES, type AddTierStep, type EditTier } from './AddTierModal'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useAuthStore } from '@/stores/auth-store'
// Wave-19.7 — approval-tier options are driven by `enum_value_definitions`.
import { useEnumValuesStore, type EnumValue } from '@/stores/enum-values-store'

// W19.7-BUG-1 fix: module-level stable empty reference (see ApprovalTiersSection).
const EMPTY_ENUM_VALUES: EnumValue[] = []
import type {
  PolicyCategory,
  PolicyApprovalTier,
  PolicyActivityEntry,
  ReviewSchedule,
} from '@/types'

// Tier-driven default workflow. Keys align with the five tiers seeded by
// migration 074: board, agm, managerial, sharia, audit_committee.
// The old `management` key is aliased to `managerial` for backward compat.
const TIER_WORKFLOWS: Record<string, Array<{ step: string; description: string; actionType: string }>> = {
  board: [
    { step: 'Legal Review',           description: 'Initial legal assessment',             actionType: 'send-for-review'    },
    { step: 'Audit Committee Review', description: 'Reviewed by Audit Committee',          actionType: 'request-approval'   },
    { step: 'Board Approval',         description: 'Final approval by Board of Directors', actionType: 'request-approval'   },
  ],
  // P2: renamed from `management` → `managerial`; old key aliased for backward compat.
  managerial: [
    { step: 'Department Review',    description: 'Review by relevant department head', actionType: 'send-for-review'  },
    { step: 'Compliance Review',    description: 'Compliance team assessment',         actionType: 'request-approval' },
    { step: 'Managerial Approval',  description: 'Final approval by Management',       actionType: 'request-approval' },
  ],
  management: [
    { step: 'Department Review',   description: 'Review by relevant department head', actionType: 'send-for-review'  },
    { step: 'Compliance Review',   description: 'Compliance team assessment',         actionType: 'request-approval' },
    { step: 'Management Approval', description: 'Final approval by Management',       actionType: 'request-approval' },
  ],
  sharia: [
    { step: 'Legal Review',            description: 'Initial legal assessment',           actionType: 'send-for-review'  },
    { step: 'Sharia Committee Review', description: 'Review by Sharia Supervisory Board', actionType: 'request-approval' },
    { step: 'Sharia Board Approval',   description: 'Final approval by Sharia Board',     actionType: 'request-approval' },
  ],
  agm: [
    { step: 'Management Review', description: 'Executive management review',        actionType: 'notify-manager'   },
    { step: 'AGM Preparation',   description: 'Preparation of AGM documentation',   actionType: 'send-email'       },
    { step: 'AGM Approval',      description: 'Approval by Annual General Meeting', actionType: 'request-approval' },
  ],
  audit_committee: [
    { step: 'Internal Audit Review', description: 'Review by internal audit team',        actionType: 'send-for-review'  },
    { step: 'Committee Review',      description: 'Audit Committee deliberation',          actionType: 'request-approval' },
    { step: 'Committee Approval',    description: 'Final approval by Audit Committee',     actionType: 'request-approval' },
  ],
}

// P7 (W30): helper to read a File as a base64 data URL so it can be passed
// to the attachment store which expects a dataUrl.
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Shared upload zone — same UX as the inline component.
function UploadZone({
  file, fileRef, label, required, t,
}: {
  file: File | null
  fileRef: React.RefObject<HTMLInputElement | null>
  label: string
  required?: boolean
  t: (key: any, params?: Record<string, string>) => string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <><span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span></>}
      </label>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xlsx,.pptx"
        onChange={() => {}}
      />
      {file ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors"
        >
          <Icon icon="lucide:file-check" className="text-emerald-500 text-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-700 truncate">{file.name}</p>
            <p className="text-[10px] text-emerald-500">{t('policies.clickToChange')}</p>
          </div>
          <Icon icon="lucide:refresh-cw" className="text-emerald-400 text-sm shrink-0" />
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {t('policies.dropFileHere')} <span className="text-emerald-600 font-bold">{t('policies.browse')}</span>
          </p>
        </div>
      )}
    </div>
  )
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (toastMsg: string, newId: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

export function RegisterPolicyModal({ isOpen, onClose, onCreated, t, isRTL }: Props) {
  const { create, addAttachment } = usePolicyStore()
  const { user: currentUser } = useAuthStore()
  const [isCreating, setIsCreating] = useState(false)
  const teamMembers = useTeamStore((s) => s.members)
  const policyCategoryItems = usePolicyCategoryStore((s) => s.categories)
  const addPolicyCategory = usePolicyCategoryStore((s) => s.add)
  const editPolicyCategory = usePolicyCategoryStore((s) => s.update)
  const removePolicyCategory = usePolicyCategoryStore((s) => s.remove)
  const departments = useDepartmentStore((s) => s.departments)
  const addDepartment = useDepartmentStore((s) => s.addDepartment)
  const updateDepartment = useDepartmentStore((s) => s.updateDepartment)
  const removeDepartment = useDepartmentStore((s) => s.removeDepartment)
  const {
    templates: policyTemplates,
    incrementUsage: incrementPolicyTemplateUsage,
    create: createPolicyTemplate,
    update: updatePolicyTemplate,
    delete: deletePolicyTemplate,
    fetchAll: fetchAllPolicyTemplates,
  } = usePolicyTemplateStore()

  // P1 (W34): "Save as template" persists to the SAME store the template
  // dropdown and Settings → Policy Templates read from (the policy_templates
  // table). The previous code wrote to the unrelated entity_templates table, so
  // the POST returned 201 but the new template never appeared anywhere.
  const [showSavePolicyTemplateForm, setShowSavePolicyTemplateForm] = useState(false)
  // ISSUE-4: custom approval-tier add modal. W37: editTier set => edit mode.
  const [showAddTier, setShowAddTier] = useState(false)
  const [editTier, setEditTier] = useState<EditTier | null>(null)
  const [policyTemplateNameInput, setPolicyTemplateNameInput] = useState('')
  const [isSavingPolicyTemplate, setIsSavingPolicyTemplate] = useState(false)
  useEffect(() => {
    if (isOpen) void fetchAllPolicyTemplates()
  }, [isOpen, fetchAllPolicyTemplates])

  function handleSavePolicyTemplate() {
    if (!policyTemplateNameInput.trim()) return
    setIsSavingPolicyTemplate(true)
    try {
      // Synchronous optimistic insert + background POST /api/policy-templates,
      // so the new template appears immediately in the dropdown and in Settings.
      createPolicyTemplate({
        name: policyTemplateNameInput.trim(),
        category: (formCategory || 'compliance') as PolicyCategory,
        approvalTier: (formTier || 'management') as PolicyApprovalTier,
        defaultDescription: formDescription,
        defaultWorkflowSteps: [],
        versionPattern: 'v{major}.{minor}',
        status: 'active',
      })
      setPolicyTemplateNameInput('')
      setShowSavePolicyTemplateForm(false)
    } catch (e) {
      // create() throws if the user lacks the 'Manage Policy Templates' permission.
      console.error('Failed to save policy template', e)
    } finally {
      setIsSavingPolicyTemplate(false)
    }
  }

  // W37: persist an ADDED or EDITED approval tier. A tier = an enum option
  // (policy.approval_tier) + a paired policy_template carrying its default
  // workflow steps. The policy CREATE route prefers that template, so this is
  // how a tier's workflow (a custom one, OR a customized seeded one) takes
  // effect. Reuses useEnumValuesStore (POST/PATCH /settings/enum-values) and the
  // policy-templates store — no migration.
  async function handleSaveTier(key: string, nameEn: string, nameAr: string, steps: AddTierStep[], isEdit: boolean): Promise<boolean> {
    try {
      if (isEdit) {
        const row = tierRows.find((r) => r.key === key)
        // Rename the enum option (the server blocks renaming the default tier).
        if (row && !row.isDefault && (row.nameEn !== nameEn || row.nameAr !== nameAr)) {
          await updateEnumTier(row.id, { nameEn, nameAr })
        }
      } else {
        await addEnumTier('policy.approval_tier', key, nameEn, nameAr)
      }
      // Upsert the paired template holding the tier's workflow steps. A tier can
      // have several templates with the same approval_tier (e.g. an empty one
      // from "Save as template"); prefer updating the one that already HAS steps
      // so the edit lands on the real tier-workflow source, not an empty dup.
      const existing =
        policyTemplates.find((tp) => tp.approvalTier === key && (tp.defaultWorkflowSteps?.length ?? 0) > 0) ??
        policyTemplates.find((tp) => tp.approvalTier === key)
      if (existing) {
        await updatePolicyTemplate(existing.id, { name: nameEn, nameAr, defaultWorkflowSteps: steps })
      } else {
        createPolicyTemplate({
          name: nameEn,
          nameAr,
          category: (formCategory || 'compliance') as PolicyCategory,
          approvalTier: key as PolicyApprovalTier,
          defaultDescription: '',
          defaultWorkflowSteps: steps,
          versionPattern: 'v{major}.{minor}',
          status: 'active',
        })
      }
      if (!isEdit) setFormTier(key as PolicyApprovalTier)
      setEditTier(null)
      return true
    } catch (e) {
      // Surface failure to the modal so it stays open (the enum/template stores
      // already show a revert toast). Returning false prevents the modal from
      // closing as if the save succeeded.
      console.error('Failed to save approval tier', e)
      return false
    }
  }

  // W37: delete a tier — remove its enum option (the server blocks the default
  // tier and any tier still in use) plus its paired workflow template.
  async function handleDeleteTier(key: string): Promise<void> {
    const row = tierRows.find((r) => r.key === key)
    if (!row || row.isDefault) return
    try {
      await removeEnumTier(row.id)
      const tmpl = policyTemplates.find((tp) => tp.approvalTier === key)
      if (tmpl) await deletePolicyTemplate(tmpl.id)
      if (formTier === key) setFormTier('')
      setEditTier(null)
    } catch (e) {
      // The enum/template stores surface a revert toast on failure; clear any
      // stale edit state so a later Edit re-hydrates fresh.
      console.error('Failed to delete approval tier', e)
      setEditTier(null)
    }
  }

  // W37: open the tier modal in EDIT mode, pre-filled with the tier's current
  // name + steps. Custom tiers read steps from their paired template; seeded
  // tiers read theirs from the per-tier seed (policy_workflow_step_templates).
  async function openEditTier(key: string): Promise<void> {
    const row = tierRows.find((r) => r.key === key)
    if (!row) return
    // Normalize legacy/seeded action types to the canonical set so the
    // EditableSelect shows a real option (not "Select…") and the value can't be
    // lost on save. (W37 "collapse the redundant ones".)
    const NORMALIZE: Record<string, string> = {
      publish: 'review_complete',
      approve: 'request-approval',
      vote_approve: 'request-approval',
      'send-for-review': 'request-approval',
    }
    const safeAction = (a: string | null | undefined): string => {
      if (!a) return 'move-to-next'
      if (NORMALIZE[a]) return NORMALIZE[a]
      return (ACTION_TYPES as readonly string[]).includes(a) ? a : 'move-to-next'
    }
    let steps: AddTierStep[] = []
    const tmpl = policyTemplates.find((tp) => tp.approvalTier === key && (tp.defaultWorkflowSteps?.length ?? 0) > 0)
    if (tmpl) {
      steps = (tmpl.defaultWorkflowSteps as Array<{ step?: string; description?: string; actionType?: string }>).map((s) => ({
        step: s.step ?? '',
        description: s.description ?? '',
        actionType: safeAction(s.actionType),
      }))
    } else {
      try {
        const rows = await api.get<Array<{ step: string; description: string | null; action_type: string | null }>>(
          '/policy-workflow-step-templates',
          { tier: key },
        )
        steps = rows.map((r) => ({ step: r.step, description: r.description ?? '', actionType: safeAction(r.action_type) }))
      } catch {
        steps = []
      }
    }
    setEditTier({ key, nameEn: row.nameEn, nameAr: row.nameAr, steps })
    setShowAddTier(true)
  }

  // Wave-19.7 — approval-tier dropdown options driven by enum_value_definitions.
  const tierRows = useEnumValuesStore((s) => s.byDomain['policy.approval_tier'] ?? EMPTY_ENUM_VALUES)
  const fetchEnumValues = useEnumValuesStore((s) => s.fetch)
  const addEnumTier = useEnumValuesStore((s) => s.add)
  const updateEnumTier = useEnumValuesStore((s) => s.update)
  const removeEnumTier = useEnumValuesStore((s) => s.remove)
  useEffect(() => {
    if (isOpen) void fetchEnumValues('policy.approval_tier')
  }, [isOpen, fetchEnumValues])
  const tierItems = useMemo(
    () =>
      tierRows
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((v) => ({
          id: v.key,
          label: isRTL ? v.nameAr : v.nameEn,
          // isDefault hides the per-row trash (the canonical tier can't be deleted).
          isDefault: v.isDefault,
        })),
    [tierRows, isRTL],
  )

  // Derive owners from team store — same as inline.
  const OWNERS = useMemo(() =>
    teamMembers
      .filter((m) => m.status === 'active')
      .map((m) => ({ name: m.name, avatar: m.name, department: m.department }))
  , [teamMembers])

  // ── Form state ───────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<PolicyCategory | ''>('')
  const [formTier, setFormTier] = useState<PolicyApprovalTier | ''>('')
  const [formVersion, setFormVersion] = useState('v1.0')
  const [formReviewSchedule, setFormReviewSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })
  const [formOwnerIdx, setFormOwnerIdx] = useState(0)
  const [formDescription, setFormDescription] = useState('')
  const [formDocFile, setFormDocFile] = useState<File | null>(null)
  const [formAffectedDepartments, setFormAffectedDepartments] = useState<string[]>([])
  const [formBusinessOwnerDepartmentId, setFormBusinessOwnerDepartmentId] = useState<string>('')
  const formDocFileRef = useRef<HTMLInputElement>(null)

  // Wire native file input onChange via ref.
  useEffect(() => {
    const el = formDocFileRef.current
    if (!el) return
    const handler = () => { const f = el.files?.[0]; if (f) setFormDocFile(f) }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  }, [isOpen])

  function reset() {
    setSelectedTemplateId('')
    setFormName('')
    setFormCategory('')
    setFormTier('')
    setFormVersion('v1.0')
    setFormReviewSchedule({ cadence: 'yearly', dayOfMonth: 1 })
    setFormOwnerIdx(0)
    setFormDescription('')
    setFormDocFile(null)
    setFormAffectedDepartments([])
    setFormBusinessOwnerDepartmentId('')
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId)
    if (!templateId) return
    const tmpl = policyTemplates.find((tp) => tp.id === templateId)
    if (!tmpl) return
    setFormName(tmpl.name)
    setFormDescription(tmpl.defaultDescription)
    setFormCategory(tmpl.category)
    setFormTier(tmpl.approvalTier)
  }

  const missingFields = [
    !formName && t('policies.policyName'),
    !formCategory && t('policies.selectCategory'),
    !formTier && t('policies.approvalTier'),
    !formDescription && t('policies.description'),
  ].filter(Boolean) as string[]
  const formValid = missingFields.length === 0

  // P3-D1: async — awaits the server-confirmed row so newPolicy.id is the
  // canonical ref_code, not a local optimistic placeholder.
  async function handleCreate() {
    if (!formValid || isCreating) return
    setIsCreating(true)
    const owner = OWNERS[formOwnerIdx]
    if (!owner) { setIsCreating(false); return }
    const today = new Date().toISOString().split('T')[0]
    const selectedTmpl = selectedTemplateId ? policyTemplates.find((tp) => tp.id === selectedTemplateId) : null
    // ISSUE-4: a custom tier seeds its workflow from the policy_template whose
    // approvalTier matches the chosen tier key (saved when the tier was added).
    const tierTmpl = !selectedTmpl && formTier
      ? policyTemplates.find((tp) => tp.approvalTier === formTier && tp.defaultWorkflowSteps?.length)
      : null
    // ISSUE-3: the "Other" tier seeds NO default steps — the user builds the
    // workflow via the Workflow tab. An explicit or tier-keyed template wins.
    const tierSteps = (selectedTmpl?.defaultWorkflowSteps?.length ? selectedTmpl.defaultWorkflowSteps : null)
      ?? (tierTmpl?.defaultWorkflowSteps?.length ? tierTmpl.defaultWorkflowSteps : null)
      ?? (formTier === 'other' ? [] : (TIER_WORKFLOWS[formTier as PolicyApprovalTier] ?? TIER_WORKFLOWS.management))
    const workflowTimeline = tierSteps.length === 0
      ? [
          // Empty-tier optimistic shape: only the completed "Draft Created" step
          // (matches the server truth, workflow_steps = [], after the detail GET).
          { step: 'Draft Created', date: today, user: owner.name, status: 'completed' as const, actionType: 'move-to-next' },
        ]
      : [
          { step: 'Draft Created', date: today, user: owner.name, status: 'completed' as const, actionType: 'move-to-next' },
          { step: tierSteps[0].step, description: tierSteps[0].description, actionType: tierSteps[0].actionType, date: '', user: '', status: 'current' as const },
          ...tierSteps.slice(1).map((s) => ({ step: s.step, description: s.description, actionType: s.actionType, date: '', user: '', status: 'pending' as const })),
        ]
    const cycleId = Date.now().toString()
    const cycleLabel = `Review ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    const activityLog: PolicyActivityEntry[] = [{
      id: cycleId,
      timestamp: new Date().toISOString(),
      date: today,
      type: 'created',
      textEn: `Policy created by ${currentUser?.name ?? owner.name}`,
      textAr: `تم إنشاء السياسة بواسطة ${currentUser?.name ?? owner.name}`,
      user: currentUser?.name ?? owner.name,
    }]
    try {
      const newPolicy = await create({
        name: formName,
        description: formDescription,
        status: 'draft',
        category: formCategory as PolicyCategory,
        version: formVersion || 'v1.0',
        approvalTier: formTier as PolicyApprovalTier,
        owner,
        affectedDepartments: formAffectedDepartments,
        businessOwnerDepartmentId: formBusinessOwnerDepartmentId || undefined,
        lastReviewDate: '',
        nextReviewDate: computeNextReview(formReviewSchedule),
        reviewCycleDays: cadenceToReviewCycleDays(formReviewSchedule.cadence),
        reviewSchedule: formReviewSchedule,
        attachmentUrl: formDocFile?.name ?? '',
        currentReviewCycleId: cycleId,
        currentReviewCycleLabel: cycleLabel,
        reviewCycleHistory: [],
        // Wave-19.4 / Item-3 — dual-store. The initial-draft entry is purely
        // client-side optimistic state and is replaced by the server-emitted
        // row on first refresh.
        versionHistory: [
          { version: formVersion || 'v1.0', date: today, author: owner.name, textEn: 'Initial draft', textAr: 'المسودة الأولى' },
        ],
        workflowTimeline,
        activityLog,
      })
      if (selectedTemplateId) incrementPolicyTemplateUsage(selectedTemplateId)

      // P7 (W30): if the user attached a document at create time, POST it to
      // the attachments route now that we have the canonical policy UUID. The
      // `attachmentUrl` field in the create payload only carries the filename
      // as a visual hint — it does NOT persist to the policy_attachments table.
      if (formDocFile) {
        try {
          const dataUrl = await readFileAsDataUrl(formDocFile)
          // BUG-P-R2-02: pass silent=true so the attachment upload during
          // initial policy creation does NOT write an activity-log entry.
          await addAttachment(newPolicy.id, {
            name: formDocFile.name,
            dataUrl,
            size: formDocFile.size,
            uploadedBy: currentUser?.name ?? owner.name,
          }, true)
        } catch {
          // Non-fatal — the policy is created; surface error via toast if needed.
        }
      }

      onCreated(t('policies.policyCreated'), newPolicy.id)
      reset()
      onClose()
    } finally {
      setIsCreating(false)
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('policies.createNewPolicy')}
      size="xl"
    >
      <div className="space-y-6">
        <p className="text-sm text-slate-500 -mt-2">{t('policies.createPolicySubtitle')}</p>

        {/* Template picker — locked + inline "Save as template" footer (P4/M2 W30). */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.selectTemplate')}</label>
          <EditableSelect
            value={selectedTemplateId || null}
            onChange={(id) => handleTemplateSelect(id)}
            items={[
              { id: '', label: t('settings.noTemplate'), isDefault: true },
              // W37: hide tier-WORKFLOW-source templates (the paired template a
              // tier stores its steps in — name+key match a tier enum). They are
              // tier definitions, not policy starting-templates; showing them let
              // a user delete one here and silently break that tier's workflow.
              ...policyTemplates
                .filter((tmpl) => !tierRows.some((r) => r.key === tmpl.approvalTier && r.nameEn === tmpl.name))
                .map((tmpl) => ({ id: tmpl.id, label: tmpl.name, labelAr: tmpl.nameAr })),
            ]}
            placeholder={t('settings.noTemplate')}
            bilingual={false}
            onEdit={(id, label) => (id ? updatePolicyTemplate(id, { name: label }) : undefined)}
            onDelete={(id) => (id ? deletePolicyTemplate(id) : undefined)}
            isRTL={isRTL}
            footerSlot={
              showSavePolicyTemplateForm ? (
                <div className="flex items-center gap-2 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    autoFocus
                    className="flex-1 h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder={t('regulatoryUpdates.templateNamePlaceholder' as any)}
                    value={policyTemplateNameInput}
                    onChange={(e) => setPolicyTemplateNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') void handleSavePolicyTemplate()
                      if (e.key === 'Escape') setShowSavePolicyTemplateForm(false)
                    }}
                  />
                  <button
                    type="button"
                    className="p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                    disabled={isSavingPolicyTemplate || !policyTemplateNameInput.trim()}
                    onClick={(e) => { e.stopPropagation(); void handleSavePolicyTemplate() }}
                  >
                    {isSavingPolicyTemplate
                      ? <Icon icon="lucide:loader-2" className="animate-spin text-xs" />
                      : <Icon icon="lucide:check" className="text-xs" />}
                  </button>
                  <button
                    type="button"
                    className="p-1 text-slate-400 hover:text-slate-600"
                    onClick={(e) => { e.stopPropagation(); setShowSavePolicyTemplateForm(false); setPolicyTemplateNameInput('') }}
                  >
                    <Icon icon="lucide:x" className="text-xs" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setShowSavePolicyTemplateForm(true) }}
                >
                  <Icon icon="lucide:save" className="text-[11px]" />
                  {t('regulatoryUpdates.saveAsTemplate' as any)}
                </button>
              )
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <Input
              label={t('policies.policyName')}
              requiredMark
              placeholder={t('policies.policyNamePlaceholder')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')}<span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span></label>
              <EditableSelect
                value={formCategory || null}
                onChange={(id) => setFormCategory(id as PolicyCategory | '')}
                items={policyCategoryItems}
                placeholder={t('policies.selectCategory')}
                onAdd={(label, labelAr) => addPolicyCategory(label, labelAr)}
                onEdit={(id, label, labelAr) => editPolicyCategory(id, { label, labelAr })}
                onDelete={(id) => removePolicyCategory(id)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')}<span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span></label>
              {/* W37: in-dropdown tier management (reverted per request). The
                  footer "+ Add approval tier" and per-row pencil use the
                  EditableSelect external-action props (onAddClick/onEditClick),
                  which CLOSE the dropdown before opening the rich Add/Edit Tier
                  modal — so the dropdown portal no longer hovers over it. Per-row
                  trash (onDelete) deletes; hidden for the default tier. */}
              <EditableSelect
                value={formTier || null}
                onChange={(id) => setFormTier(id as PolicyApprovalTier | '')}
                items={tierItems}
                placeholder={t('policies.selectApprovalTier')}
                onAddClick={() => { setEditTier(null); setShowAddTier(true) }}
                onEditClick={(key) => openEditTier(key)}
                onDelete={(key) => handleDeleteTier(key)}
                addLabel={t('policies.addApprovalTier')}
                bilingual={false}
                isRTL={isRTL}
              />
            </div>
            <Input
              label={t('policies.version')}
              placeholder="v1.0"
              value={formVersion}
              onChange={(e) => setFormVersion(e.target.value)}
            />
            <ReviewSchedulePicker
              value={formReviewSchedule}
              onChange={setFormReviewSchedule}
              t={t}
              isRTL={isRTL}
            />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectOwner')}</label>
              <EditableSelect
                value={String(formOwnerIdx)}
                onChange={(id) => setFormOwnerIdx(Number(id))}
                items={OWNERS.map((o, idx) => ({ id: String(idx), label: `${o.name} — ${o.department}` }))}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept' as any)}</label>
              <EditableSelect
                value={formBusinessOwnerDepartmentId || null}
                onChange={(id) => setFormBusinessOwnerDepartmentId(id)}
                items={departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
                onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                onDelete={(id) => removeDepartment(id)}
                placeholder={t('regulatoryUpdates.selectDepartment' as any)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments' as any)}</label>
              {/* P4 (W34): chip + removable-pill multi-select matching the Rules
                  "Register Circular" modal. Stores dept.id (policy convention), so
                  it round-trips with EditPolicyModal's id-based hydration. */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex flex-wrap gap-1.5">
                  {departments.map((dept) => {
                    const selected = formAffectedDepartments.includes(dept.id)
                    return (
                      <button
                        type="button"
                        key={dept.id}
                        onClick={() => setFormAffectedDepartments((prev) =>
                          prev.includes(dept.id) ? prev.filter((d) => d !== dept.id) : [...prev, dept.id]
                        )}
                        className={
                          selected
                            ? 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white border border-emerald-600 cursor-pointer transition-colors'
                            : 'px-2.5 py-1 rounded-full text-xs font-medium bg-white text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 cursor-pointer transition-colors'
                        }
                      >
                        {isRTL ? dept.nameAr : dept.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              {formAffectedDepartments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formAffectedDepartments.map((id) => {
                    const dept = departments.find((d) => d.id === id)
                    if (!dept) return null
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"
                      >
                        {isRTL ? dept.nameAr : dept.name}
                        <button
                          type="button"
                          onClick={() => setFormAffectedDepartments((prev) => prev.filter((d) => d !== id))}
                          className="text-emerald-600 hover:text-rose-600 cursor-pointer"
                        >
                          <Icon icon="lucide:x" className="text-[10px]" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')}<span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span></label>
              <textarea
                className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                placeholder={t('policies.descriptionPlaceholder')}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <UploadZone
              file={formDocFile}
              fileRef={formDocFileRef}
              label={t('policies.uploadDocument')}
              t={t}
            />
          </div>
        </div>

        {/* P4/M2 (W30): standalone "Save as template" button removed — functionality
            moved into the template dropdown's footerSlot above. */}
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
          {!formValid && (
            <p className="text-xs text-rose-600 self-end">
              {t('regulatoryUpdates.missingRequired')}: {missingFields.join(', ')}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={handleClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => void handleCreate()}
              disabled={!formValid || isCreating}
              aria-busy={isCreating || undefined}
            >
              <Icon icon={isCreating ? 'lucide:loader-2' : 'lucide:plus'} className={`w-4 h-4${isCreating ? ' animate-spin' : ''}`} />
              {isCreating ? t('common.saving') : t('policies.createPolicy')}
            </Button>
          </div>
        </div>
      </div>

      {/* Conditionally mounted + keyed so each open seeds fresh state from props
          (add vs edit-of-a-specific-tier) without a re-seeding effect. */}
      {showAddTier && (
        <AddTierModal
          key={editTier ? `edit-${editTier.key}` : 'add'}
          isOpen
          onClose={() => { setShowAddTier(false); setEditTier(null) }}
          onSave={handleSaveTier}
          existingKeys={tierItems.map((ti) => ti.id)}
          editTier={editTier}
          isRTL={isRTL}
          t={t}
        />
      )}
    </Modal>
  )
}
