'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'
import type { Circular, CircularAuthority, CircularPriority } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { normalizeUrl } from './utils'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import type { RegulatoryBodyId } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'


type Props = {
  circular: Circular
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

export function EditCircularModal({ circular, isOpen, onClose, onSaved, t, isRTL }: Props) {
  const { requestCircularEdit } = useCircularStore()
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const { members: teamMembers } = useTeamStore()

  const [formTitle, setFormTitle] = useState(circular.title)
  const [formAuthority, setFormAuthority] = useState<CircularAuthority>(circular.authority)
  const [formPriority, setFormPriority] = useState<CircularPriority>(circular.priority)
  const [formIssuanceDate, setFormIssuanceDate] = useState(circular.issuanceDate)
  const [formDueDate, setFormDueDate] = useState(circular.dueDate)
  const [formCapDeadline, setFormCapDeadline] = useState(circular.capDeadline ?? '')
  const [formReferenceUrl, setFormReferenceUrl] = useState(circular.referenceUrl ?? '')
  const [formDepartments, setFormDepartments] = useState<string[]>(circular.departments)
  const [formDescription, setFormDescription] = useState(circular.description ?? '')
  const [formBODept, setFormBODept] = useState(circular.businessOwnerDepartment ?? '')
  const [formAssignedTo, setFormAssignedTo] = useState(circular.assignedTo ?? '')
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>(circular.frameworkIds ?? [])

  // Re-sync form state from the circular prop whenever the modal opens or the
  // underlying record changes (e.g. fetchById fills in description /
  // referenceUrl that weren't on the list response). Without this, opening the
  // Edit modal would keep stale state from the first time it mounted.
  useEffect(() => {
    if (!isOpen) return
    setFormTitle(circular.title)
    setFormAuthority(circular.authority)
    setFormPriority(circular.priority)
    setFormIssuanceDate(circular.issuanceDate)
    setFormDueDate(circular.dueDate)
    setFormCapDeadline(circular.capDeadline ?? '')
    setFormReferenceUrl(circular.referenceUrl ?? '')
    setFormDepartments(circular.departments)
    setFormDescription(circular.description ?? '')
    setFormBODept(circular.businessOwnerDepartment ?? '')
    setFormAssignedTo(circular.assignedTo ?? '')
    setFrameworkIds(circular.frameworkIds ?? [])
  }, [
    isOpen,
    circular.id,
    circular.title,
    circular.authority,
    circular.priority,
    circular.issuanceDate,
    circular.dueDate,
    circular.capDeadline,
    circular.referenceUrl,
    circular.departments,
    circular.description,
    circular.businessOwnerDepartment,
    circular.assignedTo,
    circular.frameworkIds,
  ])

  // Options = enabled correspondence-based frameworks. The current selection
  // is always included so editing a circular whose authority was later
  // disabled doesn't silently switch the value.
  const frameworksAll = useFrameworkConfigStore((s) => s.frameworks)
  const authorityOptions = useMemo(() => {
    // Authority picker shows only frameworks the user has BOTH enabled in
    // Settings AND that are correspondence-based. Compliance-only frameworks
    // (e.g. NCA) still surface as framework tags via FrameworkTagSelector —
    // they just aren't valid "authority" values for a circular.
    const base = frameworksAll
      .filter((f) => f.enabled && f.correspondenceBased)
      .map((f) => ({ value: f.id as string, label: isRTL ? f.nameAr : f.name }))
    if (formAuthority && !base.some((o) => o.value === formAuthority)) {
      const match = frameworksAll.find((f) => f.id === formAuthority)
      base.push({
        value: formAuthority,
        label: match ? (isRTL ? match.nameAr : match.name) : String(formAuthority),
      })
    }
    return base
  }, [frameworksAll, formAuthority, isRTL])

  function toggleDept(dept: string) {
    setFormDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  function handleRequestEdit() {
    // GAP-7 + GAP-10: send ONLY the fields the user actually changed. Diffing
    // each form value against the ORIGINAL `circular` prop avoids two bugs:
    //  - GAP-7: the server timeline lists every field even on a 1-field edit.
    //  - GAP-10: a stale prefill for an untouched field would be written back,
    //    silently overwriting the real DB value.
    // GAP-3 still holds: a field the user *did* change to empty is sent as `''`
    // so `toUpdatePayload` collapses it to an explicit `null`.

    // Optional strings: treat '' and undefined/null as equal — no spurious diff.
    const strEq = (a: string | null | undefined, b: string | null | undefined) =>
      (a ?? '') === (b ?? '')
    // Arrays: order-insensitive content compare.
    const arrEq = (a: readonly string[], b: readonly string[]) => {
      if (a.length !== b.length) return false
      const sa = [...a].sort()
      const sb = [...b].sort()
      return sa.every((v, i) => v === sb[i])
    }

    const normalizedUrl = formReferenceUrl ? normalizeUrl(formReferenceUrl) : ''

    const editData: Partial<Circular> = {}
    if (formTitle !== circular.title) editData.title = formTitle
    if (formAuthority !== circular.authority) editData.authority = formAuthority
    if (formPriority !== circular.priority) editData.priority = formPriority
    if (formIssuanceDate !== circular.issuanceDate) editData.issuanceDate = formIssuanceDate
    if (formDueDate !== circular.dueDate) editData.dueDate = formDueDate
    if (!strEq(formCapDeadline, circular.capDeadline)) editData.capDeadline = formCapDeadline
    if (!strEq(normalizedUrl, circular.referenceUrl)) editData.referenceUrl = normalizedUrl
    if (!arrEq(formDepartments, circular.departments)) editData.departments = formDepartments
    if (!strEq(formDescription, circular.description)) editData.description = formDescription
    if (!strEq(formBODept, circular.businessOwnerDepartment))
      editData.businessOwnerDepartment = formBODept
    if (!strEq(formAssignedTo, circular.assignedTo)) editData.assignedTo = formAssignedTo
    if (!arrEq(frameworkIds, circular.frameworkIds ?? [])) editData.frameworkIds = frameworkIds

    // Close-on-click: close immediately, fire the persist in the background.
    // The store applies an optimistic update so the row reflects the new
    // values right away; on failure the store will surface state.error and
    // revert via its catch path. When nothing changed, skip the PATCH entirely
    // so no pointless timeline row / version is written.
    onSaved()
    if (Object.keys(editData).length === 0) return
    void Promise.resolve(requestCircularEdit(circular.id, editData)).catch(() => {})
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('regulatoryUpdates.editCircular')} size="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.authority')}</label>
              <EditableSelect
                locked
                value={formAuthority}
                onChange={(id) => setFormAuthority(id as CircularAuthority)}
                items={authorityOptions.map((opt) => ({ id: opt.value, label: opt.label }))}
                isRTL={isRTL}
              />
            </div>

            <Input
              label={t('regulatoryUpdates.ruleTitle')}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.priorityLevel')}</label>
                <EditableSelect
                  locked
                  value={formPriority}
                  onChange={(id) => setFormPriority(id as CircularPriority)}
                  items={[
                    { id: 'critical', label: t('regulatoryUpdates.critical') },
                    { id: 'high', label: t('regulatoryUpdates.high') },
                    { id: 'medium', label: t('regulatoryUpdates.medium') },
                    { id: 'low', label: t('regulatoryUpdates.low') },
                  ]}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
                <EditableSelect
                  value={formBODept || null}
                  onChange={(id) => setFormBODept(id)}
                  items={allDepartments.map((dept) => ({
                    id: dept.name,
                    label: dept.name,
                    labelAr: dept.nameAr,
                    isDefault: dept.isDefault,
                  }))}
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).name}
                  onEdit={(id, label, labelAr) => {
                    const dept = allDepartments.find((d) => d.name === id)
                    if (dept) updateDepartment(dept.id, { name: label, nameAr: labelAr ?? label })
                  }}
                  onDelete={(id) => {
                    const dept = allDepartments.find((d) => d.name === id)
                    if (dept) removeDepartment(dept.id)
                  }}
                  placeholder={t('regulatoryUpdates.selectDepartment')}
                  isRTL={isRTL}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.assignedCircularFollowUp')}
              </label>
              <EditableSelect
                value={formAssignedTo || null}
                onChange={(id) => setFormAssignedTo(id)}
                items={teamMembers.filter((m) => m.status === 'active').map((m) => ({
                  // Send the team-member UUID, not their display name —
                  // `assigned_to` is a UUID column on the server. Seeding the
                  // control from `circular.assignedTo` (a UUID) only matches
                  // when item ids are UUIDs too, consistent with the Register
                  // modal.
                  id: m.id,
                  // Cosmetic: only append "- department" when the member has
                  // one; otherwise the label trails a dangling separator.
                  label: m.department ? `${m.name} - ${m.department}` : m.name,
                }))}
                placeholder={t('regulatoryUpdates.selectOfficer')}
                isRTL={isRTL}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('regulatoryUpdates.issuanceDate')}
                type="date"
                value={formIssuanceDate}
                onChange={(e) => setFormIssuanceDate(e.target.value)}
              />
              <Input
                label={t('regulatoryUpdates.implementationDeadline')}
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.capDeadline')}</label>
              <input
                type="date"
                value={formCapDeadline}
                onChange={(e) => setFormCapDeadline(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.referenceUrl')}</label>
              <input
                type="url"
                value={formReferenceUrl}
                onChange={(e) => setFormReferenceUrl(e.target.value)}
                placeholder={t('regulatoryUpdates.referenceUrlPlaceholder')}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments')}</label>
              {/* Side-bug: chips multi-select — kept consistent with the
                  Register modal's "Affected Departments" picker. Clicking a
                  chip toggles selection; selected chips show below as
                  removable pills. */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex flex-wrap gap-1.5">
                  {allDepartments.map((dept) => {
                    const selected = formDepartments.includes(dept.name)
                    return (
                      <button
                        type="button"
                        key={dept.id}
                        onClick={() => toggleDept(dept.name)}
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
              {formDepartments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formDepartments.map((dept) => (
                    <span
                      key={dept}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"
                    >
                      {/* RTL-3: show the Arabic department name on the
                          selected pills, matching the picker grid above. */}
                      {(() => {
                        const d = allDepartments.find(
                          (x) => x.name === dept || x.id === dept,
                        )
                        return d ? (isRTL ? d.nameAr : d.name) : dept
                      })()}
                      <button
                        type="button"
                        onClick={() => toggleDept(dept)}
                        className="text-emerald-600 hover:text-rose-600 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-[10px]" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.circularDescription')}</label>
              <textarea
                className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label={t('regulatoryUpdates.frameworks')} selfAssessmentOnly />
          </div>
        </div>

        <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100`}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleRequestEdit} disabled={!formTitle}>
            {t('common.saveChanges')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
