// Training store — Phase 5 server-state migration.
//
// Two sub-domains live here:
//   1. The legacy `trainings: Training[]` (compliance-engine slice). No
//      dedicated API endpoint exists for this resource family; the compliance
//      engine still reads it. We keep the in-memory array empty and the CRUD
//      surface intact so consumers compile, but every action is a local-only
//      stub until a backend route ships.
//   2. The team-training page state (`employees`, `courses`, `saudizationMetrics`,
//      `departmentProgress`, `overviewStats`). Courses + employees are now
//      server-backed via `/api/training/courses` and `/api/training/employees`.
//      The derived aggregates (`saudizationMetrics`, `departmentProgress`,
//      `overviewStats`) stay computed client-side until the API exposes them.
//
// SKELETON-LOADING NOTE: render a skeleton when
//   `isLoading && courses.length === 0 && employees.length === 0` for the
//   team-training page (first-fetch).
//
// PARITY NOTES (matches circular-store / audit-store / observation-store):
//   - `detailLoadedIds` + `isDetailLoaded(id)` flag which course rows have had
//     their full detail fetched (so per-course detail screens can skip the
//     skeleton on subsequent visits and gate sub-section reads).
//   - `fetchCourseById` prepends to `courses[]` when the id isn't in the list
//     yet (e.g. deep-link to a freshly created course), mirroring the audit
//     store.
//   - Hard-delete actions (`removeCourse`, `removeEnrollment`) snapshot the
//     row + index, optimistically remove from the list, and splice back in on
//     failure.
//   - Hot mutations (`updateCourse`, `assignCourseToEmployee`,
//     `updateEnrollment`) apply the patch optimistically and roll back from a
//     snapshot if the server rejects it.

import { create } from 'zustand'
import type {
  Training,
  TrainingFilters,
  PaginationState,
  SortState,
  TrainingEmployee,
  TrainingCourse,
  DepartmentTraining,
  SaudizationMetrics,
  TrainingOverviewStats,
  CourseProgress,
  RegulatoryBodyId,
} from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

// ---------- API row shapes --------------------------------------------------

interface TrainingCourseApiRow {
  id: string
  name: string
  category: string
  due_date: string | null
  description: string | null
  assigned_count: number
  completed_count: number
  overdue_count: number
  in_progress_count: number
  framework_ids: string[] | null
  created_at: string
  updated_at: string
}

interface TrainingEmployeeApiRow {
  id: string
  user_id: string | null
  name: string
  email: string
  department: string | null
  is_saudi: boolean
  overall_progress: number
  created_at: string
  updated_at: string
}

interface EnrollmentApiRow {
  id: string
  employee_id: string
  course_id: string
  status: string
  progress: number
  score: number | null
  completed_date: string | null
  due_date: string | null
}

function mapCourseRow(row: TrainingCourseApiRow, previous?: TrainingCourse): TrainingCourse {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    dueDate: row.due_date ?? previous?.dueDate ?? '',
    description: row.description ?? previous?.description ?? undefined,
    assignedCount: row.assigned_count ?? previous?.assignedCount ?? 0,
    completedCount: row.completed_count ?? previous?.completedCount ?? 0,
    overdueCount: row.overdue_count ?? previous?.overdueCount ?? 0,
    inProgressCount: row.in_progress_count ?? previous?.inProgressCount ?? 0,
    frameworkIds: (row.framework_ids ?? previous?.frameworkIds ?? []) as RegulatoryBodyId[],
  }
}

function mapEmployeeRow(row: TrainingEmployeeApiRow, previous?: TrainingEmployee): TrainingEmployee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department ?? previous?.department ?? '',
    isSaudi: row.is_saudi ?? previous?.isSaudi ?? false,
    overallProgress: row.overall_progress ?? previous?.overallProgress ?? 0,
    courses: previous?.courses ?? [],
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

// ---------- store -----------------------------------------------------------

interface TrainingState {
  // Compliance-engine slice (no backend route yet — local-only).
  trainings: Training[]
  selectedTraining: Training | null
  filters: TrainingFilters
  pagination: PaginationState
  sort: SortState

  // Team-training page slice (server-backed for employees/courses).
  employees: TrainingEmployee[]
  courses: TrainingCourse[]
  saudizationMetrics: SaudizationMetrics
  departmentProgress: DepartmentTraining[]
  overviewStats: TrainingOverviewStats

  // Detail-loaded marker: ids of course rows that have had their full detail
  // hydrated via `fetchCourseById`. Gates per-course detail-page skeletons.
  detailLoadedIds: Record<string, true>

  // Status.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  // Compliance-engine actions (local-only shims).
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Training | null>
  create: (data: Omit<Training, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Training>
  update: (id: string, data: Partial<Training>) => Promise<Training>
  delete: (id: string) => Promise<void>
  setFilters: (filters: TrainingFilters) => void
  clearFilters: () => void
  setSelected: (training: Training | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void

  // Team-training page actions.
  fetchEmployees: () => Promise<void>
  fetchCourses: () => Promise<void>
  fetchCourseById: (id: string) => Promise<TrainingCourse | null>
  isDetailLoaded: (id: string) => boolean
  addEmployee: (employee: TrainingEmployee) => void
  updateEmployee: (id: string, data: Partial<TrainingEmployee>) => void
  removeEmployee: (id: string) => void
  assignCourseToEmployee: (employeeId: string, course: CourseProgress) => void
  bulkAssignCourse: (employeeIds: string[], course: CourseProgress) => void
  // Per-enrollment hot mutations (optimistic). The enrollment id is the
  // `employee_course_progress.id` returned by the server; courses on the
  // employee record carry this id once the row has been persisted.
  updateEnrollment: (
    employeeId: string,
    enrollmentId: string,
    data: Partial<CourseProgress>,
  ) => void
  removeEnrollment: (employeeId: string, enrollmentId: string) => void
  addCourse: (course: TrainingCourse) => void
  updateCourse: (id: string, data: Partial<TrainingCourse>) => void
  removeCourse: (id: string) => void
  updateSaudizationMetrics: (data: Partial<SaudizationMetrics>) => void
  updateOverviewStats: (data: Partial<TrainingOverviewStats>) => void
  recalculateDepartmentProgress: () => void
  recalculateOverviewStats: () => void
  importUploadData: (data: {
    employees?: TrainingEmployee[]
    saudization?: Partial<SaudizationMetrics>
    overviewStats?: Partial<TrainingOverviewStats>
  }) => void

  clearError: () => void
}

const INITIAL_SAUDIZATION: SaudizationMetrics = {
  target: 0,
  actual: 0,
  totalEmployees: 0,
  saudiEmployees: 0,
  byDepartment: [],
}

const INITIAL_OVERVIEW: TrainingOverviewStats = {
  overallCompletion: 0,
  coursesAssigned: 0,
  overdueCourses: 0,
  inProgressCourses: 0,
}

// Recompute an employee's `overallProgress` from their course list using the
// same shape both `assignCourseToEmployee` and `updateEnrollment` need.
function recomputeOverallProgress(courses: CourseProgress[]): number {
  if (courses.length === 0) return 0
  const completed = courses.filter((c) => c.status === 'completed').length
  return Math.round((completed / courses.length) * 100)
}

export const useTrainingStore = create<TrainingState>()((set, get) => ({
  trainings: [],
  selectedTraining: null,
  filters: {},
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  sort: { field: 'deadline', direction: 'asc' },

  employees: [],
  courses: [],
  saudizationMetrics: INITIAL_SAUDIZATION,
  departmentProgress: [],
  overviewStats: INITIAL_OVERVIEW,

  detailLoadedIds: {},

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  // ---------- Compliance-engine slice (local-only) -------------------------

  fetchAll: async () => {
    // No backend route for the compliance-engine `Training` resource yet.
    // Re-derive pagination from local state for back-compat.
    set((state) => ({
      pagination: {
        ...state.pagination,
        total: state.trainings.length,
        totalPages: Math.max(1, Math.ceil(state.trainings.length / state.pagination.pageSize)),
      },
      isLoading: false,
      error: null,
      lastFetched: Date.now(),
    }))
    // Also refresh the team-training page slice in the background.
    void get().fetchCourses()
    void get().fetchEmployees()
  },

  fetchById: async (id) => {
    const training = get().trainings.find((t) => t.id === id) || null
    set({ selectedTraining: training })
    return training
  },

  create: async (data) => {
    const now = new Date().toISOString()
    const newTraining: Training = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    set((s) => ({ trainings: [newTraining, ...s.trainings] }))
    return newTraining
  },

  update: async (id, data) => {
    const now = new Date().toISOString()
    let updated: Training | null = null
    set((state) => ({
      trainings: state.trainings.map((t) => {
        if (t.id === id) {
          updated = { ...t, ...data, updatedAt: now }
          return updated
        }
        return t
      }),
      selectedTraining:
        state.selectedTraining?.id === id
          ? { ...state.selectedTraining, ...data, updatedAt: now }
          : state.selectedTraining,
    }))
    if (!updated) throw new Error('Training not found')
    return updated
  },

  delete: async (id) => {
    set((state) => ({
      trainings: state.trainings.filter((t) => t.id !== id),
      selectedTraining: state.selectedTraining?.id === id ? null : state.selectedTraining,
    }))
  },

  setFilters: (filters) => set({ filters }),
  clearFilters: () => set({ filters: {} }),
  setSelected: (training) => set({ selectedTraining: training }),
  setSort: (sort) => set({ sort }),
  setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
  setPageSize: (pageSize) =>
    set((state) => ({
      pagination: {
        ...state.pagination,
        pageSize,
        totalPages: Math.max(1, Math.ceil(state.pagination.total / pageSize)),
      },
    })),

  // ---------- Team-training page slice (server-backed) ---------------------

  fetchCourses: async () => {
    set({ isLoading: true, error: null })
    try {
      // _ts cache-buster forces the browser to revalidate the GET against the
      // origin. The Route Handler sets `s-maxage=60, stale-while-revalidate=300`,
      // which otherwise lets the browser serve a stale list right after a POST
      // (the server-side `revalidateTag` only invalidates the Next data cache,
      // not the HTTP response cache). See `lib/api/cache.ts`.
      const result = await api.get<{
        items: TrainingCourseApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/training/courses', { pageSize: 100, _ts: Date.now() })
      const previousById = new Map(get().courses.map((c) => [c.id, c]))
      set({
        courses: result.items.map((row) => mapCourseRow(row, previousById.get(row.id))),
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch training courses'), isLoading: false })
    }
  },

  fetchEmployees: async () => {
    set({ isLoading: true, error: null })
    try {
      // See `fetchCourses` for the rationale on the `_ts` cache-buster.
      const result = await api.get<{
        items: TrainingEmployeeApiRow[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }>('/training/employees', { pageSize: 100, _ts: Date.now() })
      const previousById = new Map(get().employees.map((e) => [e.id, e]))
      set({
        employees: result.items.map((row) => mapEmployeeRow(row, previousById.get(row.id))),
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch training employees'), isLoading: false })
    }
  },

  fetchCourseById: async (id) => {
    // Mirrors audit-store / observation-store `fetchById`. If the row is not
    // already in `courses[]` (e.g. deep-link to a freshly created course),
    // prepend it so list-driven selectors can still resolve the id.
    set({ isLoading: true, error: null })
    try {
      const row = await api.get<TrainingCourseApiRow>(`/training/courses/${id}`)
      const previous = get().courses.find((c) => c.id === id)
      const course = mapCourseRow(row, previous)
      set((state) => ({
        courses: state.courses.some((c) => c.id === id)
          ? state.courses.map((c) => (c.id === id ? course : c))
          : [course, ...state.courses],
        detailLoadedIds: { ...state.detailLoadedIds, [id]: true },
        isLoading: false,
        lastFetched: Date.now(),
      }))
      return course
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch training course'), isLoading: false })
      if (e instanceof ApiClientError && e.code === 'not_found') return null
      return null
    }
  },

  isDetailLoaded: (id) => Boolean(get().detailLoadedIds[id]),

  addEmployee: (employee) => {
    // Optimistic insert; fire-and-forget POST. On success, swap the optimistic
    // row for the server row (so it carries a real uuid + derived progress).
    // On failure, roll back the optimistic insert.
    const optimisticId = employee.id
    set((s) => ({ employees: [...s.employees, employee], isMutating: true, error: null }))
    void (async () => {
      try {
        const row = await api.post<TrainingEmployeeApiRow>('/training/employees', {
          name: employee.name,
          email: employee.email,
          department: employee.department || undefined,
          is_saudi: employee.isSaudi,
        })
        const mapped = mapEmployeeRow(row, employee)
        set((s) => ({
          employees: s.employees.map((e) => (e.id === optimisticId ? mapped : e)),
          isMutating: false,
        }))
        // Background refresh to capture any server-derived fields.
        void get().fetchEmployees()
      } catch (e) {
        // Roll back the optimistic insert so reload-survival matches what's on the server.
        set((s) => ({
          employees: s.employees.filter((e) => e.id !== optimisticId),
          error: errorMessage(e, 'Failed to add training employee'),
          isMutating: false,
        }))
      }
    })()
  },

  updateEmployee: (id, data) => {
    // OPTIMISTIC update with snapshot-restore on failure.
    const snapshot = get().employees.find((e) => e.id === id)
    set((s) => ({
      employees: s.employees.map((e) => (e.id === id ? { ...e, ...data } : e)),
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const body: Record<string, unknown> = {}
        if (data.name !== undefined) body.name = data.name
        if (data.email !== undefined) body.email = data.email
        if (data.department !== undefined) body.department = data.department
        if (data.isSaudi !== undefined) body.is_saudi = data.isSaudi
        if (data.overallProgress !== undefined) body.overall_progress = data.overallProgress
        if (Object.keys(body).length > 0) {
          await api.patch(`/training/employees/${id}`, body)
        }
        set({ isMutating: false })
      } catch (e) {
        // Roll back to the snapshot.
        set((s) => ({
          employees: snapshot
            ? s.employees.map((emp) => (emp.id === id ? snapshot : emp))
            : s.employees,
          error: errorMessage(e, 'Failed to update training employee'),
          isMutating: false,
        }))
      }
    })()
  },

  removeEmployee: (id) => {
    // OPTIMISTIC hard-delete: snapshot the row + its index, splice back in on
    // failure. Mirrors observation-store and audit-store delete semantics.
    const existing = get().employees.find((e) => e.id === id)
    const prevIndex = get().employees.findIndex((e) => e.id === id)
    set((s) => ({ employees: s.employees.filter((e) => e.id !== id), isMutating: true, error: null }))
    void (async () => {
      try {
        await api.delete(`/training/employees/${id}`)
        set({ isMutating: false })
      } catch (e) {
        if (existing) {
          set((s) => {
            const list = [...s.employees]
            const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
            list.splice(insertAt, 0, existing)
            return {
              employees: list,
              error: errorMessage(e, 'Failed to remove training employee'),
              isMutating: false,
            }
          })
        } else {
          set({ error: errorMessage(e, 'Failed to remove training employee'), isMutating: false })
        }
      }
    })()
  },

  assignCourseToEmployee: (employeeId, course) => {
    // OPTIMISTIC: insert the course into the employee's local list with a
    // temporary id (the `course.id` passed in is the *course* uuid, not the
    // enrollment uuid). After the server creates the enrollment, swap the
    // temp row's id for the persisted enrollment id so subsequent
    // updateEnrollment / removeEnrollment calls hit the right row.
    const snapshot = get().employees.find((e) => e.id === employeeId)
    const tempEnrollmentId = `temp-enrollment-${crypto.randomUUID()}`
    const optimisticCourse: CourseProgress = { ...course, id: tempEnrollmentId }
    set((state) => ({
      employees: state.employees.map((e) => {
        if (e.id !== employeeId) return e
        const updatedCourses = [...e.courses, optimisticCourse]
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: recomputeOverallProgress(updatedCourses),
        }
      }),
      isMutating: true,
      error: null,
    }))

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(course.id)
    if (!isUuid) {
      // No server round-trip possible without a real course uuid — treat as a
      // local-only assignment (legacy seed data path).
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        const row = await api.post<EnrollmentApiRow>(
          `/training/employees/${employeeId}/enrollments`,
          {
            course_id: course.id,
            status: course.status,
            progress: course.progress,
            due_date: course.dueDate || undefined,
          },
        )
        set((state) => ({
          employees: state.employees.map((e) => {
            if (e.id !== employeeId) return e
            return {
              ...e,
              courses: e.courses.map((c) =>
                c.id === tempEnrollmentId
                  ? {
                      ...c,
                      id: row.id,
                      status: (row.status as CourseProgress['status']) ?? c.status,
                      progress: row.progress ?? c.progress,
                      score: row.score ?? c.score,
                      completedDate: row.completed_date ?? c.completedDate,
                      dueDate: row.due_date ?? c.dueDate,
                    }
                  : c,
              ),
            }
          }),
          isMutating: false,
        }))
      } catch (e) {
        // Roll back to the snapshot.
        set((state) => ({
          employees: snapshot
            ? state.employees.map((emp) => (emp.id === employeeId ? snapshot : emp))
            : state.employees,
          error: errorMessage(e, 'Failed to assign course'),
          isMutating: false,
        }))
      }
    })()
  },

  bulkAssignCourse: (employeeIds, course) => {
    set((state) => ({
      employees: state.employees.map((e) => {
        if (!employeeIds.includes(e.id)) return e
        const updatedCourses = [...e.courses, { ...course, id: `${course.id}-${e.id}` }]
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: recomputeOverallProgress(updatedCourses),
        }
      }),
    }))
    // Fire the bulk-assign endpoint when `course.id` looks like a server uuid.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(course.id)
    if (!isUuid) return
    void (async () => {
      try {
        await api.post(`/training/courses/${course.id}/assign`, {
          employee_ids: employeeIds,
          due_date: course.dueDate || undefined,
        })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to assign course'), isMutating: false })
      }
    })()
  },

  updateEnrollment: (employeeId, enrollmentId, data) => {
    // OPTIMISTIC per-enrollment toggle (e.g. mark complete, bump progress).
    // Snapshot the employee so we can restore on failure.
    const snapshot = get().employees.find((e) => e.id === employeeId)
    const isTemp = enrollmentId.startsWith('temp-enrollment-')

    set((state) => ({
      employees: state.employees.map((e) => {
        if (e.id !== employeeId) return e
        const updatedCourses = e.courses.map((c) => {
          if (c.id !== enrollmentId) return c
          const next: CourseProgress = { ...c, ...data }
          // If the patch flips status -> completed and doesn't set progress
          // explicitly, mirror the route handler's auto-100% behaviour.
          if (data.status === 'completed' && data.progress === undefined) {
            next.progress = 100
          }
          if (data.status === 'completed' && data.completedDate === undefined) {
            next.completedDate = new Date().toISOString().slice(0, 10)
          }
          return next
        })
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: recomputeOverallProgress(updatedCourses),
        }
      }),
      isMutating: true,
      error: null,
    }))

    // Skip the server call for optimistic temp rows — the original
    // `assignCourseToEmployee` flow swaps the id once the enrollment lands.
    if (isTemp) {
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        const body: Record<string, unknown> = {}
        if (data.status !== undefined) body.status = data.status
        if (data.progress !== undefined) body.progress = data.progress
        if (data.score !== undefined) body.score = data.score
        if (data.completedDate !== undefined) body.completed_date = data.completedDate || undefined
        if (data.dueDate !== undefined) body.due_date = data.dueDate || undefined
        if (Object.keys(body).length > 0) {
          await api.patch(
            `/training/employees/${employeeId}/enrollments/${enrollmentId}`,
            body,
          )
        }
        set({ isMutating: false })
      } catch (e) {
        // Roll back the entire employee to the pre-patch snapshot. Replacing
        // the whole record (vs. unwinding the single course) keeps the
        // derived `overallProgress` consistent with what the server still has.
        set((state) => ({
          employees: snapshot
            ? state.employees.map((emp) => (emp.id === employeeId ? snapshot : emp))
            : state.employees,
          error: errorMessage(e, 'Failed to update enrollment'),
          isMutating: false,
        }))
      }
    })()
  },

  removeEnrollment: (employeeId, enrollmentId) => {
    // OPTIMISTIC hard-delete: snapshot the employee, drop the enrollment, and
    // restore the snapshot on failure. Mirrors the audit/observation delete
    // pattern.
    const snapshot = get().employees.find((e) => e.id === employeeId)
    const isTemp = enrollmentId.startsWith('temp-enrollment-')

    set((state) => ({
      employees: state.employees.map((e) => {
        if (e.id !== employeeId) return e
        const updatedCourses = e.courses.filter((c) => c.id !== enrollmentId)
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: recomputeOverallProgress(updatedCourses),
        }
      }),
      isMutating: true,
      error: null,
    }))

    if (isTemp) {
      set({ isMutating: false })
      return
    }

    void (async () => {
      try {
        await api.delete(`/training/employees/${employeeId}/enrollments/${enrollmentId}`)
        set({ isMutating: false })
      } catch (e) {
        set((state) => ({
          employees: snapshot
            ? state.employees.map((emp) => (emp.id === employeeId ? snapshot : emp))
            : state.employees,
          error: errorMessage(e, 'Failed to remove enrollment'),
          isMutating: false,
        }))
      }
    })()
  },

  addCourse: (course) => {
    // Optimistic insert with a client-generated id. On success, swap the
    // optimistic row for the server row so the persisted uuid drives any
    // subsequent assign / update / delete calls. On failure, roll back.
    const optimisticId = course.id
    set((s) => ({ courses: [...s.courses, course], isMutating: true, error: null }))
    void (async () => {
      try {
        const row = await api.post<TrainingCourseApiRow>('/training/courses', {
          name: course.name,
          category: course.category,
          description: course.description,
          due_date: course.dueDate || undefined,
          framework_ids: course.frameworkIds ?? [],
        })
        const mapped = mapCourseRow(row)
        set((s) => ({
          courses: s.courses.map((c) => (c.id === optimisticId ? mapped : c)),
          isMutating: false,
        }))
      } catch (e) {
        set((s) => ({
          courses: s.courses.filter((c) => c.id !== optimisticId),
          error: errorMessage(e, 'Failed to add training course'),
          isMutating: false,
        }))
      }
    })()
  },

  updateCourse: (id, data) => {
    // OPTIMISTIC update with snapshot-restore on failure. Mirrors the
    // circular-store / audit-store update semantics.
    const snapshot = get().courses.find((c) => c.id === id)
    set((s) => ({
      courses: s.courses.map((c) => (c.id === id ? { ...c, ...data } : c)),
      isMutating: true,
      error: null,
    }))
    void (async () => {
      try {
        const body: Record<string, unknown> = {}
        if (data.name !== undefined) body.name = data.name
        if (data.category !== undefined) body.category = data.category
        if (data.description !== undefined) body.description = data.description
        if (data.dueDate !== undefined) body.due_date = data.dueDate || undefined
        if (data.frameworkIds !== undefined) body.framework_ids = data.frameworkIds
        if (Object.keys(body).length > 0) {
          const row = await api.patch<TrainingCourseApiRow>(`/training/courses/${id}`, body)
          // Re-map from the server response so derived counts stay aligned.
          const mapped = mapCourseRow(row, get().courses.find((c) => c.id === id))
          set((s) => ({
            courses: s.courses.map((c) => (c.id === id ? mapped : c)),
            isMutating: false,
          }))
        } else {
          set({ isMutating: false })
        }
      } catch (e) {
        set((s) => ({
          courses: snapshot ? s.courses.map((c) => (c.id === id ? snapshot : c)) : s.courses,
          error: errorMessage(e, 'Failed to update training course'),
          isMutating: false,
        }))
      }
    })()
  },

  removeCourse: (id) => {
    // OPTIMISTIC hard-delete: snapshot row + index + detail-loaded flag, drop
    // immediately, and splice back in on failure. Mirrors the
    // observation-store and audit-store delete shape.
    const existing = get().courses.find((c) => c.id === id)
    const prevIndex = get().courses.findIndex((c) => c.id === id)
    const wasDetailLoaded = Boolean(get().detailLoadedIds[id])
    set((s) => {
      const { [id]: _dropDetail, ...restDetail } = s.detailLoadedIds
      return {
        courses: s.courses.filter((c) => c.id !== id),
        detailLoadedIds: restDetail,
        isMutating: true,
        error: null,
      }
    })
    void (async () => {
      try {
        await api.delete(`/training/courses/${id}`)
        set({ isMutating: false })
      } catch (e) {
        if (existing) {
          set((s) => {
            const list = [...s.courses]
            const insertAt = prevIndex >= 0 && prevIndex <= list.length ? prevIndex : list.length
            list.splice(insertAt, 0, existing)
            return {
              courses: list,
              detailLoadedIds: wasDetailLoaded
                ? { ...s.detailLoadedIds, [id]: true }
                : s.detailLoadedIds,
              error: errorMessage(e, 'Failed to remove training course'),
              isMutating: false,
            }
          })
        } else {
          set({ error: errorMessage(e, 'Failed to remove training course'), isMutating: false })
        }
      }
    })()
  },

  updateSaudizationMetrics: (data) =>
    set((state) => ({
      saudizationMetrics: { ...state.saudizationMetrics, ...data },
    })),

  updateOverviewStats: (data) =>
    set((state) => ({
      overviewStats: { ...state.overviewStats, ...data },
    })),

  recalculateDepartmentProgress: () => {
    const { employees } = get()
    const deptMap = new Map<
      string,
      { employees: number; completed: number; inProgress: number; overdue: number; total: number }
    >()

    for (const emp of employees) {
      const dept = emp.department || 'Unknown'
      if (!deptMap.has(dept)) {
        deptMap.set(dept, { employees: 0, completed: 0, inProgress: 0, overdue: 0, total: 0 })
      }
      const d = deptMap.get(dept)!
      d.employees += 1
      for (const c of emp.courses) {
        d.total += 1
        if (c.status === 'completed') d.completed += 1
        else if (c.status === 'in_progress') d.inProgress += 1
        else if (c.status === 'overdue') d.overdue += 1
      }
    }

    const departmentProgress: DepartmentTraining[] = Array.from(deptMap.entries()).map(
      ([name, d]) => ({
        name,
        employees: d.employees,
        completed: d.completed,
        inProgress: d.inProgress,
        overdue: d.overdue,
        progress: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      }),
    )

    set({ departmentProgress })
  },

  recalculateOverviewStats: () => {
    const { employees } = get()
    let totalCourses = 0
    let completedCourses = 0
    let overdueCourses = 0
    let inProgressCourses = 0

    for (const emp of employees) {
      for (const c of emp.courses) {
        totalCourses += 1
        if (c.status === 'completed') completedCourses += 1
        else if (c.status === 'overdue') overdueCourses += 1
        else if (c.status === 'in_progress') inProgressCourses += 1
      }
    }

    set({
      overviewStats: {
        overallCompletion: totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0,
        coursesAssigned: totalCourses,
        overdueCourses,
        inProgressCourses,
      },
    })
  },

  importUploadData: (data) => {
    set((state) => ({
      ...(data.employees ? { employees: data.employees } : {}),
      ...(data.saudization
        ? { saudizationMetrics: { ...state.saudizationMetrics, ...data.saudization } }
        : {}),
      ...(data.overviewStats
        ? { overviewStats: { ...state.overviewStats, ...data.overviewStats } }
        : {}),
    }))
  },

  clearError: () => set({ error: null }),
}))
