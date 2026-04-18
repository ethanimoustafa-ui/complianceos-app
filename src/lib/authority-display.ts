import type { FrameworkConfig } from '@/types'

// Display-side helpers for correspondence authority values stored on
// circulars, letters, observations, etc. Values are framework ids
// (e.g. 'sama', 'citc', 'sharia-board', 'custom-abc'). Legacy persisted
// data may still carry uppercase values like 'SAMA' — the lookup below
// is case-insensitive so both resolve to the same framework.
export function resolveAuthorityLabel(
  authority: string | undefined,
  frameworks: FrameworkConfig[],
  isRTL: boolean
): string {
  if (!authority) return ''
  const direct = frameworks.find((f) => f.id === authority)
  if (direct) return isRTL ? direct.nameAr : direct.name
  const legacy = frameworks.find(
    (f) => f.id.toLowerCase() === authority.toLowerCase()
  )
  if (legacy) return isRTL ? legacy.nameAr : legacy.name
  return authority
}

// Short code fallback — always returns an uppercase-ish acronym.
// Used in badges where full names are too wide.
export function resolveAuthorityCode(
  authority: string | undefined,
  frameworks: FrameworkConfig[]
): string {
  if (!authority) return ''
  const match =
    frameworks.find((f) => f.id === authority) ??
    frameworks.find((f) => f.id.toLowerCase() === authority.toLowerCase())
  if (!match) return authority.toUpperCase()
  // Use name if short (≤ 8 chars), otherwise fall back to id uppercased.
  return match.name.length <= 8 ? match.name : match.id.toUpperCase()
}
