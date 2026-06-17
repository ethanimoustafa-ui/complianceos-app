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
import { pushToast } from '@/stores/toast-store'
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

// Client-side limits for the policy document (mirrors RegisterPolicyModal).
// The size cap gives the user a friendly message BEFORE a large file is read
// and submitted with the policy PATCH.
const POLICY_DOC_MAX_BYTES = 25 * 1024 * 1024
const POLICY_DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xlsx', 'pptx'] as const

// Returns a translation spec when the file is rejected, or null when it passes.
// Extension is checked before size so the message names the more fundamental
// problem first.
function validatePolicyDoc(file: File): { key: string; params?: Record<string, string> } | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(POLICY_DOC_EXTENSIONS as readonly string[]).includes(ext)) {
    return { key: 'errors.policies.documentWrongType' }
  }
  if (file.size > POLICY_DOC_MAX_BYTES) {
    return { key: 'errors.policies.documentTooLarge', params: { name: file.name } }
  }
  return null
}

// Shared upload zone (kept local to the modal — same UX as the inline form).
function UploadZone({
  file, fileRef, label, required, t, existingName,
}: {
  file: File | null
  fileRef: React.RefObject<HTMLInputElement | null>
  label: string
  required?: boolean
  t: (key: any, params?: Record<string, string>) => string
  // W37: name of the document already uploaded to this policy, so the edit
  // modal SHOWS it (with a click-to-replace affordance) instead of an empty
  // drop zone.
  existingName?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-rose-500"> *</span>}
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
      ) : existingName ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors"
        >
          <Icon icon="lucide:file-text" className="text-slate-400 text-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-700 truncate">{existingName}</p>
            <p className="text-[10px] text-slate-400">{t('policies.clickToChange')}</p>
          </div>
          <Icon icon="lucide:refresh-cw" className="text-slate-400 text-sm shrink-0" />
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
  const { update, reseedWorkflowFromTier } = usePolicyStore()
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
  const [docError, setDocError] = useState<string | null>(null)
  const [formAffectedDepartments, setFormAffectedDepartments] = useState<string[]>([])
  const [formBusinessOwnerDepartmentId, setFormBusinessOwnerDepartmentId] = useState<string>('')
  const formDocFileRef = useRef<HTMLInputElement>(null)
  // W37: when the approval tier changes, prompt whether to also reset the
  // workflow steps to match the new tier (see doSave / the confirm overlay).
  const [showTierConfirm, setShowTierConfirm] = useState(false)
  const [isReseeding, setIsReseeding] = useState(false)

  // Reset form whenever the modal opens for a (possibly new) policy.
  useEffect(() => {
    if (!isOpen || !policy) return
    setShowTierConfirm(false)
    setIsReseeding(false)
    setFormName(policy.name)
    setFormCategory(policy.category)
    setFormTier(policy.approvalTier)
    setFormVersion(policy.version)
    setFormReviewSchedule(policy.reviewSchedule ?? { cadence: 'yearly', dayOfMonth: 1 })
    const idx = OWNERS.findIndex((o) => o.name === policy.owner.name)
    setFormOwnerIdx(idx >= 0 ? idx : 0)
    setFormDescription(policy.description)
    setFormDocFile(null)
    setDocError(null)
    setFormAffectedDepartments(policy.affectedDepartments ?? [])
    setFormBusinessOwnerDepartmentId(policy.businessOwnerDepartmentId ?? '')
  }, [isOpen, policy, OWNERS])

  // Wire file input onChange via ref. Validate size/type before storing the file
  // so the user gets a clear inline message instead of the document being added
  // to state and only rejected (if at all) when the policy PATCH is submitted.
  useEffect(() => {
    const el = formDocFileRef.current
    if (!el) return
    const handler = () => {
      const f = el.files?.[0]
      if (!f) return
      const err = validatePolicyDoc(f)
      if (err) {
        setDocError(t(err.key, err.params))
        setFormDocFile(null)
        el.value = ''
        return
      }
      setDocError(null)
      setFormDocFile(f)
    }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  }, [isOpen, t])

  const formValid = !!(formName && formCategory && formTier && formDescription)

  async function doSave(reseedSteps: boolean) {
    if (!policy || !formValid) return
    // NOTE: we intentionally do NOT close the tier-confirm prompt here. For the
    // reseed path it stays open showing the spinner on "Yes, reset steps to
    // match" until the work completes; onClose() (below) then closes the whole
    // modal at once. (Closing it up-front made the spinner invisible and the
    // modal close felt abrupt.) The prompt flag is reset when the modal re-opens.
    const owner = OWNERS[formOwnerIdx] ?? policy.owner
    const today = new Date().toISOString().split('T')[0]
    const newVersion = formVersion || policy.version

    // P8 (W34): only recompute next_review_date when the review schedule
    // actually changed. computeNextReview is date-relative (anchored to "today"),
    // so recomputing it on every save made a no-op edit look like a real
    // next_review_date change — which created a spurious version-history row both
    // client-side and server-side on every Save (even with no edits).
    const normSchedule = (
      s: { cadence?: string; dayOfMonth?: number; adhocDate?: string } | null | undefined,
    ) => JSON.stringify({ cadence: s?.cadence, dayOfMonth: s?.dayOfMonth ?? null, adhocDate: s?.adhocDate ?? null })
    const storedSchedule = policy.reviewSchedule ?? { cadence: 'yearly', dayOfMonth: 1 }
    const scheduleChanged = normSchedule(formReviewSchedule) !== normSchedule(storedSchedule)
    const editNextReview = scheduleChanged ? computeNextReview(formReviewSchedule) : policy.nextReviewDate

    const sortedEq = (a: string[], b: string[]) =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    const departmentsChanged = !sortedEq(formAffectedDepartments, policy.affectedDepartments ?? [])
    const ownerDeptChanged =
      (formBusinessOwnerDepartmentId || undefined) !== (policy.businessOwnerDepartmentId ?? undefined)

    // Build human-readable change summary for version history + activity log.
    const changes: string[] = []
    if (formName !== policy.name) changes.push(`Name: "${policy.name}" → "${formName}"`)
    if (formDescription !== policy.description) changes.push('Description updated')
    if (formCategory !== policy.category) changes.push(`Category: ${policy.category} → ${formCategory}`)
    if (newVersion !== policy.version) changes.push(`Version: ${policy.version} → ${newVersion}`)
    if (formTier !== policy.approvalTier) changes.push(`Approval tier: ${policy.approvalTier} → ${formTier}`)
    if (owner.name !== policy.owner.name) changes.push(`Owner: ${policy.owner.name} → ${owner.name}`)
    if (scheduleChanged && editNextReview !== policy.nextReviewDate) changes.push(`Next review: ${policy.nextReviewDate} → ${editNextReview}`)
    if (departmentsChanged) changes.push('Affected departments updated')
    if (ownerDeptChanged) changes.push('Business owner department updated')
    if (formDocFile) changes.push(`Document replaced: "${formDocFile.name}"`)

    // P8: nothing actually changed → close without appending a version-history
    // entry (and without re-anchoring next_review_date).
    if (changes.length === 0) {
      onClose()
      return
    }

    const changesText = changes.join('; ')

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

    // W37: when the tier changed and the user opted to reset, reseed the
    // workflow FIRST (the reseed route owns steps + status), then apply the
    // field edits on top — its reconcile reads the freshly-seeded steps.
    // Guard the whole save tail: if the reseed throws unexpectedly the modal
    // would otherwise stay stuck behind a spinner with no feedback, so reset the
    // reseed flag in finally and surface a clear toast on failure.
    try {
      if (reseedSteps) {
        setIsReseeding(true)
        await reseedWorkflowFromTier(policy.id, formTier as string)
      }
    } catch (e) {
      console.error('Failed to reset policy workflow on tier change', e)
      pushToast({ key: 'errors.policies.updateFailed' }, 'error')
      return
    } finally {
      setIsReseeding(false)
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
      // Only push schedule-derived fields when the schedule actually changed, so
      // a no-op save never re-anchors next_review_date (server version gate).
      ...(scheduleChanged
        ? {
            nextReviewDate: editNextReview,
            reviewCycleDays: cadenceToReviewCycleDays(formReviewSchedule.cadence),
            reviewSchedule: formReviewSchedule,
          }
        : {}),
      ...(formDocFile ? { attachmentUrl: formDocFile.name } : {}),
      versionHistory: [...policy.versionHistory, versionEntry],
      activityLog: [...(policy.activityLog ?? []), activityEntry],
    })
    onSaved(t('policies.policyUpdated'))
    onClose()
  }

  // Changing the approval tier on an existing policy keeps the workflow steps by
  // default; we prompt to optionally reset them to match the new tier.
  function handleSave() {
    if (!policy || !formValid) return
    if (formTier !== policy.approvalTier) { setShowTierConfirm(true); return }
    void doSave(false)
  }

  if (!policy) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('policies.editPolicy')} size="xl">
      <div className="space-y-6">
        {/* W37: tier-change → optional workflow reseed prompt. `fixed` so it
            centers in the viewport regardless of how far the modal is scrolled. */}
        {showTierConfirm && (
          <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Icon icon="lucide:git-branch" className="text-amber-600 text-lg" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('policies.tierChangeTitle')}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('policies.tierChangeBody', { tier: tierItems.find((ti) => ti.id === formTier)?.label ?? String(formTier) })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Icon icon="lucide:alert-triangle" className="text-amber-500 text-sm shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-700">{t('policies.tierChangeWarning')}</span>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <Button variant="primary" disabled={isReseeding} aria-busy={isReseeding || undefined} onClick={() => void doSave(true)}>
                  {isReseeding && <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />}
                  {t('policies.tierChangeReset')}
                </Button>
                <Button variant="outline" disabled={isReseeding} onClick={() => void doSave(false)}>
                  {t('policies.tierChangeKeep')}
                </Button>
                <Button variant="ghost" disabled={isReseeding} onClick={() => setShowTierConfirm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}
        <p className="text-sm text-slate-500 -mt-2">{t('policies.editPolicySubtitle')}</p>

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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')}<span className="text-rose-500"> *</span></label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')}<span className="text-rose-500"> *</span></label>
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
              {/* W37: chip + removable-pill multi-select, matching the Create
                  Policy modal (was an old checkbox list). */}
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')}<span className="text-rose-500"> *</span></label>
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
              existingName={policy.attachments?.[0]?.name ?? (policy.attachmentUrl || undefined)}
              t={t}
            />
            {docError && <p role="alert" className="text-xs font-semibold text-rose-600 mt-1.5">{docError}</p>}
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
