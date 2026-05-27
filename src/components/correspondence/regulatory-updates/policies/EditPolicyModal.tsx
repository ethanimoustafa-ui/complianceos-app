'use client'
// Wave-18 cleanup — Edit Policy modal (feature-parity port).
//
// Mirrors RegisterPolicyModal for the edit path. Builds a per-field patch
// from the (form vs. policy) diff and submits via usePolicyStore.update
// which already threads `If-Match`. Captures a version-history row + an
// activity-log row describing the change (defence-in-depth alongside the
// server-side diff in countermeasure 6).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { EditableSelect } from '@/components/ui/editable-select'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview, cadenceToReviewCycleDays } from '@/lib/review-schedule'
import { usePolicyStore } from '@/stores/policy-store'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useAuthStore } from '@/stores/auth-store'
// Wave-19.7 — approval-tier options driven by `enum_value_definitions`.
import { useEnumValuesStore, type EnumValue } from '@/stores/enum-values-store'

// W19.7-BUG-1 fix: module-level stable empty reference (see ApprovalTiersSection).
const EMPTY_ENUM_VALUES: EnumValue[] = []
import type {
  Policy,
  PolicyCategory,
  PolicyApprovalTier,
  PolicyVersionEntry,
  PolicyActivityEntry,
  ReviewSchedule,
} from '@/types'

// Shared upload zone (kept local to the modal — same UX as the inline form).
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
  policy: Policy | null
  onSaved: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

export function EditPolicyModal({ isOpen, onClose, policy, onSaved, t, isRTL }: Props) {
  const { update } = usePolicyStore()
  const { user: currentUser } = useAuthStore()
  const teamMembers = useTeamStore((s) => s.members)
  const policyCategoryItems = usePolicyCategoryStore((s) => s.categories)
  const addPolicyCategory = usePolicyCategoryStore((s) => s.add)
  const editPolicyCategory = usePolicyCategoryStore((s) => s.update)
  const removePolicyCategory = usePolicyCategoryStore((s) => s.remove)
  const departments = useDepartmentStore((s) => s.departments)
  const addDepartment = useDepartmentStore((s) => s.addDepartment)
  const updateDepartment = useDepartmentStore((s) => s.updateDepartment)
  const removeDepartment = useDepartmentStore((s) => s.removeDepartment)

  // Wave-19.7 — approval-tier dropdown driven by enum_value_definitions.
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

  const OWNERS = useMemo(() =>
    teamMembers
      .filter((m) => m.status === 'active')
      .map((m) => ({ name: m.name, avatar: m.name, department: m.department }))
  , [teamMembers])

  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<PolicyCategory | ''>('')
  const [formTier, setFormTier] = useState<PolicyApprovalTier | ''>('')
  const [formVersion, setFormVersion] = useState('')
  const [formReviewSchedule, setFormReviewSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })
  const [formOwnerIdx, setFormOwnerIdx] = useState(0)
  const [formDescription, setFormDescription] = useState('')
  const [formDocFile, setFormDocFile] = useState<File | null>(null)
  const [formAffectedDepartments, setFormAffectedDepartments] = useState<string[]>([])
  const [formBusinessOwnerDepartmentId, setFormBusinessOwnerDepartmentId] = useState<string>('')
  const formDocFileRef = useRef<HTMLInputElement>(null)

  // Reset form whenever the modal opens for a (possibly new) policy.
  useEffect(() => {
    if (!isOpen || !policy) return
    setFormName(policy.name)
    setFormCategory(policy.category)
    setFormTier(policy.approvalTier)
    setFormVersion(policy.version)
    setFormReviewSchedule(policy.reviewSchedule ?? { cadence: 'yearly', dayOfMonth: 1 })
    const idx = OWNERS.findIndex((o) => o.name === policy.owner.name)
    setFormOwnerIdx(idx >= 0 ? idx : 0)
    setFormDescription(policy.description)
    setFormDocFile(null)
    setFormAffectedDepartments(policy.affectedDepartments ?? [])
    setFormBusinessOwnerDepartmentId(policy.businessOwnerDepartmentId ?? '')
  }, [isOpen, policy, OWNERS])

  // Wire file input onChange via ref.
  useEffect(() => {
    const el = formDocFileRef.current
    if (!el) return
    const handler = () => { const f = el.files?.[0]; if (f) setFormDocFile(f) }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  }, [isOpen])

  const formValid = !!(formName && formCategory && formTier && formDescription)

  function handleSave() {
    if (!policy || !formValid) return
    const owner = OWNERS[formOwnerIdx] ?? policy.owner
    const today = new Date().toISOString().split('T')[0]
    const newVersion = formVersion || policy.version
    const editNextReview = computeNextReview(formReviewSchedule)

    // Build human-readable change summary for version history + activity log.
    const changes: string[] = []
    if (formName !== policy.name) changes.push(`Name: "${policy.name}" → "${formName}"`)
    if (formDescription !== policy.description) changes.push('Description updated')
    if (formCategory !== policy.category) changes.push(`Category: ${policy.category} → ${formCategory}`)
    if (newVersion !== policy.version) changes.push(`Version: ${policy.version} → ${newVersion}`)
    if (formTier !== policy.approvalTier) changes.push(`Approval tier: ${policy.approvalTier} → ${formTier}`)
    if (owner.name !== policy.owner.name) changes.push(`Owner: ${policy.owner.name} → ${owner.name}`)
    if (editNextReview !== policy.nextReviewDate) changes.push(`Next review: ${policy.nextReviewDate} → ${editNextReview}`)
    if (formDocFile) changes.push(`Document replaced: "${formDocFile.name}"`)
    const changesText = changes.length > 0 ? changes.join('; ') : 'Minor update'

    // Wave-19.4 / Item-3 — dual-store. Client-side composed text is the same
    // for both locales (the user just typed it); the server-side PATCH path
    // composes proper EN/AR via `renderBilingual`.
    const versionEntry: PolicyVersionEntry = {
      version: newVersion,
      date: today,
      author: owner.name,
      textEn: changesText,
      textAr: changesText,
    }
    const actingUser = currentUser?.name ?? owner.name
    const activityEntry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'edited',
      textEn: `Policy updated — ${changesText}`,
      textAr: `تم تحديث السياسة — ${changesText}`,
      user: actingUser,
    }

    update(policy.id, {
      name: formName,
      description: formDescription,
      category: formCategory as PolicyCategory,
      version: newVersion,
      approvalTier: formTier as PolicyApprovalTier,
      owner,
      affectedDepartments: formAffectedDepartments,
      businessOwnerDepartmentId: formBusinessOwnerDepartmentId || undefined,
      nextReviewDate: editNextReview,
      reviewCycleDays: cadenceToReviewCycleDays(formReviewSchedule.cadence),
      reviewSchedule: formReviewSchedule,
      ...(formDocFile ? { attachmentUrl: formDocFile.name } : {}),
      versionHistory: [...policy.versionHistory, versionEntry],
      activityLog: [...(policy.activityLog ?? []), activityEntry],
    })
    onSaved(t('policies.policyUpdated'))
    onClose()
  }

  if (!policy) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('policies.editPolicy')} size="xl">
      <div className="space-y-6">
        <p className="text-sm text-slate-500 -mt-2">{t('policies.createPolicySubtitle')}</p>

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
                onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
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
              t={t}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            className="shadow-lg shadow-emerald-100"
            onClick={handleSave}
            disabled={!formValid}
          >
            {t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
