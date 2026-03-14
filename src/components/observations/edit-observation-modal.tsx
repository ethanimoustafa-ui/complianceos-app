'use client'

import { useEffect, useState, useMemo, memo } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FileUpload, UploadedFile } from '@/components/ui/file-upload'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useTeamStore } from '@/stores/team-store'
import { useTranslation } from '@/i18n'
import type { TeamMember } from '@/types'
import {
  SeverityField,
  DepartmentField,
  AssigneeField,
  DueDateField,
  departments,
} from './observation-form-fields'

const observationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  subTitle: z.string().optional(),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  source: z.enum(['sama', 'internal', 'sharia']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  dueDate: z.string().min(1, 'Due date is required'),
  remediationSubmissionDueDate: z.string().optional(),
  assigneeId: z.string().optional(),
  department: z.string().optional(),
}).refine((data) => {
  // Validate submission due date is before observation due date
  if (data.remediationSubmissionDueDate && data.dueDate) {
    const submissionDate = new Date(data.remediationSubmissionDueDate)
    const completionDate = new Date(data.dueDate)
    return submissionDate < completionDate
  }
  return true
}, {
  message: 'Submission due date must be before observation due date',
  path: ['remediationSubmissionDueDate'],
})

type ObservationFormData = z.infer<typeof observationSchema>

// Generic observation type to avoid import conflicts
interface ObservationData {
  id: string
  title: string
  subTitle?: string
  description: string
  source: string
  severity: string
  status: string
  dueDate: string
  remediationSubmissionDueDate?: string
  department?: string
  assignee?: { id?: string; name?: string; avatar?: string; role?: string }
  assignees?: { id?: string; name?: string; avatar?: string; role?: string }[]
  documents?: { id: string; name: string; type: string }[]
}

interface EditObservationModalProps {
  isOpen: boolean
  onClose: () => void
  observation: ObservationData | null
  onSave: (observationId: string, data: Partial<ObservationData>) => void
}

export const EditObservationModal = memo(function EditObservationModal({
  isOpen,
  onClose,
  observation,
  onSave,
}: EditObservationModalProps) {
  const { t, isRTL } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [selectedAssignees, setSelectedAssignees] = useState<TeamMember[]>([])
  const { members } = useTeamStore()
  const activeMembers = useMemo(() => members.filter(m => m.status === 'active'), [members])

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ObservationFormData>({
    resolver: zodResolver(observationSchema),
    defaultValues: {
      title: '',
      subTitle: '',
      description: '',
      source: 'sama',
      severity: 'medium',
      status: 'open',
      dueDate: '',
      remediationSubmissionDueDate: '',
      assigneeId: '',
      department: '',
    },
  })

  useEffect(() => {
    if (observation && isOpen) {
      console.log('EditObservationModal: Populating form with observation:', observation)
      // Use source value directly (sama, internal, sharia)
      const validSources: ObservationFormData['source'][] = ['sama', 'internal', 'sharia']
      const source = validSources.includes(observation.source as ObservationFormData['source'])
        ? (observation.source as ObservationFormData['source'])
        : 'sama'

      reset({
        title: observation.title,
        subTitle: observation.subTitle || '',
        description: observation.description,
        source,
        severity: observation.severity as ObservationFormData['severity'],
        status: observation.status as ObservationFormData['status'],
        dueDate: observation.dueDate,
        remediationSubmissionDueDate: observation.remediationSubmissionDueDate || '',
        assigneeId: '',
        department: observation.department || '',
      })

      // Initialize files from existing documents with correct MIME type mapping
      if (observation.documents) {
        setUploadedFiles(observation.documents.map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type === 'pdf' ? 'application/pdf'
              : doc.type === 'image' ? 'image/png'
              : 'application/msword',
          size: 0,
          progress: 100,
          status: 'complete' as const,
        })))
      } else {
        setUploadedFiles([])
      }

      // Initialize selected assignees from observation
      const existingAssignees: TeamMember[] = []
      // Check for assignees array first, then fall back to single assignee
      if (observation.assignees && observation.assignees.length > 0) {
        observation.assignees.forEach(assignee => {
          if (assignee?.id) {
            const member = members.find(m => m.id === assignee.id && m.status === 'active')
            if (member) existingAssignees.push(member)
          }
        })
      } else if (observation.assignee?.id) {
        const member = members.find(m => m.id === observation.assignee?.id && m.status === 'active')
        if (member) existingAssignees.push(member)
      }
      setSelectedAssignees(existingAssignees)
    }
  }, [observation, isOpen, reset, members])

  const onSubmit = async (data: ObservationFormData) => {
    if (!observation) return

    setIsLoading(true)
    try {
      // Convert uploaded files to documents format
      const documents = uploadedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type.includes('pdf') ? 'pdf' as const : file.type.includes('image') ? 'image' as const : 'doc' as const,
      }))

      // Convert selected team members to assignees format
      const assignees = selectedAssignees.map(member => ({
        id: member.id,
        name: member.name,
        avatar: member.avatar || member.name,
        role: member.role,
      }))

      // Call parent handler to update local state
      onSave(observation.id, {
        title: data.title,
        subTitle: data.subTitle,
        description: data.description,
        source: data.source,
        severity: data.severity,
        status: data.status,
        dueDate: data.dueDate,
        remediationSubmissionDueDate: data.remediationSubmissionDueDate || undefined,
        department: data.department,
        assignees,
        documents,
      })
      handleClose()
    } catch (error) {
      console.error('Failed to update observation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!observation) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className={`flex justify-between items-start mb-8`}>
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">{t('observations.modal.editTitle')}</h2>
              <p className="text-sm text-slate-500">{t('observations.modal.editDescription')}</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.findingTitle')}
                </label>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      className={cn(
                        `w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`,
                        errors.title ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.title && (
                  <p className={`text-rose-500 text-xs mt-1 `}>{errors.title.message}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.form.subFindingTitle')}
                </label>
                <Controller
                  name="subTitle"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder={t('observations.form.subFindingTitlePlaceholder')}
                      className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                    />
                  )}
                />
              </div>

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block `}>
                  {t('observations.source')}
                </label>
                <Controller
                  name="source"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 `}
                    >
                      <option value="sama">{t('observations.sama')}</option>
                      <option value="internal">{t('observations.sources.internal')}</option>
                      <option value="sharia">{t('observations.sources.sharia')}</option>
                    </select>
                  )}
                />
              </div>

              <Controller
                name="severity"
                control={control}
                render={({ field }) => (
                  <SeverityField
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />

              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('common.status')}
                </label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    >
                      <option value="open">{t('observations.statusOptions.open')}</option>
                      <option value="in_progress">{t('observations.statusOptions.inProgress')}</option>
                      <option value="resolved">{t('observations.statusOptions.pendingReview')}</option>
                      <option value="closed">{t('observations.statusOptions.closed')}</option>
                    </select>
                  )}
                />
              </div>

              <Controller
                name="dueDate"
                control={control}
                render={({ field }) => (
                  <DueDateField
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.dueDate?.message}
                  />
                )}
              />

              {/* Remediation Plan Submission Due Date */}
              <div>
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.remediationSubmissionDueDate')}
                </label>
                <Controller
                  name="remediationSubmissionDueDate"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="date"
                      value={field.value || ''}
                      onChange={field.onChange}
                      className={cn(
                        `w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`,
                        errors.remediationSubmissionDueDate ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                <p className="text-xs text-slate-400 mt-1">{t('observations.form.remediationSubmissionDueDateHint')}</p>
                {errors.remediationSubmissionDueDate ? (
                  <p className="text-rose-500 text-xs mt-1">{errors.remediationSubmissionDueDate.message}</p>
                ) : null}
              </div>

              <Controller
                name="department"
                control={control}
                render={({ field }) => (
                  <DepartmentField
                    value={field.value || ''}
                    onChange={field.onChange}
                    showEmpty
                  />
                )}
              />

              <AssigneeField
                selectedAssignees={selectedAssignees}
                availableMembers={activeMembers}
                onChange={setSelectedAssignees}
                isRTL={isRTL}
              />

              <div className="col-span-2">
                <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block`}>
                  {t('observations.form.description')}
                </label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={4}
                      className={cn(
                        `w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none`,
                        errors.description ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.description ? (
                  <p className={`text-rose-500 text-xs mt-1`}>{errors.description.message}</p>
                ) : null}
              </div>

              <div className="col-span-2">
                <FileUpload
                  label={t('observations.form.documents')}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  multiple
                  files={uploadedFiles}
                  onChange={setUploadedFiles}
                  helperText={t('observations.form.documentsHelper')}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className={`p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3`}>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('observations.modal.saving')}
              </>
            ) : (
              t('observations.modal.saveButton')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
})
