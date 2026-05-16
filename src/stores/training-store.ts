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

function mapCourseRow(row: TrainingCourseApiRow): TrainingCourse {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    dueDate: row.due_date ?? '',
    description: row.description ?? undefined,
    assignedCount: row.assigned_count ?? 0,
    completedCount: row.completed_count ?? 0,
    overdueCount: row.overdue_count ?? 0,
    inProgressCount: row.in_progress_count ?? 0,
    frameworkIds: (row.framework_ids ?? []) as RegulatoryBodyId[],
  }
}

function mapEmployeeRow(row: TrainingEmployeeApiRow, previous?: TrainingEmployee): TrainingEmployee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department ?? '',
    isSaudi: row.is_saudi ?? false,
    overallProgress: row.overall_progress ?? 0,
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
  addEmployee: (employee: TrainingEmployee) => void
  updateEmployee: (id: string, data: Partial<TrainingEmployee>) => void
  removeEmployee: (id: string) => void
  assignCourseToEmployee: (employeeId: string, course: CourseProgress) => void
  bulkAssignCourse: (employeeIds: string[], course: CourseProgress) => void
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
      set({
        courses: result.items.map(mapCourseRow),
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
        set({ error: errorMessage(e, 'Failed to update training employee'), isMutating: false })
      }
    })()
  },

  removeEmployee: (id) => {
    const existing = get().employees.find((e) => e.id === id)
    set((s) => ({ employees: s.employees.filter((e) => e.id !== id), isMutating: true, error: null }))
    void (async () => {
      try {
        await api.delete(`/training/employees/${id}`)
        set({ isMutating: false })
      } catch (e) {
        // Roll back.
        set((s) => ({
          employees: existing ? [...s.employees, existing] : s.employees,
          error: errorMessage(e, 'Failed to remove training employee'),
          isMutating: false,
        }))
      }
    })()
  },

  assignCourseToEmployee: (employeeId, course) =>
    set((state) => ({
      employees: state.employees.map((e) => {
        if (e.id !== employeeId) return e
        const updatedCourses = [...e.courses, course]
        const total = updatedCourses.length
        const completed = updatedCourses.filter((c) => c.status === 'completed').length
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0,
        }
      }),
    })),

  bulkAssignCourse: (employeeIds, course) => {
    set((state) => ({
      employees: state.employees.map((e) => {
        if (!employeeIds.includes(e.id)) return e
        const updatedCourses = [...e.courses, { ...course, id: `${course.id}-${e.id}` }]
        const total = updatedCourses.length
        const completed = updatedCourses.filter((c) => c.status === 'completed').length
        return {
          ...e,
          courses: updatedCourses,
          overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0,
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
          await api.patch(`/training/courses/${id}`, body)
        }
        set({ isMutating: false })
      } catch (e) {
        set({ error: errorMessage(e, 'Failed to update training course'), isMutating: false })
      }
    })()
  },

  removeCourse: (id) => {
    const existing = get().courses.find((c) => c.id === id)
    set((s) => ({ courses: s.courses.filter((c) => c.id !== id), isMutating: true, error: null }))
    void (async () => {
      try {
        await api.delete(`/training/courses/${id}`)
        set({ isMutating: false })
      } catch (e) {
        set((s) => ({
          courses: existing ? [...s.courses, existing] : s.courses,
          error: errorMessage(e, 'Failed to remove training course'),
          isMutating: false,
        }))
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
