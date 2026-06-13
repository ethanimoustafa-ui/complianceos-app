'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { NoDataEmptyState } from '@/components/ui/empty-state'
import { useDepartmentStore } from '@/stores/department-store'
import { EditableSelect } from '@/components/ui/editable-select'
import type { TrainingEmployee, TrainingStatus } from '@/types'
import { dicebearAvatar } from '@/lib/avatar'
import { Gate } from '@/components/auth/gate'

interface EmployeeTableProps {
  employees: TrainingEmployee[]
  onViewEmployee: (employee: TrainingEmployee) => void
  /** Manual single-person enrollment (the Excel bulk import is parked). */
  onAddEmployee?: () => void
  /** Remove a person from the training roster (hard delete, confirmed). */
  onRemoveEmployee?: (employee: TrainingEmployee) => void
  onHrReminder?: () => void
  onExport?: () => void
}

export function EmployeeTable({ employees, onViewEmployee, onAddEmployee, onRemoveEmployee, onHrReminder, onExport }: EmployeeTableProps) {
  const { t, isRTL } = useTranslation()
  const departments = useDepartmentStore(s => s.departments)
  const addDepartment = useDepartmentStore(s => s.addDepartment)
  const updateDepartment = useDepartmentStore(s => s.updateDepartment)
  const removeDepartment = useDepartmentStore(s => s.removeDepartment)
  const deptLabel = (name: string) => {
    if (!isRTL) return name
    const dept = departments.find(d => d.name === name)
    return dept?.nameAr || name
  }
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | ''>('')
  const [progressFilter, setProgressFilter] = useState<'all' | 'in_training' | 'completed' | 'overdue'>('all')

  const employeesInTraining = useMemo(
    () => employees.filter((emp) => emp.courses.some((c) => c.status === 'in_progress')),
    [employees]
  )
  const employeesWithOverdue = useMemo(
    () => employees.filter((emp) => emp.courses.some((c) => c.status === 'overdue')),
    [employees]
  )
  const employeesAllCompleted = useMemo(
    () => employees.filter((emp) => emp.courses.length > 0 && emp.courses.every((c) => c.status === 'completed')),
    [employees]
  )

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesDept = !deptFilter || emp.department === deptFilter
      const matchesStatus = !statusFilter || emp.courses.some((c) => c.status === statusFilter)
      let matchesProgress = true
      if (progressFilter === 'in_training') {
        matchesProgress = emp.courses.some((c) => c.status === 'in_progress')
      } else if (progressFilter === 'completed') {
        matchesProgress = emp.courses.length > 0 && emp.courses.every((c) => c.status === 'completed')
      } else if (progressFilter === 'overdue') {
        matchesProgress = emp.courses.some((c) => c.status === 'overdue')
      }
      return matchesDept && matchesStatus && matchesProgress
    })
  }, [employees, deptFilter, statusFilter, progressFilter])

  return (
    <>
      {/* Currently In Training Summary */}
      {employeesInTraining.length > 0 && (
        <Card className="p-4 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Icon icon="lucide:book-open-check" className="text-xl text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{t('training.currentlyInTraining' as TranslationKey)}</h4>
                <p className="text-xs text-slate-500">
                  {t('training.inTrainingCount' as TranslationKey).replace('{count}', employeesInTraining.length.toString())}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {employeesInTraining.slice(0, 5).map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => onViewEmployee(emp)}
                  className="group relative"
                  title={emp.name}
                >
                  <img
                    src={dicebearAvatar(emp.name)}
                    className="w-9 h-9 rounded-full border-2 border-white shadow-sm hover:border-blue-300 transition-all cursor-pointer"
                    alt={emp.name}
                  />
                  <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[8px] font-bold px-1 rounded">
                    {emp.courses.filter((c) => c.status === 'in_progress').length}
                  </span>
                </button>
              ))}
              {employeesInTraining.length > 5 && (
                <button
                  onClick={() => setProgressFilter('in_training')}
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
        <CardHeader className="flex flex-col gap-4 items-start">
          <div className="w-full flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{t('training.employeeRecords' as TranslationKey)}</h3>
            <div className="flex items-center gap-4">
              <div className="min-w-[180px]">
                <EditableSelect
                  value={deptFilter || null}
                  onChange={(id) => {
                    // Selecting the "all" sentinel clears the filter; ids match dept.name otherwise.
                    if (id === '__ALL__') { setDeptFilter(''); return }
                    setDeptFilter(id)
                  }}
                  size="sm"
                  placeholder={t('training.allDepartments' as TranslationKey)}
                  items={[
                    { id: '__ALL__', label: t('training.allDepartments' as TranslationKey) },
                    ...departments.map((dept) => ({
                      id: dept.name,
                      label: dept.name,
                      labelAr: dept.nameAr,
                      isDefault: dept.isDefault,
                    })),
                  ]}
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.name)}
                  onEdit={(id, label, labelAr) => {
                    const dept = departments.find((d) => d.name === id)
                    if (dept) updateDepartment(dept.id, { name: label, nameAr: labelAr ?? label })
                  }}
                  onDelete={(id) => {
                    const dept = departments.find((d) => d.name === id)
                    if (dept) removeDepartment(dept.id)
                  }}
                />
              </div>
              <div className="min-w-[180px]">
                <EditableSelect
                  locked
                  value={statusFilter || null}
                  onChange={(id) => {
                    if (id === '__ALL__') { setStatusFilter(''); return }
                    setStatusFilter(id as TrainingStatus)
                  }}
                  size="sm"
                  placeholder={t('training.allStatuses' as TranslationKey)}
                  items={[
                    { id: '__ALL__', label: t('training.allStatuses' as TranslationKey) },
                    { id: 'completed', label: t('training.completed' as TranslationKey) },
                    { id: 'in_progress', label: t('training.inProgress' as TranslationKey) },
                    { id: 'overdue', label: t('training.overdue' as TranslationKey) },
                    { id: 'not_started', label: t('training.notStarted' as TranslationKey) },
                  ]}
                />
              </div>
              {onAddEmployee && (
                <Gate perm="Manage Training Programs">
                  <button onClick={onAddEmployee} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg flex items-center gap-1.5 hover:bg-emerald-700 transition-colors cursor-pointer">
                    <Icon icon="lucide:user-plus" className="text-sm" />
                    {t('training.addPerson' as TranslationKey)}
                  </button>
                </Gate>
              )}
              {onHrReminder && (
                <button onClick={onHrReminder} className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer">
                  <Icon icon="lucide:mail-warning" className="text-amber-500 text-sm" />
                  {t('training.hrReminder' as TranslationKey)}
                </button>
              )}
              <button onClick={onExport} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                <Icon icon="lucide:download" />
              </button>
            </div>
          </div>

          {/* Progress Filter Pills */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setProgressFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                progressFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t('common.all')} ({employees.length})
            </button>
            <button
              onClick={() => setProgressFilter('in_training')}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                progressFilter === 'in_training' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              <Icon icon="lucide:book-open" className="text-sm" />
              {t('training.inProgress' as TranslationKey)} ({employeesInTraining.length})
            </button>
            <button
              onClick={() => setProgressFilter('completed')}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                progressFilter === 'completed' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <Icon icon="lucide:check-circle" className="text-sm" />
              {t('training.completed' as TranslationKey)} ({employeesAllCompleted.length})
            </button>
            <button
              onClick={() => setProgressFilter('overdue')}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                progressFilter === 'overdue' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              <Icon icon="lucide:alert-triangle" className="text-sm" />
              {t('training.overdue' as TranslationKey)} ({employeesWithOverdue.length})
            </button>
          </div>
        </CardHeader>

        {filteredEmployees.length === 0 ? (
          <NoDataEmptyState entityName="training records" onAdd={undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('training.employee' as TranslationKey)}
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('training.department' as TranslationKey)}
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('training.nationality' as TranslationKey)}
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('training.progress' as TranslationKey)}
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('training.courses' as TranslationKey)}
                  </th>
                  <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-start">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const completedCourses = employee.courses.filter((c) => c.status === 'completed').length
                  const overdueCourses = employee.courses.filter((c) => c.status === 'overdue').length
                  return (
                    <tr key={employee.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={dicebearAvatar(employee.name)}
                            className="w-10 h-10 rounded-full border-2 border-slate-100"
                            alt={employee.name}
                          />
                          <div>
                            <p className="text-sm font-bold text-slate-900">{employee.name}</p>
                            <p className="text-xs text-slate-500">{employee.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                          {deptLabel(employee.department)}
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
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-bold ${
                              employee.overallProgress === 100 ? 'text-emerald-600' : employee.overallProgress >= 50 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {employee.overallProgress}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                employee.overallProgress === 100 ? 'bg-emerald-500' : employee.overallProgress >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${employee.overallProgress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-600">{completedCourses} {t('training.done' as TranslationKey)}</span>
                          {overdueCourses > 0 && (
                            <span className="text-xs font-bold text-rose-600">{overdueCourses} {t('training.overdue' as TranslationKey)}</span>
                          )}
                          <span className="text-xs text-slate-400">/ {employee.courses.length}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onViewEmployee(employee)}
                            title={t('common.view')}
                            className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                          >
                            <Icon icon="lucide:eye" className="text-lg" />
                          </button>
                          {onRemoveEmployee && (
                            <Gate perm="Manage Training Programs">
                              <button
                                onClick={() => onRemoveEmployee(employee)}
                                title={t('training.removePerson' as TranslationKey)}
                                className="text-slate-300 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              >
                                <Icon icon="lucide:trash-2" className="text-lg" />
                              </button>
                            </Gate>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filteredEmployees.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              {t('training.showingEmployees' as TranslationKey)
                .replace('{count}', filteredEmployees.length.toString())
                .replace('{total}', employees.length.toString())}
            </p>
          </div>
        )}
      </Card>
    </>
  )
}
