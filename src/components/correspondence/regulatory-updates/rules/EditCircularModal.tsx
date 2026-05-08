'use client'

import { useState, useEffect, useMemo } from 'react'
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

  // Options = enabled correspondence-based frameworks. The current selection
  // is always included so editing a circular whose authority was later
  // disabled doesn't silently switch the value.
  const frameworksAll = useFrameworkConfigStore((s) => s.frameworks)
  const authorityOptions = useMemo(() => {
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
    const editData: Partial<Circular> = {
      title: formTitle,
      authority: formAuthority,
      priority: formPriority,
      issuanceDate: formIssuanceDate,
      dueDate: formDueDate,
      capDeadline: formCapDeadline || undefined,
      referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined,
      departments: formDepartments,
      description: formDescription,
      businessOwnerDepartment: formBODept || undefined,
      assignedTo: formAssignedTo || undefined,
      frameworkIds,
    }
    requestCircularEdit(circular.id, editData)
    onSaved()
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
                  id: m.name,
                  label: `${m.name} - ${m.department}`,
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
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-44 overflow-y-auto">
                {allDepartments.map((dept) => (
                  <label key={dept.id} className={`flex items-center gap-3 cursor-pointer`}>
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                      checked={formDepartments.includes(dept.name)}
                      onChange={() => toggleDept(dept.name)}
                    />
                    <span className="text-sm">{isRTL ? dept.nameAr : dept.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.circularDescription')}</label>
              <textarea
                className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" selfAssessmentOnly />
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
