'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'
import type { CircularAuthority, CircularPriority, CircularStatus, CircularApplicability, CAPStatus } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useTranslation } from '@/i18n'
import { readFileAsDataUrl, normalizeUrl } from './utils'
import { formatBytes } from '@/lib/format'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import type { RegulatoryBodyId } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'
import { useEntityTemplateStore } from '@/stores/entity-template-store'


type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
}

export function RegisterCircularModal({ isOpen, onClose, onCreated, t }: Props) {
  const { isRTL } = useTranslation()
  const { create, addPdfAttachment } = useCircularStore()
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const { members: teamMembers } = useTeamStore()

  // M2: template store — Select Template dropdown only (Save button moved to Policy/Audit per W29 M2).
  const { byType: templatesByType, fetchByType } = useEntityTemplateStore()
  const circularTemplates = templatesByType['circular'] ?? []
  useEffect(() => {
    if (isOpen) void fetchByType('circular')
  }, [isOpen, fetchByType])

  const [formTitle, setFormTitle] = useState('')
  const [formAuthority, setFormAuthority] = useState<CircularAuthority | ''>('')
  const [formPriority, setFormPriority] = useState<CircularPriority>('medium')
  const [formIssuanceDate, setFormIssuanceDate] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [formCapDeadline, setFormCapDeadline] = useState('')
  const [formReferenceUrl, setFormReferenceUrl] = useState('')
  const [formDepartments, setFormDepartments] = useState<string[]>([])
  const [formDescription, setFormDescription] = useState('')
  const [formBODept, setFormBODept] = useState('')
  const [formAssignedTo, setFormAssignedTo] = useState('')
  const [formPdfFiles, setFormPdfFiles] = useState<Array<{ name: string; dataUrl: string; size: number }>>([])
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>([])

  // Authority picker shows ONLY frameworks the user has both enabled in
  // Settings AND that are correspondence-based. Compliance-only frameworks
  // (e.g. NCA) still surface as framework tags via FrameworkTagSelector
  // below — they just aren't valid "authority" values for a circular.
  const frameworksAll = useFrameworkConfigStore((s) => s.frameworks)
  const authorityOptions = useMemo(
    () =>
      frameworksAll
        .filter((f) => f.enabled && f.correspondenceBased)
        .map((f) => ({ value: f.id, label: isRTL ? f.nameAr : f.name })),
    [frameworksAll, isRTL]
  )

  // M2: apply a selected template to the form fields.
  function applyTemplate(templateId: string) {
    const tpl = circularTemplates.find((t) => t.id === templateId)
    if (!tpl) return
    const f = tpl.fields as Record<string, unknown>
    if (typeof f.title === 'string') setFormTitle(f.title)
    if (typeof f.authority === 'string') setFormAuthority(f.authority as CircularAuthority | '')
    if (typeof f.priority === 'string') setFormPriority(f.priority as CircularPriority)
    if (typeof f.description === 'string') setFormDescription(f.description)
    if (Array.isArray(f.departments)) setFormDepartments(f.departments as string[])
    if (typeof f.bo_dept === 'string') setFormBODept(f.bo_dept)
  }

  function toggleDepartment(dept: string) {
    setFormDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  function handleCreate() {
    if (
      !formAuthority ||
      !formTitle ||
      !formIssuanceDate ||
      !formDueDate ||
      !formCapDeadline ||
      formDepartments.length === 0
    ) {
      return
    }
    // Capture the form payload before resetting / closing.
    const payload = {
      authority: formAuthority as CircularAuthority,
      title: formTitle,
      priority: formPriority,
      status: 'pending' as CircularStatus,
      applicability: 'pending' as CircularApplicability,
      departments: formDepartments,
      businessOwnerDepartment: formBODept || undefined,
      assignedTo: formAssignedTo || undefined,
      progress: 0,
      issuanceDate: formIssuanceDate,
      dueDate: formDueDate,
      capDeadline: formCapDeadline,
      referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined,
      capStatus: 'not-started' as CAPStatus,
      articles: [],
      description: formDescription,
      frameworkIds,
    }
    // W15-4: every uploaded PDF — including the FIRST — must go through the
    // multi-file attachment flow so its real filename is persisted. The legacy
    // single `pdf_url` path (via `setPdfUrl`) stored no `name`, so the first
    // upload on a new circular used to lose its filename. Capture the full
    // list (each entry already carries `name`) and upload them all.
    const pdfFilesToUpload = [...formPdfFiles]

    // Close-on-click: reset the form + close the modal the SAME tick. The
    // store inserts a temp circular row at the top of the list immediately
    // (before the POST returns), swaps it for the server row on success, and
    // removes it + toasts on failure. The optional PDF upload chains onto the
    // real id once the create resolves.
    setFormTitle('')
    setFormAuthority('')
    setFormPriority('medium')
    setFormIssuanceDate('')
    setFormDueDate('')
    setFormCapDeadline('')
    setFormReferenceUrl('')
    setFormDepartments([])
    setFormDescription('')
    setFormBODept('')
    setFormAssignedTo('')
    setFormPdfFiles([])
    setFrameworkIds([])
    onCreated(t('regulatoryUpdates.circularRegistered'))

    void Promise.resolve(create(payload))
      .then(async (created) => {
        if (created && pdfFilesToUpload.length > 0) {
          // Sequential so each attachment row keeps a stable order; the store
          // persists the File's real `.name` on every upload.
          for (const f of pdfFilesToUpload) {
            try {
              await addPdfAttachment(created.id, {
                name: f.name,
                size: f.size,
                dataUrl: f.dataUrl,
                type: 'application/pdf',
              })
            } catch {
              // Store already reverted + raised a friendly toast.
            }
          }
        }
      })
      .catch(() => {
        // Store already reverted + raised a friendly toast.
      })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('regulatoryUpdates.registerNewCircular')}
      size="xl"
    >
      <div className="space-y-6">
        <p className="text-sm text-slate-500 -mt-2">{t('regulatoryUpdates.enterCircularDetails')}</p>

        {/* M2: Select template row */}
        {circularTemplates.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <Icon icon="lucide:layout-template" className="text-slate-400 shrink-0" />
            <div className="flex-1">
              <EditableSelect
                locked
                value={null}
                onChange={(id) => { if (id) applyTemplate(id) }}
                items={circularTemplates.map((tpl) => ({ id: tpl.id, label: tpl.name }))}
                placeholder={t('regulatoryUpdates.selectTemplatePlaceholder' as any)}
                isRTL={isRTL}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.authority')}<span className="text-rose-500" aria-hidden="true"> *</span><span className="sr-only"> ({t('common.required')})</span>
              </label>
              <EditableSelect
                locked
                value={formAuthority || null}
                onChange={(id) => setFormAuthority(id as CircularAuthority | '')}
                items={authorityOptions.map((opt) => ({ id: opt.value as string, label: opt.label }))}
                placeholder={t('regulatoryUpdates.selectAuthority')}
                isRTL={isRTL}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.ruleTitle')} <span className="text-rose-500 ml-1">*</span>
              </label>
              <input
                type="text"
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder={t('regulatoryUpdates.ruleTitlePlaceholder')}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

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
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.name)}
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
                  // assigned_to is a UUID column on the server (HANDOFF #15).
                  id: m.id,
                  // Cosmetic: only append "— department" when the member has
                  // one; otherwise the label trails a dangling separator.
                  label: m.department ? `${m.name} — ${m.department}` : m.name,
                }))}
                placeholder={t('regulatoryUpdates.selectOfficer')}
                isRTL={isRTL}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.issuanceDate')} <span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  type="date"
                  value={formIssuanceDate}
                  onChange={(e) => setFormIssuanceDate(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.implementationDeadline')} <span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.capDeadline')} <span className="text-rose-500 ml-1">*</span>
              </label>
              <input
                type="date"
                value={formCapDeadline}
                onChange={(e) => setFormCapDeadline(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.referenceUrl')}
              </label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.affectedDepartments')} <span className="text-rose-500 ml-1">*</span>
              </label>
              {/* Multi-pick chip selector (Story 1 #1.4). Clicking a chip
                  toggles selection; selected chips show below as removable
                  pills. Min-one validation is enforced by handleCreate +
                  surfaced in the "Missing required" hint. */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex flex-wrap gap-1.5">
                  {allDepartments.map((dept) => {
                    const selected = formDepartments.includes(dept.name)
                    return (
                      <button
                        type="button"
                        key={dept.id}
                        onClick={() => toggleDepartment(dept.name)}
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
                      {dept}
                      <button
                        type="button"
                        onClick={() => toggleDepartment(dept)}
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.description')}</label>
              <textarea
                className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                placeholder={t('regulatoryUpdates.addInternalComments')}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label={t('regulatoryUpdates.frameworks')} selfAssessmentOnly />

            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,.docx"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? [])
                for (const file of files) {
                  const dataUrl = await readFileAsDataUrl(file)
                  setFormPdfFiles(prev => [...prev, { name: file.name, dataUrl, size: file.size }])
                }
                e.target.value = ''
              }}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.addCircularFiles')}</label>
              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-emerald-500 transition-colors"
                onClick={() => pdfInputRef.current?.click()}
              >
                {formPdfFiles.length > 0 ? (
                  <div className="space-y-2">
                    {formPdfFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Icon icon="lucide:file-text" className="text-emerald-600 shrink-0" />
                        <span className="text-sm font-medium text-emerald-700 flex-1 truncate">{f.name}</span>
                        <span className="text-[10px] text-slate-400">{formatBytes(f.size, 0)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setFormPdfFiles(prev => prev.filter((_, j) => j !== i)) }}
                          className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Icon icon="lucide:x" className="text-xs" />
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-slate-400 mt-1">{t('regulatoryUpdates.uploadMoreFiles')}</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">{t('regulatoryUpdates.fileUploadHint')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`flex flex-col gap-3 pt-4 border-t border-slate-100`}>
          {(() => {
            const missing = [
              !formAuthority && t('regulatoryUpdates.authority'),
              !formTitle && t('regulatoryUpdates.ruleTitle'),
              !formIssuanceDate && t('regulatoryUpdates.issuanceDate'),
              !formDueDate && t('regulatoryUpdates.implementationDeadline'),
              !formCapDeadline && t('regulatoryUpdates.capDeadline'),
              formDepartments.length === 0 && t('regulatoryUpdates.affectedDepartments'),
            ].filter(Boolean) as string[]
            if (missing.length === 0) return null
            return (
              <p className="text-xs text-rose-600 self-end">
                {t('regulatoryUpdates.missingRequired')}: {missing.join(', ')}
              </p>
            )
          })()}
          {/* M2: Save-as-template button removed from Rules per W29 M2.
              The Select Template dropdown above is kept (already wired, harmless).
              Template creation for Rules is now handled in Settings > Templates. */}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={handleCreate}
              disabled={
                !formAuthority ||
                !formTitle ||
                !formIssuanceDate ||
                !formDueDate ||
                !formCapDeadline ||
                formDepartments.length === 0
              }
            >
              {t('regulatoryUpdates.initiateTracker')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
