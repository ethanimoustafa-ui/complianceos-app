'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'
import { NoDataEmptyState } from '@/components/ui/empty-state'

// Tab type
type TabValue = 'directory' | 'logs' | 'training'

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

// Types
interface TeamMember {
  id: number
  name: string
  email: string
  role: string
  roleColor: 'dark' | 'blue' | 'slate' | 'purple'
  capacity: number
  status: 'active' | 'offline' | 'away'
  lastActive: string
  avatar: string
  assignments: { title: string; dueDate: string }[]
  permissions: { label: string; enabled: boolean }[]
}

interface UserLog {
  id: number
  timestamp: string
  user: string
  action: 'sign_in' | 'sign_out' | 'session_timeout' | 'password_change' | 'profile_update' | 'permission_change' | 'mfa_enabled' | 'failed_login'
  detailsKey: string
  ipAddress: string
  device: string
  location: string
  status: 'success' | 'warning' | 'failed' | 'info'
}

// Mock Data
const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: 'Sarah Connor',
    email: 'sarah.c@complianceos.io',
    role: 'Lead Auditor',
    roleColor: 'dark',
    capacity: 95,
    status: 'active',
    lastActive: '2 mins ago',
    avatar: 'Sarah',
    assignments: [
      { title: 'ISO 27001 Annual Review', dueDate: 'Oct 15, 2024' },
      { title: 'SOC2 Internal Audit (Q3)', dueDate: 'Oct 30, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 2,
    name: 'Michael Scott',
    email: 'm.scott@complianceos.io',
    role: 'Org Admin',
    roleColor: 'blue',
    capacity: 62,
    status: 'active',
    lastActive: '1 hour ago',
    avatar: 'Michael',
    assignments: [
      { title: 'Vendor Risk Assessment', dueDate: 'Nov 5, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: true },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 3,
    name: 'David Wallace',
    email: 'd.wallace@complianceos.io',
    role: 'Compliance Officer',
    roleColor: 'slate',
    capacity: 45,
    status: 'offline',
    lastActive: '3 days ago',
    avatar: 'David',
    assignments: [
      { title: 'GDPR Compliance Check', dueDate: 'Nov 12, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 4,
    name: 'Kelly Kapoor',
    email: 'k.kapoor@complianceos.io',
    role: 'Reporting Analyst',
    roleColor: 'purple',
    capacity: 22,
    status: 'active',
    lastActive: 'Just now',
    avatar: 'Kelly',
    assignments: [
      { title: 'Q4 Compliance Report', dueDate: 'Dec 1, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: false },
    ],
  },
]

const userLogs: UserLog[] = [
  { id: 1, timestamp: '2024-01-15 14:32:18', user: 'Sarah Connor', action: 'sign_in', detailsKey: 'team.signedInViaSso', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 2, timestamp: '2024-01-15 14:28:45', user: 'Michael Scott', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'info' },
  { id: 3, timestamp: '2024-01-15 13:55:12', user: 'David Wallace', action: 'password_change', detailsKey: 'team.passwordUpdatedSuccessfully', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 4, timestamp: '2024-01-15 13:42:30', user: 'Kelly Kapoor', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 5, timestamp: '2024-01-15 12:18:09', user: 'John Smith', action: 'mfa_enabled', detailsKey: 'team.enabledTwoFactorAuth', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 6, timestamp: '2024-01-15 11:45:22', user: 'Jane Doe', action: 'profile_update', detailsKey: 'team.updatedProfilePictureBio', ipAddress: '192.168.1.55', device: 'Chrome on MacOS', location: 'Austin, TX', status: 'success' },
  { id: 7, timestamp: '2024-01-15 11:20:33', user: 'Sarah Connor', action: 'permission_change', detailsKey: 'team.grantedDocumentApprovalAccess', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 8, timestamp: '2024-01-15 10:55:47', user: 'Michael Scott', action: 'failed_login', detailsKey: 'team.invalidPasswordAttempt', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'warning' },
  { id: 9, timestamp: '2024-01-15 10:12:18', user: 'David Wallace', action: 'sign_in', detailsKey: 'team.signedInWithPassword', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 10, timestamp: '2024-01-15 09:38:55', user: 'Kelly Kapoor', action: 'sign_in', detailsKey: 'team.signedInViaGoogleOauth', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 11, timestamp: '2024-01-14 16:45:12', user: 'John Smith', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 12, timestamp: '2024-01-14 15:22:30', user: 'Jane Doe', action: 'failed_login', detailsKey: 'team.accountLockedFailedAttempts', ipAddress: '10.0.0.55', device: 'Unknown Browser', location: 'Unknown', status: 'failed' },
  { id: 13, timestamp: '2024-01-14 14:18:45', user: 'Sarah Connor', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'info' },
  { id: 14, timestamp: '2024-01-14 13:55:09', user: 'Michael Scott', action: 'profile_update', detailsKey: 'team.updatedEmailNotificationPreferences', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'success' },
  { id: 15, timestamp: '2024-01-14 12:42:33', user: 'David Wallace', action: 'permission_change', detailsKey: 'team.adminAccessRevoked', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'warning' },
]

const trainingModules = [
  { nameKey: 'team.complianceFundamentals' as const, completed: 16, total: 18 },
  { nameKey: 'team.dataPrivacyGdpr' as const, completed: 14, total: 18 },
  { nameKey: 'team.riskAssessment' as const, completed: 12, total: 18 },
  { nameKey: 'team.auditProcedures' as const, completed: 18, total: 18 },
]

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
  actual: 50, // Updated to reflect 5 Saudi out of 10 = 50%
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

export default function TeamManagementPage() {
  const { t, isRTL } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabValue>('directory')
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(teamMembers[0])
  const [expandedLogs, setExpandedLogs] = useState<number[]>([])

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
  const [isDrawerOpen, setIsDrawerOpen] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Translated action labels
  const actionLabels: Record<UserLog['action'], string> = {
    sign_in: t('team.signIn'),
    sign_out: t('team.signOut'),
    session_timeout: t('team.sessionTimeout'),
    password_change: t('team.passwordChange'),
    profile_update: t('team.profileUpdate'),
    permission_change: t('team.permissionChange'),
    mfa_enabled: t('team.mfaEnabled'),
    failed_login: t('team.failedLogin'),
  }

  // Translated status labels
  const statusTranslations: Record<UserLog['status'], string> = {
    success: t('team.success'),
    warning: t('team.warning'),
    failed: t('team.failed'),
    info: t('team.info'),
  }

  // Translated member status labels
  const memberStatusLabels: Record<TeamMember['status'], string> = {
    active: t('team.active'),
    offline: t('team.offline'),
    away: t('team.away'),
  }

  const filteredLogs = userLogs.filter((log) => {
    const translatedDetails = t(log.detailsKey as Parameters<typeof t>[0])
    const matchSearch = !logSearch ||
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      translatedDetails.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.device.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.location.toLowerCase().includes(logSearch.toLowerCase())
    const matchUser = !filterUser || log.user === filterUser
    const matchAction = !filterAction || log.action === filterAction
    const matchStatus = !filterStatus || log.status === filterStatus
    return matchSearch && matchUser && matchAction && matchStatus
  })

  const clearFilters = () => {
    setLogSearch('')
    setFilterUser('')
    setFilterAction('')
    setFilterStatus('')
  }

  const toggleLogExpand = (logId: number) => {
    setExpandedLogs((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    )
  }

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
    <>
      {/* Header with Tabs */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold text-slate-900">{t('team.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('team.subtitle')}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'directory'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('team.activeDirectory')}
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('team.userLogs')}
            </button>
            <button
              onClick={() => setActiveTab('training')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'training'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('team.tabs.training' as TranslationKey)}
            </button>
          </div>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 transition-colors border-x border-slate-100 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:search" className="text-slate-400" />
              <input
                type="text"
                placeholder={t('team.findTeammate')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-transparent outline-none text-xs font-medium w-48 placeholder:text-slate-400 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
            <button className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">{t('team.filters')}</button>
          </div>
          <RoleGuard requiredPermission="team:invite" hidden>
            <Button onClick={() => setIsInviteModalOpen(true)}>
              <Icon icon="lucide:user-plus" />
              {t('team.inviteMember')}
            </Button>
          </RoleGuard>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Directory Content */}
          {activeTab === 'directory' && (
            <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatCard
                  icon="lucide:users-2"
                  iconColor="emerald"
                  value="18"
                  label={t('team.totalMembers')}
                  badge={`+2 ${t('team.thisMonth')}`}
                  badgeColor="emerald"
                  isRTL={isRTL}
                />
                <StatCard
                  icon="lucide:shield"
                  iconColor="blue"
                  value="4"
                  label={t('team.adminAccounts')}
                  badge={t('team.stable')}
                  badgeColor="blue"
                  isRTL={isRTL}
                />
                <StatCard
                  icon="lucide:activity"
                  iconColor="orange"
                  value="142"
                  label={t('team.assignedTasks')}
                  badge={`82% ${t('team.capacity')}`}
                  badgeColor="orange"
                  isRTL={isRTL}
                />
                <StatCard
                  icon="lucide:key"
                  iconColor="purple"
                  value="100%"
                  label={t('team.securityCoverage')}
                  badge={t('team.ssoActive')}
                  badgeColor="purple"
                  isRTL={isRTL}
                />
              </div>

              {/* Training Compliance Section */}
              <div className="mb-8">
                <h3 className={`text-sm font-black text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                  {t('team.trainingComplianceOverview')}
                </h3>
                <Card className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className={`flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <TrainingCircularProgress value={89} />
                      <div className={isRTL ? 'text-right' : ''}>
                        <p className="text-sm font-bold text-slate-800">{t('team.overallTrainingCompletion')}</p>
                        <p className="text-xs text-slate-500 mt-1">16 of 18 {t('team.teamMembersCertified')}</p>
                        <p className="text-xs text-amber-600 font-bold mt-1">2 {t('team.certificationsExpiring')}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {trainingModules.map((module, index) => (
                        <TrainingProgressBar
                          key={index}
                          label={t(module.nameKey)}
                          completed={module.completed}
                          total={module.total}
                          isRTL={isRTL}
                        />
                      ))}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Member Table */}
              <Card className="overflow-hidden">
                <CardHeader className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('team.allTeamMembers')}</h3>
                  <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                      <Icon icon="lucide:download" />
                    </button>
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                      <Icon icon="lucide:more-vertical" />
                    </button>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-6 py-4">{t('team.member')}</th>
                        <th className="px-6 py-4">{t('team.role')}</th>
                        <th className="px-6 py-4">{t('team.workload')}</th>
                        <th className="px-6 py-4">{t('team.status')}</th>
                        <th className="px-6 py-4">{t('team.lastActive')}</th>
                        <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('team.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamMembers
                        .filter((member) =>
                          member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          member.email.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((member) => (
                          <tr
                            key={member.id}
                            onClick={() => {
                              setSelectedMember(member)
                              setIsDrawerOpen(true)
                            }}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-4">
                              <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                <img
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                                  className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                  alt={member.name}
                                />
                                <div className={isRTL ? 'text-right' : ''}>
                                  <p className="text-sm font-bold text-slate-900">{member.name}</p>
                                  <p className="text-xs text-slate-500">{member.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <RoleBadge role={member.role} color={member.roleColor} />
                            </td>
                            <td className="px-6 py-4">
                              <WorkloadBar capacity={member.capacity} isRTL={isRTL} />
                            </td>
                            <td className="px-6 py-4">
                              <StatusIndicator status={member.status} label={memberStatusLabels[member.status]} isRTL={isRTL} />
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{member.lastActive}</td>
                            <td className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                              <RoleGuard requiredPermission="team:edit" hidden>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-400 hover:text-slate-900 transition-colors p-2 cursor-pointer"
                                >
                                  <Icon icon="lucide:edit-3" />
                                </button>
                              </RoleGuard>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <p className="text-xs text-slate-500 font-medium">{t('team.showingMembers').replace('{shown}', '4').replace('{total}', '18')}</p>
                  <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button variant="outline" size="sm" disabled>
                      {t('team.previous')}
                    </Button>
                    <Button variant="outline" size="sm">
                      {t('team.next')}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* User Logs Content */}
          {activeTab === 'logs' && (
            <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
              {/* Filters */}
              <Card className="p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.searchLogs')}
                    </label>
                    <div className="relative">
                      <Icon
                        icon="lucide:search"
                        className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                      />
                      <input
                        type="text"
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        placeholder={t('team.searchByUserDeviceLocation')}
                        className={`w-full ${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.user')}
                    </label>
                    <select
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
                    >
                      <option value="">{t('team.allUsers')}</option>
                      <option value="Sarah Connor">Sarah Connor</option>
                      <option value="Michael Scott">Michael Scott</option>
                      <option value="David Wallace">David Wallace</option>
                      <option value="Kelly Kapoor">Kelly Kapoor</option>
                      <option value="John Smith">John Smith</option>
                      <option value="Jane Doe">Jane Doe</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.actionType')}
                    </label>
                    <select
                      value={filterAction}
                      onChange={(e) => setFilterAction(e.target.value)}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
                    >
                      <option value="">{t('team.allActions')}</option>
                      <option value="sign_in">{t('team.signIn')}</option>
                      <option value="sign_out">{t('team.signOut')}</option>
                      <option value="session_timeout">{t('team.sessionTimeout')}</option>
                      <option value="password_change">{t('team.passwordChange')}</option>
                      <option value="profile_update">{t('team.profileUpdate')}</option>
                      <option value="permission_change">{t('team.permissionChange')}</option>
                      <option value="mfa_enabled">{t('team.mfaEnabled')}</option>
                      <option value="failed_login">{t('team.failedLogin')}</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.status')}
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
                    >
                      <option value="">{t('team.allStatuses')}</option>
                      <option value="success">{t('team.success')}</option>
                      <option value="warning">{t('team.warning')}</option>
                      <option value="failed">{t('team.failed')}</option>
                      <option value="info">{t('team.info')}</option>
                    </select>
                  </div>
                </div>
                <div className={`flex items-center justify-between mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <button
                    onClick={clearFilters}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    {t('team.clearFilters')}
                  </button>
                  <Button size="sm">
                    <Icon icon="lucide:download" />
                    {t('team.exportLogs')}
                  </Button>
                </div>
              </Card>

              {/* Logs Table */}
              <Card className="overflow-hidden">
                <CardHeader className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('team.userActivityLogs')}</h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {filteredLogs.length} {t('team.entriesFound')}
                  </span>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-6 py-4">
                          <div className={`flex items-center gap-2 cursor-pointer hover:text-slate-600 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            {t('team.timestamp')}
                            <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                          </div>
                        </th>
                        <th className="px-6 py-4">
                          <div className={`flex items-center gap-2 cursor-pointer hover:text-slate-600 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            {t('team.userName')}
                            <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                          </div>
                        </th>
                        <th className="px-6 py-4">{t('team.actionType')}</th>
                        <th className="px-6 py-4">{t('team.deviceLocation')}</th>
                        <th className="px-6 py-4">{t('team.details')}</th>
                        <th className="px-6 py-4">{t('team.status')}</th>
                        <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'} w-12`}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredLogs.map((log) => (
                        <React.Fragment key={log.id}>
                          <tr
                            onClick={() => toggleLogExpand(log.id)}
                            className={cn(
                              'cursor-pointer transition-colors',
                              expandedLogs.includes(log.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                            )}
                          >
                            <td className="px-6 py-4 text-xs font-medium text-slate-600">
                              {log.timestamp}
                            </td>
                            <td className="px-6 py-4">
                              <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                <img
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                                  className="w-6 h-6 rounded-full border border-slate-200"
                                  alt={log.user}
                                />
                                <span className="text-sm font-bold text-slate-900">{log.user}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <UserActionBadge action={log.action} label={actionLabels[log.action]} />
                            </td>
                            <td className="px-6 py-4">
                              <div className={isRTL ? 'text-right' : ''}>
                                <p className="text-xs font-medium text-slate-700">{log.device}</p>
                                <p className="text-[10px] text-slate-400">{log.location}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                              {t(log.detailsKey as Parameters<typeof t>[0])}
                            </td>
                            <td className="px-6 py-4">
                              <LogStatusIndicator status={log.status} label={statusTranslations[log.status]} isRTL={isRTL} />
                            </td>
                            <td className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                              <Icon
                                icon={expandedLogs.includes(log.id) ? "lucide:chevron-up" : "lucide:chevron-down"}
                                className="w-4 h-4 text-slate-400"
                              />
                            </td>
                          </tr>
                          {/* Expandable detail row */}
                          {expandedLogs.includes(log.id) && (
                            <tr className="animate-expand-row">
                              <td colSpan={7} className="px-4 py-4 bg-slate-50">
                                <div className={`${isRTL ? 'mr-8' : 'ml-8'} p-5 bg-white rounded-xl border border-slate-200 shadow-sm`}>
                                  <div className="grid grid-cols-4 gap-6">
                                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                      <img
                                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                                        className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                        alt={log.user}
                                      />
                                      <div className={isRTL ? 'text-right' : ''}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('team.user')}</p>
                                        <p className="text-sm font-bold text-slate-900">{log.user}</p>
                                      </div>
                                    </div>
                                    <div className={isRTL ? 'text-right' : ''}>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.logId')}</p>
                                      <p className="font-mono text-sm text-slate-700">#{log.id.toString().padStart(6, '0')}</p>
                                    </div>
                                    <div className={isRTL ? 'text-right' : ''}>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.device')}</p>
                                      <p className="text-sm font-bold text-slate-900">{log.device}</p>
                                    </div>
                                    <div className={isRTL ? 'text-right' : ''}>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.location')}</p>
                                      <p className="text-sm text-slate-600">{log.location}</p>
                                    </div>
                                  </div>
                                  <div className={`mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('team.fullContext')}</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{t(log.detailsKey as Parameters<typeof t>[0])}</p>
                                    <p className="text-xs text-slate-500 mt-2">{t('team.ipAddress')}: {log.ipAddress}</p>
                                  </div>
                                  <div className={`flex gap-3 mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                    <Button variant="outline" size="sm">
                                      <Icon icon="lucide:user" className="w-3 h-3" />
                                      {t('team.viewUserProfile')}
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                      <Icon icon="lucide:download" className="w-3 h-3" />
                                      {t('team.exportLogEntry')}
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <p className="text-xs text-slate-500 font-medium">
                    {t('team.showingLogs').replace('{shown}', filteredLogs.length.toString()).replace('{total}', userLogs.length.toString())}
                  </p>
                  <Button variant="outline" size="sm">
                    {t('team.loadMore')}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Training Tab Content */}
          {activeTab === 'training' && (
            <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
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
                          <span className="text-base">🇸🇦</span>
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
          )}
        </div>

        {/* Member Detail Drawer */}
        {activeTab === 'directory' && (
          <aside
            className={`bg-white ${isRTL ? 'border-r' : 'border-l'} border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden ${
              isDrawerOpen && selectedMember ? 'w-[400px]' : 'w-0'
            }`}
          >
            {selectedMember && (
              <div className="flex-1 flex flex-col h-full min-w-[400px]">
                <div className="p-6 border-b border-slate-100">
                  <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                      {t('team.memberInsights')}
                    </span>
                    <button
                      onClick={() => setIsDrawerOpen(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:x" className="text-xl" />
                    </button>
                  </div>

                  <div className={`flex items-center gap-4 mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedMember.avatar}`}
                      className="w-16 h-16 rounded-2xl border-4 border-slate-50"
                      alt={selectedMember.name}
                    />
                    <div className={isRTL ? 'text-right' : ''}>
                      <h2 className="text-xl font-bold font-display text-slate-900">
                        {selectedMember.name}
                      </h2>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                        {selectedMember.role}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Assignments */}
                  <section>
                    <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span>{t('team.currentAssignments')}</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">
                        {selectedMember.assignments.length}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {selectedMember.assignments.map((assignment, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-xl border border-slate-100 bg-slate-50 ${isRTL ? 'text-right' : ''}`}
                        >
                          <p className="text-xs font-bold text-slate-700">{assignment.title}</p>
                          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">
                            {t('team.due')}: {assignment.dueDate}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Capacity Metric */}
                  <section>
                    <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.bandwidthAnalysis')}
                    </h3>
                    <div className={`flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <CapacityRing capacity={selectedMember.capacity} />
                      <div className={isRTL ? 'text-right' : ''}>
                        <p className="text-sm font-bold text-slate-900">
                          {selectedMember.capacity >= 90
                            ? t('team.nearCapacity')
                            : selectedMember.capacity >= 70
                            ? t('team.moderateLoad')
                            : t('team.available')}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedMember.assignments.length} {t('team.tasksPending')}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Permissions */}
                  <section>
                    <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                      {t('team.accessControl')}
                    </h3>
                    <div className="space-y-2">
                      {selectedMember.permissions.map((permission, index) => (
                        <label
                          key={index}
                          className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl cursor-pointer ${isRTL ? 'flex-row-reverse' : ''} ${
                            permission.enabled ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {permission.label}
                          </span>
                          <div
                            className={`w-8 h-4 rounded-full relative ${
                              permission.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-2 h-2 bg-white rounded-full ${
                                permission.enabled ? 'right-1' : 'left-1'
                              }`}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="p-6 border-t border-slate-100">
                  <Button variant="dark" className="w-full">
                    {t('team.updatePermissions')}
                    <Icon icon="lucide:shield-check" />
                  </Button>
                </div>
              </div>
            )}
          </aside>
        )}

      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title={t('team.inviteNewMember')}
        size="md"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <Input label={t('team.fullName')} placeholder={t('team.fullNamePlaceholder')} />
            <Input label={t('team.workEmail')} type="email" placeholder={t('team.workEmailPlaceholder')} />
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('team.assignRole')}
              </label>
              <select className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}>
                <option value="lead-auditor">{t('team.leadAuditor')}</option>
                <option value="compliance-officer">{t('team.complianceOfficer')}</option>
                <option value="reporting-analyst">{t('team.reportingAnalyst')}</option>
                <option value="org-admin">{t('team.organizationAdmin')}</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('team.accessLevel')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input
                    type="radio"
                    name="access"
                    defaultChecked
                    className="accent-emerald-600"
                  />
                  <span className="text-xs font-bold text-slate-700">{t('team.limitedAccess')}</span>
                </label>
                <label className={`flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input type="radio" name="access" className="accent-emerald-600" />
                  <span className="text-xs font-bold text-slate-700">{t('team.fullControl')}</span>
                </label>
              </div>
            </div>
          </div>
          <div className={`flex gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsInviteModalOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button className="flex-1">
              {t('team.sendInvitation')}
              <Icon icon="lucide:send" className="text-sm" />
            </Button>
          </div>
        </div>
      </Modal>

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
                {selectedCourseForAssignment.assignedCount} {t('training.assigned' as TranslationKey)} • {selectedCourseForAssignment.completedCount} {t('training.completed' as TranslationKey)}
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
                        <span className="text-base">🇸🇦</span>
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
    </>
  )
}

// Helper Components
function StatCard({
  icon,
  iconColor,
  value,
  label,
  badge,
  badgeColor,
  isRTL,
}: {
  icon: string
  iconColor: 'emerald' | 'blue' | 'orange' | 'purple'
  value: string
  label: string
  badge: string
  badgeColor: 'emerald' | 'blue' | 'orange' | 'purple'
  isRTL: boolean
}) {
  const iconColorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  const badgeColorClasses = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50',
  }

  return (
    <Card className="p-6">
      <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}
        >
          <Icon icon={icon} className="text-xl" />
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${badgeColorClasses[badgeColor]}`}>
          {badge}
        </span>
      </div>
      <p className={`text-2xl font-bold text-slate-900 ${isRTL ? 'text-right' : ''}`}>{value}</p>
      <p className={`text-xs font-medium text-slate-500 ${isRTL ? 'text-right' : ''}`}>{label}</p>
    </Card>
  )
}

function RoleBadge({ role, color }: { role: string; color: 'dark' | 'blue' | 'slate' | 'purple' }) {
  const colorClasses = {
    dark: 'bg-slate-900 text-white',
    blue: 'bg-blue-100 text-blue-700',
    slate: 'bg-slate-100 text-slate-600',
    purple: 'bg-purple-100 text-purple-700',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${colorClasses[color]}`}
    >
      {role}
    </span>
  )
}

function WorkloadBar({ capacity, isRTL }: { capacity: number; isRTL: boolean }) {
  const getBarColor = (cap: number) => {
    if (cap >= 90) return 'bg-rose-500'
    if (cap >= 70) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="w-32">
      <div className={`flex justify-between text-[10px] font-bold mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-slate-400">{capacity}%</span>
      </div>
      <div className={`h-1.5 w-full bg-slate-100 rounded-full overflow-hidden ${isRTL ? 'rotate-180' : ''}`}>
        <div
          className={`h-full rounded-full ${getBarColor(capacity)}`}
          style={{ width: `${capacity}%` }}
        />
      </div>
    </div>
  )
}

function StatusIndicator({ status, label, isRTL }: { status: 'active' | 'offline' | 'away'; label: string; isRTL: boolean }) {
  const statusConfig = {
    active: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    offline: { color: 'bg-slate-300', textColor: 'text-slate-400' },
    away: { color: 'bg-amber-500', textColor: 'text-amber-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

function UserActionBadge({ action, label }: { action: UserLog['action']; label: string }) {
  const actionColors: Record<UserLog['action'], string> = {
    sign_in: 'bg-emerald-100 text-emerald-700',
    sign_out: 'bg-slate-100 text-slate-700',
    session_timeout: 'bg-blue-100 text-blue-700',
    password_change: 'bg-purple-100 text-purple-700',
    profile_update: 'bg-indigo-100 text-indigo-700',
    permission_change: 'bg-orange-100 text-orange-700',
    mfa_enabled: 'bg-green-100 text-green-700',
    failed_login: 'bg-rose-100 text-rose-700',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionColors[action]}`}
    >
      {label}
    </span>
  )
}

function LogStatusIndicator({ status, label, isRTL }: { status: UserLog['status']; label: string; isRTL: boolean }) {
  const statusConfig = {
    success: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    warning: { color: 'bg-orange-500', textColor: 'text-orange-600' },
    failed: { color: 'bg-rose-500', textColor: 'text-rose-600' },
    info: { color: 'bg-blue-500', textColor: 'text-blue-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

function CapacityRing({ capacity }: { capacity: number }) {
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (capacity / 100) * circumference
  const ringColor = capacity >= 90 ? 'text-rose-500' : capacity >= 70 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-200 stroke-current"
          strokeWidth="12"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <circle
          className={`${ringColor} stroke-current transition-all duration-700`}
          strokeWidth="12"
          strokeLinecap="round"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-900">{capacity}%</span>
      </div>
    </div>
  )
}

function TrainingCircularProgress({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-100 stroke-current"
          strokeWidth="10"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <circle
          className="text-emerald-500 stroke-current"
          strokeWidth="10"
          strokeLinecap="round"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900">{value}%</span>
      </div>
    </div>
  )
}

function TrainingProgressBar({
  label,
  completed,
  total,
  isRTL,
}: {
  label: string
  completed: number
  total: number
  isRTL: boolean
}) {
  const percentage = (completed / total) * 100
  const isComplete = completed === total

  return (
    <div>
      <div className={`flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-slate-500">{label}</span>
        <span className={isComplete ? 'text-emerald-600' : 'text-slate-900'}>
          {completed}/{total}
        </span>
      </div>
      <div className={`h-1.5 w-full bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
        <div
          className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
