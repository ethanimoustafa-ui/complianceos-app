'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import type { Correspondence } from '@/types'

const correspondenceSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters'),
  // Correspondence types managed via useCorrespondenceTypeStore; widened.
  type: z.string().min(1, 'Type is required'),
  status: z.enum(['draft', 'sent', 'received']),
  from: z.string().min(1, 'From is required'),
  to: z.string().min(1, 'At least one recipient is required'),
  body: z.string().min(10, 'Body must be at least 10 characters'),
})

type CorrespondenceFormData = z.infer<typeof correspondenceSchema>

interface EditCorrespondenceModalProps {
  isOpen: boolean
  onClose: () => void
  correspondence: Correspondence | null
  onSuccess?: (correspondence: Correspondence) => void
}

export function EditCorrespondenceModal({
  isOpen,
  onClose,
  correspondence,
  onSuccess,
}: EditCorrespondenceModalProps) {
  const { update, isLoading } = useCorrespondenceStore()

  const {
    control,
    handleSubmit,
    reset,
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

  useEffect(() => {
    if (correspondence) {
      reset({
        subject: correspondence.subject,
        type: correspondence.type,
        status: correspondence.status,
        from: correspondence.from,
        to: correspondence.to.join(', '),
        body: correspondence.body,
      })
    }
  }, [correspondence, reset])

  const onSubmit = async (data: CorrespondenceFormData) => {
    if (!correspondence) return

    try {
      const updatedCorrespondence = await update(correspondence.id, {
        subject: data.subject,
        type: data.type,
        status: data.status,
        from: data.from,
        to: data.to.split(',').map((email) => email.trim()),
        body: data.body,
      })
      onSuccess?.(updatedCorrespondence)
      handleClose()
    } catch (error) {
      console.error('Failed to update correspondence:', error)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!correspondence) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                Edit Correspondence
              </h2>
              <p className="text-sm text-slate-500">Update correspondence details.</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  Type
                </label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="sama">SAMA</option>
                      <option value="cma">CMA</option>
                      <option value="internal">Internal</option>
                      <option value="external_auditor">External Auditor</option>
                      <option value="sharia_board">Sharia Board</option>
                      <option value="vendor">Vendor / Third Party</option>
                      <option value="other">Other</option>
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
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="received">Received</option>
                    </select>
                  )}
                />
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
                  To
                </label>
                <Controller
                  name="to"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
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
