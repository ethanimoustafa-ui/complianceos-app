'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FileUpload, UploadedFile } from '@/components/ui/file-upload'
import { ObservationSource, ObservationSeverity, sourceConfig } from './observation-types'
import { useObservationStore } from '@/stores/observation-store'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'
import type { TeamMember } from '@/types'

// Department keys for translation lookup
const departmentKeys: Record<string, string> = {
  'IT & Cybersecurity': 'observations.departments.itCybersecurity',
  'Human Resources': 'observations.departments.humanResources',
  'Risk Management': 'observations.departments.riskManagement',
  'Operations': 'observations.departments.operations',
  'Legal': 'observations.departments.legal',
  'Compliance': 'observations.departments.compliance',
  'Finance': 'observations.departments.finance',
}

const departments = Object.keys(departmentKeys)

interface AddObservationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ObservationFormData) => void
}

export interface ObservationFormData {
  source: ObservationSource
  title: string
  subTitle: string
  reference: string
  severity: ObservationSeverity
  description: string
  department: string
  assignees: { id: string; name: string; avatar: string; role: string }[]
  dueDate: string
  attachments?: UploadedFile[]
}

export function AddObservationModal({ isOpen, onClose, onSave }: AddObservationModalProps) {
  const { t, isRTL } = useTranslation()
  const { getNextReference } = useObservationStore()
  const { members } = useTeamStore()
  const activeMembers = members.filter(m => m.status === 'active')

  const [formData, setFormData] = useState<ObservationFormData>({
    source: 'sama',
    title: '',
    subTitle: '',
    reference: '',
    severity: 'critical',
    description: '',
    department: 'IT & Cybersecurity',
    assignees: [],
    dueDate: '',
    attachments: [],
  })
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<TeamMember[]>([])

  const handleSourceSelect = (source: ObservationSource) => {
    setFormData((prev) => ({ ...prev, source }))
  }

  const handleSubmit = () => {
    // Convert selected team members to assignees format
    const assignees = selectedAssignees.map(member => ({
      id: member.id,
      name: member.name,
      avatar: member.avatar || member.name,
      role: member.role,
    }))
    onSave({ ...formData, assignees, attachments: uploadedFiles })
    // Don't call onClose() here - parent will close the modal after processing
    // Reset form for next time modal opens
    setFormData({
      source: 'sama',
      title: '',
      subTitle: '',
      reference: '',
      severity: 'critical',
      description: '',
      department: 'IT & Cybersecurity',
      assignees: [],
      dueDate: '',
      attachments: [],
    })
    setUploadedFiles([])
    setSelectedAssignees([])
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className={`flex justify-between items-start mb-8`}>
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                {t('observations.modal.addTitle')}
              </h2>
              <p className="text-sm text-slate-500">
                {t('observations.modal.addDescription')}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <div className="space-y-8">
            {/* Source Selection */}
            <div>
              <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block `}>
                {t('observations.form.sourceSelection')}
              </label>
              <div className="grid grid-cols-3 gap-4">
                {(Object.keys(sourceConfig) as ObservationSource[]).map((source) => {
                  const config = sourceConfig[source]
                  const isSelected = formData.source === source

                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => handleSourceSelect(source)}
                      className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                          : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                    >
                      <Icon
                        icon={config.icon}
                        className={`text-3xl ${
                          source === 'sama'
                            ? 'text-emerald-600'
                            : source === 'internal'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                        }`}
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {source === 'sama'
                          ? t('observations.sama')
                          : source === 'internal'
                          ? t('observations.sources.internal')
                          : t('observations.sources.sharia')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.findingTitle')}
                </label>
                <input
                  type="text"
                  placeholder={t('observations.form.findingTitlePlaceholder')}
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                />
              </div>

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.subFindingTitle')}
                </label>
                <input
                  type="text"
                  placeholder={t('observations.form.subFindingTitlePlaceholder')}
                  value={formData.subTitle}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, subTitle: e.target.value }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                />
              </div>

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.referenceNumber')}
                </label>
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input
                    type="text"
                    placeholder={t('observations.form.referencePlaceholder')}
                    value={formData.reference}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, reference: e.target.value }))
                    }
                    className={`flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextRef = getNextReference()
                      setFormData((prev) => ({ ...prev, reference: nextRef }))
                    }}
                    className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 hover:bg-emerald-100 transition-colors"
                    title="Auto-generate reference"
                  >
                    <Icon icon="lucide:sparkles" />
                  </button>
                </div>
              </div>

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.severity')}
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      severity: e.target.value as ObservationSeverity,
                    }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                >
                  <option value="critical">{t('observations.severityOptions.critical')}</option>
                  <option value="high">{t('observations.severityOptions.high')}</option>
                  <option value="medium">{t('observations.severityOptions.medium')}</option>
                  <option value="low">{t('observations.severityOptions.low')}</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.description')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('observations.form.descriptionPlaceholder')}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none `}
                />
              </div>

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.departmentAssignment')}
                </label>
                <select
                  value={formData.department}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                >
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {t(departmentKeys[dept] as 'observations.departments.itCybersecurity')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.dueDate')}
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                />
              </div>

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.assignees')}
                </label>
                {/* Selected assignees as chips */}
                {selectedAssignees.length > 0 && (
                  <div className={`flex flex-wrap gap-2 mb-3 max-h-20 overflow-y-auto ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {selectedAssignees.map(member => (
                      <span
                        key={member.id}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-slate-700 ${isRTL ? 'flex-row-reverse' : ''}`}
                      >
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                          className="w-5 h-5 rounded-full"
                          alt={member.name}
                        />
                        {member.name}
                        <button
                          type="button"
                          onClick={() => setSelectedAssignees(prev => prev.filter(m => m.id !== member.id))}
                          className="text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Icon icon="lucide:x" className="text-sm" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Dropdown to add more */}
                <div className="relative">
                  <Icon
                    icon="lucide:user-plus"
                    className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      const member = activeMembers.find(m => m.id === e.target.value)
                      if (member && !selectedAssignees.find(m => m.id === member.id)) {
                        setSelectedAssignees(prev => [...prev, member])
                      }
                    }}
                    className={`w-full pl-10 pr-8 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  >
                    <option value="">{t('observations.form.addAssignee')}</option>
                    {activeMembers
                      .filter(m => !selectedAssignees.find(s => s.id === m.id))
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} - {member.role} ({member.department})
                        </option>
                      ))}
                  </select>
                  <Icon
                    icon="lucide:chevron-down"
                    className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
                  />
                </div>
              </div>

              <div className="col-span-2">
                <FileUpload
                  label={t('observations.form.uploadReport')}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  multiple
                  files={uploadedFiles}
                  onChange={setUploadedFiles}
                  helperText={t('observations.form.fileHelper')}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            {t('observations.modal.createButton')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
