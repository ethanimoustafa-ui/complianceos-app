'use client'

import { cn } from '@/lib/utils'
import type { ReviewCadence, ReviewSchedule } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
const CADENCES: ReviewCadence[] = ['monthly', 'quarterly', 'semi-annual', 'yearly', 'adhoc']

const cadenceLabelKeys: Record<ReviewCadence, string> = {
  monthly: 'reviewSchedule.monthly',
  quarterly: 'reviewSchedule.quarterly',
  'semi-annual': 'reviewSchedule.semiAnnual',
  yearly: 'reviewSchedule.yearly',
  adhoc: 'reviewSchedule.adhoc',
}

interface Props {
  value: ReviewSchedule | undefined
  onChange: (s: ReviewSchedule) => void
  t: (key: any) => string
  isRTL?: boolean
}

export function ReviewSchedulePicker({ value, onChange, t, isRTL }: Props) {
  const cadence: ReviewCadence = value?.cadence ?? 'monthly'
  const dayOfMonth: number = value?.dayOfMonth ?? 1
  const adhocDate: string = value?.adhocDate ?? ''

  function setCadence(c: ReviewCadence) {
    if (c === 'adhoc') {
      onChange({ cadence: c, adhocDate: value?.adhocDate ?? '' })
    } else {
      onChange({ cadence: c, dayOfMonth: value?.dayOfMonth ?? 1 })
    }
  }

  function setDay(d: number) {
    onChange({ cadence, dayOfMonth: d })
  }

  function setAdhocDate(date: string) {
    onChange({ cadence: 'adhoc', adhocDate: date })
  }

  return (
    <div className="space-y-4">
      {/* Cadence select */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {t('reviewSchedule.cadence')}
        </label>
        <EditableSelect
          locked
          value={cadence}
          onChange={(id) => setCadence(id as ReviewCadence)}
          items={CADENCES.map((c) => ({ id: c, label: t(cadenceLabelKeys[c]) }))}
          isRTL={!!isRTL}
        />
      </div>

      {/* Day-of-month grid */}
      {cadence !== 'adhoc' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {t('reviewSchedule.dayOfMonth')}
          </label>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={cn(
                  'h-9 w-full rounded-lg text-sm font-medium transition-colors',
                  d === dayOfMonth
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ad hoc date input */}
      {cadence === 'adhoc' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('reviewSchedule.adhocDate')}
          </label>
          <input
            type="date"
            value={adhocDate}
            onChange={(e) => setAdhocDate(e.target.value)}
            className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}
    </div>
  )
}
