'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useAuditStore } from '@/stores/audit-store'
import type { Audit } from '@/types'

const auditSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.enum(['internal', 'sama', 'sharia']),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue']),
  dueDate: z.string().min(1, 'Due date is required'),
  assigneeId: z.string().optional(),
  scope: z.string().optional(),
  framework: z.string().optional(),
  description: z.string().optional(),
})

type AuditFormData = z.infer<typeof auditSchema>

interface AddAuditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (audit: Audit) => void
}

const auditTypes = [
  { id: 'internal', label: 'Internal Audit', icon: 'lucide:shield', color: 'blue' },
  { id: 'sama', label: 'SAMA Audit', icon: 'lucide:landmark', color: 'emerald' },
  { id: 'sharia', label: 'Sharia Audit', icon: 'lucide:book-open', color: 'amber' },
] as const

const frameworks = [
  'ISO 27001',
  'SAMA CSF',
  'PCI DSS',
  'SOC 2',
  'GDPR',
  'NCA ECC',
]

export function AddAuditModal({ isOpen, onClose, onSuccess }: AddAuditModalProps) {
  const { t } = useTranslation()
  const { create, isLoading } = useAuditStore()
  const [selectedType, setSelectedType] = useState<'internal' | 'sama' | 'sharia'>('internal')

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema),
    defaultValues: {
      title: '',
      type: 'internal',
      status: 'pending',
      dueDate: '',
      assigneeId: '',
      scope: '',
      framework: '',
      description: '',
    },
  })

  const handleTypeSelect = (type: 'internal' | 'sama' | 'sharia') => {
    setSelectedType(type)
    setValue('type', type)
  }

  const onSubmit = async (data: AuditFormData) => {
    try {
      const auditData = {
        title: data.title,
        type: data.type,
        status: data.status,
        dueDate: data.dueDate,
        progress: 0,
        assignee: {
          id: data.assigneeId || '1',
          name: 'Unassigned',
          email: '',
          role: 'officer' as const,
          department: '',
          workload: 0,
        },
      }

      const newAudit = await create(auditData)
      onSuccess?.(newAudit)
      handleClose()
    } catch (error) {
      console.error('Failed to create audit:', error)
    }
  }

  const handleClose = () => {
    reset()
    setSelectedType('internal')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Create New Audit</h2>
              <p className="text-sm text-slate-500">
                Schedule a new audit for compliance verification.
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Audit Type Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Audit Type
              </label>
              <div className="grid grid-cols-3 gap-4">
                {auditTypes.map((type) => (
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
                        type.color === 'amber' && 'text-amber-600'
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
                  Audit Title
                </label>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="e.g., Q1 2024 Information Security Audit"
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
                  Framework
                </label>
                <Controller
                  name="framework"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Select framework...</option>
                      {frameworks.map((fw) => (
                        <option key={fw} value={fw}>
                          {fw}
                        </option>
                      ))}
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
                  Lead Assignee
                </label>
                <div className="relative">
                  <Icon
                    icon="lucide:user"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Controller
                    name="assigneeId"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        placeholder="Select assignee..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Scope & Description
                </label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={3}
                      placeholder="Describe the scope and objectives of this audit..."
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
                Creating...
              </>
            ) : (
              'Create Audit'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
