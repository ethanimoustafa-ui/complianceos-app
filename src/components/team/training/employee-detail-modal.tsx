'use client'

import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { TrainingEmployee, TrainingStatus } from '@/types'
import { dicebearAvatar } from '@/lib/avatar'

const trainingStatusConfig: Record<TrainingStatus, { bg: string; text: string; labelKey: string }> = {
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', labelKey: 'training.completed' },
  in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'training.inProgress' },
  not_started: { bg: 'bg-slate-100', text: 'text-slate-600', labelKey: 'training.notStarted' },
  overdue: { bg: 'bg-rose-100', text: 'text-rose-700', labelKey: 'training.overdue' },
}

interface EmployeeDetailModalProps {
  isOpen: boolean
  onClose: () => void
  employee: TrainingEmployee | null
  onAssignTraining: (employee: TrainingEmployee) => void
  onToast: (message: string) => void
  onExport?: (employee: TrainingEmployee) => void
}

export function EmployeeDetailModal({ isOpen, onClose, employee, onAssignTraining, onToast, onExport }: EmployeeDetailModalProps) {
  const { t } = useTranslation()

  if (!employee) return null

  const handleSendReminder = () => {
    const incompleteCourses = employee.courses.filter(c => c.status !== 'completed')
    const body = [
      `Hi ${employee.name},`,
      '',
      'This is a reminder about your pending training courses:',
      '',
      ...incompleteCourses.map(c => `- ${c.name}: ${c.progress ?? 0}% complete (Due: ${c.dueDate})`),
      '',
      'Please complete these courses as soon as possible.',
      '',
      'Best regards,',
      'Training Department',
    ].join('\n')

    const mailto = `mailto:${employee.email || ''}?subject=${encodeURIComponent('Training Reminder')}&body=${encodeURIComponent(body)}`
    window.open(mailto)
  }

  const handleGenerateReport = () => {
    if (onExport) {
      onExport(employee)
    } else {
      onToast(t('training.reportGenerated' as TranslationKey))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={employee.name}
      subtitle={employee.department}
      size="lg"
    >
      <div className="space-y-6">
        {/* Employee Info */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <img
            src={dicebearAvatar(employee.name)}
            className="w-16 h-16 rounded-full border-4 border-white"
            alt={employee.name}
          />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">{employee.name}</h3>
            <p className="text-sm text-slate-500">{employee.email}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs font-bold text-slate-600 bg-slate-200 px-3 py-1 rounded-full">
                {employee.department}
              </span>
              {employee.isSaudi && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1">
                  <Icon icon="lucide:flag" className="text-xs" />
                  {t('training.saudi' as TranslationKey)}
                </span>
              )}
            </div>
          </div>
          <div className="text-center">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke={employee.overallProgress === 100 ? '#10b981' : employee.overallProgress >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${(employee.overallProgress / 100) * 251.2} 251.2`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-slate-900">{employee.overallProgress}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Courses List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-900">
              {t('training.assignedCourses' as TranslationKey)} ({employee.courses.length})
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAssignTraining(employee)}
            >
              <Icon icon="lucide:plus-circle" className="mr-1" />
              {t('training.assignTraining' as TranslationKey)}
            </Button>
          </div>
          <div className="space-y-3">
            {employee.courses.map((course) => {
              const statusConfig = trainingStatusConfig[course.status]
              return (
                <div key={course.id} className={`p-4 border rounded-xl ${course.status === 'overdue' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="text-sm font-bold text-slate-900">{course.name}</h5>
                      <p className="text-xs text-slate-500 capitalize">
                        {course.category ? t(`training.category.${course.category}` as TranslationKey) : '—'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                      {t(statusConfig.labelKey as TranslationKey)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Icon icon="lucide:calendar" className="text-slate-400" />
                      {t('training.dueDate' as TranslationKey)}: {course.dueDate}
                    </span>
                    {course.completedDate && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <Icon icon="lucide:check-circle" className="text-emerald-500" />
                        {t('training.completedOn' as TranslationKey)}: {course.completedDate}
                      </span>
                    )}
                    {course.score && (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <Icon icon="lucide:trophy" className="text-blue-500" />
                        {t('training.score' as TranslationKey)}: {course.score}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={handleSendReminder}
            className="flex-1 bg-amber-100 text-amber-700 py-3 rounded-lg font-bold hover:bg-amber-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Icon icon="lucide:bell" className="text-lg" />
            {t('training.sendReminder' as TranslationKey)}
          </button>
          <button
            onClick={handleGenerateReport}
            className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Icon icon="lucide:file-text" className="text-lg" />
            {t('training.generateReport' as TranslationKey)}
          </button>
        </div>
      </div>
    </Modal>
  )
}
