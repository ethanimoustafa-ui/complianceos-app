'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { TrainingEmployee, TrainingCourse, CourseProgress } from '@/types'
import { dicebearAvatar } from '@/lib/avatar'

interface AssignTrainingModalProps {
  isOpen: boolean
  onClose: () => void
  employee: TrainingEmployee | null
  courses: TrainingCourse[]
  onAssign: (employeeId: string, courses: CourseProgress[]) => void
  onToast: (message: string) => void
}

export function AssignTrainingModal({ isOpen, onClose, employee, courses, onAssign, onToast }: AssignTrainingModalProps) {
  const { t } = useTranslation()
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')

  // W44: dedupe by COURSE ID — name-matching hid distinct courses that
  // happened to share a name.
  const availableCourses = employee
    ? courses.filter((course) => !employee.courses.some((c) => c.id === course.id))
    : []

  const handleAssign = () => {
    if (!employee || selectedCourseIds.length === 0 || !dueDate) return

    // W44: keep the REAL course id — a random UUID here meant the enrollment
    // POST carried a course_id that doesn't exist in training_courses.
    const coursesToAdd: CourseProgress[] = courses
      .filter((c) => selectedCourseIds.includes(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        status: 'not_started' as const,
        progress: 0,
        dueDate,
      }))

    onAssign(employee.id, coursesToAdd)
    onToast(t('training.trainingAssigned' as TranslationKey))
    handleClose()
  }

  const handleClose = () => {
    onClose()
    setSelectedCourseIds([])
    setDueDate('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('training.assignTraining' as TranslationKey)}
      subtitle={employee?.name}
      size="md"
    >
      {employee && (
        <div className="space-y-6">
          {/* Employee Info */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <img
              src={dicebearAvatar(employee.name)}
              className="w-10 h-10 rounded-full border-2 border-white"
              alt={employee.name}
            />
            <div>
              <p className="text-sm font-bold text-slate-900">{employee.name}</p>
              <p className="text-xs text-slate-500">{employee.department}</p>
            </div>
          </div>

          {/* Available Courses */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              {t('training.availableCourses' as TranslationKey)}
            </h4>
            {availableCourses.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableCourses.map((course) => (
                  <label
                    key={course.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedCourseIds.includes(course.id) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(course.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCourseIds([...selectedCourseIds, course.id])
                        } else {
                          setSelectedCourseIds(selectedCourseIds.filter((id) => id !== course.id))
                        }
                      }}
                      className="accent-emerald-600"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">{course.name}</p>
                      <p className="text-xs text-slate-500">{t(`training.category.${course.category}` as TranslationKey)}</p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-lg">
                {t('training.allCoursesAssigned' as TranslationKey)}
              </p>
            )}
          </div>

          {/* Due Date */}
          {selectedCourseIds.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('training.dueDate' as TranslationKey)}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button className="flex-1" onClick={handleAssign} disabled={selectedCourseIds.length === 0 || !dueDate}>
              {t('training.assignSelected' as TranslationKey)}
              <Icon icon="lucide:check" className="text-sm ml-1" />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Bulk Assignment Modal — assign a course to multiple employees
interface BulkAssignModalProps {
  isOpen: boolean
  onClose: () => void
  course: TrainingCourse | null
  employees: TrainingEmployee[]
  onAssign: (employeeIds: string[], course: CourseProgress) => void
  onToast: (message: string) => void
}

export function BulkAssignModal({ isOpen, onClose, course, employees, onAssign, onToast }: BulkAssignModalProps) {
  const { t } = useTranslation()
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')

  // W44: dedupe by COURSE ID (see AssignTrainingModal above).
  const eligibleEmployees = course
    ? employees.filter((emp) => !emp.courses.some((c) => c.id === course.id))
    : []

  const handleAssign = () => {
    if (!course || selectedEmployeeIds.length === 0 || !dueDate) return

    // W44: keep the REAL course id (random UUID broke the enrollment POST).
    const newCourseAssignment: CourseProgress = {
      id: course.id,
      name: course.name,
      category: course.category,
      status: 'not_started',
      progress: 0,
      dueDate,
    }

    onAssign(selectedEmployeeIds, newCourseAssignment)
    onToast(t('training.trainingAssigned' as TranslationKey))
    handleClose()
  }

  const handleClose = () => {
    onClose()
    setSelectedEmployeeIds([])
    setDueDate('')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('training.assignToEmployees' as TranslationKey)}
      subtitle={course?.name}
      size="md"
    >
      {course && (
        <div className="space-y-6">
          {/* Course Info */}
          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-sm font-bold text-slate-900">{course.name}</p>
            <p className="text-xs text-slate-500">{t(`training.category.${course.category}` as TranslationKey)}</p>
            <p className="text-xs text-slate-400 mt-1">
              {course.assignedCount} {t('training.assigned' as TranslationKey)} &bull; {course.completedCount} {t('training.completed' as TranslationKey)}
            </p>
          </div>

          {/* Select Employees */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              {t('training.selectEmployees' as TranslationKey)}
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {eligibleEmployees.map((emp) => (
                <label
                  key={emp.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedEmployeeIds.includes(emp.id) ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.includes(emp.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEmployeeIds([...selectedEmployeeIds, emp.id])
                      } else {
                        setSelectedEmployeeIds(selectedEmployeeIds.filter((id) => id !== emp.id))
                      }
                    }}
                    className="accent-emerald-600"
                  />
                  <img
                    src={dicebearAvatar(emp.name)}
                    className="w-8 h-8 rounded-full border border-slate-200"
                    alt={emp.name}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">{emp.name}</p>
                    <p className="text-xs text-slate-500">{emp.department}</p>
                  </div>
                  {emp.isSaudi && <span className="text-base">{'\u{1F1F8}\u{1F1E6}'}</span>}
                </label>
              ))}
              {eligibleEmployees.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-lg">
                  {t('training.allCoursesAssigned' as TranslationKey)}
                </p>
              )}
            </div>
          </div>

          {/* Due Date */}
          {selectedEmployeeIds.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('training.dueDate' as TranslationKey)}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button className="flex-1" onClick={handleAssign} disabled={selectedEmployeeIds.length === 0 || !dueDate}>
              {t('training.assignSelected' as TranslationKey)} ({selectedEmployeeIds.length})
              <Icon icon="lucide:check" className="text-sm ml-1" />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
