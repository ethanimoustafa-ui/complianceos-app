'use client'

// Settings → Training Courses launcher. Owner: the configurables "Training
// Category" entry should manage the actual training COURSES (name, due date,
// description, category — displayed, editable, prompted on creation), not just
// category labels. This reuses the training page's TrainingManageModal wired to
// the training store, so it's the same full course manager (category labels are
// still editable inline via the add form's category picker).

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { TrainingManageModal } from '@/components/team/training/training-manage-modal'
import { useTrainingStore } from '@/stores/training-store'
import { pushToast } from '@/stores/toast-store'
import { useTranslation, type TranslationKey } from '@/i18n'
import type { TrainingCourse } from '@/types'

export function TrainingCoursesLauncher() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const courses = useTrainingStore((s) => s.courses)
  const addCourse = useTrainingStore((s) => s.addCourse)
  const removeCourse = useTrainingStore((s) => s.removeCourse)
  const updateCourse = useTrainingStore((s) => s.updateCourse)
  const fetchCourses = useTrainingStore((s) => s.fetchCourses)

  useEffect(() => { void fetchCourses() }, [fetchCourses])

  // Mirror the training page's handlers.
  const handleAddCourse = (
    courseData: Omit<TrainingCourse, 'id' | 'assignedCount' | 'completedCount' | 'overdueCount' | 'inProgressCount'>,
  ) => {
    addCourse({
      id: crypto.randomUUID(),
      ...courseData,
      assignedCount: 0,
      completedCount: 0,
      overdueCount: 0,
      inProgressCount: 0,
    })
  }
  const handleUpdateDeadline = (courseId: string, newDate: string) => updateCourse(courseId, { dueDate: newDate })

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Icon icon="lucide:graduation-cap" className="text-sm" />
        {t('training.trainingCourses' as TranslationKey)}
        <span className="text-[10px] font-bold text-slate-400 ms-1">({courses.length})</span>
      </Button>
      <TrainingManageModal
        isOpen={open}
        onClose={() => setOpen(false)}
        courses={courses}
        onAddCourse={handleAddCourse}
        onRemoveCourse={removeCourse}
        onUpdateDeadline={handleUpdateDeadline}
        // Assigning to employees belongs to the training page; here it's a no-op.
        onAssignToEmployees={() => {}}
        onToast={(msg) => pushToast(msg, 'success')}
      />
    </>
  )
}
