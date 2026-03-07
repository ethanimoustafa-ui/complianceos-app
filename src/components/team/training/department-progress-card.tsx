'use client'

import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { DepartmentTraining } from '@/types'

interface DepartmentProgressCardProps {
  departments: DepartmentTraining[]
}

export function DepartmentProgressCard({ departments }: DepartmentProgressCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
        <Icon icon="lucide:building-2" className="text-slate-400" />
        {t('training.departmentProgress' as TranslationKey)}
      </h3>
      <div className="space-y-4">
        {departments.map((dept) => (
          <div key={dept.name}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-700">{dept.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-600 font-bold">
                  {dept.completed} {t('training.completed' as TranslationKey)}
                </span>
                {dept.overdue > 0 && (
                  <span className="text-xs text-rose-600 font-bold">
                    {dept.overdue} {t('training.overdue' as TranslationKey)}
                  </span>
                )}
                <span className="text-xs font-bold text-slate-500">{dept.progress}%</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  dept.progress >= 80
                    ? 'bg-emerald-500'
                    : dept.progress >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${dept.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
