'use client'

import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { SaudizationMetrics, TrainingEmployee } from '@/types'

interface SaudizationCardProps {
  metrics: SaudizationMetrics
  employees: TrainingEmployee[]
  onEmployeeClick: (employee: TrainingEmployee) => void
}

export function SaudizationCard({ metrics, employees, onEmployeeClick }: SaudizationCardProps) {
  const { t } = useTranslation()

  const saudiEmployeesWithProgress = employees
    .filter((emp) => emp.isSaudi)
    .map((emp) => ({
      ...emp,
      trainingProgress: emp.overallProgress,
    }))
    .sort((a, b) => b.trainingProgress - a.trainingProgress)

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Icon icon="lucide:flag" className="text-slate-400" />
        {t('training.saudizationMetrics' as TranslationKey)}
      </h3>

      {/* Top Section: Circular Progress + Summary */}
      <div className="flex items-center gap-6 mb-6 pb-6 border-b border-slate-100">
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={metrics.actual >= metrics.target ? '#10b981' : '#f59e0b'}
              strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(metrics.actual / 100) * 251.2} 251.2`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-lg font-bold text-slate-900">{metrics.actual}%</p>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <span className="text-xs text-slate-500">
              {t('training.target' as TranslationKey)}: <span className="font-bold text-slate-700">{metrics.target}%</span>
            </span>
            <span className={`text-xs font-bold ${metrics.actual >= metrics.target ? 'text-emerald-600' : 'text-rose-600'}`}>
              {t('training.gap' as TranslationKey)}: {metrics.actual >= metrics.target ? '+' : ''}{(metrics.actual - metrics.target).toFixed(1)}%
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
              {metrics.saudiEmployees} {t('training.saudi' as TranslationKey)}
            </span>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
              {metrics.totalEmployees - metrics.saudiEmployees} {t('training.nonSaudi' as TranslationKey)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown by Department */}
      <div className="mb-6">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          {t('training.breakdownByDepartment' as TranslationKey)}
        </h4>
        <div className="space-y-2">
          {metrics.byDepartment.map((dept, idx) => (
            <div key={`${dept.name}-${idx}`} className="grid grid-cols-[8rem_2.5rem_1fr_2.5rem] items-center gap-2">
              <span className="text-xs font-medium text-slate-700 truncate">{dept.name || 'Unknown'}</span>
              <span className="text-[10px] text-slate-500">{dept.saudi}/{dept.total}</span>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dept.percentage >= 50
                      ? 'bg-emerald-500'
                      : dept.percentage > 0
                      ? 'bg-amber-500'
                      : 'bg-slate-200'
                  }`}
                  style={{ width: `${dept.percentage}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold text-end ${
                dept.percentage >= 50
                  ? 'text-emerald-600'
                  : dept.percentage > 0
                  ? 'text-amber-600'
                  : 'text-slate-400'
              }`}>
                {dept.percentage.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Saudi Employees List */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          {t('training.saudiEmployees' as TranslationKey)}
        </h4>
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {t('training.employeeColumn' as TranslationKey)}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {t('training.trainingProgress' as TranslationKey)}
          </span>
        </div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {saudiEmployeesWithProgress.map((emp) => (
            <button
              key={emp.id}
              onClick={() => onEmployeeClick(emp)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="text-base">{'\u{1F1F8}\u{1F1E6}'}</span>
              <div className="flex-1 text-start">
                <span className="text-xs font-bold text-slate-700">{emp.name}</span>
                <span className="text-[10px] text-slate-400 mx-2">({emp.department})</span>
              </div>
              <span className={`text-[10px] font-bold ${
                emp.trainingProgress === 100
                  ? 'text-emerald-600'
                  : emp.trainingProgress >= 50
                  ? 'text-amber-600'
                  : 'text-rose-600'
              }`}>
                {emp.trainingProgress}%
              </span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}
