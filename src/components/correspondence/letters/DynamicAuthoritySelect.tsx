'use client'

import { useMemo } from 'react'
import type { CircularAuthority } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'

// Authority dropdown that lists every enabled correspondence-based framework
// plus any hardcoded LETTER_AUTHORITIES the user's data already references.
// Used by both the draft-letter modal and the template editor. Authority is
// calc-bound (drives the entire framework path) → `locked` per round-3 §3.
export function DynamicAuthoritySelect({
  value,
  onChange,
  isRTL,
}: {
  value: CircularAuthority
  onChange: (v: CircularAuthority) => void
  isRTL: boolean
}) {
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const items = useMemo(() => {
    const seedOpts: { id: string; label: string; labelAr?: string }[] = frameworks
      .filter((f) => f.enabled && f.correspondenceBased)
      .map((f) => ({
        id: f.id as string,
        label: f.name,
        labelAr: f.nameAr,
      }))
    // Ensure the current value is selectable even if its framework was
    // later disabled or still uses a legacy uppercase id.
    if (value && !seedOpts.some((o) => o.id === value)) {
      const match = frameworks.find((f) => f.id.toLowerCase() === String(value).toLowerCase())
      seedOpts.push({
        id: String(value),
        label: match ? match.name : String(value),
        labelAr: match ? match.nameAr : String(value),
      })
    }
    return seedOpts
  }, [frameworks, value])

  return (
    <EditableSelect
      locked
      items={items}
      value={value}
      onChange={(id) => onChange(id as CircularAuthority)}
      isRTL={isRTL}
    />
  )
}
