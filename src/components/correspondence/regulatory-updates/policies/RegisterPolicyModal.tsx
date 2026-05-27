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
import { usePolicyStore } from '@/stores/policy-store'
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
        {label}{required && ' *'}
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
  const { create } = usePolicyStore()
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
  } = usePolicyTemplateStore()

  // Wave-19.7 — approval-tier dropdown options driven by enum_value_definitions.
  const tierRows = useEnumValuesStore((s) => s.byDomain['policy.approval_tier'] ?? EMPTY_ENUM_VALUES)
  const fetchEnumValues = useEnumValuesStore((s) => s.fetch)
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
    const tierSteps = (selectedTmpl?.defaultWorkflowSteps?.length ? selectedTmpl.defaultWorkflowSteps : null)
      ?? TIER_WORKFLOWS[formTier as PolicyApprovalTier]
      ?? TIER_WORKFLOWS.management
    const workflowTimeline = [
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

        {/* Template picker — locked because templates are managed in Settings. */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.selectTemplate')}</label>
          <EditableSelect
            locked
            value={selectedTemplateId || null}
            onChange={(id) => handleTemplateSelect(id)}
            items={[
              { id: '', label: t('settings.noTemplate') },
              ...policyTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.name })),
            ]}
            placeholder={t('settings.noTemplate')}
            isRTL={isRTL}
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <Input
              label={`${t('policies.policyName')} *`}
              placeholder={t('policies.policyNamePlaceholder')}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')} *</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')} *</label>
              <EditableSelect
                locked
                value={formTier || null}
                onChange={(id) => setFormTier(id as PolicyApprovalTier | '')}
                items={tierItems}
                placeholder={t('policies.selectApprovalTier')}
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
                onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
                onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                onDelete={(id) => removeDepartment(id)}
                placeholder={t('regulatoryUpdates.selectDepartment' as any)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments' as any)}</label>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                {departments.map((dept) => (
                  <label key={dept.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                      checked={formAffectedDepartments.includes(dept.id)}
                      onChange={() => setFormAffectedDepartments((prev) =>
                        prev.includes(dept.id) ? prev.filter((d) => d !== dept.id) : [...prev, dept.id]
                      )}
                    />
                    <span className="text-sm">{isRTL ? dept.nameAr : dept.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')} *</label>
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
              required
              t={t}
            />
          </div>
        </div>

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
              {isCreating ? t('common.saving') : t('policies.createPolicy')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
