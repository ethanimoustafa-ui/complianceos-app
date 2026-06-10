'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { useTrainingStore } from '@/stores/training-store'
import { ListSkeleton } from '@/components/ui/skeleton'
import type { TrainingEmployee, TrainingCourse, CourseProgress } from '@/types'

import { TrainingOverviewStats } from '@/components/team/training/training-overview-stats'
import { DepartmentProgressCard } from '@/components/team/training/department-progress-card'
import { SaudizationCard } from '@/components/team/training/saudization-card'
import { EmployeeTable } from '@/components/team/training/employee-table'
import { EmployeeDetailModal } from '@/components/team/training/employee-detail-modal'
import { TrainingManageModal } from '@/components/team/training/training-manage-modal'
import { AssignTrainingModal, BulkAssignModal } from '@/components/team/training/assign-training-modal'
import { TrainingUploadModal } from '@/components/team/training/training-upload-modal'
import { TrainingManualEntryModal } from '@/components/team/training/training-manual-entry-modal'

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    // W44: `end-8` (logical) instead of `right-8` so the toast lands on the
    // correct side in RTL.
    <div className="fixed bottom-8 end-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

function TeamTrainingPageContent() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Store data
  const employees = useTrainingStore((s) => s.employees)
  const courses = useTrainingStore((s) => s.courses)
  const saudizationMetrics = useTrainingStore((s) => s.saudizationMetrics)
  const departmentProgress = useTrainingStore((s) => s.departmentProgress)
  const overviewStats = useTrainingStore((s) => s.overviewStats)

  // Store actions
  const addCourse = useTrainingStore((s) => s.addCourse)
  const removeCourse = useTrainingStore((s) => s.removeCourse)
  const updateCourse = useTrainingStore((s) => s.updateCourse)
  const assignCourseToEmployee = useTrainingStore((s) => s.assignCourseToEmployee)
  const bulkAssignCourse = useTrainingStore((s) => s.bulkAssignCourse)
  const updateSaudizationMetrics = useTrainingStore((s) => s.updateSaudizationMetrics)
  const updateOverviewStats = useTrainingStore((s) => s.updateOverviewStats)
  const importUploadData = useTrainingStore((s) => s.importUploadData)
  const recalculateDepartmentProgress = useTrainingStore((s) => s.recalculateDepartmentProgress)
  const fetchCourses = useTrainingStore((s) => s.fetchCourses)
  const fetchEmployees = useTrainingStore((s) => s.fetchEmployees)

  // Hydrate server-state on mount. Without this the courses / employees lists
  // come from a fresh Zustand store and reload wipes anything created in the
  // current tab. See `training-store.ts` — Phase 5 server-state migration.
  useEffect(() => {
    void fetchCourses()
    void fetchEmployees()
  }, [fetchCourses, fetchEmployees])

  // Wave-2 Agent E: first-fetch skeleton.
  const trainingLoading = useTrainingStore((s) => s.isLoading)
  const trainingLastFetched = useTrainingStore((s) => s.lastFetched)
  const showTrainingSkeleton =
    trainingLoading
    && employees.length === 0
    && courses.length === 0
    && trainingLastFetched === null

  // UI state
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<TrainingEmployee | null>(null)
  const [isEmployeeDetailOpen, setIsEmployeeDetailOpen] = useState(false)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false)

  // Assignment modal state
  const [isAssignTrainingOpen, setIsAssignTrainingOpen] = useState(false)
  const [assigningToEmployee, setAssigningToEmployee] = useState<TrainingEmployee | null>(null)
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false)
  const [selectedCourseForBulk, setSelectedCourseForBulk] = useState<TrainingCourse | null>(null)

  // HR Reminder state
  const [isHrReminderOpen, setIsHrReminderOpen] = useState(false)
  const [hrEmail, setHrEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hr-reminder-email') || ''
    }
    return ''
  })
  const [saveHrEmail, setSaveHrEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('hr-reminder-email')
    }
    return false
  })

  useEffect(() => {
    const empId = searchParams.get('employeeId')
    if (empId && employees.length > 0) {
      const target = employees.find(e => e.id === empId)
      if (target) {
        setSelectedEmployee(target)
        setIsEmployeeDetailOpen(true)
      }
    }
  }, [searchParams, employees])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const handleViewEmployee = (employee: TrainingEmployee) => {
    setSelectedEmployee(employee)
    setIsEmployeeDetailOpen(true)
  }

  const handleAssignTraining = (employee: TrainingEmployee) => {
    setAssigningToEmployee(employee)
    setIsAssignTrainingOpen(true)
  }

  const handleAddCourse = (courseData: Omit<TrainingCourse, 'id' | 'assignedCount' | 'completedCount' | 'overdueCount' | 'inProgressCount'>) => {
    addCourse({
      id: crypto.randomUUID(),
      ...courseData,
      assignedCount: 0,
      completedCount: 0,
      overdueCount: 0,
      inProgressCount: 0,
    })
  }

  const handleUpdateDeadline = (courseId: string, newDate: string) => {
    updateCourse(courseId, { dueDate: newDate })
  }

  const handleAssignToEmployees = (course: TrainingCourse) => {
    setSelectedCourseForBulk(course)
    setIsBulkAssignOpen(true)
  }

  const handleAssignCourses = (employeeId: string, newCourses: CourseProgress[]) => {
    for (const course of newCourses) {
      assignCourseToEmployee(employeeId, course)
    }
    recalculateDepartmentProgress()
    const store = useTrainingStore.getState()
    store.recalculateOverviewStats()
    // Update selected employee reference if viewing
    if (selectedEmployee && selectedEmployee.id === employeeId) {
      const updatedEmp = useTrainingStore.getState().employees.find(e => e.id === employeeId)
      if (updatedEmp) setSelectedEmployee(updatedEmp)
    }
  }

  const handleBulkAssign = (employeeIds: string[], course: CourseProgress) => {
    bulkAssignCourse(employeeIds, course)
    // W44: keep KPIs in sync — single-assign recalculated, bulk didn't.
    recalculateDepartmentProgress()
    useTrainingStore.getState().recalculateOverviewStats()
  }

  const handleUploadConfirm = (data: { saudization?: Partial<typeof saudizationMetrics>; overviewStats?: Partial<typeof overviewStats> }) => {
    importUploadData({ saudization: data.saudization, overviewStats: data.overviewStats })
    showToast(t('training.dataImported' as TranslationKey))
  }

  const handleManualEntryConfirm = (data: { saudization: Partial<typeof saudizationMetrics>; overviewStats: Partial<typeof overviewStats> }) => {
    updateSaudizationMetrics(data.saudization)
    updateOverviewStats(data.overviewStats)
    recalculateDepartmentProgress()
    showToast(t('training.dataImported' as TranslationKey))
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
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
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => {
            import('@/lib/export').then(({ exportTrainingDataLocalized }) => {
              exportTrainingDataLocalized(employees, courses, 'training-data', t)
            })
          }}>
            <Icon icon="lucide:download" className="mr-1.5" />
            {t('training.exportReport' as TranslationKey)}
          </Button>
          <Gate perm="Manage Training Programs">
            <Button variant="outline" size="sm" onClick={() => setIsManualEntryOpen(true)}>
              <Icon icon="lucide:pencil" className="mr-1.5" />
              {t('training.editMetrics' as TranslationKey)}
            </Button>
            <Button size="sm" onClick={() => setIsUploadModalOpen(true)}>
              <Icon icon="lucide:upload" className="mr-1.5" />
              {t('training.uploadFile' as TranslationKey)}
            </Button>
          </Gate>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        {/* Training Overview Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">
            {t('training.overallCompletion' as TranslationKey)}
          </h3>
          <Button variant="outline" size="sm" onClick={() => setIsManageModalOpen(true)}>
            <Icon icon="lucide:settings" className="mr-2" />
            {t('training.manageTrainings' as TranslationKey)}
          </Button>
        </div>

        {/* Overview Stats */}
        <TrainingOverviewStats stats={overviewStats} />

        {/* Department Progress & Saudization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <DepartmentProgressCard departments={departmentProgress} />
          <SaudizationCard
            metrics={saudizationMetrics}
            employees={employees}
            onEmployeeClick={handleViewEmployee}
          />
        </div>

        {/* Employee Table */}
        {showTrainingSkeleton ? (
          <ListSkeleton rows={5} columns={5} className="bg-white rounded-2xl p-6 border border-slate-100" />
        ) : (
          <EmployeeTable
            employees={employees}
            onViewEmployee={handleViewEmployee}
            onHrReminder={() => setIsHrReminderOpen(true)}
            onExport={() => {
              import('@/lib/export').then(({ exportTrainingDataLocalized }) => {
                exportTrainingDataLocalized(employees, courses, 'training-data', t)
              })
            }}
          />
        )}
      </div>

      {/* Modals */}
      <EmployeeDetailModal
        isOpen={isEmployeeDetailOpen}
        onClose={() => setIsEmployeeDetailOpen(false)}
        employee={selectedEmployee}
        onAssignTraining={handleAssignTraining}
        onToast={showToast}
        onExport={(emp) => {
          import('@/lib/export').then(({ exportTrainingDataLocalized }) => {
            exportTrainingDataLocalized([emp], courses, `training-${emp.name}`, t)
          })
        }}
      />

      <TrainingManageModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        courses={courses}
        onAddCourse={handleAddCourse}
        onRemoveCourse={removeCourse}
        onUpdateDeadline={handleUpdateDeadline}
        onAssignToEmployees={handleAssignToEmployees}
        onToast={showToast}
      />

      <AssignTrainingModal
        isOpen={isAssignTrainingOpen}
        onClose={() => { setIsAssignTrainingOpen(false); setAssigningToEmployee(null) }}
        employee={assigningToEmployee}
        courses={courses}
        onAssign={handleAssignCourses}
        onToast={showToast}
      />

      <BulkAssignModal
        isOpen={isBulkAssignOpen}
        onClose={() => { setIsBulkAssignOpen(false); setSelectedCourseForBulk(null) }}
        course={selectedCourseForBulk}
        employees={employees}
        onAssign={handleBulkAssign}
        onToast={showToast}
      />

      <TrainingUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onConfirm={handleUploadConfirm}
      />

      <TrainingManualEntryModal
        isOpen={isManualEntryOpen}
        onClose={() => setIsManualEntryOpen(false)}
        onConfirm={handleManualEntryConfirm}
        currentSaudization={saudizationMetrics}
        currentOverviewStats={overviewStats}
      />

      {/* HR Reminder Modal */}
      <Modal
        isOpen={isHrReminderOpen}
        onClose={() => setIsHrReminderOpen(false)}
        title={t('training.hrReminder' as TranslationKey)}
        size="lg"
      >
        {(() => {
          const now = new Date()
          const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

          const atRisk = employees.filter(emp => {
            const avg = emp.overallProgress
            return avg < 50 && emp.courses.some(c => c.status !== 'completed' && new Date(c.dueDate) <= in30d && new Date(c.dueDate) >= now)
          })

          const critical = employees.filter(emp => {
            const avg = emp.overallProgress
            return avg < 75 && emp.courses.some(c => c.status !== 'completed' && new Date(c.dueDate) <= in7d && new Date(c.dueDate) >= now)
          })

          const overdue = employees.filter(emp =>
            emp.courses.some(c => c.status === 'overdue' || (c.status !== 'completed' && new Date(c.dueDate) < now))
          )

          const hasAny = atRisk.length > 0 || critical.length > 0 || overdue.length > 0

          const buildBody = () => {
            const lines: string[] = ['Training Compliance Alert', '']
            if (overdue.length > 0) {
              lines.push('OVERDUE:')
              overdue.forEach(e => lines.push(`  - ${e.name} (${e.department}) — ${e.overallProgress}% complete`))
              lines.push('')
            }
            if (critical.length > 0) {
              lines.push('CRITICAL (< 75%, due within 7 days):')
              critical.forEach(e => lines.push(`  - ${e.name} (${e.department}) — ${e.overallProgress}% complete`))
              lines.push('')
            }
            if (atRisk.length > 0) {
              lines.push('AT RISK (< 50%, due within 30 days):')
              atRisk.forEach(e => lines.push(`  - ${e.name} (${e.department}) — ${e.overallProgress}% complete`))
              lines.push('')
            }
            return lines.join('\n')
          }

          const handleSend = () => {
            if (saveHrEmail && hrEmail) {
              localStorage.setItem('hr-reminder-email', hrEmail)
            } else {
              localStorage.removeItem('hr-reminder-email')
            }
            const mailto = `mailto:${hrEmail}?subject=${encodeURIComponent('Training Compliance Alert')}&body=${encodeURIComponent(buildBody())}`
            window.open(mailto)
            setIsHrReminderOpen(false)
          }

          const renderSection = (title: string, list: TrainingEmployee[], color: string) => {
            if (list.length === 0) return null
            return (
              <div className="space-y-2">
                <h4 className={`text-xs font-bold ${color}`}>{title}</h4>
                <div className="space-y-1">
                  {list.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{emp.name}</p>
                        <p className="text-[10px] text-slate-500">{emp.department}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-600">{emp.overallProgress}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return (
            <div className="space-y-5">
              {!hasAny ? (
                <div className="text-center py-8">
                  <Icon icon="lucide:check-circle" className="text-3xl text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">{t('training.noEmployeesNeedAttention' as TranslationKey)}</p>
                </div>
              ) : (
                <>
                  {renderSection(t('training.overdueEmployees' as TranslationKey), overdue, 'text-rose-600')}
                  {renderSection(t('training.criticalEmployees' as TranslationKey), critical, 'text-amber-600')}
                  {renderSection(t('training.atRiskEmployees' as TranslationKey), atRisk, 'text-blue-600')}

                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('training.hrEmail' as TranslationKey)}</label>
                      <input
                        type="email"
                        value={hrEmail}
                        onChange={(e) => setHrEmail(e.target.value)}
                        placeholder="hr@company.com"
                        className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveHrEmail}
                        onChange={(e) => setSaveHrEmail(e.target.checked)}
                        className="accent-emerald-600"
                      />
                      <span className="text-xs font-medium text-slate-700">{t('training.alwaysUseEmail' as TranslationKey)}</span>
                    </label>
                    <Button className="w-full" onClick={handleSend}>
                      <Icon icon="lucide:mail" className="mr-2" />
                      {t('training.sendHrReminder' as TranslationKey)}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}

export default function TeamTrainingPage() {
  return (
    <Suspense>
      <TeamTrainingPageContent />
    </Suspense>
  )
}
