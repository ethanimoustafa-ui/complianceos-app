'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useCalendarStore } from '@/stores/calendar-store'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import type { RegulatoryBodyId } from '@/types'

interface CreateEventModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (dateKey: string) => void
}

export function CreateEventModal({ isOpen, onClose, onSuccess }: CreateEventModalProps) {
  const { t, isRTL } = useTranslation()
  const createEvent = useCalendarStore((s) => s.createEvent)

  const [form, setForm] = useState({
    title: '',
    date: '',
    type: 'meeting' as 'deadline' | 'meeting' | 'submission' | 'review',
    description: '',
    startTime: '',
    endTime: '',
  })
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>([])

  const handleClose = () => {
    setForm({ title: '', date: '', type: 'meeting', description: '', startTime: '', endTime: '' })
    setFrameworkIds([])
    onClose()
  }

  const handleSubmit = () => {
    if (!form.title || !form.date) return

    createEvent({
      title: form.title,
      date: form.date,
      type: form.type,
      description: form.description,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      attendees: [],
      reminders: [],
      frameworkIds,
    })

    onSuccess?.(form.date)
    setForm({ title: '', date: '', type: 'meeting', description: '', startTime: '', endTime: '' })
    setFrameworkIds([])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
        <div className={`p-6 border-b border-slate-100 flex items-center justify-between`}>
          <h3 className="text-lg font-bold text-slate-900">{t('calendar.newComplianceTask')}</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-900 cursor-pointer">
            <Icon icon="lucide:x" className="text-xl" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
              {t('calendar.taskTitle')}<span className="text-rose-500 ms-1">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder={t('calendar.taskTitlePlaceholder')}
              className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('calendar.date')}<span className="text-rose-500 ms-1">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
            <div>
              <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('common.type')}
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value as typeof form.type }))}
                className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
              >
                <option value="meeting">{t('calendar.typeMeeting')}</option>
                <option value="deadline">{t('calendar.typeDeadline')}</option>
                <option value="submission">{t('calendar.typeSubmission')}</option>
                <option value="review">{t('calendar.typeReview')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('calendar.startTime')}
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
            <div>
              <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('calendar.endTime')}
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
          </div>
          <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" />
          <div>
            <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>
              {t('common.description')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              placeholder={t('calendar.addNotesPlaceholder')}
              className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none ${isRTL ? 'text-right' : ''}`}
            />
          </div>
        </div>
        <div className={`p-6 bg-slate-50 flex gap-3`}>
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-2.5 text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors shadow-lg shadow-emerald-100 cursor-pointer"
          >
            {t('calendar.createTask')}
          </button>
        </div>
      </div>
    </div>
  )
}
