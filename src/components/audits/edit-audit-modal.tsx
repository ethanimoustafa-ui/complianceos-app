'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useAuditStore } from '@/stores/audit-store'
import type { Audit } from '@/types'

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.enum(['internal', 'sama', 'sharia']),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  dueDate: z.string().min(1, 'Due date is required'),
  progress: z.number().min(0).max(100),
  assigneeId: z.string().optional(),
  description: z.string().optional(),
})

type AuditFormData = z.infer<typeof auditSchema>

interface EditAuditModalProps {
  isOpen: boolean
  onClose: () => void
  audit: Audit | null
  onSuccess?: (audit: Audit) => void
}

const frameworks = [
  'ISO 27001',
  'SAMA CSF',
  'PCI DSS',
  'SOC 2',
  'GDPR',
  'NCA ECC',
]

export function EditAuditModal({ isOpen, onClose, audit, onSuccess }: EditAuditModalProps) {
  const { update, isLoading } = useAuditStore()

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema),
    defaultValues: {
      title: '',
      type: 'internal',
      status: 'pending',
      dueDate: '',
      progress: 0,
      assigneeId: '',
      description: '',
    },
  })

  useEffect(() => {
    if (audit) {
      reset({
        title: audit.title,
        type: audit.type,
        status: audit.status,
        dueDate: audit.dueDate,
        progress: audit.progress,
        assigneeId: audit.assignee?.id || '',
        description: '',
      })
    }
  }, [audit, reset])

  const onSubmit = async (data: AuditFormData) => {
    if (!audit) return

    try {
      const updatedAudit = await update(audit.id, {
        title: data.title,
        type: data.type,
        status: data.status,
        dueDate: data.dueDate,
        progress: data.progress,
      })
      onSuccess?.(updatedAudit)
      handleClose()
    } catch (error) {
      console.error('Failed to update audit:', error)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!audit) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Edit Audit</h2>
              <p className="text-sm text-slate-500">Update audit details and settings.</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Audit Title
                </label>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.title ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.title && (
                  <p className="text-rose-500 text-xs mt-1">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Audit Type
                </label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="internal">Internal Audit</option>
                      <option value="sama">SAMA Audit</option>
                      <option value="sharia">Sharia Audit</option>
                    </select>
                  )}
                />
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
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Due Date
                </label>
                <Controller
                  name="dueDate"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="date"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.dueDate ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.dueDate && (
                  <p className="text-rose-500 text-xs mt-1">{errors.dueDate.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Progress ({audit.progress}%)
                </label>
                <Controller
                  name="progress"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="range"
                      min="0"
                      max="100"
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  )}
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Notes
                </label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={3}
                      placeholder="Add any notes or updates..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  )}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
