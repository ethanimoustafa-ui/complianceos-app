'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useCalendarStore } from '@/stores/calendar-store'
import type { CalendarEvent } from '@/types'

const eventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  // Type ids are managed via useCalendarEventTypeStore; widened to plain string.
  type: z.string().min(1, 'Type is required'),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
})

type EventFormData = z.infer<typeof eventSchema>

interface EditEventModalProps {
  isOpen: boolean
  onClose: () => void
  event: CalendarEvent | null
  onSuccess?: (event: CalendarEvent) => void
}

export function EditEventModal({ isOpen, onClose, event, onSuccess }: EditEventModalProps) {
  const { updateEvent, isLoading } = useCalendarStore()

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      type: 'meeting',
      date: '',
      startTime: '',
      endTime: '',
      description: '',
      location: '',
    },
  })

  useEffect(() => {
    if (event) {
      reset({
        title: event.title,
        type: event.type,
        date: event.date,
        startTime: event.startTime || '',
        endTime: event.endTime || '',
        description: event.description || '',
        location: event.location || '',
      })
    }
  }, [event, reset])

  const onSubmit = (data: EventFormData) => {
    if (!event) return

    const updatedEvent = updateEvent(event.id, {
      title: data.title,
      type: data.type,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description,
      location: data.location,
    })
    if (updatedEvent) onSuccess?.(updatedEvent)
    handleClose()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!event) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Edit Event</h2>
              <p className="text-sm text-slate-500">Update event details.</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Event Title
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
                Event Type
              </label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="deadline">Deadline</option>
                    <option value="meeting">Meeting</option>
                    <option value="submission">Submission</option>
                    <option value="review">Review</option>
                  </select>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Date
                </label>
                <Controller
                  name="date"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="date"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.date ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.date && (
                  <p className="text-rose-500 text-xs mt-1">{errors.date.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Start Time
                </label>
                <Controller
                  name="startTime"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="time"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  End Time
                </label>
                <Controller
                  name="endTime"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="time"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Location
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:map-pin"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Controller
                  name="location"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="Room or meeting link"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Description
              </label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={3}
                    placeholder="Add notes or agenda..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                )}
              />
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
