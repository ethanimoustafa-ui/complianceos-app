'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { TrainingCourse, TrainingCategory } from '@/types'
import { useTrainingCategoryStore } from '@/stores/training-category-store'
import { useTrainingStore } from '@/stores/training-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { getCategoryConfig } from '@/lib/category-config'
import { formatTimelineDate } from '@/lib/format-date'

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
  const { t, isRTL } = useTranslation()
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [courseToDelete, setCourseToDelete] = useState<TrainingCourse | null>(null)
  const [editingDeadline, setEditingDeadline] = useState<string | null>(null)
  const [newCourse, setNewCourse] = useState({ name: '', category: '' as TrainingCategory | '', dueDate: '', description: '' })
  // Editable training categories
  const trainingCategoryItems = useTrainingCategoryStore((s) => s.categories)
  const addTrainingCategory = useTrainingCategoryStore((s) => s.add)
  const editTrainingCategory = useTrainingCategoryStore((s) => s.update)
  const removeTrainingCategory = useTrainingCategoryStore((s) => s.remove)

  // Store-driven mutation flag — survives route changes and prevents the
  // add / remove buttons from desyncing if the user re-opens the modal mid-flight.
  const isMutating = useTrainingStore((s) => s.isMutating)

  // Sort courses newest-first (rows without a usable date sink to the bottom).
  // The shape only carries `dueDate`, so we treat that as the timeline anchor.
  const sortedCourses = useMemo(() => {
    return [...courses].sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : 0
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : 0
      return bd - ad
    })
  }, [courses])

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

  const handleRemove = async (courseId: string) => {
    onRemoveCourse(courseId)
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
                    <EditableSelect
                      value={newCourse.category || null}
                      onChange={(id) => setNewCourse({ ...newCourse, category: id as TrainingCategory })}
                      items={trainingCategoryItems}
                      placeholder={t('training.selectCategory' as TranslationKey)}
                      onAdd={(label, labelAr) => addTrainingCategory(label, labelAr)}
                      onEdit={(id, label, labelAr) => editTrainingCategory(id, { label, labelAr })}
                      onDelete={(id) => removeTrainingCategory(id)}
                      isRTL={isRTL}
                    />
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
                  <LoadingButton
                    size="sm"
                    loading={isMutating}
                    onClick={handleAddCourse}
                    disabled={!newCourse.name || !newCourse.category || !newCourse.dueDate}
                  >
                    {t('training.addCourse' as TranslationKey)}
                  </LoadingButton>
                </div>
              </div>
            </div>
          )}

          {/* Course List */}
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {sortedCourses.length === 0 ? (
              <div className="p-2">
                <EmptyState
                  icon="lucide:book-open"
                  title={t('training.noCoursesTitle' as TranslationKey)}
                  description={t('training.noCoursesDescription' as TranslationKey)}
                  action={{
                    label: t('training.addCourse' as TranslationKey),
                    onClick: () => setIsAddFormOpen(true),
                    icon: 'lucide:plus',
                  }}
                />
              </div>
            ) : sortedCourses.map((course) => (
              <div key={course.id} className="p-4 hover:bg-slate-50 transition-colors">
                {(
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-slate-900">{course.name}</h5>
                        {(() => {
                          const conf = getCategoryConfig('training', course.category)
                          const item = trainingCategoryItems.find((c) => c.id === course.category)
                          const seedKeyExists = ['compliance','aml','cybersecurity','sharia','risk','data-privacy','ethics','fraud-prevention','governance','operational-risk','business-continuity','sanctions','internal-audit'].includes(course.category)
                          return (
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${conf.bg} ${conf.text}`}>
                              {seedKeyExists
                                ? t(`training.category.${course.category}` as TranslationKey)
                                : (isRTL && item?.labelAr ? item.labelAr : (item?.label ?? conf.label))}
                            </span>
                          )
                        })()}
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
                            {t('training.dueDate' as TranslationKey)}: {course.dueDate ? formatTimelineDate(course.dueDate, isRTL) : '—'}
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
                        onClick={() => setCourseToDelete(course)}
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
