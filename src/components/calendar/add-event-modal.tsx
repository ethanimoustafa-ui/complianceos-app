'use client'

import { useState, useEffect } from 'react'
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
  attendees: z.array(z.string()).optional(),
})

type EventFormData = z.infer<typeof eventSchema>

interface AddEventModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (event: CalendarEvent) => void
  initialDate?: Date
}

const eventTypes = [
  { id: 'deadline', label: 'Deadline', icon: 'lucide:alert-circle', color: 'rose' },
  { id: 'meeting', label: 'Meeting', icon: 'lucide:users', color: 'blue' },
  { id: 'submission', label: 'Submission', icon: 'lucide:send', color: 'emerald' },
  { id: 'review', label: 'Review', icon: 'lucide:file-check', color: 'amber' },
] as const

export function AddEventModal({ isOpen, onClose, onSuccess, initialDate }: AddEventModalProps) {
  const { createEvent, isLoading } = useCalendarStore()
  const [selectedType, setSelectedType] = useState<'deadline' | 'meeting' | 'submission' | 'review'>(
    'meeting'
  )

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      type: 'meeting',
      date: initialDate?.toISOString().split('T')[0] || '',
      startTime: '',
      endTime: '',
      description: '',
      location: '',
      attendees: [],
    },
  })

  const handleTypeSelect = (type: 'deadline' | 'meeting' | 'submission' | 'review') => {
    setSelectedType(type)
    setValue('type', type)
  }

  const onSubmit = (data: EventFormData) => {
    const eventData = {
      title: data.title,
      type: data.type,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description,
      location: data.location,
      attendees: data.attendees || [],
      reminders: [],
    }

    const newEvent = createEvent(eventData)
    onSuccess?.(newEvent)
    handleClose()
  }

  const handleClose = () => {
    reset()
    setSelectedType('meeting')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Add Event</h2>
              <p className="text-sm text-slate-500">Schedule a new event or deadline.</p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Event Type Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Event Type
              </label>
              <div className="grid grid-cols-4 gap-3">
                {eventTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeSelect(type.id)}
                    className={cn(
                      'p-3 border-2 rounded-xl flex flex-col items-center gap-2 transition-all cursor-pointer',
                      selectedType === type.id
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                        : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                    )}
                  >
                    <Icon
                      icon={type.icon}
                      className={cn(
                        'text-2xl',
                        type.color === 'rose' && 'text-rose-600',
                        type.color === 'blue' && 'text-blue-600',
                        type.color === 'emerald' && 'text-emerald-600',
                        type.color === 'amber' && 'text-amber-600'
                      )}
                    />
                    <span className="text-xs font-bold text-slate-900">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
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
                      placeholder="e.g., SAMA Compliance Review"
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
                  Location (optional)
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
                        placeholder="Room 101 or Meeting Link"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    )}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Description (optional)
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
              'Create Event'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
