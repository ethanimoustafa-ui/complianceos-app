'use client'

// GAP-19: shared Version History list — renders the SAME expandable
// 3-column Field Changed / From / To diff for BOTH circular versions
// (`CircularVersionEntry`) and article versions (`ArticleVersionEntry`).
// Each carries a structured `fieldChanges: {field,from,to}[]` array; the
// caller normalises its entries into the `VersionHistoryItem` shape below.
//
// Wave-19.4 / Item-3 — version `changes` is fully dual-store. The caller
// passes the LOCALE-RESOLVED `summary` string directly (picked from `textEn`
// vs `textAr` per the current locale); no JSON parse, no regex.

import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { VersionFieldChange } from '@/types'
import { renderFieldLabel } from '@/lib/timeline-message'

export interface VersionHistoryItem {
  version: number
  date: string
  author: string
  /** Pre-resolved human-readable summary in the current locale. */
  summary: string
  fieldChanges: VersionFieldChange[]
  approved: boolean
}

type Props = {
  items: VersionHistoryItem[]
  t: (key: any, params?: Record<string, string>) => string
  emptyLabel?: string
}

export function VersionHistoryList({ items, t, emptyLabel }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel ?? '—'}</p>
  }

  // Newest-first display.
  const ordered = [...items].sort((a, b) => b.version - a.version)

  return (
    <div className="space-y-2">
      {ordered.map((ver) => {
        const isOpen = expanded === ver.version
        const hasDiff = ver.fieldChanges.length > 0
        return (
          <div key={ver.version}>
            <button
              onClick={() => setExpanded(isOpen ? null : ver.version)}
              className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
            >
              <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">
                v{ver.version}
              </span>
              <div className="flex-1 min-w-0">
                {/* Wave-19.4 / Item-3 — locale-resolved by the caller. */}
                <p className="text-xs font-bold text-slate-700">{ver.summary}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {ver.date} • {ver.author}
                </p>
              </div>
              {ver.approved && (
                <Icon
                  icon="lucide:check-circle"
                  className="text-emerald-500 text-sm shrink-0 mt-0.5"
                />
              )}
              <Icon
                icon={isOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                className="text-slate-400 text-sm shrink-0 mt-0.5"
              />
            </button>

            {isOpen && hasDiff && (
              <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                  <span>{t('regulatoryUpdates.fieldChanged')}</span>
                  <span>{t('regulatoryUpdates.changedFrom')}</span>
                  <span>{t('regulatoryUpdates.changedTo')}</span>
                </div>
                {ver.fieldChanges.map((diff, i) => (
                  <div
                    key={`${diff.field}-${i}`}
                    className="grid grid-cols-3 gap-1 text-[10px]"
                  >
                    <span className="font-bold text-slate-600">{renderFieldLabel(diff.field, t)}</span>
                    <span className="text-rose-600 line-through truncate">
                      {diff.from || '—'}
                    </span>
                    <span className="text-emerald-600 truncate">
                      {diff.to || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isOpen && !hasDiff && (
              <div className="bg-slate-50 rounded-xl p-3 mt-1">
                <p className="text-xs text-slate-400">{ver.summary}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
