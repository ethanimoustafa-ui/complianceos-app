// Zod schemas for the training resource family.
//
// Covers:
//   - training_courses
//   - training_employees
//   - employee_course_progress (exposed as "enrollments" in the API)
//   - training_categories
//
// Note: the schema (migration 010) does not have a dedicated
// `training_certifications` table. The certifications endpoints are
// implemented against `employee_course_progress` rows whose `status='completed'`
// and `score IS NOT NULL` — see services/training.ts. The CreateCertification
// schema accepts the same input shape as a completion patch.

import { z } from 'zod'

const Uuid = z.string().uuid()
const DateString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

const EnrollmentStatus = z.enum(['not_started', 'in_progress', 'completed', 'overdue'])

// ---------- training_courses --------------------------------------------------

export const CreateTrainingCourseSchema = z.object({
  name: z.string().min(1).max(300),
  category: z.string().min(1).max(100),
  description: z.string().max(10_000).optional(),
  due_date: DateString.optional(),
  framework_ids: z.array(z.string().min(1)).default([]),
})
export type CreateTrainingCourseInput = z.infer<typeof CreateTrainingCourseSchema>

export const UpdateTrainingCourseSchema = CreateTrainingCourseSchema.partial()
export type UpdateTrainingCourseInput = z.infer<typeof UpdateTrainingCourseSchema>

export const ListTrainingCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  category: z.string().optional(),
  framework_id: z.string().optional(),
  q: z.string().max(200).optional(),
})
export type ListTrainingCoursesQuery = z.infer<typeof ListTrainingCoursesQuerySchema>

// ---------- training_employees ------------------------------------------------

export const CreateTrainingEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  department: z.string().max(200).optional(),
  is_saudi: z.boolean().default(false),
  user_id: Uuid.optional(),
})
export type CreateTrainingEmployeeInput = z.infer<typeof CreateTrainingEmployeeSchema>

export const UpdateTrainingEmployeeSchema = CreateTrainingEmployeeSchema.partial().extend({
  overall_progress: z.number().int().min(0).max(100).optional(),
})
export type UpdateTrainingEmployeeInput = z.infer<typeof UpdateTrainingEmployeeSchema>

export const ListTrainingEmployeesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  department: z.string().optional(),
  // department_id deep-link — resolves to `departments.key`/`name_en` via service.
  department_id: Uuid.optional(),
  // status filter — maps to overall_progress thresholds (active = any; complete =100).
  status: z.enum(['active', 'completed', 'in_progress', 'overdue']).optional(),
  employeeId: Uuid.optional(),
  q: z.string().max(200).optional(),
})
export type ListTrainingEmployeesQuery = z.infer<typeof ListTrainingEmployeesQuerySchema>

// ---------- enrollments (employee_course_progress) ----------------------------

export const CreateEnrollmentSchema = z.object({
  course_id: Uuid,
  due_date: DateString.optional(),
  status: EnrollmentStatus.default('not_started'),
  progress: z.number().int().min(0).max(100).default(0),
})
export type CreateEnrollmentInput = z.infer<typeof CreateEnrollmentSchema>

export const UpdateEnrollmentSchema = z.object({
  status: EnrollmentStatus.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  score: z.number().int().min(0).max(100).optional(),
  completed_date: DateString.optional(),
  due_date: DateString.optional(),
})
export type UpdateEnrollmentInput = z.infer<typeof UpdateEnrollmentSchema>

// ---------- certifications (filtered view of employee_course_progress) --------
// Backed by `employee_course_progress` where score IS NOT NULL & status='completed'.

export const CreateCertificationSchema = z.object({
  course_id: Uuid,
  score: z.number().int().min(0).max(100),
  completed_date: DateString,
})
export type CreateCertificationInput = z.infer<typeof CreateCertificationSchema>

export const UpdateCertificationSchema = z.object({
  score: z.number().int().min(0).max(100).optional(),
  completed_date: DateString.optional(),
})
export type UpdateCertificationInput = z.infer<typeof UpdateCertificationSchema>

// ---------- training_categories -----------------------------------------------

export const CreateTrainingCategorySchema = z.object({
  key: z.string().min(1).max(100),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
})
export type CreateTrainingCategoryInput = z.infer<typeof CreateTrainingCategorySchema>

export const UpdateTrainingCategorySchema = CreateTrainingCategorySchema.partial()
export type UpdateTrainingCategoryInput = z.infer<typeof UpdateTrainingCategorySchema>

// ---------- bulk assign -------------------------------------------------------

export const AssignCourseSchema = z.object({
  employee_ids: z.array(Uuid).min(1),
  due_date: DateString.optional(),
})
export type AssignCourseInput = z.infer<typeof AssignCourseSchema>

// ---------- manual training metrics (saudization_metrics singleton) -----------
// The training page's "Edit Metrics" modal — all fields optional so a partial
// manual entry only overwrites what the user actually typed.

export const UpdateTrainingMetricsSchema = z
  .object({
    target: z.number().min(0).max(100).optional(),
    actual: z.number().min(0).max(100).optional(),
    total_employees: z.number().int().min(0).optional(),
    saudi_employees: z.number().int().min(0).optional(),
    overall_completion: z.number().min(0).max(100).nullable().optional(),
    courses_assigned: z.number().int().min(0).nullable().optional(),
    last_data_source: z.enum(['manual', 'upload']).optional(),
  })
  .strict()
export type UpdateTrainingMetricsInput = z.infer<typeof UpdateTrainingMetricsSchema>
