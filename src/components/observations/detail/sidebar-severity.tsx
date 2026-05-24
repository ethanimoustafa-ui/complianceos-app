'use client'

import { memo } from 'react'
import { useTranslation } from '@/i18n'
import { formatObservationSeverity } from '@/lib/format/enum'
import type { ObservationSeverity } from '../observation-types'

export interface SidebarSeverityProps {
  severity: ObservationSeverity
  isRTL: boolean
}

export const SidebarSeverity = memo(function SidebarSeverity({
  severity,
  isRTL,
}: SidebarSeverityProps) {
  const { t } = useTranslation()

  const severityColors = {
    critical: 'bg-rose-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-slate-500',
  }

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4 ${isRTL ? 'text-center' : ''}`}>
        {t('observations.detail.severityLabel')}
      </h4>
      <span
        className={`px-4 py-2 ${severityColors[severity]} text-white text-xs font-black rounded-lg uppercase block text-center`}
      >
        {/* Wave-20.cleanup — single shared enum formatter. */}
        {formatObservationSeverity(t, severity)}
      </span>
    </div>
  )
})
