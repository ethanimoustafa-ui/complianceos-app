'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FileUpload, UploadedFile } from '@/components/ui/file-upload'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import type { Correspondence } from '@/types'

const correspondenceSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters'),
  type: z.enum(['internal', 'external', 'sama']),
  status: z.enum(['draft', 'sent', 'received']),
  from: z.string().min(1, 'From is required'),
  to: z.string().min(1, 'At least one recipient is required'),
  body: z.string().min(10, 'Body must be at least 10 characters'),
})

type CorrespondenceFormData = z.infer<typeof correspondenceSchema>

interface AddCorrespondenceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (correspondence: Correspondence) => void
}

const correspondenceTypes = [
  { id: 'internal', label: 'Internal', icon: 'lucide:building-2', color: 'blue' },
  { id: 'external', label: 'External', icon: 'lucide:globe', color: 'emerald' },
  { id: 'sama', label: 'SAMA', icon: 'lucide:landmark', color: 'purple' },
] as const

export function AddCorrespondenceModal({ isOpen, onClose, onSuccess }: AddCorrespondenceModalProps) {
  const { create, isLoading } = useCorrespondenceStore()
  const [selectedType, setSelectedType] = useState<'internal' | 'external' | 'sama'>('internal')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CorrespondenceFormData>({
    resolver: zodResolver(correspondenceSchema),
    defaultValues: {
      subject: '',
      type: 'internal',
      status: 'draft',
      from: '',
      to: '',
      body: '',
    },
  })

  const handleTypeSelect = (type: 'internal' | 'external' | 'sama') => {
    setSelectedType(type)
    setValue('type', type)
  }

  const onSubmit = async (data: CorrespondenceFormData) => {
    try {
      const correspondenceData = {
        subject: data.subject,
        type: data.type,
        status: data.status,
        from: data.from,
        to: data.to.split(',').map((email) => email.trim()),
        body: data.body,
        date: new Date().toISOString(),
        attachments: uploadedFiles.map((f) => ({
          id: f.id,
          name: f.name,
          url: '', // Would be set after actual upload
          type: f.type,
          size: f.size,
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'current-user',
        })),
      }

      const newCorrespondence = await create(correspondenceData)
      onSuccess?.(newCorrespondence)
      handleClose()
    } catch (error) {
      console.error('Failed to create correspondence:', error)
    }
  }

  const handleClose = () => {
    reset()
    setSelectedType('internal')
    setUploadedFiles([])
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                New Correspondence
              </h2>
              <p className="text-sm text-slate-500">Create a new correspondence record.</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Type Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Correspondence Type
              </label>
              <div className="grid grid-cols-3 gap-4">
                {correspondenceTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={cn(
                      'p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer',
                      selectedType === type.id
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                    )}
                  >
                    <Icon
                      icon={type.icon}
                      className={cn(
                        'text-3xl',
                        type.color === 'blue' && 'text-blue-600',
                        type.color === 'emerald' && 'text-emerald-600',
                        type.color === 'purple' && 'text-purple-600'
                      )}
                    />
                    <span className="text-sm font-bold text-slate-900">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Subject
                </label>
                <Controller
                  name="subject"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="e.g., Re: Quarterly Compliance Report"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.subject ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.subject && (
                  <p className="text-rose-500 text-xs mt-1">{errors.subject.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  From
                </label>
                <Controller
                  name="from"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      placeholder="sender@company.com"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.from ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.from && (
                  <p className="text-rose-500 text-xs mt-1">{errors.from.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  To (comma separated)
                </label>
                <Controller
                  name="to"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="recipient1@company.com, recipient2@company.com"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.to ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.to && (
                  <p className="text-rose-500 text-xs mt-1">{errors.to.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Status
                </label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="received">Received</option>
                    </select>
                  )}
                />
              </div>

              <div className="col-span-2">
                <FileUpload
                  label="Attachments"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  multiple
                  files={uploadedFiles}
                  onChange={setUploadedFiles}
                  helperText="PDF, DOC, XLS, or images up to 10MB"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Body
                </label>
                <Controller
                  name="body"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={6}
                      placeholder="Write your message here..."
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none',
                        errors.body ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.body && (
                  <p className="text-rose-500 text-xs mt-1">{errors.body.message}</p>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleSubmit(onSubmit)} disabled={isLoading}>
            <Icon icon="lucide:file" />
            Save as Draft
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Icon icon="lucide:send" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
