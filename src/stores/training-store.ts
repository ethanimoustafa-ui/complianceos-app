import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
} from '@/types'

// ── Seed Data ──────────────────────────────────────────────────────────

const seedCourses: TrainingCourse[] = [
  { id: 'CRS-001', name: 'Anti-Money Laundering Fundamentals', category: 'aml', dueDate: '2026-04-15', assignedCount: 4, completedCount: 2, overdueCount: 1, inProgressCount: 1 },
  { id: 'CRS-002', name: 'Cybersecurity Awareness', category: 'cybersecurity', dueDate: '2026-05-01', assignedCount: 4, completedCount: 1, overdueCount: 0, inProgressCount: 2 },
  { id: 'CRS-003', name: 'Compliance Essentials', category: 'compliance', dueDate: '2026-03-30', assignedCount: 3, completedCount: 2, overdueCount: 1, inProgressCount: 0 },
  { id: 'CRS-004', name: 'Risk Management Framework', category: 'risk', dueDate: '2026-06-01', assignedCount: 3, completedCount: 1, overdueCount: 0, inProgressCount: 2 },
]

const seedEmployees: TrainingEmployee[] = [
  {
    id: 'EMP-001', name: 'Fatimah Al-Rashid', email: 'fatimah@company.com', department: 'Compliance', isSaudi: true,
    overallProgress: 100,
    courses: [
      { id: 'CP-001', name: 'Anti-Money Laundering Fundamentals', category: 'aml', status: 'completed', progress: 100, completedDate: '2026-02-20', dueDate: '2026-04-15' },
      { id: 'CP-002', name: 'Compliance Essentials', category: 'compliance', status: 'completed', progress: 100, completedDate: '2026-02-25', dueDate: '2026-03-30' },
    ],
  },
  {
    id: 'EMP-002', name: 'Omar Khalid', email: 'omar@company.com', department: 'Risk Management', isSaudi: true,
    overallProgress: 55,
    courses: [
      { id: 'CP-003', name: 'Anti-Money Laundering Fundamentals', category: 'aml', status: 'in_progress', progress: 60, dueDate: '2026-04-15' },
      { id: 'CP-004', name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'in_progress', progress: 40, dueDate: '2026-05-01' },
      { id: 'CP-005', name: 'Risk Management Framework', category: 'risk', status: 'completed', progress: 100, completedDate: '2026-03-01', dueDate: '2026-06-01' },
    ],
  },
  {
    id: 'EMP-003', name: 'David Chen', email: 'david@company.com', department: 'Finance', isSaudi: false,
    overallProgress: 33,
    courses: [
      { id: 'CP-006', name: 'Anti-Money Laundering Fundamentals', category: 'aml', status: 'completed', progress: 100, completedDate: '2026-01-15', dueDate: '2026-04-15' },
      { id: 'CP-007', name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'in_progress', progress: 20, dueDate: '2026-05-01' },
      { id: 'CP-008', name: 'Compliance Essentials', category: 'compliance', status: 'overdue', progress: 0, dueDate: '2026-03-01' },
    ],
  },
  {
    id: 'EMP-004', name: 'Nora Al-Otaibi', email: 'nora@company.com', department: 'Compliance', isSaudi: true,
    overallProgress: 50,
    courses: [
      { id: 'CP-009', name: 'Anti-Money Laundering Fundamentals', category: 'aml', status: 'overdue', progress: 10, dueDate: '2026-02-28' },
      { id: 'CP-010', name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'completed', progress: 100, completedDate: '2026-02-10', dueDate: '2026-05-01' },
      { id: 'CP-011', name: 'Risk Management Framework', category: 'risk', status: 'in_progress', progress: 45, dueDate: '2026-06-01' },
    ],
  },
]

const seedSaudizationMetrics: SaudizationMetrics = {
  target: 70,
  actual: 60,
  totalEmployees: 5,
  saudiEmployees: 3,
  byDepartment: [
    { name: 'Compliance', total: 2, saudi: 2, percentage: 100 },
    { name: 'Risk Management', total: 1, saudi: 1, percentage: 100 },
    { name: 'Finance', total: 1, saudi: 0, percentage: 0 },
  ],
}

const seedDepartmentProgress: DepartmentTraining[] = [
  { name: 'Compliance', employees: 2, completed: 3, inProgress: 1, overdue: 1, progress: 60 },
  { name: 'Risk Management', employees: 1, completed: 1, inProgress: 2, overdue: 0, progress: 33 },
  { name: 'Finance', employees: 1, completed: 1, inProgress: 1, overdue: 1, progress: 33 },
]

const seedOverviewStats: TrainingOverviewStats = { overallCompletion: 72, coursesAssigned: 12, overdueCourses: 3, inProgressCourses: 5 }

// ── State Interface ────────────────────────────────────────────────────

interface TrainingState {
  // Existing (compliance engine)
  trainings: Training[]
  selectedTraining: Training | null
  filters: TrainingFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // New training-page state
  employees: TrainingEmployee[]
  courses: TrainingCourse[]
  saudizationMetrics: SaudizationMetrics
  departmentProgress: DepartmentTraining[]
  overviewStats: TrainingOverviewStats

  // Existing actions (compliance engine)
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

  // New actions
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
}

// ── Store ──────────────────────────────────────────────────────────────

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      // Existing state
      trainings: [],
      selectedTraining: null,
      filters: {},
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      sort: { field: 'deadline', direction: 'asc' },
      isLoading: false,
      error: null,

      // New state
      employees: seedEmployees,
      courses: seedCourses,
      saudizationMetrics: seedSaudizationMetrics,
      departmentProgress: seedDepartmentProgress,
      overviewStats: seedOverviewStats,

      // ── Existing actions (compliance engine) ──

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))
          const existingTrainings = get().trainings
          set({
            pagination: {
              ...get().pagination,
              total: existingTrainings.length,
              totalPages: Math.ceil(existingTrainings.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch trainings',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))
          const training = get().trainings.find((t) => t.id === id) || null
          set({ selectedTraining: training, isLoading: false })
          return training
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch training',
            isLoading: false,
          })
          return null
        }
      },

      create: async (data) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))
          const now = new Date().toISOString()
          const newTraining: Training = {
            ...data,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
          }
          set((state) => ({
            trainings: [newTraining, ...state.trainings],
            isLoading: false,
          }))
          return newTraining
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create training',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Training>) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))
          let updatedTraining: Training | null = null
          set((state) => ({
            trainings: state.trainings.map((t) => {
              if (t.id === id) {
                updatedTraining = { ...t, ...data, updatedAt: new Date().toISOString() }
                return updatedTraining
              }
              return t
            }),
            selectedTraining:
              state.selectedTraining?.id === id
                ? { ...state.selectedTraining, ...data, updatedAt: new Date().toISOString() }
                : state.selectedTraining,
            isLoading: false,
          }))
          if (!updatedTraining) throw new Error('Training not found')
          return updatedTraining
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update training',
            isLoading: false,
          })
          throw error
        }
      },

      delete: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))
          set((state) => ({
            trainings: state.trainings.filter((t) => t.id !== id),
            selectedTraining: state.selectedTraining?.id === id ? null : state.selectedTraining,
            isLoading: false,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete training',
            isLoading: false,
          })
          throw error
        }
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
            totalPages: Math.ceil(state.pagination.total / pageSize),
          },
        })),

      // ── New actions ──

      addEmployee: (employee) =>
        set((state) => ({ employees: [...state.employees, employee] })),

      updateEmployee: (id, data) =>
        set((state) => ({
          employees: state.employees.map((e) => (e.id === id ? { ...e, ...data } : e)),
        })),

      removeEmployee: (id) =>
        set((state) => ({
          employees: state.employees.filter((e) => e.id !== id),
        })),

      assignCourseToEmployee: (employeeId, course) =>
        set((state) => ({
          employees: state.employees.map((e) => {
            if (e.id !== employeeId) return e
            const updatedCourses = [...e.courses, course]
            const total = updatedCourses.length
            const completed = updatedCourses.filter(c => c.status === 'completed').length
            return { ...e, courses: updatedCourses, overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0 }
          }),
        })),

      bulkAssignCourse: (employeeIds, course) =>
        set((state) => ({
          employees: state.employees.map((e) => {
            if (!employeeIds.includes(e.id)) return e
            const updatedCourses = [...e.courses, { ...course, id: `${course.id}-${e.id}` }]
            const total = updatedCourses.length
            const completed = updatedCourses.filter(c => c.status === 'completed').length
            return { ...e, courses: updatedCourses, overallProgress: total > 0 ? Math.round((completed / total) * 100) : 0 }
          }),
        })),

      addCourse: (course) =>
        set((state) => ({ courses: [...state.courses, course] })),

      updateCourse: (id, data) =>
        set((state) => ({
          courses: state.courses.map((c) => (c.id === id ? { ...c, ...data } : c)),
        })),

      removeCourse: (id) =>
        set((state) => ({
          courses: state.courses.filter((c) => c.id !== id),
        })),

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
        const deptMap = new Map<string, { employees: number; completed: number; inProgress: number; overdue: number; total: number }>()

        for (const emp of employees) {
          const dept = emp.department
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
          })
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
    }),
    {
      name: 'training-storage',
      version: 3,
      partialize: (state) => ({
        trainings: state.trainings,
        employees: state.employees,
        courses: state.courses,
        saudizationMetrics: state.saudizationMetrics,
        departmentProgress: state.departmentProgress,
        overviewStats: state.overviewStats,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version < 3) {
          return {
            trainings: (persistedState as Record<string, unknown>).trainings ?? [],
            employees: seedEmployees,
            courses: seedCourses,
            saudizationMetrics: seedSaudizationMetrics,
            departmentProgress: seedDepartmentProgress,
            overviewStats: seedOverviewStats,
          }
        }
        return persistedState
      },
    }
  )
)
