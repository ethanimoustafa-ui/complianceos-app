'use client'

import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'
import type { CircularAuthority, CircularPriority, CircularStatus, CircularApplicability, CAPStatus } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { readFileAsDataUrl, normalizeUrl } from './utils'

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
}

export function RegisterCircularModal({ isOpen, onClose, onCreated, t }: Props) {
  const { create, setPdfUrl } = useCircularStore()
  const { departments: allDepartments } = useDepartmentStore()
  const { members: teamMembers } = useTeamStore()

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

  function toggleDepartment(dept: string) {
    setFormDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  async function handleCreate() {
    if (!formAuthority || !formTitle || !formDueDate || !formCapDeadline) return
    const created = create({
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
    })
    if (formPdfFiles[0]) {
      setPdfUrl(created.id, formPdfFiles[0].dataUrl)
    }
    // Reset form
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
    onCreated(t('regulatoryUpdates.circularRegistered'))
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

        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.authority')} <span className="text-rose-500">*</span>
              </label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                value={formAuthority}
                onChange={(e) => setFormAuthority(e.target.value as CircularAuthority | '')}
              >
                <option value="">{t('regulatoryUpdates.selectAuthority')}</option>
                <option value="SAMA">{t('regulatoryUpdates.authoritySAMA')}</option>
                <option value="CMA">{t('regulatoryUpdates.authorityCMA')}</option>
                <option value="IA">{t('regulatoryUpdates.authorityIA')}</option>
                <option value="ZATCA">{t('regulatoryUpdates.authorityZATCA')}</option>
                <option value="MISA">{t('regulatoryUpdates.authorityMISA')}</option>
                <option value="SAFIU">{t('regulatoryUpdates.authoritySAFIU')}</option>
              </select>
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
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as CircularPriority)}
                >
                  <option value="critical">{t('regulatoryUpdates.critical')}</option>
                  <option value="high">{t('regulatoryUpdates.high')}</option>
                  <option value="medium">{t('regulatoryUpdates.medium')}</option>
                  <option value="low">{t('regulatoryUpdates.low')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formBODept}
                  onChange={(e) => setFormBODept(e.target.value)}
                >
                  <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                  {allDepartments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('regulatoryUpdates.assignedCircularFollowUp')}
              </label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                value={formAssignedTo}
                onChange={(e) => setFormAssignedTo(e.target.value)}
              >
                <option value="">{t('regulatoryUpdates.selectOfficer')}</option>
                {teamMembers.filter(m => m.status === 'active').map((m) => (
                  <option key={m.id} value={m.name}>{m.name} - {m.department}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('regulatoryUpdates.issuanceDate')}
                type="date"
                value={formIssuanceDate}
                onChange={(e) => setFormIssuanceDate(e.target.value)}
              />
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments')}</label>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                {allDepartments.map((dept) => (
                  <label key={dept.id} className={`flex items-center gap-3 cursor-pointer`}>
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                      checked={formDepartments.includes(dept.name)}
                      onChange={() => toggleDepartment(dept.name)}
                    />
                    <span className="text-sm">{dept.name}</span>
                  </label>
                ))}
              </div>
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
                        <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
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

        <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100`}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            className="shadow-lg shadow-emerald-100"
            onClick={handleCreate}
            disabled={!formAuthority || !formTitle || !formDueDate || !formCapDeadline}
          >
            {t('regulatoryUpdates.initiateTracker')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
