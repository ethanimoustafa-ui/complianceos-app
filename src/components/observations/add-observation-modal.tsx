'use client'

import { useState, memo, useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FileUpload, UploadedFile } from '@/components/ui/file-upload'
import { ObservationSource, ObservationSeverity } from './observation-types'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useTranslation } from '@/i18n'
import type { TeamMember, RegulatoryBodyId } from '@/types'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import {
  SourceSelectionField,
  SeverityField,
  DepartmentField,
  AssigneeField,
  DueDateField,
} from './observation-form-fields'

interface AddObservationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ObservationFormData) => void
}

export interface ObservationFormData {
  source: ObservationSource
  title: string
  subTitle: string
  // O3/O5: reference is auto-generated server-side; removed from create form.
  reference?: string
  severity: ObservationSeverity
  description: string
  department: string
  assignees: { id: string; name: string; avatar: string; role: string }[]
  dueDate: string
  remediationSubmissionDueDate?: string
  attachments?: UploadedFile[]
  frameworkIds?: RegulatoryBodyId[]
}

interface FormErrors {
  title?: string
  subTitle?: string
  severity?: string
  description?: string
  department?: string
  dueDate?: string
  remediationSubmissionDueDate?: string
  assignees?: string
}

export const AddObservationModal = memo(function AddObservationModal({ isOpen, onClose, onSave }: AddObservationModalProps) {
  const { t, isRTL } = useTranslation()
  const { members } = useTeamStore()
  const activeMembers = members.filter(m => m.status === 'active')
  // O4: track in-flight submit to show spinner on Create button
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Hydrate department list when the modal opens — the `DepartmentField`
  // pulls from `useDepartmentStore`, which starts cold on first render. Without
  // this fetch the dropdown renders "No options" even though /api/settings/departments
  // returns 12 active rows.
  const fetchDepartments = useDepartmentStore((s) => s.fetchAll)
  const departmentsLoaded = useDepartmentStore((s) => s.lastFetched != null)
  useEffect(() => {
    if (isOpen && !departmentsLoaded) {
      void fetchDepartments()
    }
  }, [isOpen, departmentsLoaded, fetchDepartments])

  const [formData, setFormData] = useState<ObservationFormData>({
    source: 'sama',
    title: '',
    subTitle: '',
    severity: 'critical',
    description: '',
    department: '',
    assignees: [],
    dueDate: '',
    remediationSubmissionDueDate: '',
    attachments: [],
  })
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<TeamMember[]>([])
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>([])

  const handleSourceSelect = (source: ObservationSource) => {
    setFormData((prev) => ({ ...prev, source }))
  }

  const validateForm = useCallback((): FormErrors => {
    const newErrors: FormErrors = {}

    if (!formData.title.trim()) {
      newErrors.title = t('observations.validation.titleRequired')
    } else if (formData.title.trim().length < 3) {
      newErrors.title = t('observations.validation.titleMinLength')
    }

    if (!formData.subTitle.trim()) {
      newErrors.subTitle = t('observations.validation.subTitleRequired')
    }

    // O3: reference is auto-generated server-side — no client validation needed.

    if (!formData.description.trim()) {
      newErrors.description = t('observations.validation.descriptionRequired')
    } else if (formData.description.trim().length < 10) {
      newErrors.description = t('observations.validation.descriptionMinLength')
    }

    if (!formData.department) {
      newErrors.department = t('observations.validation.departmentRequired')
    }

    if (!formData.dueDate) {
      newErrors.dueDate = t('observations.validation.dueDateRequired')
    }

    // Validate submission due date must be before observation due date
    if (formData.remediationSubmissionDueDate && formData.dueDate) {
      const submissionDate = new Date(formData.remediationSubmissionDueDate)
      const completionDate = new Date(formData.dueDate)
      if (submissionDate >= completionDate) {
        newErrors.remediationSubmissionDueDate = t('observations.validation.submissionDueDateMustBeBefore')
      }
    }

    // Assignees are optional - creator will be auto-added by the store

    return newErrors
  }, [formData, selectedAssignees, t])

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    // Only validate the specific field, not the entire form
    const validationErrors = validateForm()
    // Only set error for the blurred field
    setErrors((prev) => ({
      ...prev,
      [field]: validationErrors[field as keyof FormErrors],
    }))
  }

  const handleSubmit = async () => {
    // Mark all fields as touched
    setTouched({
      title: true,
      subTitle: true,
      description: true,
      department: true,
      dueDate: true,
      remediationSubmissionDueDate: true,
      assignees: true,
    })

    const validationErrors = validateForm()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    // O4: show spinner while create is in-flight
    setIsSubmitting(true)
    try {
      // Convert selected team members to assignees format
      const assignees = selectedAssignees.map(member => ({
        id: member.id,
        name: member.name,
        avatar: member.avatar || member.name,
        role: member.role,
      }))
      await (onSave as (data: ObservationFormData) => Promise<void> | void)(
        { ...formData, assignees, attachments: uploadedFiles, frameworkIds }
      )
      // Don't call onClose() here - parent will close the modal after processing
      // Reset form for next time modal opens
      setFormData({
        source: 'sama',
        title: '',
        subTitle: '',
        severity: 'critical',
        description: '',
        department: '',
        assignees: [],
        dueDate: '',
        remediationSubmissionDueDate: '',
        attachments: [],
      })
      setUploadedFiles([])
      setSelectedAssignees([])
      setErrors({})
      setTouched({})
      setFrameworkIds([])
    } finally {
      setIsSubmitting(false)
    }
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
            <SourceSelectionField
              value={formData.source}
              onChange={handleSourceSelect}
            />

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.findingTitle')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={t('observations.form.findingTitlePlaceholder')}
                  value={formData.title}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                    // Clear error when field becomes valid
                    if (e.target.value.trim().length >= 3) {
                      setErrors((prev) => ({ ...prev, title: undefined }))
                    }
                  }}
                  onBlur={() => handleBlur('title')}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    touched.title && errors.title ? 'border-rose-300' : 'border-slate-200'
                  }`}
                />
                {touched.title && errors.title ? (
                  <p className="text-rose-500 text-xs mt-1">{errors.title}</p>
                ) : null}
              </div>

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.subFindingTitle')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={t('observations.form.subFindingTitlePlaceholder')}
                  value={formData.subTitle}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, subTitle: e.target.value }))
                    // Clear error when field becomes valid
                    if (e.target.value.trim()) {
                      setErrors((prev) => ({ ...prev, subTitle: undefined }))
                    }
                  }}
                  onBlur={() => handleBlur('subTitle')}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    touched.subTitle && errors.subTitle ? 'border-rose-300' : 'border-slate-200'
                  }`}
                />
                {touched.subTitle && errors.subTitle ? (
                  <p className="text-rose-500 text-xs mt-1">{errors.subTitle}</p>
                ) : null}
              </div>

              {/* O3: reference is auto-generated server-side — input removed */}

              <SeverityField
                value={formData.severity}
                onChange={(severity) => setFormData((prev) => ({ ...prev, severity }))}
              />

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.description')} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder={t('observations.form.descriptionPlaceholder')}
                  value={formData.description}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                    // Clear error when field becomes valid
                    if (e.target.value.trim().length >= 10) {
                      setErrors((prev) => ({ ...prev, description: undefined }))
                    }
                  }}
                  onBlur={() => handleBlur('description')}
                  className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${
                    touched.description && errors.description ? 'border-rose-300' : 'border-slate-200'
                  }`}
                />
                {touched.description && errors.description ? (
                  <p className="text-rose-500 text-xs mt-1">{errors.description}</p>
                ) : null}
              </div>

              <DepartmentField
                value={formData.department}
                onChange={(department) => {
                  setFormData((prev) => ({ ...prev, department }))
                  // Clear error when user makes a selection
                  if (department) {
                    setErrors((prev) => ({ ...prev, department: undefined }))
                  }
                }}
                onBlur={() => handleBlur('department')}
                error={touched.department ? errors.department : undefined}
                required
              />

              <DueDateField
                value={formData.dueDate}
                onChange={(dueDate) => {
                  setFormData((prev) => ({ ...prev, dueDate }))
                  // Clear error when user makes a selection
                  if (dueDate) {
                    setErrors((prev) => ({ ...prev, dueDate: undefined }))
                  }
                  // Re-validate submission due date if it exists
                  if (formData.remediationSubmissionDueDate && dueDate) {
                    const submissionDate = new Date(formData.remediationSubmissionDueDate)
                    const completionDate = new Date(dueDate)
                    if (submissionDate >= completionDate) {
                      setErrors((prev) => ({ ...prev, remediationSubmissionDueDate: t('observations.validation.submissionDueDateMustBeBefore') }))
                    } else {
                      setErrors((prev) => ({ ...prev, remediationSubmissionDueDate: undefined }))
                    }
                  }
                }}
                onBlur={() => handleBlur('dueDate')}
                error={touched.dueDate ? errors.dueDate : undefined}
                required
              />

              {/* Remediation Plan Submission Due Date */}
              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.remediationSubmissionDueDate')}
                </label>
                <input
                  type="date"
                  value={formData.remediationSubmissionDueDate}
                  onChange={(e) => {
                    const submissionDate = e.target.value
                    setFormData((prev) => ({ ...prev, remediationSubmissionDueDate: submissionDate }))
                    // Clear error when valid
                    if (submissionDate && formData.dueDate) {
                      const submission = new Date(submissionDate)
                      const completion = new Date(formData.dueDate)
                      if (submission < completion) {
                        setErrors((prev) => ({ ...prev, remediationSubmissionDueDate: undefined }))
                      }
                    } else if (!submissionDate) {
                      setErrors((prev) => ({ ...prev, remediationSubmissionDueDate: undefined }))
                    }
                  }}
                  onBlur={() => handleBlur('remediationSubmissionDueDate')}
                  className={`w-full px-4 py-3 bg-slate-50 border ${touched.remediationSubmissionDueDate && errors.remediationSubmissionDueDate ? 'border-rose-300' : 'border-slate-200'} rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                />
                <p className="text-xs text-slate-400 mt-1">{t('observations.form.remediationSubmissionDueDateHint')}</p>
                {touched.remediationSubmissionDueDate && errors.remediationSubmissionDueDate ? (
                  <p className="text-rose-500 text-xs mt-1">{errors.remediationSubmissionDueDate}</p>
                ) : null}
              </div>

              <div className="col-span-2">
                <AssigneeField
                  selectedAssignees={selectedAssignees}
                  availableMembers={activeMembers}
                  onChange={(assignees) => {
                    setSelectedAssignees(assignees)
                    setTouched((prev) => ({ ...prev, assignees: true }))
                  }}
                  isRTL={isRTL}
                  error={touched.assignees ? errors.assignees : undefined}
                />
              </div>

              <div className="col-span-2">
                <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" selfAssessmentOnly />
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
        <div className={`p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3`}>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('observations.modal.createButton')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
})
