'use client'

import { useTranslation } from '@/i18n'
import { getDaysSaudi } from './calendar-utils'

// K(#39): first-load skeleton for the calendar grid. Mirrors MonthView's 7-col
// layout (weekday header row + 6 week rows) so the page doesn't flash an empty
// grid while the nine source stores + server deadline aggregation hydrate. Pure
// presentational — no data, no interactivity.
export function CalendarSkeleton() {
  const { t } = useTranslation()
  const daysSaudi = getDaysSaudi(t)
  // 6 rows × 7 columns = the maximum a month grid ever spans.
  const cells = Array.from({ length: 42 })

  return (
    <div
      className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm m-6"
      aria-hidden="true"
    >
      {daysSaudi.map((d, i) => (
        <div
          key={`hdr-${i}`}
          className="bg-slate-50 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-300"
        >
          {d}
        </div>
      ))}

      {cells.map((_, idx) => {
        // Deterministically vary how many "event" bars each cell shows so the
        // skeleton reads like a populated month, not a uniform block. (No
        // Math.random — keep it stable across renders.)
        const barCount = idx % 5 === 0 ? 2 : idx % 3 === 0 ? 1 : 0
        return (
          <div key={`cell-${idx}`} className="bg-white min-h-[140px] p-2">
            <div className="h-5 w-5 rounded-full bg-slate-100 animate-pulse mb-2" />
            <div className="space-y-1.5">
              {Array.from({ length: barCount }).map((__, b) => (
                <div
                  key={b}
                  className="h-4 rounded-md bg-slate-100 animate-pulse"
                  style={{ width: b % 2 === 0 ? '85%' : '65%' }}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
