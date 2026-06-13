'use client'

import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import type { FrameworkConfig } from '@/types'
import { cn } from '@/lib/utils'

// Shared visual framework tags. Compact violet pills matching the circular
// detail's reference style (CircularDetailsContent "Frameworks" panel) so the
// same framework reads identically across rules, risks, policies, and audits.
// Renders nothing when the entity carries no framework ids, so it's safe to
// drop into any card/row unconditionally.
export function FrameworkChips({
  ids,
  isRTL,
  max = 3,
  className,
}: {
  ids: string[] | undefined | null
  isRTL: boolean
  /** Cap visible chips on dense list rows; the rest collapse to "+N" (full
   *  list in the title tooltip). Pass 0 for no cap (detail views). */
  max?: number
  className?: string
}) {
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  if (!ids || ids.length === 0) return null
  const chips = ids.map((id) => {
    const fw = frameworks.find((f) => f.id === id)
    return { id, label: fw ? (isRTL ? fw.nameAr : fw.name) : id }
  })
  const shown = max > 0 ? chips.slice(0, max) : chips
  const hidden = chips.length - shown.length
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} dir={isRTL ? 'rtl' : 'ltr'}>
      {shown.map((c) => (
        <span
          key={c.id}
          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 whitespace-nowrap"
        >
          {c.label}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"
          title={chips.slice(shown.length).map((c) => c.label).join(', ')}
        >
          +{hidden}
        </span>
      )}
    </div>
  )
}

// Search assist: true when the query matches one of the entity's framework
// names (EN or AR) or raw framework ids — typing "sama" / "iso" / "أمن" pulls
// up every row tagged with that framework even if its title never mentions it.
export function matchesFrameworkQuery(
  ids: string[] | undefined | null,
  frameworks: FrameworkConfig[],
  query: string,
): boolean {
  if (!ids || ids.length === 0) return false
  const q = query.trim().toLowerCase()
  if (!q) return false
  return ids.some((id) => {
    if (id.toLowerCase().includes(q)) return true
    const fw = frameworks.find((f) => f.id === id)
    return !!fw && (fw.name.toLowerCase().includes(q) || fw.nameAr.toLowerCase().includes(q))
  })
}
