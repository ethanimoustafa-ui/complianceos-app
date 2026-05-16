'use client'

import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { PlaceholderChip } from '@/components/correspondence/letter-placeholders/PlaceholderChip'
import type { PlaceholderDef, PlaceholderValue } from '@/types'

// Hybrid editor: editable textarea backed by `{{token}}` plus a live preview
// row above that renders the same string with `<PlaceholderChip>` components
// at the token positions. Editing happens in the textarea (raw `{{token}}`),
// but clicking a chip in the preview opens a popover that fills the value.
// This mirrors the @-mention experience without the bidi/cursor-position
// hazards of a true contenteditable.
export function LetterBodyEditor({
  value,
  onChange,
  placeholderDefs,
  placeholderValues,
  onPlaceholderChange,
  rows = 8,
  dir,
  fontFamily,
  textSize = 'text-sm',
  placeholder,
  inputType = 'textarea',
}: {
  value: string
  onChange: (v: string) => void
  placeholderDefs: PlaceholderDef[]
  placeholderValues: Record<string, PlaceholderValue | undefined>
  onPlaceholderChange: (key: string, v: PlaceholderValue | undefined) => void
  rows?: number
  dir?: 'ltr' | 'rtl'
  fontFamily?: string
  textSize?: string
  placeholder?: string
  inputType?: 'textarea' | 'input'
}) {
  const isRTL = dir === 'rtl'
  // Build alternating text/chip segments by splitting on `{{token}}`. Tokens
  // not declared in placeholderDefs are still rendered as a chip with a
  // synthetic def so the user gets feedback that their token is recognised.
  const segments = useMemo(() => {
    const re = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g
    const out: Array<{ kind: 'text'; text: string } | { kind: 'chip'; key: string }> = []
    let last = 0
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(value)) !== null) {
      if (m.index > last) {
        out.push({ kind: 'text', text: value.slice(last, m.index) })
      }
      out.push({ kind: 'chip', key: m[1] })
      last = m.index + m[0].length
    }
    if (last < value.length) {
      out.push({ kind: 'text', text: value.slice(last) })
    }
    return out
  }, [value])

  const defByKey = useMemo(() => {
    const map = new Map<string, PlaceholderDef>()
    for (const d of placeholderDefs) map.set(d.key, d)
    return map
  }, [placeholderDefs])

  const hasTokens = segments.some((s) => s.kind === 'chip')

  return (
    <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
      {/* Inline preview rendered with chips. Only shown when the body
          contains at least one {{token}}; otherwise it would be a redundant
          mirror of the textarea. */}
      {hasTokens && (
        <div
          dir={dir}
          style={{ fontFamily }}
          className={cn(
            'rounded-lg bg-white border border-slate-200 px-3 py-2 leading-relaxed text-slate-700 whitespace-pre-wrap break-words',
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

      {/* Toolbar (decorative — matches the previous editor look) */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button type="button" className="p-1 hover:bg-slate-200 rounded text-slate-500">
          <Icon icon="lucide:bold" />
        </button>
        <button type="button" className="p-1 hover:bg-slate-200 rounded text-slate-500">
          <Icon icon="lucide:italic" />
        </button>
        <button type="button" className="p-1 hover:bg-slate-200 rounded text-slate-500">
          <Icon icon="lucide:list" />
        </button>
      </div>

      {inputType === 'input' ? (
        <input
          type="text"
          value={value}
          dir={dir}
          style={{ fontFamily }}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'w-full bg-transparent text-slate-700 focus:outline-none placeholder:text-slate-400',
            textSize,
          )}
        />
      ) : (
        <textarea
          value={value}
          dir={dir}
          style={{ fontFamily }}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            'w-full bg-transparent resize-none text-slate-700 focus:outline-none placeholder:text-slate-400',
            textSize,
          )}
        />
      )}
    </div>
  )
}
