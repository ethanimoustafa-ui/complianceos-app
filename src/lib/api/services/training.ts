// Training service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

// --- selection lists ---------------------------------------------------------

export const TRAINING_COURSE_LIST_COLUMNS =
  'id, name, category, due_date, description, assigned_count, completed_count, overdue_count, in_progress_count, framework_ids, created_at, updated_at'

export const TRAINING_COURSE_DETAIL_COLUMNS = TRAINING_COURSE_LIST_COLUMNS

export const TRAINING_EMPLOYEE_LIST_COLUMNS =
  'id, user_id, name, email, department, is_saudi, overall_progress, created_at, updated_at'

export const TRAINING_EMPLOYEE_DETAIL_COLUMNS = TRAINING_EMPLOYEE_LIST_COLUMNS

export const ENROLLMENT_COLUMNS =
  'id, employee_id, course_id, status, progress, score, completed_date, due_date'

export const TRAINING_CATEGORY_COLUMNS =
  'id, key, name_en, name_ar, is_default, created_at, updated_at'

// --- guards ------------------------------------------------------------------

export async function assertCourseExists(
  supabase: SupabaseClient,
  courseId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('training_courses')
    .select('id')
    .eq('id', courseId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Training course ${courseId} not found`)
}

export async function assertEmployeeExists(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('training_employees')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Training employee ${employeeId} not found`)
}

export async function assertEnrollmentExists(
  supabase: SupabaseClient,
  enrollmentId: string,
  employeeId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('employee_course_progress')
    .select('id')
    .eq('id', enrollmentId)
    .eq('employee_id', employeeId)
    .maybeSingle<{ id: string }>()
  if (error) throw error
  if (!data) throw NotFound(`Enrollment ${enrollmentId} not found`)
}

// --- detail ------------------------------------------------------------------

export interface TrainingEmployeeDetail {
  id: string
  user_id: string | null
  name: string
  email: string
  department: string | null
  is_saudi: boolean
  overall_progress: number
  enrollments: Array<{
    id: string
    course_id: string
    status: string
    progress: number
    score: number | null
    completed_date: string | null
    due_date: string | null
  }>
  certifications: Array<{
    id: string
    course_id: string
    score: number | null
    completed_date: string | null
  }>
  created_at: string
  updated_at: string
}

export async function getEmployeeDetail(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<TrainingEmployeeDetail> {
  const { data: employee, error } = await supabase
    .from('training_employees')
    .select(TRAINING_EMPLOYEE_DETAIL_COLUMNS)
    .eq('id', employeeId)
    .maybeSingle<Omit<TrainingEmployeeDetail, 'enrollments' | 'certifications'>>()
  if (error) throw error
  if (!employee) throw NotFound(`Training employee ${employeeId} not found`)

  const { data: enrollments } = await supabase
    .from('employee_course_progress')
    .select(ENROLLMENT_COLUMNS)
    .eq('employee_id', employeeId)

  const allRows =
    (enrollments as Array<{
      id: string
      employee_id: string
      course_id: string
      status: string
      progress: number
      score: number | null
      completed_date: string | null
      due_date: string | null
    }>) ?? []

  const certifications = allRows
    .filter((r) => r.status === 'completed' && r.completed_date)
    .map((r) => ({
      id: r.id,
      course_id: r.course_id,
      score: r.score,
      completed_date: r.completed_date,
    }))

  return {
    ...employee,
    enrollments: allRows,
    certifications,
  }
}

/** Update aggregated counts on `training_courses` for a given course. */
export async function recomputeCourseCounts(
  supabase: SupabaseClient,
  courseId: string,
): Promise<void> {
  const { data } = await supabase
    .from('employee_course_progress')
    .select('status')
    .eq('course_id', courseId)
  const rows = (data ?? []) as Array<{ status: string }>
  const assigned = rows.length
  const completed = rows.filter((r) => r.status === 'completed').length
  const overdue = rows.filter((r) => r.status === 'overdue').length
  const inProgress = rows.filter((r) => r.status === 'in_progress').length
  await supabase
    .from('training_courses')
    .update({
      assigned_count: assigned,
      completed_count: completed,
      overdue_count: overdue,
      in_progress_count: inProgress,
    })
    .eq('id', courseId)
}

/** Update aggregated overall_progress on a `training_employees` row. */
export async function recomputeEmployeeProgress(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<void> {
  const { data } = await supabase
    .from('employee_course_progress')
    .select('progress')
    .eq('employee_id', employeeId)
  const rows = (data ?? []) as Array<{ progress: number }>
  if (rows.length === 0) {
    await supabase.from('training_employees').update({ overall_progress: 0 }).eq('id', employeeId)
    return
  }
  const avg = Math.round(rows.reduce((a, r) => a + (r.progress ?? 0), 0) / rows.length)
  await supabase.from('training_employees').update({ overall_progress: avg }).eq('id', employeeId)
}
