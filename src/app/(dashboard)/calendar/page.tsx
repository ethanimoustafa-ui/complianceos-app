'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { FilterOption } from '@/components/ui/multi-select-filter'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

// Types
type TaskType = 'audit_task' | 'submission_deadline' | 'letter_send' | 'observation_deadline'
type TaskStatus = 'pending' | 'completed' | 'in_progress'
type SubmissionStatus = 'Not Started' | 'In Progress' | 'Verified' | 'Submitted'
type Priority = 'Low' | 'Med' | 'High' | 'Critical'
type ViewMode = 'month' | 'year' | 'submissions'
type RecurringFrequency = 'annual' | 'semi-annual' | 'quarterly' | 'monthly'

interface Task {
  id: string
  name: string
  description: string
  status: TaskStatus
  priority: Priority
  time: string
  type: TaskType
  isSubmission: boolean
  submissionStatus?: SubmissionStatus
  assignee: string
  relatedAuditId?: string | null
  recurringFrequency?: RecurringFrequency
  isRecurring?: boolean
}

interface TeamMember {
  name: string
  cap: number
  avatar: string
}

interface DayData {
  tasks: Task[]
  team: TeamMember[]
}

type TaskStore = Record<string, DayData>

// Color configs
const submissionColors: Record<TaskType, { bg: string; border: string; badge: string; text: string; dot: string }> = {
  submission_deadline: { bg: 'bg-orange-50', border: 'border-orange-300', badge: 'bg-orange-500', text: 'text-orange-600', dot: 'bg-orange-500' },
  letter_send: { bg: 'bg-amber-50', border: 'border-amber-300', badge: 'bg-amber-500', text: 'text-amber-600', dot: 'bg-amber-500' },
  observation_deadline: { bg: 'bg-rose-50', border: 'border-rose-300', badge: 'bg-rose-500', text: 'text-rose-600', dot: 'bg-rose-500' },
  audit_task: { bg: 'bg-emerald-50', border: 'border-emerald-300', badge: 'bg-emerald-500', text: 'text-emerald-600', dot: 'bg-emerald-500' }
}

const priorityColors: Record<Priority, string> = {
  Critical: 'bg-red-500 text-white',
  High: 'bg-orange-500 text-white',
  Med: 'bg-amber-500 text-white',
  Low: 'bg-slate-400 text-white'
}

// Task type filter options
const taskTypeFilterOptions: FilterOption<TaskType>[] = [
  { value: 'audit_task', label: 'Audit Task', color: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' } },
  { value: 'submission_deadline', label: 'Submission', color: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' } },
  { value: 'letter_send', label: 'Letter', color: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' } },
  { value: 'observation_deadline', label: 'Observation', color: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' } },
]

// Sample data from HTML prototype
const TASK_STORE: TaskStore = {
  "2024-10-03": {
    tasks: [
      { id: 't1', name: "ISO 27001 Review", description: "Quarterly compliance review for ISO 27001 certification", status: "completed", priority: "High", time: "09:00", type: "audit_task", isSubmission: true, submissionStatus: "Verified", assignee: "Sarah Connor", relatedAuditId: "A-2024-001" }
    ],
    team: [{ name: "Sarah Connor", cap: 95, avatar: "Sarah" }]
  },
  "2024-10-06": {
    tasks: [
      { id: 't2', name: "SAMA Regulatory Filing", description: "Submit quarterly regulatory compliance report to SAMA", status: "pending", priority: "Critical", time: "14:00", type: "submission_deadline", isSubmission: true, submissionStatus: "In Progress", assignee: "Michael Scott", relatedAuditId: "A-2024-002" }
    ],
    team: [{ name: "Michael Scott", cap: 80, avatar: "Michael" }]
  },
  "2024-10-10": {
    tasks: [
      { id: 't3', name: "Quarterly Asset Audit", description: "Physical verification of IT assets", status: "pending", priority: "Med", time: "10:30", type: "audit_task", isSubmission: false, assignee: "Felix Henderson", relatedAuditId: "A-2024-003" }
    ],
    team: [{ name: "Felix", cap: 45, avatar: "Felix" }]
  },
  "2024-10-12": {
    tasks: [
      { id: 't4', name: "SAMA Correspondence Letter", description: "Response to SAMA inquiry regarding Q2 compliance findings", status: "pending", priority: "High", time: "11:00", type: "letter_send", isSubmission: true, submissionStatus: "Not Started", assignee: "Sarah Connor", relatedAuditId: "A-2024-004" }
    ],
    team: [{ name: "Sarah Connor", cap: 60, avatar: "Sarah" }]
  },
  "2024-10-15": {
    tasks: [
      { id: 't5', name: "Internal Security Review", description: "Monthly security posture assessment", status: "pending", priority: "Low", time: "15:00", type: "audit_task", isSubmission: false, assignee: "Felix Henderson", relatedAuditId: "A-2024-005" }
    ],
    team: [{ name: "Felix", cap: 30, avatar: "Felix" }]
  },
  "2024-10-18": {
    tasks: [
      { id: 't6', name: "Observation Resolution Due", description: "Resolve open findings from external audit", status: "pending", priority: "Critical", time: "09:00", type: "observation_deadline", isSubmission: true, submissionStatus: "Not Started", assignee: "Michael Scott", relatedAuditId: "A-2024-006" }
    ],
    team: [{ name: "Michael Scott", cap: 90, avatar: "Michael" }]
  },
  "2024-10-22": {
    tasks: [
      { id: 't7', name: "PCI DSS Compliance Check", description: "Annual PCI DSS submission to acquiring bank", status: "pending", priority: "High", time: "10:00", type: "audit_task", isSubmission: true, submissionStatus: "In Progress", assignee: "Sarah Connor", relatedAuditId: "A-2024-007" }
    ],
    team: [{ name: "Sarah Connor", cap: 70, avatar: "Sarah" }]
  },
  "2024-10-25": {
    tasks: [
      { id: 't8', name: "Monthly Staff Meeting", description: "Team sync and planning session", status: "pending", priority: "Low", time: "14:00", type: "audit_task", isSubmission: false, assignee: "Felix Henderson", relatedAuditId: null }
    ],
    team: [{ name: "Felix", cap: 20, avatar: "Felix" }]
  },
  "2024-10-28": {
    tasks: [
      { id: 't9', name: "SAMA Q3 Financial Report", description: "Submit quarterly financial compliance report", status: "pending", priority: "Critical", time: "16:00", type: "submission_deadline", isSubmission: true, submissionStatus: "Not Started", assignee: "Michael Scott", relatedAuditId: "A-2024-008" }
    ],
    team: [{ name: "Michael Scott", cap: 85, avatar: "Michael" }]
  },
  "2024-11-02": {
    tasks: [
      { id: 't10', name: "Cybersecurity Framework Assessment", description: "Annual NIST framework gap analysis", status: "pending", priority: "High", time: "09:00", type: "audit_task", isSubmission: true, submissionStatus: "Not Started", assignee: "Sarah Connor", relatedAuditId: "A-2024-009" }
    ],
    team: [{ name: "Sarah Connor", cap: 60, avatar: "Sarah" }]
  },
  "2024-11-05": {
    tasks: [
      { id: 't11', name: "SAMA Letter - Data Privacy", description: "Response to data privacy inquiry from regulator", status: "pending", priority: "Critical", time: "11:00", type: "letter_send", isSubmission: true, submissionStatus: "Not Started", assignee: "Michael Scott", relatedAuditId: "A-2024-010" }
    ],
    team: [{ name: "Michael Scott", cap: 75, avatar: "Michael" }]
  },
  "2024-11-10": {
    tasks: [
      { id: 't12', name: "Audit Finding Remediation", description: "Complete remediation of critical audit observations", status: "pending", priority: "Critical", time: "14:00", type: "observation_deadline", isSubmission: true, submissionStatus: "In Progress", assignee: "Felix Henderson", relatedAuditId: "A-2024-011" }
    ],
    team: [{ name: "Felix", cap: 80, avatar: "Felix" }]
  }
}

// Helper functions
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getSubmissionTypeLabel(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    submission_deadline: 'Submission',
    letter_send: 'Letter',
    observation_deadline: 'Observation',
    audit_task: 'Audit Task'
  }
  return labels[type]
}

function getLocalizedSubmissionTypeLabel(type: TaskType, t: (key: TranslationKey) => string): string {
  const labels: Record<TaskType, string> = {
    submission_deadline: t('calendar.submission'),
    letter_send: t('calendar.letter'),
    observation_deadline: t('calendar.observation'),
    audit_task: t('calendar.auditTask')
  }
  return labels[type]
}

function getDueStatus(dateKey: string): { text: string; className: string } {
  const taskDate = new Date(dateKey)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  taskDate.setHours(0, 0, 0, 0)

  const diffTime = taskDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, className: 'text-red-600 bg-red-50' }
  if (diffDays === 0) return { text: 'Due today', className: 'text-orange-600 bg-orange-50' }
  if (diffDays === 1) return { text: 'Due tomorrow', className: 'text-amber-600 bg-amber-50' }
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, className: 'text-slate-600 bg-slate-50' }
  return { text: `Due in ${diffDays}d`, className: 'text-slate-500 bg-slate-50' }
}

// Helper functions to get localized month names
function getMonthsShort(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.monthsShort.jan'), t('calendar.monthsShort.feb'), t('calendar.monthsShort.mar'),
    t('calendar.monthsShort.apr'), t('calendar.monthsShort.may'), t('calendar.monthsShort.jun'),
    t('calendar.monthsShort.jul'), t('calendar.monthsShort.aug'), t('calendar.monthsShort.sep'),
    t('calendar.monthsShort.oct'), t('calendar.monthsShort.nov'), t('calendar.monthsShort.dec'),
  ]
}

function getMonthsFull(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.monthsFull.january'), t('calendar.monthsFull.february'), t('calendar.monthsFull.march'),
    t('calendar.monthsFull.april'), t('calendar.monthsFull.may'), t('calendar.monthsFull.june'),
    t('calendar.monthsFull.july'), t('calendar.monthsFull.august'), t('calendar.monthsFull.september'),
    t('calendar.monthsFull.october'), t('calendar.monthsFull.november'), t('calendar.monthsFull.december'),
  ]
}

function getHijriMonthsShort(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.hijriMonthsShort.muharram'), t('calendar.hijriMonthsShort.safar'),
    t('calendar.hijriMonthsShort.rabiAwwal'), t('calendar.hijriMonthsShort.rabiThani'),
    t('calendar.hijriMonthsShort.jumadaAwwal'), t('calendar.hijriMonthsShort.jumadaThani'),
    t('calendar.hijriMonthsShort.rajab'), t('calendar.hijriMonthsShort.shaban'),
    t('calendar.hijriMonthsShort.ramadan'), t('calendar.hijriMonthsShort.shawwal'),
    t('calendar.hijriMonthsShort.dhuQidah'), t('calendar.hijriMonthsShort.dhuHijjah'),
  ]
}

function getHijriMonthsFull(t: (key: TranslationKey) => string): string[] {
  return [
    t('calendar.hijriMonthsFull.muharram'), t('calendar.hijriMonthsFull.safar'),
    t('calendar.hijriMonthsFull.rabiAwwal'), t('calendar.hijriMonthsFull.rabiThani'),
    t('calendar.hijriMonthsFull.jumadaAwwal'), t('calendar.hijriMonthsFull.jumadaThani'),
    t('calendar.hijriMonthsFull.rajab'), t('calendar.hijriMonthsFull.shaban'),
    t('calendar.hijriMonthsFull.ramadan'), t('calendar.hijriMonthsFull.shawwal'),
    t('calendar.hijriMonthsFull.dhuQidah'), t('calendar.hijriMonthsFull.dhuHijjah'),
  ]
}

// Hijri calendar conversion helpers
function toHijri(date: Date): { year: number; month: number; day: number } {
  // Use local date components to avoid timezone offset issues
  const utcTime = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const jd = Math.floor((utcTime / 86400000) + 2440588)
  const l = jd - 1948440 + 10632
  const n = Math.floor((l - 1) / 10631)
  const l2 = l - 10631 * n + 354
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238)
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29
  const month = Math.floor((24 * l3) / 709)
  const day = l3 - Math.floor((709 * month) / 24)
  const year = 30 * n + j - 30
  return { year, month, day }
}

// Note: HIJRI_MONTHS and HIJRI_MONTHS_SHORT are now generated via getHijriMonthsFull() and getHijriMonthsShort()

// Saudi holidays (fixed Gregorian dates and approximate Hijri-based)
const SAUDI_HOLIDAYS: Record<string, string> = {
  // 2024
  '2024-02-22': 'Founding Day',
  '2024-09-23': 'National Day',
  '2024-04-10': 'Eid al-Fitr',
  '2024-04-11': 'Eid al-Fitr',
  '2024-04-12': 'Eid al-Fitr',
  '2024-06-16': 'Eid al-Adha',
  '2024-06-17': 'Eid al-Adha',
  '2024-06-18': 'Eid al-Adha',
  '2024-06-19': 'Eid al-Adha',
  // 2025
  '2025-02-22': 'Founding Day',
  '2025-09-23': 'National Day',
  '2025-03-30': 'Eid al-Fitr',
  '2025-03-31': 'Eid al-Fitr',
  '2025-04-01': 'Eid al-Fitr',
  '2025-06-06': 'Eid al-Adha',
  '2025-06-07': 'Eid al-Adha',
  '2025-06-08': 'Eid al-Adha',
  '2025-06-09': 'Eid al-Adha',
}

// Saudi weekend: Friday (5) and Saturday (6)
function isSaudiWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 5 || day === 6
}

// Saudi week day headers (Saturday to Friday)
const DAYS_SAUDI = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']

type CalendarType = 'gregorian' | 'hijri'

export default function CalendarPage() {
  const { t, isRTL } = useTranslation()
  const [currentDate, setCurrentDate] = useState(new Date(2024, 9, 1)) // October 2024
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>('2024-10-06')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [taskStore, setTaskStore] = useState<TaskStore>(TASK_STORE)
  const [calendarType, setCalendarType] = useState<CalendarType>('gregorian')

  // Submissions filter state
  const [showCompletedSubmissions, setShowCompletedSubmissions] = useState(false)
  const [submissionFilterDate, setSubmissionFilterDate] = useState<string | null>(null)
  const [submissionGroupBy, setSubmissionGroupBy] = useState<'date' | 'month' | 'year'>('date')
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<Set<TaskType>>(
    new Set(['audit_task', 'submission_deadline', 'letter_send', 'observation_deadline'])
  )

  // New task form state
  const [newTask, setNewTask] = useState({
    title: '',
    date: '',
    priority: 'Low' as Priority,
    assignee: 'Sarah',
    isRecurring: false,
    recurringFrequency: undefined as RecurringFrequency | undefined
  })

  // Get day data for selected day
  const selectedDayData = selectedDayKey ? taskStore[selectedDayKey] : null
  const selectedTask = selectedTaskId && selectedDayData
    ? selectedDayData.tasks.find(t => t.id === selectedTaskId)
    : null

  // Task type filter options with translated labels
  const taskTypeFilterOptionsLocalized = useMemo(() => [
    { value: 'audit_task' as TaskType, label: t('calendar.auditTask'), color: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' } },
    { value: 'submission_deadline' as TaskType, label: t('calendar.submission'), color: { dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' } },
    { value: 'letter_send' as TaskType, label: t('calendar.letter'), color: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' } },
    { value: 'observation_deadline' as TaskType, label: t('calendar.observation'), color: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' } },
  ], [t])

  // Navigation functions
  const navigateDate = (offset: number) => {
    if (viewMode === 'year') {
      setCurrentDate(prev => new Date(prev.getFullYear() + offset, prev.getMonth(), 1))
    } else {
      // Month view and Submissions view both navigate by month
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
    }
  }

  const navigateToday = () => {
    setCurrentDate(new Date())
  }

  const changeView = (view: ViewMode) => {
    setViewMode(view)
  }

  const selectDay = (key: string) => {
    setSelectedDayKey(key)
    setSelectedTaskId(null)
  }

  const selectTask = (taskId: string, dateKey: string) => {
    setSelectedTaskId(taskId)
    setSelectedDayKey(dateKey)
  }

  // Generate recurring dates based on frequency
  const generateRecurringDates = (startDate: string, frequency: RecurringFrequency): string[] => {
    const dates: string[] = [startDate]
    const start = new Date(startDate)

    let monthsToAdd: number
    switch (frequency) {
      case 'annual':
        monthsToAdd = 12
        break
      case 'semi-annual':
        monthsToAdd = 6
        break
      case 'quarterly':
        monthsToAdd = 3
        break
      case 'monthly':
        monthsToAdd = 1
        break
      default:
        return dates
    }

    // Generate dates for next 12 months
    const endDate = new Date(start)
    endDate.setFullYear(endDate.getFullYear() + 1)

    let current = new Date(start)
    while (true) {
      current = new Date(current)
      current.setMonth(current.getMonth() + monthsToAdd)
      if (current > endDate) break
      const dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      dates.push(dateKey)
    }

    return dates
  }

  // Submit new task
  const submitTask = () => {
    if (!newTask.title || !newTask.date) {
      alert('Fill required fields')
      return
    }

    // Generate dates for recurring tasks
    const datesToCreate = newTask.isRecurring && newTask.recurringFrequency
      ? generateRecurringDates(newTask.date, newTask.recurringFrequency)
      : [newTask.date]

    setTaskStore(prev => {
      const updated = { ...prev }

      datesToCreate.forEach((dateKey, index) => {
        const newTaskId = 't' + Date.now() + '_' + index

        if (!updated[dateKey]) {
          updated[dateKey] = { tasks: [], team: [] }
        }
        updated[dateKey] = {
          ...updated[dateKey],
          tasks: [
            ...updated[dateKey].tasks,
            {
              id: newTaskId,
              name: newTask.title,
              description: '',
              status: 'pending',
              priority: newTask.priority,
              time: '09:00',
              type: 'audit_task',
              isSubmission: false,
              assignee: newTask.assignee,
              relatedAuditId: null,
              isRecurring: newTask.isRecurring,
              recurringFrequency: newTask.recurringFrequency
            }
          ],
          team: [
            ...updated[dateKey].team,
            { name: newTask.assignee, cap: 20, avatar: newTask.assignee }
          ]
        }
      })

      return updated
    })

    setNewTask({ title: '', date: '', priority: 'Low', assignee: 'Sarah', isRecurring: false, recurringFrequency: undefined })
    setIsTaskModalOpen(false)
    selectDay(newTask.date)
  }

  // Close drawer
  const closeDrawer = () => {
    setSelectedDayKey(null)
    setSelectedTaskId(null)
  }

  // Get display label for date navigation
  const getDisplayLabel = () => {
    if (calendarType === 'hijri') {
      const hijri = toHijri(currentDate)
      if (viewMode === 'year') {
        return `${hijri.year} هـ`
      }
      return `${getHijriMonthsFull(t)[hijri.month - 1]} ${hijri.year} هـ`
    }

    if (viewMode === 'month') {
      return `${getMonthsFull(t)[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    } else if (viewMode === 'year') {
      return `${currentDate.getFullYear()}`
    } else {
      return `${getMonthsFull(t)[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    }
  }

  // Compute completion stats for drawer
  const completionStats = useMemo(() => {
    if (!selectedDayData) return { rate: 0, done: 0, total: 0 }
    const done = selectedDayData.tasks.filter(t => t.status === 'completed').length
    const total = selectedDayData.tasks.length
    const rate = total > 0 ? Math.round((done / total) * 100) : 0
    return { rate, done, total }
  }, [selectedDayData])

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-8">
            <div className={isRTL ? 'text-right' : ''}>
              <h1 className="text-xl font-bold text-slate-900">{t('calendar.title')}</h1>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('calendar.subtitle')}</p>
            </div>

            {/* View Toggle */}
            <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
              {/* Date View button - only visible in submissions view */}
              {viewMode === 'submissions' && (
                <button
                  onClick={() => setSubmissionGroupBy('date')}
                  className={cn(
                    'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                    submissionGroupBy === 'date' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
                  )}
                >
                  {t('calendar.dateView')}
                </button>
              )}
              <button
                onClick={() => {
                  if (viewMode === 'submissions') {
                    setSubmissionGroupBy('month')
                  } else {
                    changeView('month')
                  }
                }}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                  viewMode === 'month' || (viewMode === 'submissions' && submissionGroupBy === 'month')
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {t('calendar.monthView')}
              </button>
              <button
                onClick={() => {
                  if (viewMode === 'submissions') {
                    setSubmissionGroupBy('year')
                  } else {
                    changeView('year')
                  }
                }}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer',
                  viewMode === 'year' || (viewMode === 'submissions' && submissionGroupBy === 'year')
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {t('calendar.yearView')}
              </button>
            </div>

            {/* Filter Toggle */}
            <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'mr-3' : 'ml-3'} ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => changeView('month')}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                  viewMode !== 'submissions' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900',
                  isRTL && 'flex-row-reverse'
                )}
              >
                <Icon icon="lucide:layout-grid" className="text-sm" />
                {t('calendar.allItems')}
              </button>
              <button
                onClick={() => changeView('submissions')}
                className={cn(
                  'px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
                  viewMode === 'submissions' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900',
                  isRTL && 'flex-row-reverse'
                )}
              >
                <Icon icon="lucide:list-checks" className="text-sm" />
                {t('calendar.submissions')}
              </button>
            </div>
          </div>

          <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {/* Date Navigation */}
            <div className={`flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => navigateDate(-1)}
                className="p-1.5 hover:bg-slate-50 rounded transition-colors cursor-pointer"
              >
                <Icon icon={isRTL ? "lucide:chevron-right" : "lucide:chevron-left"} className="text-slate-600" />
              </button>
              <button
                onClick={navigateToday}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded cursor-pointer"
              >
                {t('calendar.today')}
              </button>
              <button
                onClick={() => setIsPickerOpen(true)}
                className="px-4 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors border-x border-slate-100 flex items-center gap-2 cursor-pointer"
              >
                <span>{getDisplayLabel()}</span>
                <Icon icon="lucide:calendar-range" className="text-xl text-emerald-500" />
              </button>
              <button
                onClick={() => navigateDate(1)}
                className="p-1.5 hover:bg-slate-50 rounded transition-colors cursor-pointer"
              >
                <Icon icon={isRTL ? "lucide:chevron-left" : "lucide:chevron-right"} className="text-slate-600" />
              </button>
            </div>

            {/* Submissions view filters */}
            {viewMode === 'submissions' && (
              <>
                <button
                  onClick={() => setShowCompletedSubmissions(!showCompletedSubmissions)}
                  className={cn(
                    'px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2',
                    showCompletedSubmissions
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:text-slate-900',
                    isRTL && 'flex-row-reverse'
                  )}
                >
                  <Icon icon="lucide:check-circle" className="text-sm" />
                  {t('calendar.showCompleted')}
                </button>
                {submissionFilterDate && (
                  <button
                    onClick={() => setSubmissionFilterDate(null)}
                    className={cn(
                      'px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 transition-all cursor-pointer flex items-center gap-2',
                      isRTL && 'flex-row-reverse'
                    )}
                  >
                    <Icon icon="lucide:x" className="text-sm" />
                    {t('calendar.removeFilter')}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setIsTaskModalOpen(true)}
              className={cn(
                'bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer',
                isRTL && 'flex-row-reverse'
              )}
            >
              <Icon icon="lucide:plus" className="w-5 h-5" />
              {t('calendar.createTask')}
            </button>
          </div>
        </header>

        {/* Calendar Content */}
        <div className="flex-1 overflow-auto bg-slate-50 hide-scrollbar">
          {/* Task Type Filter - visible in all views */}
          <div className={`flex items-center justify-between p-6 pb-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className={`text-[10px] font-bold text-slate-400 uppercase tracking-widest ${isRTL ? 'ml-2' : 'mr-2'}`}>
                {t('calendar.filterByType')}:
              </span>
              {/* All button */}
              <button
                onClick={() => {
                  const allTypes: TaskType[] = ['audit_task', 'submission_deadline', 'letter_send', 'observation_deadline']
                  const allSelected = allTypes.every(type => selectedTaskTypes.has(type))
                  if (allSelected) {
                    setSelectedTaskTypes(new Set())
                  } else {
                    setSelectedTaskTypes(new Set(allTypes))
                  }
                }}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
                  selectedTaskTypes.size === 4
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}
              >
                {t('common.all')}
              </button>
              {taskTypeFilterOptionsLocalized.map((option) => {
                const isSelected = selectedTaskTypes.has(option.value)
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      const newSelected = new Set(selectedTaskTypes)
                      if (newSelected.has(option.value)) {
                        newSelected.delete(option.value)
                      } else {
                        newSelected.add(option.value)
                      }
                      setSelectedTaskTypes(newSelected)
                    }}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all cursor-pointer flex items-center gap-1.5',
                      isSelected
                        ? cn(option.color?.bg, option.color?.text, option.color?.border)
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {option.color?.dot && isSelected && (
                      <span className={cn('w-1.5 h-1.5 rounded-full', option.color.dot)} />
                    )}
                    {option.label}
                  </button>
                )
              })}
            </div>

            {/* Hijri/Gregorian Toggle */}
            <button
              onClick={() => setCalendarType(prev => prev === 'gregorian' ? 'hijri' : 'gregorian')}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Icon icon="lucide:calendar" />
              {calendarType === 'gregorian' ? t('calendar.hijriCalendar') : t('calendar.gregorianCalendar')}
            </button>
          </div>

          {viewMode === 'month' && <MonthView currentDate={currentDate} taskStore={taskStore} selectedDayKey={selectedDayKey} onSelectDay={selectDay} selectedTypes={selectedTaskTypes} calendarType={calendarType} />}
          {viewMode === 'year' && <YearView currentDate={currentDate} taskStore={taskStore} onSelectMonth={(month) => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setViewMode('month') }} selectedTypes={selectedTaskTypes} t={t} />}
          {viewMode === 'submissions' && <SubmissionsList taskStore={taskStore} selectedTaskId={selectedTaskId} onSelectTask={selectTask} showCompleted={showCompletedSubmissions} filterMonth={currentDate.getMonth()} filterYear={currentDate.getFullYear()} filterDate={submissionFilterDate} groupBy={submissionGroupBy} selectedTypes={selectedTaskTypes} calendarType={calendarType} t={t} isRTL={isRTL} />}
        </div>
      </main>

      {/* Right Drawer */}
      <aside className={cn(
        `bg-white ${isRTL ? 'border-r' : 'border-l'} border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden`,
        selectedDayKey ? "w-[400px]" : "w-0"
      )}>
        <div className="flex-1 flex flex-col h-full">
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-100">
            <div className={`flex items-center justify-between mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">{t('calendar.taskDetails')}</span>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                <Icon icon="lucide:x" className="text-xl" />
              </button>
            </div>
            <h2 className={`text-xl font-bold text-slate-900 ${isRTL ? 'text-right' : ''}`}>
              {selectedDayKey ? (
                calendarType === 'hijri' ? (
                  (() => {
                    const h = toHijri(new Date(selectedDayKey))
                    return `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`
                  })()
                ) : (
                  new Date(selectedDayKey).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', calendar: 'gregory' })
                )
              ) : '-'}
            </h2>
            <p className={`text-sm text-slate-500 ${isRTL ? 'text-right' : ''}`}>
              {selectedTask ? selectedTask.assignee : selectedDayData ? t('calendar.activeComplianceCycle') : t('calendar.selectTaskToView')}
            </p>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto hide-scrollbar p-6 space-y-8">
            {/* Task List Section */}
            <section>
              <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span>{t('calendar.taskInformation')}</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">
                  {selectedDayData?.tasks.length || 0}
                </span>
              </h3>
              <div className="space-y-3">
                {selectedTask ? (
                  <TaskDetailCard task={selectedTask} t={t} />
                ) : selectedDayData?.tasks.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => selectTask(task.id, selectedDayKey!)} t={t} />
                ))}
                {!selectedDayData && (
                  <p className="text-xs text-slate-400 italic text-center py-10">{t('calendar.clearForToday')}</p>
                )}
              </div>
            </section>

            {/* Progress Section */}
            <section>
              <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>{t('calendar.status')}</h3>
              <div className={`flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className="relative w-16 h-16">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle className="text-slate-200 stroke-current" strokeWidth="12" fill="transparent" r="40" cx="50" cy="50" />
                    <circle
                      className="text-emerald-500 stroke-current transition-all duration-700"
                      strokeWidth="12"
                      strokeLinecap="round"
                      fill="transparent"
                      r="40"
                      cx="50"
                      cy="50"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * completionStats.rate / 100)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold text-slate-900">{completionStats.rate}%</span>
                  </div>
                </div>
                <div className={isRTL ? 'text-right' : ''}>
                  <p className="text-sm font-bold text-slate-900">{t('calendar.progress')}</p>
                  <p className="text-xs text-slate-500">
                    {completionStats.total > 0 ? t('calendar.tasksCompleted').replace('{done}', completionStats.done.toString()).replace('{total}', completionStats.total.toString()) : t('calendar.noMetricsFound')}
                  </p>
                </div>
              </div>
            </section>

            {/* Team Assignment */}
            <section>
              <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>{t('calendar.teamAssignment')}</h3>
              <div className="space-y-4">
                {selectedDayData?.team.map((member, idx) => (
                  <div key={idx} className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                      className="w-8 h-8 rounded-full"
                      alt={member.name}
                    />
                    <div className="flex-1">
                      <div className={`flex justify-between text-[10px] mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <span className="font-bold">{member.name}</span>
                        <span className="text-slate-400">{member.cap}% {t('calendar.load')}</span>
                      </div>
                      <div className={`h-1 bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
                        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${member.cap}%` }} />
                      </div>
                    </div>
                  </div>
                )) || <p className="text-xs text-slate-400 italic">{t('calendar.unassigned')}</p>}
              </div>
            </section>
          </div>

          {/* Drawer Footer */}
          <div className="p-6 border-t border-slate-100">
            <button className={cn(
              'w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer',
              isRTL && 'flex-row-reverse'
            )}>
              {t('calendar.fullReport')} <Icon icon={isRTL ? "lucide:arrow-left" : "lucide:arrow-right"} />
            </button>
          </div>
        </div>
      </aside>

      {/* Date Picker Modal */}
      {isPickerOpen && (
        <DatePickerModal
          currentDate={currentDate}
          onClose={() => setIsPickerOpen(false)}
          onSelectMonth={(month) => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setIsPickerOpen(false) }}
          onSelectYear={(year) => { setCurrentDate(new Date(year, currentDate.getMonth(), 1)) }}
          onOpenMonthView={() => { setViewMode('month'); setIsPickerOpen(false) }}
          onOpenYearView={() => { setViewMode('year'); setIsPickerOpen(false) }}
          viewMode={viewMode}
          onSelectDay={(dateKey) => { setSubmissionFilterDate(dateKey); setIsPickerOpen(false) }}
          selectedDate={submissionFilterDate}
          onClearFilter={() => setSubmissionFilterDate(null)}
          calendarType={calendarType}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* Task Creation Modal */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className={`p-6 border-b border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-lg font-bold text-slate-900">{t('calendar.newComplianceTask')}</h3>
              <button onClick={() => setIsTaskModalOpen(false)} className="text-slate-400 hover:text-slate-900 cursor-pointer">
                <Icon icon="lucide:x" className="text-xl" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>{t('calendar.taskTitle')}</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={t('calendar.taskTitlePlaceholder')}
                  className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>{t('calendar.date')}</label>
                  <input
                    type="date"
                    value={newTask.date}
                    onChange={(e) => setNewTask(prev => ({ ...prev, date: e.target.value }))}
                    className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>{t('calendar.priority')}</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value as Priority }))}
                    className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                  >
                    <option value="Low">{t('calendar.low')}</option>
                    <option value="Med">{t('calendar.medium')}</option>
                    <option value="High">{t('calendar.high')}</option>
                    <option value="Critical">{t('calendar.critical')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>{t('calendar.assignedTo')}</label>
                <select
                  value={newTask.assignee}
                  onChange={(e) => setNewTask(prev => ({ ...prev, assignee: e.target.value }))}
                  className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                >
                  <option value="Sarah">Sarah Connor</option>
                  <option value="Michael">Michael Scott</option>
                  <option value="Felix">Felix Henderson</option>
                </select>
              </div>

              {/* Recurring Task Section */}
              <div className="pt-4 border-t border-slate-200">
                <label className={`flex items-center gap-3 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input
                    type="checkbox"
                    checked={newTask.isRecurring}
                    onChange={(e) => setNewTask(prev => ({
                      ...prev,
                      isRecurring: e.target.checked,
                      recurringFrequency: e.target.checked ? 'monthly' : undefined
                    }))}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">{t('calendar.makeRecurring')}</span>
                </label>

                {newTask.isRecurring && (
                  <div className="mt-4">
                    <label className={`block text-xs font-bold text-slate-500 uppercase mb-1.5 ${isRTL ? 'text-right' : ''}`}>{t('calendar.recurringFrequency')}</label>
                    <select
                      value={newTask.recurringFrequency || 'monthly'}
                      onChange={(e) => setNewTask(prev => ({ ...prev, recurringFrequency: e.target.value as RecurringFrequency }))}
                      className={`w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${isRTL ? 'text-right' : ''}`}
                    >
                      <option value="monthly">{t('calendar.monthly')}</option>
                      <option value="quarterly">{t('calendar.quarterly')}</option>
                      <option value="semi-annual">{t('calendar.semiAnnual')}</option>
                      <option value="annual">{t('calendar.annual')}</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className={`p-6 bg-slate-50 flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="flex-1 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitTask}
                className="flex-1 py-2.5 text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors shadow-lg shadow-emerald-100 cursor-pointer"
              >
                {t('calendar.createAudit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Month View Component
function MonthView({ currentDate, taskStore, selectedDayKey, onSelectDay, selectedTypes, calendarType }: {
  currentDate: Date
  taskStore: TaskStore
  selectedDayKey: string | null
  onSelectDay: (key: string) => void
  selectedTypes: Set<TaskType>
  calendarType: CalendarType
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Get start offset for Saudi week (Saturday=0)
  // getDay(): 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  // For Saudi week (Sat=0): offset = (day + 1) % 7
  let startOffset = (firstDay.getDay() + 1) % 7

  const days: (Date | null)[] = []

  // Leading empty days
  for (let i = 0; i < startOffset; i++) {
    days.push(null)
  }

  // Days of month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }

  return (
    <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm m-6">
      {/* Day headers - Saudi week (Sat-Fri) */}
      {DAYS_SAUDI.map((d, i) => (
        <div
          key={d}
          className={cn(
            "bg-slate-50 py-3 text-center text-[10px] font-black uppercase tracking-widest",
            // Weekend headers (Fri=6, Sat=0 in DAYS_SAUDI)
            (i === 0 || i === 6) ? "text-emerald-600 bg-emerald-50/50" : "text-slate-400"
          )}
        >
          {d}
        </div>
      ))}

      {/* Day cells */}
      {days.map((date, idx) => {
        if (!date) {
          return <div key={idx} className="bg-slate-50/50 min-h-[140px]" />
        }

        const key = formatDateKey(date)
        const data = taskStore[key]
        // Filter tasks by selected types
        const filteredTasks = data?.tasks.filter(t => selectedTypes.has(t.type)) || []
        const task = filteredTasks[0]
        const isSelected = key === selectedDayKey

        const hasCritical = filteredTasks.some(t => t.priority === 'Critical')
        const isDone = filteredTasks.length > 0 && filteredTasks.every(t => t.status === 'completed')

        // Saudi weekend check
        const isWeekend = isSaudiWeekend(date)

        // Holiday check
        const holiday = SAUDI_HOLIDAYS[key]

        // Hijri date conversion
        const hijri = toHijri(date)

        let heatmapClass = ''
        if (filteredTasks.length > 0) {
          if (hasCritical) heatmapClass = 'heatmap-critical'
          else if (isDone) heatmapClass = 'heatmap-success'
          else heatmapClass = 'heatmap-pending'
        }

        return (
          <div
            key={idx}
            onClick={() => onSelectDay(key)}
            className={cn(
              'min-h-[140px] p-4 border-r border-b border-slate-100 flex flex-col cursor-pointer transition-all hover:bg-slate-50 relative group',
              // Weekend styling
              isWeekend ? 'bg-slate-100/70' : 'bg-white',
              heatmapClass,
              isSelected && 'day-card-selected'
            )}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                {/* Gregorian or Hijri date based on calendar type */}
                {calendarType === 'gregorian' ? (
                  <>
                    <span className="text-sm font-bold">{date.getDate()}</span>
                    <span className="text-[9px] text-slate-400 font-medium">{hijri.day}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold">{hijri.day}</span>
                    <span className="text-[9px] text-slate-400 font-medium">{date.getDate()}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Holiday indicator */}
                {holiday && (
                  <div className="group/holiday relative">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="absolute right-0 top-4 hidden group-hover/holiday:block bg-slate-900 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
                      {holiday}
                    </div>
                  </div>
                )}
                {task && (
                  <div className={cn('w-1.5 h-1.5 rounded-full', submissionColors[task.type].badge)} />
                )}
              </div>
            </div>
            {/* Holiday label */}
            {holiday && (
              <span className="text-[8px] font-bold text-red-600 mt-1">{holiday}</span>
            )}
            {task && (
              <>
                <div className="mt-3 bg-white/80 p-2 rounded-lg border border-slate-200/50 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-700 truncate">{task.name}</p>
                  {task.isSubmission && (
                    <span className={cn('inline-block mt-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white', submissionColors[task.type].badge)}>
                      {task.type.split('_')[0]}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex -space-x-1">
                  {data?.team.map((m, i) => (
                    <img key={i} src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.avatar}`} className="w-5 h-5 rounded-full ring-2 ring-white" alt={m.name} />
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Year View Component
function YearView({ currentDate, taskStore, onSelectMonth, selectedTypes, t }: {
  currentDate: Date
  taskStore: TaskStore
  onSelectMonth: (month: number) => void
  selectedTypes: Set<TaskType>
  t: (key: TranslationKey) => string
}) {
  const year = currentDate.getFullYear()

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 p-6">
      {getMonthsFull(t).map((monthName, m) => {
        const daysInMonth = new Date(year, m + 1, 0).getDate()
        const startOffset = (new Date(year, m, 1).getDay() + 6) % 7

        return (
          <div
            key={monthName}
            onClick={() => onSelectMonth(m)}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer"
          >
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-3">{monthName}</h4>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="text-[8px] font-bold text-slate-300">{d}</span>
              ))}
              {Array.from({ length: startOffset }).map((_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, d) => {
                const dayKey = formatDateKey(new Date(year, m, d + 1))
                const dayData = taskStore[dayKey]
                // Filter tasks by selected types
                const hasFilteredTasks = dayData?.tasks.some(t => selectedTypes.has(t.type)) || false
                return (
                  <span
                    key={d}
                    className={cn(
                      'text-[9px] font-medium p-0.5',
                      hasFilteredTasks ? 'bg-emerald-500 text-white rounded-full' : 'text-slate-600'
                    )}
                  >
                    {d + 1}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Submissions List View
function SubmissionsList({ taskStore, selectedTaskId, onSelectTask, showCompleted = false, filterMonth, filterYear, filterDate = null, groupBy = 'date', selectedTypes, calendarType = 'gregorian', t, isRTL }: {
  taskStore: TaskStore
  selectedTaskId: string | null
  onSelectTask: (taskId: string, dateKey: string) => void
  showCompleted: boolean
  filterMonth: number
  filterYear: number
  filterDate?: string | null
  groupBy?: 'date' | 'month' | 'year'
  selectedTypes: Set<TaskType>
  calendarType?: CalendarType
  t: (key: TranslationKey) => string
  isRTL: boolean
}) {
  // Get all tasks filtered by date or month/year, and optionally by completed status
  const allTasks: (Task & { date: string })[] = []
  Object.keys(taskStore).forEach(dateKey => {
    // If filterDate is set, only show tasks for that specific day
    if (filterDate) {
      if (dateKey !== filterDate) {
        return // skip tasks not on the filtered date
      }
    } else {
      // Filter by month/year
      const taskDate = new Date(dateKey)
      if (taskDate.getMonth() !== filterMonth || taskDate.getFullYear() !== filterYear) {
        return // skip tasks outside current month
      }
    }

    const dayData = taskStore[dateKey]
    dayData.tasks.forEach(task => {
      // Filter based on showCompleted prop
      if (!showCompleted && task.status === 'completed') {
        return // skip completed
      }
      // Filter by task type
      if (!selectedTypes.has(task.type)) {
        return // skip tasks not in selected types
      }
      allTasks.push({ ...task, date: dateKey })
    })
  })
  allTasks.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Group tasks based on groupBy prop
  const grouped: Record<string, (Task & { date: string })[]> = {}
  allTasks.forEach(task => {
    let groupKey: string
    const taskDate = new Date(task.date)

    if (groupBy === 'date') {
      groupKey = task.date // "2024-10-06"
    } else if (groupBy === 'month') {
      groupKey = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}` // "2024-10"
    } else {
      groupKey = `${taskDate.getFullYear()}` // "2024"
    }

    if (!grouped[groupKey]) {
      grouped[groupKey] = []
    }
    grouped[groupKey].push(task)
  })

  if (allTasks.length === 0) {
    const dateLocale = isRTL ? 'ar-SA' : 'en-US'
    const emptyLabel = filterDate
      ? new Date(filterDate).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric', calendar: 'gregory' })
      : new Date(filterYear, filterMonth).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric', calendar: 'gregory' })
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
          <Icon icon="lucide:check-circle" className="text-5xl text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{t('calendar.noSubmissionsFor')} {emptyLabel}</h3>
        <p className="text-sm text-slate-500 text-center">
          {showCompleted ? 'No tasks found for this month.' : 'No pending tasks or submissions for this month.'}
        </p>
      </div>
    )
  }

  // Helper to format group headers based on groupBy
  const getGroupHeader = (key: string): { main: string; sub?: string } => {
    const dateLocale = isRTL ? 'ar-SA' : 'en-US'
    if (groupBy === 'date') {
      const dateObj = new Date(key)
      if (calendarType === 'hijri') {
        const h = toHijri(dateObj)
        return {
          main: `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`,
          sub: dateObj.toLocaleDateString(dateLocale, { weekday: 'long', calendar: 'gregory' })
        }
      }
      return {
        main: dateObj.toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric', calendar: 'gregory' }),
        sub: dateObj.toLocaleDateString(dateLocale, { weekday: 'long', calendar: 'gregory' })
      }
    } else if (groupBy === 'month') {
      // key is "2024-10"
      const [year, month] = key.split('-')
      if (calendarType === 'hijri') {
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 15) // mid-month
        const h = toHijri(dateObj)
        return { main: `${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ` }
      }
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1)
      return {
        main: dateObj.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric', calendar: 'gregory' })
      }
    } else {
      // key is "2024"
      if (calendarType === 'hijri') {
        const h = toHijri(new Date(parseInt(key), 6, 1)) // mid-year
        return { main: `${h.year} هـ` }
      }
      return { main: key }
    }
  }

  return (
    <div className="p-6 pt-0 space-y-6">
      {/* Grouped tasks */}
      {Object.keys(grouped).sort().map(groupKey => {
        const tasks = grouped[groupKey]
        const header = getGroupHeader(groupKey)

        return (
          <div key={groupKey}>
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-slate-900">
                  {header.main}
                </h3>
                {header.sub && (
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    {header.sub}
                  </span>
                )}
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {tasks.length} {tasks.length === 1 ? t('calendar.taskSingular') : t('calendar.taskPlural')}
                </span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {tasks.map(task => {
                const colors = submissionColors[task.type]
                const dueStatus = getDueStatus(task.date)
                const priorityColor = priorityColors[task.priority]

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id, task.date)}
                    className={cn(
                      'task-row bg-white border-l-4 border border-slate-200 rounded-xl p-4 cursor-pointer flex items-center gap-4 transition-all hover:bg-slate-50 hover:translate-x-1 hover:shadow-md',
                      colors.border,
                      selectedTaskId === task.id && 'task-row-selected bg-slate-100 !border-l-emerald-500',
                      task.status === 'completed' && 'opacity-60 bg-slate-50'
                    )}
                  >
                    {/* Left: Status & Type */}
                    <div className="flex items-center gap-3">
                      <div className={cn('w-3 h-3 rounded-full', task.status === 'completed' ? 'bg-emerald-500' : colors.dot)} />
                      <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded text-white', task.status === 'completed' ? 'bg-emerald-500' : colors.badge)}>
                        {task.status === 'completed' ? t('common.completed') : getLocalizedSubmissionTypeLabel(task.type, t)}
                      </span>
                    </div>

                    {/* Middle: Task Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className={cn('text-sm font-bold text-slate-900 truncate mb-1', task.status === 'completed' && 'line-through')}>{task.name}</h4>
                      {task.description && <p className="text-xs text-slate-500 truncate">{task.description}</p>}
                    </div>

                    {/* Right: Priority, Assignee, Due */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cn('text-[9px] font-black uppercase px-2 py-1 rounded', priorityColor)}>
                        {task.priority}
                      </span>
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${task.assignee}`}
                        className="w-8 h-8 rounded-full border-2 border-white shadow-sm"
                        alt={task.assignee}
                      />
                      <span className={cn('text-[10px] font-bold px-2 py-1 rounded', dueStatus.className)}>
                        {dueStatus.text}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Task Card Component (for drawer)
function TaskCard({ task, onClick, t }: { task: Task; onClick: () => void; t: (key: TranslationKey) => string }) {
  const colors = submissionColors[task.type]

  const typeLabels: Record<TaskType, string> = {
    submission_deadline: t('calendar.submission'),
    letter_send: t('calendar.letter'),
    observation_deadline: t('calendar.observation'),
    audit_task: t('calendar.auditTask')
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 p-3 rounded-xl border border-slate-100 bg-white shadow-sm cursor-pointer hover:border-emerald-300 transition-all',
        task.isSubmission && cn(colors.bg, colors.border)
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-1.5 h-1.5 rounded-full', colors.badge)} />
          <span className="text-xs font-bold text-slate-700">{task.name}</span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400">{task.time || t('calendar.allDay')}</span>
      </div>
      {task.isSubmission && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded text-white', colors.badge)}>
            {typeLabels[task.type]}
          </span>
          <span className={cn(
            'text-[8px] font-bold uppercase tracking-wider px-2 py-1 rounded',
            task.submissionStatus === 'Verified' || task.submissionStatus === 'Submitted' ? 'bg-green-100 text-green-700' :
            task.submissionStatus === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
          )}>
            {task.submissionStatus || t('common.pending')}
          </span>
        </div>
      )}
    </div>
  )
}

// Task Detail Card (for drawer when task is selected)
function TaskDetailCard({ task, t }: { task: Task; t: (key: TranslationKey) => string }) {
  const colors = submissionColors[task.type]

  const typeLabels: Record<TaskType, string> = {
    submission_deadline: t('calendar.submission'),
    letter_send: t('calendar.letter'),
    observation_deadline: t('calendar.observation'),
    audit_task: t('calendar.auditTask')
  }

  return (
    <div className={cn('flex flex-col gap-3 p-4 rounded-xl border', colors.border, colors.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-2 h-2 rounded-full', colors.dot)} />
          <span className="text-xs font-bold text-slate-700">{task.name}</span>
        </div>
      </div>
      {task.description && (
        <p className="text-xs text-slate-600 leading-relaxed">{task.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded text-white', colors.badge)}>
          {typeLabels[task.type]}
        </span>
        <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded', priorityColors[task.priority])}>
          {task.priority}
        </span>
        {task.isSubmission && task.submissionStatus && (
          <span className={cn(
            'text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded',
            task.submissionStatus === 'Verified' || task.submissionStatus === 'Submitted' ? 'bg-green-100 text-green-700' :
            task.submissionStatus === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
          )}>
            {task.submissionStatus}
          </span>
        )}
        {task.relatedAuditId && (
          <span className="text-[9px] font-mono px-2 py-1 rounded bg-slate-100 text-slate-600">
            {task.relatedAuditId}
          </span>
        )}
      </div>
    </div>
  )
}

// Date Picker Modal
function DatePickerModal({ currentDate, onClose, onSelectMonth, onSelectYear, onOpenMonthView, onOpenYearView, viewMode, onSelectDay, selectedDate, onClearFilter, calendarType = 'gregorian', t, isRTL }: {
  currentDate: Date
  onClose: () => void
  onSelectMonth: (month: number) => void
  onSelectYear: (year: number) => void
  onOpenMonthView: () => void
  onOpenYearView: () => void
  viewMode?: ViewMode
  onSelectDay?: (dateKey: string) => void
  selectedDate?: string | null
  onClearFilter?: () => void
  calendarType?: CalendarType
  t: (key: TranslationKey) => string
  isRTL: boolean
}) {
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()
  const [showDayPicker, setShowDayPicker] = useState(false)

  // Generate month positions in a radial layout
  const radius = 120

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row animate-fade-in">
        {/* Month Dial Section */}
        <div className="p-12 border-r border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-10">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('calendar.monthSelector')}</h3>

          {/* Radial Month Dial */}
          <div className="relative w-[320px] h-[320px] flex items-center justify-center">
            {/* Center */}
            <div className="absolute w-24 h-24 bg-white rounded-full shadow-2xl flex flex-col items-center justify-center z-10 border-4 border-emerald-500">
              <span className="text-lg font-bold text-slate-900">
                {calendarType === 'hijri'
                  ? getHijriMonthsShort(t)[toHijri(currentDate).month - 1]
                  : getMonthsShort(t)[currentMonth]}
              </span>
              <span className="text-[8px] font-black text-emerald-600 tracking-widest uppercase">{t('calendar.active')}</span>
            </div>

            {/* Month items */}
            {(calendarType === 'hijri' ? getHijriMonthsShort(t) : getMonthsShort(t)).map((m, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180)
              const x = Math.cos(angle) * radius
              const y = Math.sin(angle) * radius
              const isActive = calendarType === 'hijri'
                ? i === toHijri(currentDate).month - 1
                : i === currentMonth

              return (
                <button
                  key={m}
                  onClick={() => onSelectMonth(i)}
                  className={cn(
                    'absolute w-12 h-12 rounded-full text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer',
                    isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-white text-slate-600 hover:bg-emerald-50'
                  )}
                  style={{
                    left: `calc(50% + ${x}px - 24px)`,
                    top: `calc(50% + ${y}px - 24px)`
                  }}
                >
                  {m}
                </button>
              )
            })}

            {/* Day picker OVERLAY - covers the radial dial when open */}
            {showDayPicker && (
              <div className="absolute inset-0 bg-white rounded-xl p-4 border border-slate-200 shadow-lg z-20 flex flex-col">
                {/* Selected day indicator */}
                {selectedDate && (
                  <div className="text-center text-xs text-emerald-600 font-bold mb-2">
                    Filtered: {calendarType === 'hijri'
                      ? (() => {
                          const [y, m, d] = selectedDate.split('-').map(Number)
                          const h = toHijri(new Date(y, m - 1, d))
                          return `${h.day} ${getHijriMonthsFull(t)[h.month - 1]} ${h.year} هـ`
                        })()
                      : new Date(selectedDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', calendar: 'gregory' })
                    }
                  </div>
                )}
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <span key={i} className="text-center text-[10px] text-slate-400 font-bold">{d}</span>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1 flex-1 content-start">
                  {/* Leading empty cells for first day offset */}
                  {Array.from({ length: (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {/* Day buttons */}
                  {Array.from({ length: new Date(currentYear, currentMonth + 1, 0).getDate() }).map((_, d) => {
                    const day = d + 1
                    const dateKey = formatDateKey(new Date(currentYear, currentMonth, day))
                    const isSelected = dateKey === selectedDate
                    return (
                      <button
                        key={day}
                        onClick={() => onSelectDay?.(dateKey)}
                        className={cn(
                          'w-9 h-9 rounded-full text-sm font-medium transition-colors cursor-pointer flex items-center justify-center',
                          isSelected
                            ? 'bg-emerald-500 text-white'
                            : 'hover:bg-emerald-100 hover:text-emerald-700'
                        )}
                      >
                        {calendarType === 'hijri'
                          ? toHijri(new Date(currentYear, currentMonth, day)).day
                          : day
                        }
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {viewMode === 'submissions' ? (
            <div className="w-full flex items-center gap-2">
              <button
                onClick={() => setShowDayPicker(!showDayPicker)}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Icon icon="lucide:calendar-days" /> {showDayPicker ? t('calendar.hideDatePicker') : t('calendar.openDatePicker')}
              </button>
              {selectedDate && (
                <button
                  onClick={onClearFilter}
                  className="p-3 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors cursor-pointer"
                  title="Clear day filter"
                >
                  <Icon icon="lucide:x" className="text-lg" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowDayPicker(!showDayPicker)}
              className="w-full px-6 py-3 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon icon="lucide:calendar-days" /> {showDayPicker ? t('calendar.hideCalendar') : t('calendar.openCalendar')}
            </button>
          )}
        </div>

        {/* Year Selection Section */}
        <div className="flex-1 p-10 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('calendar.yearSelection')}</h3>
              <p className="text-[10px] text-slate-500">
                {calendarType === 'hijri'
                  ? t('calendar.browseArchivesHijri')
                  : t('calendar.browseArchivesGregorian')}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-full cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          {/* Year Grid */}
          <div className="flex-1 overflow-y-auto hide-scrollbar grid grid-cols-5 gap-3 pr-6">
            {calendarType === 'hijri' ? (
              // Hijri years (1420-1530 range)
              Array.from({ length: 12 }).map((_, decadeIdx) => {
                const decade = 1420 + decadeIdx * 10
                const currentHijriYear = toHijri(currentDate).year
                return (
                  <div key={decade} className="contents">
                    {/* Decade Header */}
                    <div className="col-span-5 pt-4 pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {decade}s هـ
                    </div>
                    {/* Years in Decade */}
                    {Array.from({ length: Math.min(10, 1531 - decade) }).map((_, yIdx) => {
                      const y = decade + yIdx
                      const isActive = y === currentHijriYear
                      return (
                        <button
                          key={y}
                          onClick={() => onSelectYear(y)}
                          className={cn(
                            'py-3 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            isActive ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 scale-105' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          )}
                        >
                          {y}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            ) : (
              // Gregorian years (2000-2100)
              Array.from({ length: 11 }).map((_, decadeIdx) => {
                const decade = 2000 + decadeIdx * 10
                return (
                  <div key={decade} className="contents">
                    {/* Decade Header */}
                    <div className="col-span-5 pt-4 pb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      {decade}s
                    </div>
                    {/* Years in Decade */}
                    {Array.from({ length: Math.min(10, 2101 - decade) }).map((_, yIdx) => {
                      const y = decade + yIdx
                      const isActive = y === currentYear
                      return (
                        <button
                          key={y}
                          onClick={() => onSelectYear(y)}
                          className={cn(
                            'py-3 text-sm font-bold rounded-xl transition-all cursor-pointer',
                            isActive ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 scale-105' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                          )}
                        >
                          {y}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center shrink-0">
            <div className="flex gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> Selected Year
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <div className="w-2 h-2 rounded-full bg-slate-200" /> Available
              </span>
            </div>
            <button onClick={onOpenYearView} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">
              Switch to Full Year View &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
