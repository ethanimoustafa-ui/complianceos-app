'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { NoDataEmptyState } from '@/components/ui/empty-state'

// Training types
type TrainingStatus = 'completed' | 'in_progress' | 'not_started' | 'overdue'
type TrainingCategory = 'compliance' | 'aml' | 'cybersecurity' | 'sharia' | 'risk'

interface EmployeeTraining {
  id: number
  name: string
  email: string
  department: string
  isSaudi: boolean
  courses: CourseProgress[]
  overallProgress: number
}

interface CourseProgress {
  id: number
  name: string
  category: TrainingCategory
  status: TrainingStatus
  completedDate?: string
  dueDate: string
  score?: number
}

interface DepartmentTraining {
  name: string
  employees: number
  completed: number
  inProgress: number
  overdue: number
  progress: number
}

interface TrainingCourse {
  id: number
  name: string
  category: TrainingCategory
  dueDate: string
  description?: string
  assignedCount: number
  completedCount: number
  overdueCount: number
  inProgressCount: number
}

// Training Tab Mock Data
const employeeTrainingData: EmployeeTraining[] = [
  {
    id: 1,
    name: 'Ahmed Al-Rashid',
    email: 'ahmed.r@complianceos.io',
    department: 'Compliance',
    isSaudi: true,
    overallProgress: 100,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'completed', completedDate: '2024-09-15', dueDate: '2024-09-30', score: 92 },
      { id: 2, name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'completed', completedDate: '2024-08-20', dueDate: '2024-08-31', score: 88 },
      { id: 3, name: 'Sharia Compliance Basics', category: 'sharia', status: 'completed', completedDate: '2024-07-10', dueDate: '2024-07-31', score: 95 },
    ]
  },
  {
    id: 2,
    name: 'Sarah Connor',
    email: 'sarah.c@complianceos.io',
    department: 'Risk Management',
    isSaudi: false,
    overallProgress: 85,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'completed', completedDate: '2024-09-10', dueDate: '2024-09-30', score: 90 },
      { id: 2, name: 'Risk Assessment Methods', category: 'risk', status: 'in_progress', dueDate: '2024-11-15' },
      { id: 3, name: 'Compliance Framework', category: 'compliance', status: 'completed', completedDate: '2024-08-15', dueDate: '2024-08-31', score: 87 },
    ]
  },
  {
    id: 3,
    name: 'Fatima Hassan',
    email: 'fatima.h@complianceos.io',
    department: 'Compliance',
    isSaudi: true,
    overallProgress: 67,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'completed', completedDate: '2024-09-20', dueDate: '2024-09-30', score: 85 },
      { id: 2, name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'in_progress', dueDate: '2024-11-30' },
      { id: 3, name: 'Sharia Compliance Basics', category: 'sharia', status: 'not_started', dueDate: '2024-12-15' },
    ]
  },
  {
    id: 4,
    name: 'Michael Scott',
    email: 'm.scott@complianceos.io',
    department: 'IT',
    isSaudi: false,
    overallProgress: 50,
    courses: [
      { id: 1, name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'completed', completedDate: '2024-09-05', dueDate: '2024-09-15', score: 82 },
      { id: 2, name: 'Data Privacy Essentials', category: 'compliance', status: 'overdue', dueDate: '2024-10-01' },
      { id: 3, name: 'Risk Assessment Methods', category: 'risk', status: 'not_started', dueDate: '2024-12-01' },
    ]
  },
  {
    id: 5,
    name: 'Khalid Al-Otaibi',
    email: 'khalid.o@complianceos.io',
    department: 'Finance',
    isSaudi: true,
    overallProgress: 100,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'completed', completedDate: '2024-08-28', dueDate: '2024-09-30', score: 94 },
      { id: 2, name: 'Financial Crime Prevention', category: 'aml', status: 'completed', completedDate: '2024-09-18', dueDate: '2024-10-15', score: 91 },
    ]
  },
  {
    id: 6,
    name: 'Omar Khalil',
    email: 'omar.k@complianceos.io',
    department: 'IT',
    isSaudi: false,
    overallProgress: 33,
    courses: [
      { id: 1, name: 'Cybersecurity Awareness', category: 'cybersecurity', status: 'completed', completedDate: '2024-09-12', dueDate: '2024-09-30', score: 79 },
      { id: 2, name: 'Data Privacy Essentials', category: 'compliance', status: 'overdue', dueDate: '2024-10-15' },
      { id: 3, name: 'Information Security Policy', category: 'cybersecurity', status: 'not_started', dueDate: '2024-12-20' },
    ]
  },
  {
    id: 7,
    name: 'Layla Mahmoud',
    email: 'layla.m@complianceos.io',
    department: 'Risk Management',
    isSaudi: true,
    overallProgress: 75,
    courses: [
      { id: 1, name: 'Risk Assessment Methods', category: 'risk', status: 'completed', completedDate: '2024-09-08', dueDate: '2024-09-30', score: 88 },
      { id: 2, name: 'Operational Risk Management', category: 'risk', status: 'in_progress', dueDate: '2024-11-20' },
      { id: 3, name: 'Compliance Framework', category: 'compliance', status: 'completed', completedDate: '2024-08-25', dueDate: '2024-09-15', score: 86 },
    ]
  },
  {
    id: 8,
    name: 'David Wallace',
    email: 'd.wallace@complianceos.io',
    department: 'Operations',
    isSaudi: false,
    overallProgress: 0,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'overdue', dueDate: '2024-10-01' },
      { id: 2, name: 'Compliance Framework', category: 'compliance', status: 'not_started', dueDate: '2024-11-30' },
    ]
  },
  {
    id: 9,
    name: 'Nora Al-Saud',
    email: 'nora.s@complianceos.io',
    department: 'Compliance',
    isSaudi: true,
    overallProgress: 100,
    courses: [
      { id: 1, name: 'AML Fundamentals', category: 'aml', status: 'completed', completedDate: '2024-08-15', dueDate: '2024-09-30', score: 96 },
      { id: 2, name: 'Sharia Compliance Basics', category: 'sharia', status: 'completed', completedDate: '2024-09-01', dueDate: '2024-09-30', score: 98 },
      { id: 3, name: 'Compliance Framework', category: 'compliance', status: 'completed', completedDate: '2024-09-20', dueDate: '2024-10-15', score: 94 },
    ]
  },
  {
    id: 10,
    name: 'Kelly Kapoor',
    email: 'k.kapoor@complianceos.io',
    department: 'Finance',
    isSaudi: false,
    overallProgress: 67,
    courses: [
      { id: 1, name: 'Financial Crime Prevention', category: 'aml', status: 'completed', completedDate: '2024-09-25', dueDate: '2024-10-15', score: 83 },
      { id: 2, name: 'AML Fundamentals', category: 'aml', status: 'in_progress', dueDate: '2024-11-15' },
      { id: 3, name: 'Risk Assessment Methods', category: 'risk', status: 'not_started', dueDate: '2024-12-01' },
    ]
  },
]

const departmentTrainingData: DepartmentTraining[] = [
  { name: 'Compliance', employees: 3, completed: 8, inProgress: 1, overdue: 0, progress: 89 },
  { name: 'Risk Management', employees: 2, completed: 4, inProgress: 2, overdue: 0, progress: 80 },
  { name: 'Finance', employees: 2, completed: 3, inProgress: 1, overdue: 0, progress: 75 },
  { name: 'IT', employees: 2, completed: 2, inProgress: 0, overdue: 2, progress: 42 },
  { name: 'Operations', employees: 1, completed: 0, inProgress: 0, overdue: 1, progress: 0 },
]

// Saudization metrics with department breakdown
const saudizationMetrics = {
  target: 42,
  actual: 50,
  totalEmployees: 10,
  saudiEmployees: 5,
  byDepartment: [
    { name: 'Compliance', total: 3, saudi: 3, percentage: 100 },
    { name: 'Risk Management', total: 2, saudi: 1, percentage: 50 },
    { name: 'Finance', total: 2, saudi: 1, percentage: 50 },
    { name: 'IT', total: 2, saudi: 0, percentage: 0 },
    { name: 'Operations', total: 1, saudi: 0, percentage: 0 },
  ],
}

// Get Saudi employees with their training progress
const getSaudiEmployeesWithProgress = () => {
  return employeeTrainingData
    .filter(emp => emp.isSaudi)
    .map(emp => ({
      id: emp.id,
      name: emp.name,
      department: emp.department,
      trainingProgress: emp.overallProgress,
    }))
    .sort((a, b) => b.trainingProgress - a.trainingProgress)
}

// Mock training courses data for management modal
const mockTrainingCourses: TrainingCourse[] = [
  {
    id: 1,
    name: 'AML Fundamentals',
    category: 'aml',
    dueDate: '2026-02-15',
    description: 'Core anti-money laundering concepts and regulatory requirements',
    assignedCount: 12,
    completedCount: 8,
    overdueCount: 2,
    inProgressCount: 2,
  },
  {
    id: 2,
    name: 'Cybersecurity Awareness',
    category: 'cybersecurity',
    dueDate: '2026-03-01',
    description: 'Information security best practices and threat awareness',
    assignedCount: 10,
    completedCount: 6,
    overdueCount: 1,
    inProgressCount: 3,
  },
  {
    id: 3,
    name: 'Sharia Compliance Basics',
    category: 'sharia',
    dueDate: '2026-04-15',
    description: 'Fundamentals of Islamic banking and sharia-compliant operations',
    assignedCount: 8,
    completedCount: 5,
    overdueCount: 0,
    inProgressCount: 0,
  },
  {
    id: 4,
    name: 'Risk Assessment Methods',
    category: 'risk',
    dueDate: '2026-03-30',
    description: 'Risk identification, analysis, and mitigation strategies',
    assignedCount: 6,
    completedCount: 4,
    overdueCount: 1,
    inProgressCount: 0,
  },
  {
    id: 5,
    name: 'Compliance Framework',
    category: 'compliance',
    dueDate: '2026-05-01',
    description: 'Organizational compliance policies and procedures',
    assignedCount: 10,
    completedCount: 7,
    overdueCount: 0,
    inProgressCount: 0,
  },
]

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

export default function TeamTrainingPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()

  // Training tab states
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeTraining | null>(null)
  const [isEmployeeDetailOpen, setIsEmployeeDetailOpen] = useState(false)
  const [trainingDeptFilter, setTrainingDeptFilter] = useState('')
  const [trainingStatusFilter, setTrainingStatusFilter] = useState<TrainingStatus | ''>('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Training management modal states
  const [isTrainingManageModalOpen, setIsTrainingManageModalOpen] = useState(false)
  const [trainingsData, setTrainingsData] = useState<TrainingCourse[]>(mockTrainingCourses)
  const [employeesData, setEmployeesData] = useState<EmployeeTraining[]>(employeeTrainingData)
  const [isAddCourseFormOpen, setIsAddCourseFormOpen] = useState(false)
  const [newCourse, setNewCourse] = useState({
    name: '',
    category: '' as TrainingCategory | '',
    dueDate: '',
    description: '',
  })
  const [courseToDelete, setCourseToDelete] = useState<number | null>(null)
  const [editingDeadline, setEditingDeadline] = useState<number | null>(null)

  // Training progress filter state (Feature 2)
  const [trainingProgressFilter, setTrainingProgressFilter] = useState<'all' | 'in_training' | 'completed' | 'overdue'>('all')

  // Training assignment modal states (Feature 3)
  const [isAssignTrainingOpen, setIsAssignTrainingOpen] = useState(false)
  const [assigningToEmployee, setAssigningToEmployee] = useState<EmployeeTraining | null>(null)
  const [selectedCoursesToAssign, setSelectedCoursesToAssign] = useState<number[]>([])
  const [assignmentDueDate, setAssignmentDueDate] = useState('')

  // Assign to employees from course (bulk assignment)
  const [isAssignToEmployeesOpen, setIsAssignToEmployeesOpen] = useState(false)
  const [selectedCourseForAssignment, setSelectedCourseForAssignment] = useState<TrainingCourse | null>(null)
  const [selectedEmployeesForAssignment, setSelectedEmployeesForAssignment] = useState<number[]>([])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Training status config
  const trainingStatusConfig: Record<TrainingStatus, { bg: string; text: string; labelKey: string }> = {
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', labelKey: 'training.completed' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'training.inProgress' },
    not_started: { bg: 'bg-slate-100', text: 'text-slate-600', labelKey: 'training.notStarted' },
    overdue: { bg: 'bg-rose-100', text: 'text-rose-700', labelKey: 'training.overdue' },
  }

  // Compute employees by training status (Feature 2)
  const employeesInTraining = employeesData.filter(emp =>
    emp.courses.some(c => c.status === 'in_progress')
  )
  const employeesWithOverdue = employeesData.filter(emp =>
    emp.courses.some(c => c.status === 'overdue')
  )
  const employeesAllCompleted = employeesData.filter(emp =>
    emp.courses.length > 0 && emp.courses.every(c => c.status === 'completed')
  )

  // Filter employees for training tab with all filters
  const filteredEmployeeTraining = employeesData.filter(emp => {
    const matchesDept = !trainingDeptFilter || emp.department === trainingDeptFilter
    const matchesStatus = !trainingStatusFilter || emp.courses.some(c => c.status === trainingStatusFilter)

    // Training progress filter (Feature 2)
    let matchesProgressFilter = true
    if (trainingProgressFilter === 'in_training') {
      matchesProgressFilter = emp.courses.some(c => c.status === 'in_progress')
    } else if (trainingProgressFilter === 'completed') {
      matchesProgressFilter = emp.courses.length > 0 && emp.courses.every(c => c.status === 'completed')
    } else if (trainingProgressFilter === 'overdue') {
      matchesProgressFilter = emp.courses.some(c => c.status === 'overdue')
    }

    return matchesDept && matchesStatus && matchesProgressFilter
  })

  // Training management handlers
  const handleAddCourse = () => {
    if (!newCourse.name || !newCourse.category || !newCourse.dueDate) return

    const course: TrainingCourse = {
      id: Date.now(),
      name: newCourse.name,
      category: newCourse.category as TrainingCategory,
      dueDate: newCourse.dueDate,
      description: newCourse.description,
      assignedCount: 0,
      completedCount: 0,
      overdueCount: 0,
      inProgressCount: 0,
    }
    setTrainingsData([...trainingsData, course])
    setNewCourse({ name: '', category: '', dueDate: '', description: '' })
    setIsAddCourseFormOpen(false)
    showToast(t('training.courseAdded' as TranslationKey))
  }

  const handleRemoveCourse = (courseId: number) => {
    setTrainingsData(trainingsData.filter(c => c.id !== courseId))
    setCourseToDelete(null)
    showToast(t('training.courseRemoved' as TranslationKey))
  }

  const handleUpdateDeadline = (courseId: number, newDate: string) => {
    setTrainingsData(trainingsData.map(c =>
      c.id === courseId ? { ...c, dueDate: newDate } : c
    ))
    setEditingDeadline(null)
    showToast(t('training.deadlineUpdated' as TranslationKey))
  }

  // Training assignment handlers (Feature 3)
  const handleAssignTrainingToEmployee = () => {
    if (!assigningToEmployee || selectedCoursesToAssign.length === 0 || !assignmentDueDate) return

    // Get selected courses details
    const coursesToAdd = trainingsData
      .filter(c => selectedCoursesToAssign.includes(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        category: c.category,
        status: 'not_started' as TrainingStatus,
        dueDate: assignmentDueDate,
      }))

    // Update employee's courses
    setEmployeesData(prev => prev.map(emp => {
      if (emp.id === assigningToEmployee.id) {
        return {
          ...emp,
          courses: [...emp.courses, ...coursesToAdd],
        }
      }
      return emp
    }))

    // Update training course counts
    setTrainingsData(prev => prev.map(course => {
      if (selectedCoursesToAssign.includes(course.id)) {
        return { ...course, assignedCount: course.assignedCount + 1 }
      }
      return course
    }))

    // Update selected employee reference
    if (selectedEmployee && selectedEmployee.id === assigningToEmployee.id) {
      setSelectedEmployee({
        ...selectedEmployee,
        courses: [...selectedEmployee.courses, ...coursesToAdd],
      })
    }

    // Reset and close modal
    setIsAssignTrainingOpen(false)
    setAssigningToEmployee(null)
    setSelectedCoursesToAssign([])
    setAssignmentDueDate('')
    showToast(t('training.trainingAssigned' as TranslationKey))
  }

  const handleBulkAssignCourse = () => {
    if (!selectedCourseForAssignment || selectedEmployeesForAssignment.length === 0 || !assignmentDueDate) return

    const newCourseAssignment = {
      id: selectedCourseForAssignment.id,
      name: selectedCourseForAssignment.name,
      category: selectedCourseForAssignment.category,
      status: 'not_started' as TrainingStatus,
      dueDate: assignmentDueDate,
    }

    // Update employees' courses
    setEmployeesData(prev => prev.map(emp => {
      if (selectedEmployeesForAssignment.includes(emp.id)) {
        // Check if course is already assigned
        if (!emp.courses.some(c => c.id === selectedCourseForAssignment.id)) {
          return {
            ...emp,
            courses: [...emp.courses, newCourseAssignment],
          }
        }
      }
      return emp
    }))

    // Update training course counts
    setTrainingsData(prev => prev.map(course => {
      if (course.id === selectedCourseForAssignment.id) {
        return { ...course, assignedCount: course.assignedCount + selectedEmployeesForAssignment.length }
      }
      return course
    }))

    // Reset and close modal
    setIsAssignToEmployeesOpen(false)
    setSelectedCourseForAssignment(null)
    setSelectedEmployeesForAssignment([])
    setAssignmentDueDate('')
    showToast(t('training.trainingAssigned' as TranslationKey))
  }

  // Get available courses for an employee (not yet assigned)
  const getAvailableCoursesForEmployee = (employee: EmployeeTraining) => {
    return trainingsData.filter(course =>
      !employee.courses.some(c => c.name === course.name)
    )
  }

  // Calculate totals for training management
  const trainingStats = {
    totalCourses: trainingsData.length,
    totalAssigned: trainingsData.reduce((sum, c) => sum + c.assignedCount, 0),
    totalCompleted: trainingsData.reduce((sum, c) => sum + c.completedCount, 0),
    totalOverdue: trainingsData.reduce((sum, c) => sum + c.overdueCount, 0),
    totalInProgress: trainingsData.reduce((sum, c) => sum + c.inProgressCount, 0),
  }

  // Category colors for training management
  const categoryColors: Record<TrainingCategory, { bg: string; text: string }> = {
    compliance: { bg: 'bg-blue-100', text: 'text-blue-700' },
    aml: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    cybersecurity: { bg: 'bg-purple-100', text: 'text-purple-700' },
    sharia: { bg: 'bg-amber-100', text: 'text-amber-700' },
    risk: { bg: 'bg-rose-100', text: 'text-rose-700' },
  }

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold text-slate-900">{t('team.title' as TranslationKey)}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('team.subtitle' as TranslationKey)}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/team/directory" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/directory') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.activeDirectory' as TranslationKey)}
            </Link>
            <Link href="/team/logs" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/logs') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.userLogs' as TranslationKey)}
            </Link>
            <Link href="/team/training" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/training') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.tabs.training' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* no right-side buttons */}
        </div>
      </header>
      <div className={`flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8`}>
        {/* Training Overview Header */}
        <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <h3 className={`text-sm font-bold text-slate-700 ${isRTL ? 'text-right' : ''}`}>
            {t('training.overallCompletion' as TranslationKey)}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsTrainingManageModalOpen(true)}
          >
            <Icon icon="lucide:settings" className={isRTL ? 'ml-2' : 'mr-2'} />
            {t('training.manageTrainings' as TranslationKey)}
          </Button>
        </div>
        {/* Training Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="glass-card p-6 rounded-2xl">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <Icon icon="lucide:graduation-cap" className="text-2xl text-emerald-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">73%</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('training.overallCompletion' as TranslationKey)}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-6 rounded-2xl">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-blue-50 rounded-xl">
                <Icon icon="lucide:book-open" className="text-2xl text-blue-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">28</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('training.coursesAssigned' as TranslationKey)}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-6 rounded-2xl">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-rose-50 rounded-xl">
                <Icon icon="lucide:alert-triangle" className="text-2xl text-rose-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-rose-600">4</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('training.overdueCourses' as TranslationKey)}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-6 rounded-2xl">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="p-3 bg-amber-50 rounded-xl">
                <Icon icon="lucide:clock" className="text-2xl text-amber-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">5</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('training.inProgressCourses' as TranslationKey)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Department Progress & Saudization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Department Progress */}
          <Card className="p-6">
            <h3 className={`text-sm font-bold text-slate-900 mb-6 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:building-2" className="text-slate-400" />
              {t('training.departmentProgress' as TranslationKey)}
            </h3>
            <div className="space-y-4">
              {departmentTrainingData.map((dept) => (
                <div key={dept.name}>
                  <div className={`flex justify-between items-center mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-sm font-bold text-slate-700">{dept.name}</span>
                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs text-emerald-600 font-bold">{dept.completed} {t('training.completed' as TranslationKey)}</span>
                      {dept.overdue > 0 && (
                        <span className="text-xs text-rose-600 font-bold">{dept.overdue} {t('training.overdue' as TranslationKey)}</span>
                      )}
                      <span className="text-xs font-bold text-slate-500">{dept.progress}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${dept.progress >= 80 ? 'bg-emerald-500' : dept.progress >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${dept.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Enhanced Saudization Metrics */}
          <Card className="p-6">
            <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:flag" className="text-slate-400" />
              {t('training.saudizationMetrics' as TranslationKey)}
            </h3>

            {/* Top Section: Circular Progress + Summary */}
            <div className={`flex items-center gap-6 mb-6 pb-6 border-b border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
              {/* Circular Progress */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke={saudizationMetrics.actual >= saudizationMetrics.target ? '#10b981' : '#f59e0b'}
                    strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(saudizationMetrics.actual / 100) * 251.2} 251.2`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-lg font-bold text-slate-900">{saudizationMetrics.actual}%</p>
                </div>
              </div>
              <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                <div className={`flex items-center gap-4 mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-xs text-slate-500">{t('training.target' as TranslationKey)}: <span className="font-bold text-slate-700">{saudizationMetrics.target}%</span></span>
                  <span className={`text-xs font-bold ${saudizationMetrics.actual >= saudizationMetrics.target ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t('training.gap' as TranslationKey)}: {saudizationMetrics.actual >= saudizationMetrics.target ? '+' : ''}{(saudizationMetrics.actual - saudizationMetrics.target).toFixed(1)}%
                  </span>
                </div>
                <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">{saudizationMetrics.saudiEmployees} {t('training.saudi' as TranslationKey)}</span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">{saudizationMetrics.totalEmployees - saudizationMetrics.saudiEmployees} {t('training.nonSaudi' as TranslationKey)}</span>
                </div>
              </div>
            </div>

            {/* Breakdown by Department */}
            <div className="mb-6">
              <h4 className={`text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 ${isRTL ? 'text-right' : ''}`}>
                {t('training.breakdownByDepartment' as TranslationKey)}
              </h4>
              <div className="space-y-2">
                {saudizationMetrics.byDepartment.map((dept) => (
                  <div key={dept.name} className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-medium text-slate-700 w-28 truncate">{dept.name}</span>
                    <span className="text-[10px] text-slate-500 w-8">{dept.saudi}/{dept.total}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${dept.percentage >= 50 ? 'bg-emerald-500' : dept.percentage > 0 ? 'bg-amber-500' : 'bg-slate-200'}`}
                        style={{ width: `${dept.percentage}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold w-10 text-right ${dept.percentage >= 50 ? 'text-emerald-600' : dept.percentage > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {dept.percentage.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Saudi Employees List */}
            <div>
              <h4 className={`text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 ${isRTL ? 'text-right' : ''}`}>
                {t('training.saudiEmployees' as TranslationKey)}
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {getSaudiEmployeesWithProgress().map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => {
                      const fullEmployee = employeesData.find(e => e.id === emp.id)
                      if (fullEmployee) {
                        setSelectedEmployee(fullEmployee)
                        setIsEmployeeDetailOpen(true)
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <span className="text-base">{'\u{1F1F8}\u{1F1E6}'}</span>
                    <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                      <span className="text-xs font-bold text-slate-700">{emp.name}</span>
                      <span className="text-[10px] text-slate-400 mx-2">({emp.department})</span>
                    </div>
                    <span className={`text-[10px] font-bold ${emp.trainingProgress === 100 ? 'text-emerald-600' : emp.trainingProgress >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {emp.trainingProgress}% {t('training.progress' as TranslationKey).toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Currently In Training Summary Card (Feature 2) */}
        {employeesInTraining.length > 0 && (
          <Card className="p-4 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
            <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Icon icon="lucide:book-open-check" className="text-xl text-blue-600" />
                </div>
                <div className={isRTL ? 'text-right' : ''}>
                  <h4 className="text-sm font-bold text-slate-900">{t('training.currentlyInTraining' as TranslationKey)}</h4>
                  <p className="text-xs text-slate-500">
                    {t('training.inTrainingCount' as TranslationKey).replace('{count}', employeesInTraining.length.toString())}
                  </p>
                </div>
              </div>
              <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                {employeesInTraining.slice(0, 5).map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => {
                      setSelectedEmployee(emp)
                      setIsEmployeeDetailOpen(true)
                    }}
                    className="group relative"
                    title={emp.name}
                  >
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`}
                      className="w-9 h-9 rounded-full border-2 border-white shadow-sm hover:border-blue-300 transition-all cursor-pointer"
                      alt={emp.name}
                    />
                    <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[8px] font-bold px-1 rounded">
                      {emp.courses.filter(c => c.status === 'in_progress').length}
                    </span>
                  </button>
                ))}
                {employeesInTraining.length > 5 && (
                  <button
                    onClick={() => setTrainingProgressFilter('in_training')}
                    className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    +{employeesInTraining.length - 5}
                  </button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Employee Training Records */}
        <Card className="overflow-hidden">
          <CardHeader className={`flex flex-col gap-4 ${isRTL ? 'items-end' : 'items-start'}`}>
            <div className={`w-full flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-sm font-bold text-slate-900">{t('training.employeeRecords' as TranslationKey)}</h3>
              <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <select
                  value={trainingDeptFilter}
                  onChange={(e) => setTrainingDeptFilter(e.target.value)}
                  className={`px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                >
                  <option value="">{t('training.allDepartments' as TranslationKey)}</option>
                  <option value="Compliance">{t('training.compliance' as TranslationKey)}</option>
                  <option value="Risk Management">{t('training.riskManagement' as TranslationKey)}</option>
                  <option value="Finance">{t('training.finance' as TranslationKey)}</option>
                  <option value="IT">{t('training.it' as TranslationKey)}</option>
                  <option value="Operations">{t('training.operations' as TranslationKey)}</option>
                </select>
                <select
                  value={trainingStatusFilter}
                  onChange={(e) => setTrainingStatusFilter(e.target.value as TrainingStatus | '')}
                  className={`px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                >
                  <option value="">{t('training.allStatuses' as TranslationKey)}</option>
                  <option value="completed">{t('training.completed' as TranslationKey)}</option>
                  <option value="in_progress">{t('training.inProgress' as TranslationKey)}</option>
                  <option value="overdue">{t('training.overdue' as TranslationKey)}</option>
                  <option value="not_started">{t('training.notStarted' as TranslationKey)}</option>
                </select>
                <button
                  onClick={() => showToast(t('training.exportingReport' as TranslationKey))}
                  className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer"
                >
                  <Icon icon="lucide:download" />
                </button>
              </div>
            </div>

            {/* Training Progress Filter Pills (Feature 2) */}
            <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => setTrainingProgressFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  trainingProgressFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('common.all')} ({employeesData.length})
              </button>
              <button
                onClick={() => setTrainingProgressFilter('in_training')}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                  trainingProgressFilter === 'in_training'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Icon icon="lucide:book-open" className="text-sm" />
                {t('training.inProgress' as TranslationKey)} ({employeesInTraining.length})
              </button>
              <button
                onClick={() => setTrainingProgressFilter('completed')}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                  trainingProgressFilter === 'completed'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <Icon icon="lucide:check-circle" className="text-sm" />
                {t('training.completed' as TranslationKey)} ({employeesAllCompleted.length})
              </button>
              <button
                onClick={() => setTrainingProgressFilter('overdue')}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                  trainingProgressFilter === 'overdue'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <Icon icon="lucide:alert-triangle" className="text-sm" />
                {t('training.overdue' as TranslationKey)} ({employeesWithOverdue.length})
              </button>
            </div>
          </CardHeader>
          {filteredEmployeeTraining.length === 0 ? (
            <NoDataEmptyState
              entityName="training records"
              onAdd={undefined}
            />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('training.employee' as TranslationKey)}
                  </th>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('training.department' as TranslationKey)}
                  </th>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('training.nationality' as TranslationKey)}
                  </th>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('training.progress' as TranslationKey)}
                  </th>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('training.courses' as TranslationKey)}
                  </th>
                  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployeeTraining.map((employee) => {
                  const completedCourses = employee.courses.filter(c => c.status === 'completed').length
                  const overdueCourses = employee.courses.filter(c => c.status === 'overdue').length
                  return (
                    <tr key={employee.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <img
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${employee.name}`}
                            className="w-10 h-10 rounded-full border-2 border-slate-100"
                            alt={employee.name}
                          />
                          <div className={isRTL ? 'text-right' : ''}>
                            <p className="text-sm font-bold text-slate-900">{employee.name}</p>
                            <p className="text-xs text-slate-500">{employee.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                          {employee.department}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {employee.isSaudi ? (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1 w-fit">
                            <Icon icon="lucide:flag" className="text-xs" />
                            {t('training.saudi' as TranslationKey)}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                            {t('training.nonSaudi' as TranslationKey)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-24">
                          <div className={`flex justify-between items-center mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <span className={`text-xs font-bold ${employee.overallProgress === 100 ? 'text-emerald-600' : employee.overallProgress >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {employee.overallProgress}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${employee.overallProgress === 100 ? 'bg-emerald-500' : employee.overallProgress >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${employee.overallProgress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <span className="text-xs font-bold text-emerald-600">{completedCourses} {t('training.done' as TranslationKey)}</span>
                          {overdueCourses > 0 && (
                            <span className="text-xs font-bold text-rose-600">{overdueCourses} {t('training.overdue' as TranslationKey)}</span>
                          )}
                          <span className="text-xs text-slate-400">/ {employee.courses.length}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setSelectedEmployee(employee)
                            setIsEmployeeDetailOpen(true)
                          }}
                          className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Icon icon="lucide:eye" className="text-lg" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
          {filteredEmployeeTraining.length > 0 && (
          <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
            <p className="text-xs text-slate-500 font-medium">
              {t('training.showingEmployees' as TranslationKey).replace('{count}', filteredEmployeeTraining.length.toString()).replace('{total}', employeeTrainingData.length.toString())}
            </p>
            <button
              onClick={() => showToast(t('training.exportingReport' as TranslationKey))}
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors flex items-center gap-1 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:download" />
              {t('training.exportReport' as TranslationKey)}
            </button>
          </div>
          )}
        </Card>
      </div>

      {/* Employee Training Detail Modal */}
      <Modal
        isOpen={isEmployeeDetailOpen}
        onClose={() => setIsEmployeeDetailOpen(false)}
        title={selectedEmployee?.name || t('training.employeeDetails' as TranslationKey)}
        subtitle={selectedEmployee?.department}
        size="lg"
      >
        {selectedEmployee && (
          <div className="space-y-6">
            {/* Employee Info */}
            <div className={`flex items-center gap-4 p-4 bg-slate-50 rounded-xl ${isRTL ? 'flex-row-reverse' : ''}`}>
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedEmployee.name}`}
                className="w-16 h-16 rounded-full border-4 border-white"
                alt={selectedEmployee.name}
              />
              <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                <h3 className="text-lg font-bold text-slate-900">{selectedEmployee.name}</h3>
                <p className="text-sm text-slate-500">{selectedEmployee.email}</p>
                <div className={`flex items-center gap-3 mt-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-xs font-bold text-slate-600 bg-slate-200 px-3 py-1 rounded-full">
                    {selectedEmployee.department}
                  </span>
                  {selectedEmployee.isSaudi && (
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
                      stroke={selectedEmployee.overallProgress === 100 ? '#10b981' : selectedEmployee.overallProgress >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(selectedEmployee.overallProgress / 100) * 251.2} 251.2`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-slate-900">{selectedEmployee.overallProgress}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Courses List */}
            <div>
              <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <h4 className={`text-sm font-bold text-slate-900 ${isRTL ? 'text-right' : ''}`}>
                  {t('training.assignedCourses' as TranslationKey)} ({selectedEmployee.courses.length})
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssigningToEmployee(selectedEmployee)
                    setIsAssignTrainingOpen(true)
                  }}
                >
                  <Icon icon="lucide:plus-circle" className={isRTL ? 'ml-1' : 'mr-1'} />
                  {t('training.assignTraining' as TranslationKey)}
                </Button>
              </div>
              <div className="space-y-3">
                {selectedEmployee.courses.map((course) => {
                  const statusConfig = trainingStatusConfig[course.status]
                  return (
                    <div key={course.id} className={`p-4 border rounded-xl ${course.status === 'overdue' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                      <div className={`flex justify-between items-start ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <div className={isRTL ? 'text-right' : ''}>
                          <h5 className="text-sm font-bold text-slate-900">{course.name}</h5>
                          <p className="text-xs text-slate-500 capitalize">{t(`training.category.${course.category}` as TranslationKey)}</p>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                          {t(statusConfig.labelKey as TranslationKey)}
                        </span>
                      </div>
                      <div className={`flex items-center gap-4 mt-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <span className={`text-xs text-slate-500 flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <Icon icon="lucide:calendar" className="text-slate-400" />
                          {t('training.dueDate' as TranslationKey)}: {course.dueDate}
                        </span>
                        {course.completedDate && (
                          <span className={`text-xs text-emerald-600 flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Icon icon="lucide:check-circle" className="text-emerald-500" />
                            {t('training.completedOn' as TranslationKey)}: {course.completedDate}
                          </span>
                        )}
                        {course.score && (
                          <span className={`text-xs text-blue-600 flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
            <div className={`flex gap-3 pt-4 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => showToast(t('training.reminderSent' as TranslationKey))}
                className={`flex-1 bg-amber-100 text-amber-700 py-3 rounded-lg font-bold hover:bg-amber-200 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <Icon icon="lucide:bell" className="text-lg" />
                {t('training.sendReminder' as TranslationKey)}
              </button>
              <button
                onClick={() => showToast(t('training.reportGenerated' as TranslationKey))}
                className={`flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <Icon icon="lucide:file-text" className="text-lg" />
                {t('training.generateReport' as TranslationKey)}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Training Management Modal */}
      <Modal
        isOpen={isTrainingManageModalOpen}
        onClose={() => {
          setIsTrainingManageModalOpen(false)
          setIsAddCourseFormOpen(false)
          setCourseToDelete(null)
          setEditingDeadline(null)
        }}
        title={t('training.manageTrainingPrograms' as TranslationKey)}
        subtitle={t('training.manageTrainingSubtitle' as TranslationKey)}
        size="lg"
      >
        <div className="space-y-6">
          {/* Statistics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl text-center">
              <p className="text-2xl font-bold text-slate-900">{trainingStats.totalCourses}</p>
              <p className="text-xs text-slate-500 font-bold uppercase">{t('training.totalCourses' as TranslationKey)}</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl text-center">
              <p className="text-2xl font-bold text-emerald-600">{trainingStats.totalCompleted}</p>
              <p className="text-xs text-slate-500 font-bold uppercase">{t('training.completed' as TranslationKey)}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl text-center">
              <p className="text-2xl font-bold text-amber-600">{trainingStats.totalInProgress}</p>
              <p className="text-xs text-slate-500 font-bold uppercase">{t('training.inProgress' as TranslationKey)}</p>
            </div>
            <div className="p-4 bg-rose-50 rounded-xl text-center">
              <p className="text-2xl font-bold text-rose-600">{trainingStats.totalOverdue}</p>
              <p className="text-xs text-slate-500 font-bold uppercase">{t('training.overdue' as TranslationKey)}</p>
            </div>
          </div>

          {/* Training Courses Section */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className={`flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h4 className="text-sm font-bold text-slate-900">{t('training.trainingCourses' as TranslationKey)}</h4>
              <Button
                size="sm"
                onClick={() => setIsAddCourseFormOpen(true)}
              >
                <Icon icon="lucide:plus" className={isRTL ? 'ml-1' : 'mr-1'} />
                {t('training.addCourse' as TranslationKey)}
              </Button>
            </div>

            {/* Add Course Form */}
            {isAddCourseFormOpen && (
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
                      <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                        {t('common.category')}
                      </label>
                      <select
                        value={newCourse.category}
                        onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value as TrainingCategory })}
                        className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}
                      >
                        <option value="">{t('training.selectCategory' as TranslationKey)}</option>
                        <option value="compliance">{t('training.category.compliance' as TranslationKey)}</option>
                        <option value="aml">{t('training.category.aml' as TranslationKey)}</option>
                        <option value="cybersecurity">{t('training.category.cybersecurity' as TranslationKey)}</option>
                        <option value="sharia">{t('training.category.sharia' as TranslationKey)}</option>
                        <option value="risk">{t('training.category.risk' as TranslationKey)}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                        {t('training.dueDate' as TranslationKey)}
                      </label>
                      <input
                        type="date"
                        value={newCourse.dueDate}
                        onChange={(e) => setNewCourse({ ...newCourse, dueDate: e.target.value })}
                        className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}
                      />
                    </div>
                    <Input
                      label={t('training.courseDescription' as TranslationKey)}
                      placeholder={t('training.courseDescriptionPlaceholder' as TranslationKey)}
                      value={newCourse.description}
                      onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                    />
                  </div>
                  <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddCourseFormOpen(false)
                        setNewCourse({ name: '', category: '', dueDate: '', description: '' })
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddCourse}
                      disabled={!newCourse.name || !newCourse.category || !newCourse.dueDate}
                    >
                      {t('training.addCourse' as TranslationKey)}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Course List */}
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {trainingsData.map((course) => (
                <div key={course.id} className="p-4 hover:bg-slate-50 transition-colors">
                  {/* Delete Confirmation */}
                  {courseToDelete === course.id ? (
                    <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <p className={`text-sm text-rose-600 font-medium ${isRTL ? 'text-right' : ''}`}>
                        {t('training.confirmRemove' as TranslationKey)}
                      </p>
                      <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCourseToDelete(null)}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-rose-200 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleRemoveCourse(course.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-start justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <h5 className="text-sm font-bold text-slate-900">{course.name}</h5>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${categoryColors[course.category].bg} ${categoryColors[course.category].text}`}>
                            {t(`training.category.${course.category}` as TranslationKey)}
                          </span>
                        </div>
                        <div className={`flex items-center gap-4 mt-2 text-xs text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <span className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Icon icon="lucide:users" className="w-3 h-3" />
                            {course.assignedCount} {t('training.assigned' as TranslationKey)}
                          </span>
                          <span className="text-emerald-600">{course.completedCount} {t('training.completed' as TranslationKey)}</span>
                          {course.overdueCount > 0 && (
                            <span className="text-rose-600">{course.overdueCount} {t('training.overdue' as TranslationKey)}</span>
                          )}
                        </div>
                        <div className={`flex items-center gap-2 mt-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <Icon icon="lucide:calendar" className="w-3 h-3 text-slate-400" />
                          {editingDeadline === course.id ? (
                            <input
                              type="date"
                              defaultValue={course.dueDate}
                              className="text-xs border border-slate-200 rounded px-2 py-1"
                              onBlur={(e) => {
                                if (e.target.value !== course.dueDate) {
                                  handleUpdateDeadline(course.id, e.target.value)
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
                      <div className="relative">
                        <div className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <button
                            onClick={() => {
                              setSelectedCourseForAssignment(course)
                              setIsAssignToEmployeesOpen(true)
                            }}
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Modal Actions */}
          <div className={`flex gap-3 pt-4 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsTrainingManageModalOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                showToast(t('common.saveChanges'))
                setIsTrainingManageModalOpen(false)
              }}
            >
              {t('training.saveChanges' as TranslationKey)}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Training to Employee Modal (Feature 3) */}
      <Modal
        isOpen={isAssignTrainingOpen}
        onClose={() => {
          setIsAssignTrainingOpen(false)
          setAssigningToEmployee(null)
          setSelectedCoursesToAssign([])
          setAssignmentDueDate('')
        }}
        title={t('training.assignTraining' as TranslationKey)}
        subtitle={assigningToEmployee?.name}
        size="md"
      >
        {assigningToEmployee && (
          <div className="space-y-6">
            {/* Employee Info */}
            <div className={`flex items-center gap-3 p-3 bg-slate-50 rounded-xl ${isRTL ? 'flex-row-reverse' : ''}`}>
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${assigningToEmployee.name}`}
                className="w-10 h-10 rounded-full border-2 border-white"
                alt={assigningToEmployee.name}
              />
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-sm font-bold text-slate-900">{assigningToEmployee.name}</p>
                <p className="text-xs text-slate-500">{assigningToEmployee.department}</p>
              </div>
            </div>

            {/* Available Courses */}
            <div>
              <h4 className={`text-sm font-bold text-slate-900 mb-3 ${isRTL ? 'text-right' : ''}`}>
                {t('training.availableCourses' as TranslationKey)}
              </h4>
              {getAvailableCoursesForEmployee(assigningToEmployee).length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {getAvailableCoursesForEmployee(assigningToEmployee).map((course) => (
                    <label
                      key={course.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedCoursesToAssign.includes(course.id)
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      } ${isRTL ? 'flex-row-reverse' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCoursesToAssign.includes(course.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCoursesToAssign([...selectedCoursesToAssign, course.id])
                          } else {
                            setSelectedCoursesToAssign(selectedCoursesToAssign.filter(id => id !== course.id))
                          }
                        }}
                        className="accent-emerald-600"
                      />
                      <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
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
            {selectedCoursesToAssign.length > 0 && (
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                  {t('training.dueDate' as TranslationKey)}
                </label>
                <input
                  type="date"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}
                />
              </div>
            )}

            {/* Actions */}
            <div className={`flex gap-3 pt-4 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsAssignTrainingOpen(false)
                  setAssigningToEmployee(null)
                  setSelectedCoursesToAssign([])
                  setAssignmentDueDate('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleAssignTrainingToEmployee}
                disabled={selectedCoursesToAssign.length === 0 || !assignmentDueDate}
              >
                {t('training.assignSelected' as TranslationKey)}
                <Icon icon="lucide:check" className={`text-sm ${isRTL ? 'mr-1' : 'ml-1'}`} />
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Course to Employees Modal (Feature 3 - Bulk Assignment) */}
      <Modal
        isOpen={isAssignToEmployeesOpen}
        onClose={() => {
          setIsAssignToEmployeesOpen(false)
          setSelectedCourseForAssignment(null)
          setSelectedEmployeesForAssignment([])
          setAssignmentDueDate('')
        }}
        title={t('training.assignToEmployees' as TranslationKey)}
        subtitle={selectedCourseForAssignment?.name}
        size="md"
      >
        {selectedCourseForAssignment && (
          <div className="space-y-6">
            {/* Course Info */}
            <div className={`p-3 bg-slate-50 rounded-xl ${isRTL ? 'text-right' : ''}`}>
              <p className="text-sm font-bold text-slate-900">{selectedCourseForAssignment.name}</p>
              <p className="text-xs text-slate-500">{t(`training.category.${selectedCourseForAssignment.category}` as TranslationKey)}</p>
              <p className="text-xs text-slate-400 mt-1">
                {selectedCourseForAssignment.assignedCount} {t('training.assigned' as TranslationKey)} &bull; {selectedCourseForAssignment.completedCount} {t('training.completed' as TranslationKey)}
              </p>
            </div>

            {/* Select Employees */}
            <div>
              <h4 className={`text-sm font-bold text-slate-900 mb-3 ${isRTL ? 'text-right' : ''}`}>
                {t('training.selectEmployees' as TranslationKey)}
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {employeesData
                  .filter(emp => !emp.courses.some(c => c.id === selectedCourseForAssignment.id))
                  .map((emp) => (
                    <label
                      key={emp.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedEmployeesForAssignment.includes(emp.id)
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      } ${isRTL ? 'flex-row-reverse' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployeesForAssignment.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployeesForAssignment([...selectedEmployeesForAssignment, emp.id])
                          } else {
                            setSelectedEmployeesForAssignment(selectedEmployeesForAssignment.filter(id => id !== emp.id))
                          }
                        }}
                        className="accent-emerald-600"
                      />
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`}
                        className="w-8 h-8 rounded-full border border-slate-200"
                        alt={emp.name}
                      />
                      <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                        <p className="text-sm font-medium text-slate-700">{emp.name}</p>
                        <p className="text-xs text-slate-500">{emp.department}</p>
                      </div>
                      {emp.isSaudi && (
                        <span className="text-base">{'\u{1F1F8}\u{1F1E6}'}</span>
                      )}
                    </label>
                  ))}
                {employeesData.filter(emp => !emp.courses.some(c => c.id === selectedCourseForAssignment.id)).length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4 bg-slate-50 rounded-lg">
                    {t('training.allCoursesAssigned' as TranslationKey)}
                  </p>
                )}
              </div>
            </div>

            {/* Due Date */}
            {selectedEmployeesForAssignment.length > 0 && (
              <div>
                <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                  {t('training.dueDate' as TranslationKey)}
                </label>
                <input
                  type="date"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}
                />
              </div>
            )}

            {/* Actions */}
            <div className={`flex gap-3 pt-4 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsAssignToEmployeesOpen(false)
                  setSelectedCourseForAssignment(null)
                  setSelectedEmployeesForAssignment([])
                  setAssignmentDueDate('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleBulkAssignCourse}
                disabled={selectedEmployeesForAssignment.length === 0 || !assignmentDueDate}
              >
                {t('training.assignSelected' as TranslationKey)} ({selectedEmployeesForAssignment.length})
                <Icon icon="lucide:check" className={`text-sm ${isRTL ? 'mr-1' : 'ml-1'}`} />
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
