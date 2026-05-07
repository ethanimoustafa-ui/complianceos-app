'use client'

import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { PlaceholderDef, PlaceholderRefKind, PlaceholderType } from '@/types'
import { REF_KIND_LABELS, reconcilePlaceholderDefs } from '@/lib/letter-placeholders'

interface PlaceholderDefEditorProps {
  defs: PlaceholderDef[]
  bodyEn?: string
  subjectEn?: string
  onChange: (next: PlaceholderDef[]) => void
}

const TYPE_OPTIONS: { value: PlaceholderType; label: string; icon: string }[] = [
  { value: 'text',      label: 'Free text', icon: 'lucide:text-cursor-input' },
  { value: 'date',      label: 'Date',      icon: 'lucide:calendar' },
  { value: 'reference', label: 'Reference', icon: 'lucide:link' },
]

const REF_KINDS: PlaceholderRefKind[] = ['observation', 'audit', 'letter', 'rule', 'policy']

export function PlaceholderDefEditor({ defs, bodyEn, subjectEn, onChange }: PlaceholderDefEditorProps) {
  const reconciled = reconcilePlaceholderDefs(defs, bodyEn, subjectEn)
  const list = reconciled.length > 0 ? reconciled : defs

  if (list.length === 0) {
    return (
      <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center">
        <p className="text-xs text-slate-500">
          Insert <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">{'{{token}}'}</code> placeholders into the
          subject or body. Each one will appear here so you can configure its type.
        </p>
      </div>
    )
  }

  const updateDef = (key: string, patch: Partial<PlaceholderDef>) => {
    onChange(list.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  return (
    <div className="space-y-2">
      {list.map((def) => (
        <div key={def.key} className="p-3 border border-slate-200 rounded-xl bg-white">
          <div className="flex items-center gap-2 mb-2">
            <code className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-mono rounded">
              {`{{${def.key}}}`}
            </code>
            <input
              value={def.label}
              onChange={(e) => updateDef(def.key, { label: e.target.value })}
              placeholder="Label shown in compose"
              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          <div className="flex items-center gap-1 mb-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateDef(def.key, { type: opt.value })}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
                  def.type === opt.value
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300',
                )}
              >
                <Icon icon={opt.icon} className="text-[11px]" />
                {opt.label}
              </button>
            ))}
          </div>

          {def.type === 'reference' && (
            <div className="pl-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Allowed reference types
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {REF_KINDS.map((kind) => {
                  const enabled = (def.refKinds ?? REF_KINDS).includes(kind)
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        const current = def.refKinds ?? REF_KINDS
                        const next = enabled
                          ? current.filter((k) => k !== kind)
                          : [...current, kind]
                        updateDef(def.key, { refKinds: next.length === 0 ? undefined : next })
                      }}
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-bold rounded-full border cursor-pointer',
                        enabled
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      {REF_KIND_LABELS[kind]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
