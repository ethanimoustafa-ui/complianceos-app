'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import type { PlaceholderDef, PlaceholderRefKind, PlaceholderValue } from '@/types'
import { refKindLabel } from '@/lib/letters/letter-placeholders'
import { useTranslation } from '@/i18n'
import { useObservationStore } from '@/stores/observation-store'
import { useAuditStore } from '@/stores/audit-store'
import { useLetterStore } from '@/stores/letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { usePolicyStore } from '@/stores/policy-store'

interface PlaceholderPickerProps {
  def: PlaceholderDef
  value?: PlaceholderValue
  onChange: (next: PlaceholderValue) => void
}

interface RefOption {
  kind: PlaceholderRefKind
  id: string
  reference: string
  title: string
}

export function PlaceholderPicker({ def, value, onChange }: PlaceholderPickerProps) {
  if (def.type === 'date') {
    return (
      <input
        type="date"
        value={value?.type === 'date' ? value.value : ''}
        onChange={(e) => onChange({ type: 'date', value: e.target.value })}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      />
    )
  }

  return (
    <ReferencePicker
      def={def}
      value={value?.type === 'reference' ? value : undefined}
      onChange={(refValue) => onChange(refValue)}
    />
  )
}

function ReferencePicker({
  def,
  value,
  onChange,
}: {
  def: PlaceholderDef
  value?: Extract<PlaceholderValue, { type: 'reference' }>
  onChange: (next: Extract<PlaceholderValue, { type: 'reference' }>) => void
}) {
  const { t } = useTranslation()
  const observations = useObservationStore((s) => s.observations)
  const observationsLastFetched = useObservationStore((s) => s.lastFetched)
  const fetchObservations = useObservationStore((s) => s.fetchAll)
  const audits = useAuditStore((s) => s.audits)
  const auditsLastFetched = useAuditStore((s) => s.lastFetched)
  const fetchAudits = useAuditStore((s) => s.fetchAll)
  const letters = useLetterStore((s) => s.letters)
  const lettersLastFetched = useLetterStore((s) => s.lastFetched)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const circulars = useCircularStore((s) => s.circulars)
  const circularsLastFetched = useCircularStore((s) => s.lastFetched)
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  const policies = usePolicyStore((s) => s.policies)
  const policiesLastFetched = usePolicyStore((s) => s.lastFetched)
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)

  // C1+C2: Eagerly hydrate each store the first time this picker renders —
  // without this, the dropdowns are empty until the user visits the source page.
  useEffect(() => {
    if (!observationsLastFetched) void fetchObservations()
    if (!auditsLastFetched)      void fetchAudits()
    if (!lettersLastFetched)     void fetchLetters()
    if (!circularsLastFetched)   void fetchCirculars()
    if (!policiesLastFetched)    void fetchPolicies()
  }, [
    observationsLastFetched, fetchObservations,
    auditsLastFetched, fetchAudits,
    lettersLastFetched, fetchLetters,
    circularsLastFetched, fetchCirculars,
    policiesLastFetched, fetchPolicies,
  ])

  const allowedKinds: PlaceholderRefKind[] = useMemo(
    () => def.refKinds && def.refKinds.length > 0 ? def.refKinds : ['observation', 'audit', 'letter', 'rule', 'policy'],
    [def.refKinds],
  )

  const [open, setOpen] = useState(false)
  const [activeKind, setActiveKind] = useState<PlaceholderRefKind>(allowedKinds[0])
  const [search, setSearch] = useState('')

  const options = useMemo<RefOption[]>(() => {
    const q = search.trim().toLowerCase()
    let list: RefOption[] = []
    if (activeKind === 'observation') {
      list = observations.map((o) => ({ kind: 'observation', id: o.id, reference: o.reference, title: o.title }))
    } else if (activeKind === 'audit') {
      list = audits.map((a) => ({ kind: 'audit', id: a.id, reference: a.title, title: a.title }))
    } else if (activeKind === 'letter') {
      list = letters.map((l) => ({ kind: 'letter', id: l.id, reference: l.reference, title: l.subject }))
    } else if (activeKind === 'rule') {
      list = circulars.map((c) => ({ kind: 'rule', id: c.id, reference: c.reference, title: c.title }))
    } else if (activeKind === 'policy') {
      list = policies.map((p) => ({ kind: 'policy', id: p.id, reference: p.id, title: p.name }))
    }
    if (!q) return list
    return list.filter(
      (o) => o.title.toLowerCase().includes(q) || o.reference.toLowerCase().includes(q),
    )
  }, [activeKind, search, observations, audits, letters, circulars, policies])

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer text-start"
      >
        {value ? (
          <span className="truncate">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">
              {refKindLabel(value.value.kind, t)}
            </span>
            <span className="text-slate-900 font-medium">{value.value.reference}</span>
            <span className="text-slate-500"> — {value.value.title}</span>
          </span>
        ) : (
          <span className="text-slate-400">{t('placeholderPicker.pickReference')}</span>
        )}
        <Icon icon="lucide:chevron-down" className="text-slate-400 text-sm" />
      </button>

      {open && (
        <div className="border border-slate-200 bg-white rounded-lg shadow-xl p-3 space-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            {allowedKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
                  activeKind === kind
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300',
                )}
              >
                {refKindLabel(kind, t)}
              </button>
            ))}
          </div>
          <div className="relative">
            <Icon icon="lucide:search" className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('placeholderPicker.searchKind', { kind: refKindLabel(activeKind, t) })}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
            {options.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic p-2">{t('placeholderPicker.noMatches')}</p>
            ) : (
              options.map((opt) => (
                <button
                  key={`${opt.kind}-${opt.id}`}
                  type="button"
                  onClick={() => {
                    onChange({ type: 'reference', value: opt })
                    setOpen(false)
                  }}
                  className="w-full px-2 py-2 text-start hover:bg-slate-50 cursor-pointer"
                >
                  <p className="text-xs font-bold text-slate-900 truncate">{opt.reference}</p>
                  <p className="text-[11px] text-slate-500 truncate">{opt.title}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
