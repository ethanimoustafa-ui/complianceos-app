'use client'

import React, { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useTranslation } from '@/i18n'
import type { RegulatoryBodyId } from '@/types'

interface FrameworkTagSelectorProps {
  value: RegulatoryBodyId[]
  onChange: (value: RegulatoryBodyId[]) => void
  label?: string
  className?: string
}

export function FrameworkTagSelector({ value, onChange, label, className }: FrameworkTagSelectorProps) {
  const { t, isRTL } = useTranslation()
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const enabledFrameworks = useMemo(() => frameworks.filter((f) => f.enabled), [frameworks])

  const toggle = (id: RegulatoryBodyId) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="text-xs font-medium text-slate-600">{label}</label>
      )}
      <div className="flex flex-wrap gap-1.5" dir={isRTL ? 'rtl' : 'ltr'}>
        {enabledFrameworks.map((fw) => {
          const isSelected = value.includes(fw.id)
          return (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggle(fw.id)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all border',
                isSelected
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <Icon icon={fw.icon} className="w-3 h-3" />
              <span>{isRTL ? fw.nameAr : fw.name}</span>
              {isSelected && (
                <Icon icon="lucide:check" className="w-3 h-3 text-indigo-500" />
              )}
            </button>
          )
        })}
        {enabledFrameworks.length === 0 && (
          <span className="text-xs text-slate-400 italic">
            {t('common.noFrameworksEnabled')}
          </span>
        )}
      </div>
    </div>
  )
}
