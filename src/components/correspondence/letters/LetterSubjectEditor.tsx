'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PlaceholderChip } from '@/components/correspondence/sama-letters/PlaceholderChip'
import type { PlaceholderDef, PlaceholderValue } from '@/types'

// Subject input variant: reuses LetterBodyEditor styled as a single-line
// input + inline preview for any tokens it contains.
export function LetterSubjectEditor({
  value,
  onChange,
  placeholderDefs,
  placeholderValues,
  onPlaceholderChange,
  dir,
  fontFamily,
  textSize = 'text-sm',
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholderDefs: PlaceholderDef[]
  placeholderValues: Record<string, PlaceholderValue | undefined>
  onPlaceholderChange: (key: string, v: PlaceholderValue | undefined) => void
  dir?: 'ltr' | 'rtl'
  fontFamily?: string
  textSize?: string
  placeholder?: string
}) {
  const isRTL = dir === 'rtl'
  const segments = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g
    const out: Array<{ kind: 'text'; text: string } | { kind: 'chip'; key: string }> = []
    let last = 0
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(value)) !== null) {
      if (m.index > last) out.push({ kind: 'text', text: value.slice(last, m.index) })
      out.push({ kind: 'chip', key: m[1] })
      last = m.index + m[0].length
    }
    if (last < value.length) out.push({ kind: 'text', text: value.slice(last) })
    return out
  }, [value])

  const defByKey = useMemo(() => {
    const map = new Map<string, PlaceholderDef>()
    for (const d of placeholderDefs) map.set(d.key, d)
    return map
  }, [placeholderDefs])

  const hasTokens = segments.some((s) => s.kind === 'chip')

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        dir={dir}
        style={{ fontFamily }}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-medium focus:ring-2 focus:ring-emerald-500 outline-none',
          textSize,
        )}
      />
      {hasTokens && (
        <div
          dir={dir}
          style={{ fontFamily }}
          className={cn(
            'rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-slate-700 break-words',
            textSize,
          )}
        >
          {segments.map((seg, idx) =>
            seg.kind === 'text' ? (
              <span key={idx}>{seg.text}</span>
            ) : (
              <PlaceholderChip
                key={`${idx}-${seg.key}`}
                def={defByKey.get(seg.key) ?? { key: seg.key, label: seg.key, type: 'date' }}
                value={placeholderValues[seg.key]}
                onChange={(v) => onPlaceholderChange(seg.key, v)}
                onClear={() => onPlaceholderChange(seg.key, undefined)}
                isRTL={isRTL}
                size="sm"
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}
