'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { TrainingCourse, TrainingCategory } from '@/types'

const categoryColors: Record<TrainingCategory, { bg: string; text: string }> = {
  compliance: { bg: 'bg-blue-100', text: 'text-blue-700' },
  aml: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  cybersecurity: { bg: 'bg-purple-100', text: 'text-purple-700' },
  sharia: { bg: 'bg-amber-100', text: 'text-amber-700' },
  risk: { bg: 'bg-rose-100', text: 'text-rose-700' },
  'data-privacy': { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  ethics: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'fraud-prevention': { bg: 'bg-orange-100', text: 'text-orange-700' },
  governance: { bg: 'bg-teal-100', text: 'text-teal-700' },
  'operational-risk': { bg: 'bg-red-100', text: 'text-red-700' },
  'business-continuity': { bg: 'bg-lime-100', text: 'text-lime-700' },
  sanctions: { bg: 'bg-pink-100', text: 'text-pink-700' },
  'internal-audit': { bg: 'bg-violet-100', text: 'text-violet-700' },
}

interface TrainingManageModalProps {
  isOpen: boolean
  onClose: () => void
  courses: TrainingCourse[]
  onAddCourse: (course: Omit<TrainingCourse, 'id' | 'assignedCount' | 'completedCount' | 'overdueCount' | 'inProgressCount'>) => void
  onRemoveCourse: (courseId: string) => void
  onUpdateDeadline: (courseId: string, newDate: string) => void
  onAssignToEmployees: (course: TrainingCourse) => void
  onToast: (message: string) => void
}

export function TrainingManageModal({
  isOpen, onClose, courses, onAddCourse, onRemoveCourse, onUpdateDeadline, onAssignToEmployees, onToast,
}: TrainingManageModalProps) {
  const { t } = useTranslation()
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<string | null>(null)
  const [editingDeadline, setEditingDeadline] = useState<string | null>(null)
  const [newCourse, setNewCourse] = useState({ name: '', category: '' as TrainingCategory | '', dueDate: '', description: '' })

  const stats = {
    totalCourses: courses.length,
    totalAssigned: courses.reduce((sum, c) => sum + c.assignedCount, 0),
    totalCompleted: courses.reduce((sum, c) => sum + c.completedCount, 0),
    totalOverdue: courses.reduce((sum, c) => sum + c.overdueCount, 0),
    totalInProgress: courses.reduce((sum, c) => sum + c.inProgressCount, 0),
  }

  const handleAddCourse = () => {
    if (!newCourse.name || !newCourse.category || !newCourse.dueDate) return
    onAddCourse({
      name: newCourse.name,
      category: newCourse.category as TrainingCategory,
      dueDate: newCourse.dueDate,
      description: newCourse.description,
    })
    setNewCourse({ name: '', category: '', dueDate: '', description: '' })
    setIsAddFormOpen(false)
    onToast(t('training.courseAdded' as TranslationKey))
  }

  const handleRemove = (courseId: string) => {
    onRemoveCourse(courseId)
    setCourseToDelete(null)
    onToast(t('training.courseRemoved' as TranslationKey))
  }

  const handleDeadlineUpdate = (courseId: string, newDate: string) => {
    onUpdateDeadline(courseId, newDate)
    setEditingDeadline(null)
    onToast(t('training.deadlineUpdated' as TranslationKey))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); setIsAddFormOpen(false); setCourseToDelete(null); setEditingDeadline(null) }}
      title={t('training.manageTrainingPrograms' as TranslationKey)}
      subtitle={t('training.manageTrainingSubtitle' as TranslationKey)}
      size="lg"
    >
      <div className="space-y-6">
        {/* Statistics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-slate-900">{stats.totalCourses}</p>
            <p className="text-xs text-slate-500 font-bold uppercase">{t('training.totalCourses' as TranslationKey)}</p>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.totalCompleted}</p>
            <p className="text-xs text-slate-500 font-bold uppercase">{t('training.completed' as TranslationKey)}</p>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.totalInProgress}</p>
            <p className="text-xs text-slate-500 font-bold uppercase">{t('training.inProgress' as TranslationKey)}</p>
          </div>
          <div className="p-4 bg-rose-50 rounded-xl text-center">
            <p className="text-2xl font-bold text-rose-600">{stats.totalOverdue}</p>
            <p className="text-xs text-slate-500 font-bold uppercase">{t('training.overdue' as TranslationKey)}</p>
          </div>
        </div>

        {/* Training Courses Section */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
            <h4 className="text-sm font-bold text-slate-900">{t('training.trainingCourses' as TranslationKey)}</h4>
            <Button size="sm" onClick={() => setIsAddFormOpen(true)}>
              <Icon icon="lucide:plus" className="mr-1" />
              {t('training.addCourse' as TranslationKey)}
            </Button>
          </div>

          {/* Add Course Form */}
          {isAddFormOpen && (
            <div className="p-4 bg-emerald-50/50 border-b border-slate-200">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t('training.courseName' as TranslationKey)}
                    placeholder={t('training.courseNamePlaceholder' as TranslationKey)}
                    value={newCourse.name}
                    onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('common.category')}
                    </label>
                    <select
                      value={newCourse.category}
                      onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value as TrainingCategory })}
                      className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                    >
                      <option value="">{t('training.selectCategory' as TranslationKey)}</option>
                      <option value="compliance">{t('training.category.compliance' as TranslationKey)}</option>
                      <option value="aml">{t('training.category.aml' as TranslationKey)}</option>
                      <option value="cybersecurity">{t('training.category.cybersecurity' as TranslationKey)}</option>
                      <option value="sharia">{t('training.category.sharia' as TranslationKey)}</option>
                      <option value="risk">{t('training.category.risk' as TranslationKey)}</option>
                      <option value="data-privacy">{t('training.category.data-privacy' as TranslationKey)}</option>
                      <option value="ethics">{t('training.category.ethics' as TranslationKey)}</option>
                      <option value="fraud-prevention">{t('training.category.fraud-prevention' as TranslationKey)}</option>
                      <option value="governance">{t('training.category.governance' as TranslationKey)}</option>
                      <option value="operational-risk">{t('training.category.operational-risk' as TranslationKey)}</option>
                      <option value="business-continuity">{t('training.category.business-continuity' as TranslationKey)}</option>
                      <option value="sanctions">{t('training.category.sanctions' as TranslationKey)}</option>
                      <option value="internal-audit">{t('training.category.internal-audit' as TranslationKey)}</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('training.dueDate' as TranslationKey)}
                    </label>
                    <input
                      type="date"
                      value={newCourse.dueDate}
                      onChange={(e) => setNewCourse({ ...newCourse, dueDate: e.target.value })}
                      className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                    />
                  </div>
                  <Input
                    label={t('training.courseDescription' as TranslationKey)}
                    placeholder={t('training.courseDescriptionPlaceholder' as TranslationKey)}
                    value={newCourse.description}
                    onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" onClick={() => { setIsAddFormOpen(false); setNewCourse({ name: '', category: '', dueDate: '', description: '' }) }}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" onClick={handleAddCourse} disabled={!newCourse.name || !newCourse.category || !newCourse.dueDate}>
                    {t('training.addCourse' as TranslationKey)}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Course List */}
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {courses.map((course) => (
              <div key={course.id} className="p-4 hover:bg-slate-50 transition-colors">
                {courseToDelete === course.id ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-rose-600 font-medium">{t('training.confirmRemove' as TranslationKey)}</p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setCourseToDelete(null)}>
                        {t('common.cancel')}
                      </Button>
                      <Button variant="outline" size="sm" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => handleRemove(course.id)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-900">{course.name}</h5>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${categoryColors[course.category].bg} ${categoryColors[course.category].text}`}>
                          {t(`training.category.${course.category}` as TranslationKey)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Icon icon="lucide:users" className="w-3 h-3" />
                          {course.assignedCount} {t('training.assigned' as TranslationKey)}
                        </span>
                        <span className="text-emerald-600">{course.completedCount} {t('training.completed' as TranslationKey)}</span>
                        {course.overdueCount > 0 && (
                          <span className="text-rose-600">{course.overdueCount} {t('training.overdue' as TranslationKey)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Icon icon="lucide:calendar" className="w-3 h-3 text-slate-400" />
                        {editingDeadline === course.id ? (
                          <input
                            type="date"
                            defaultValue={course.dueDate}
                            className="text-xs border border-slate-200 rounded px-2 py-1"
                            onBlur={(e) => {
                              if (e.target.value !== course.dueDate) {
                                handleDeadlineUpdate(course.id, e.target.value)
                              } else {
                                setEditingDeadline(null)
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            {t('training.dueDate' as TranslationKey)}: {course.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAssignToEmployees(course)}
                        className="p-2 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 cursor-pointer"
                        title={t('training.assignToEmployees' as TranslationKey)}
                      >
                        <Icon icon="lucide:user-plus" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingDeadline(course.id)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={t('training.editDeadline' as TranslationKey)}
                      >
                        <Icon icon="lucide:calendar-clock" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCourseToDelete(course.id)}
                        className="p-2 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"
                        title={t('training.removeCourse' as TranslationKey)}
                      >
                        <Icon icon="lucide:trash-2" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button className="flex-1" onClick={() => { onToast(t('common.saveChanges')); onClose() }}>
            {t('training.saveChanges' as TranslationKey)}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
