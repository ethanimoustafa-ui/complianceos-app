'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useCircularStore } from '@/stores/circular-store'
import { usePolicyStore } from '@/stores/policy-store'
import type { Circular, Policy } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'
import { formatLocalizedDate } from '@/lib/format-date'

type RegistryRow = {
  id: string
  reference: string
  name: string
  kind: 'rule' | 'policy'
  category: string
  status: string
  dueDate: string
  progress: number
  phaseLabel: string
  phaseNumber: number  // -1 = N/A (policies), 0/1/2 = circulars
}

const registryStatusColors: Record<string, string> = {
  // Circular statuses
  pending: 'bg-slate-100 text-slate-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  // Policy statuses
  draft: 'bg-slate-100 text-slate-700',
  'under-review': 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-rose-100 text-rose-700',
}

export default function RegistryPage() {
  const { t, isRTL, language } = useTranslation()
  const { circulars, setSelected: setSelectedCircular } = useCircularStore()
  const { policies, setSelected: setSelectedPolicy } = usePolicyStore()
  const router = useRouter()

  // Hydrate server-state on mount (Fix-1).
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchCirculars()
    void fetchPolicies()
  }, [fetchCirculars, fetchPolicies])

  // Registry view filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')

  // Preview panel state
  const [previewRow, setPreviewRow] = useState<RegistryRow | null>(null)

  // Status translation map
  const statusLabels: Record<string, string> = {
    'pending': t('common.pending'),
    'in-progress': t('policies.inProgress' as TranslationKey),
    'completed': t('common.completed'),
    'overdue': t('common.overdue'),
    'draft': t('common.draft'),
    'under-review': t('policies.underReview' as TranslationKey),
    'approved': t('policies.approved' as TranslationKey),
    'expired': t('policies.expired' as TranslationKey),
    'requires-review': t('policies.statusRequiresReview' as TranslationKey),
  }

  // Category / authority translation map (covers both policy categories and
  // circular authority values so no raw key ever reaches the DOM).
  const categoryLabels: Record<string, string> = {
    // Policy categories
    'compliance':  t('policies.categoryCompliance' as TranslationKey),
    'it':          t('policies.categoryIT' as TranslationKey),
    'operations':  t('policies.categoryOperations' as TranslationKey),
    'risk':        t('policies.categoryRisk' as TranslationKey),
    'hr':          t('policies.categoryHR' as TranslationKey),
    'finance':     t('policies.categoryFinance' as TranslationKey),
    // Extra policy categories that may appear from user-added seeds
    'governance':  isRTL ? 'الحوكمة' : 'Governance',
    'credit-risk': isRTL ? 'مخاطر الائتمان' : 'Credit Risk',
    // Circular authority values (registry maps category = c.authority)
    'sama':  t('observations.sources.sama' as TranslationKey),
    'cma':   t('observations.sources.cma' as TranslationKey),
    'ia':    t('observations.sources.ia' as TranslationKey),
    'zatca': t('observations.sources.zatca' as TranslationKey),
    'misa':  t('observations.sources.misa' as TranslationKey),
    'safiu': t('observations.sources.safiu' as TranslationKey),
    'citc':  t('observations.sources.citc' as TranslationKey),
  }

  // ── Registry rows (circulars + policies combined) ─────────────────────────
  const registryRows = useMemo((): RegistryRow[] => {
    const phaseNames: Record<number, string> = {
      0: t('regulatoryUpdates.phaseCAP' as TranslationKey),
      1: t('regulatoryUpdates.phaseCorrectiveActionPlan' as TranslationKey),
      2: t('regulatoryUpdates.phaseRemediation' as TranslationKey),
    }
    const circRows: RegistryRow[] = circulars.map((c) => {
      const currentStep = c.workflowSteps?.find(s => s.status === 'current')
      // Fallback: if no 'current' step, use the phase after the last completed step
      const lastCompletedStep = c.workflowSteps?.filter(s => s.status === 'completed').slice(-1)[0]
      const rawPhase = currentStep?.phase ?? (lastCompletedStep ? Math.min((lastCompletedStep.phase as number) + 1, 2) : 0)
      const currentPhase = rawPhase as 0 | 1 | 2
      // Use the server-maintained progress (circulars.progress, kept in sync by the
      // shared 50/50 formula in progress-formula.ts). The registry list does NOT
      // hydrate workflowSteps — they're detail-only (fetchById) — so recomputing
      // completedSteps/totalSteps here divided 0/0 = NaN for every list row (empty
      // array → totalSteps 0, and `0 ?? 1` keeps 0). The stored value is correct in
      // both the list and detail views.
      const progress = Number.isFinite(c.progress) ? Math.round(c.progress) : 0
      return {
        id: c.id,
        reference: c.reference,
        name: c.title,
        kind: 'rule',
        category: c.authority,
        status: c.status,
        dueDate: c.dueDate,
        progress,
        phaseLabel: phaseNames[currentPhase] ?? t('regulatoryUpdates.phaseCAP' as TranslationKey),
        phaseNumber: currentPhase,
      }
    })
    const polRows: RegistryRow[] = (policies ?? []).map((p) => ({
      id: p.id,
      reference: p.id,
      name: p.name,
      kind: 'policy',
      category: p.category,
      status: p.status,
      dueDate: p.nextReviewDate,
      progress: p.status === 'approved' ? 100 : p.status === 'under-review' ? 50 : 25,
      phaseLabel: '—',
      phaseNumber: -1,
    }))
    return [...circRows, ...polRows]
  }, [circulars, policies])

  const filteredRegistryRows = useMemo(() => {
    return registryRows.filter((row) => {
      const matchesSearch = row.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.reference.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || row.status === statusFilter
      const matchesKind = !kindFilter || row.kind === kindFilter
      return matchesSearch && matchesStatus && matchesKind
    })
  }, [registryRows, searchTerm, statusFilter, kindFilter])

  // Full object for the preview panel (defensive read: byId map wins,
  // falling back to the list — avoids a "Not Found" flash on freshly
  // created rows, mirroring the audit-page fix).
  const circularById = useCircularStore((s) => s.byId)
  const policyById = usePolicyStore((s) => s.byId)
  const previewItem = useMemo(() => {
    if (!previewRow) return null
    if (previewRow.kind === 'rule') {
      return (
        circularById[previewRow.id]
        ?? circulars.find((c) => c.id === previewRow.id)
        ?? null
      ) as Circular | null
    }
    return (
      policyById[previewRow.id]
      ?? policies.find((p) => p.id === previewRow.id)
      ?? null
    ) as Policy | null
  }, [previewRow, circulars, policies, circularById, policyById])

  function openFullDetail() {
    if (!previewRow || !previewItem) return
    if (previewRow.kind === 'rule') {
      setSelectedCircular(previewItem as Circular)
      router.push('/correspondence/regulatory-updates/rules')
    } else {
      setSelectedPolicy(previewItem as Policy)
      router.push('/correspondence/regulatory-updates/policies')
    }
  }

  const phaseChipClass = (phaseNumber: number) =>
    phaseNumber === 2 ? 'bg-violet-100 text-violet-700' :
    phaseNumber === 1 ? 'bg-blue-100 text-blue-700' :
    'bg-amber-100 text-amber-700'

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        <div>
          {/* Header */}
          <div className={`flex justify-between items-center mb-8`}>
            <div className={isRTL ? 'text-right' : ''}>
              <div className={`flex items-center gap-3 mb-2`}>
                <Link
                  href="/correspondence/feed"
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="text-2xl" />
                </Link>
                <h1 className="text-2xl font-bold font-display text-slate-900">{t('correspondence.regulatoryRequirements')}</h1>
              </div>
              <p className={`text-sm text-slate-500 ${isRTL ? 'mr-11' : 'ml-11'}`}>{t('correspondence.comprehensiveList')}</p>
              <div className={`flex gap-2 mt-2 ${isRTL ? 'mr-11' : 'ml-11'}`}>
                <Link
                  href="/correspondence/regulatory-updates/rules"
                  className={`px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1`}
                >
                  {t('correspondence.viewRegulatoryUpdates' as TranslationKey)} <Icon icon="lucide:arrow-right" className="text-xs" />
                </Link>
                <Link
                  href="/correspondence/regulatory-updates/policies"
                  className={`px-3 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1`}
                >
                  {t('correspondence.viewPolicies' as TranslationKey)} <Icon icon="lucide:arrow-right" className="text-xs" />
                </Link>
              </div>
            </div>
          </div>

          {/* Search + filters */}
          <div className="glass-card rounded-2xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <div className="relative">
                  <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('common.searchRecords')}
                    className={`w-full ${isRTL ? 'pl-8 pr-4' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                </div>
              </div>
              <div>
                <EditableSelect
                  locked
                  value={statusFilter || null}
                  onChange={(id) => setStatusFilter(id)}
                  items={[
                    { id: '', label: t('correspondence.allStatuses') },
                    { id: 'pending', label: t('common.pending') },
                    { id: 'in-progress', label: t('policies.inProgress' as TranslationKey) },
                    { id: 'completed', label: t('common.completed') },
                    { id: 'overdue', label: t('common.overdue') },
                    { id: 'draft', label: t('common.draft') },
                    { id: 'under-review', label: t('policies.underReview' as TranslationKey) },
                    { id: 'approved', label: t('policies.approved' as TranslationKey) },
                    { id: 'expired', label: t('policies.expired' as TranslationKey) },
                  ]}
                  placeholder={t('correspondence.allStatuses')}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <EditableSelect
                  locked
                  value={kindFilter || null}
                  onChange={(id) => setKindFilter(id)}
                  items={[
                    { id: '', label: t('correspondence.allTypes') },
                    { id: 'rule', label: t('correspondence.ruleCircular' as TranslationKey) },
                    { id: 'policy', label: t('correspondence.policyProcedure' as TranslationKey) },
                  ]}
                  placeholder={t('correspondence.allTypes')}
                  isRTL={isRTL}
                />
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b-2 border-slate-200">
                  <tr>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('correspondence.reference')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider w-64">{t('correspondence.requirementName')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('correspondence.itemType' as TranslationKey)}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('correspondence.category')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('correspondence.phase')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('observations.dueDate')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('common.progress')}</th>
                    <th className="text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegistryRows.map((row) => (
                    <tr key={`${row.kind}-${row.id}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-xs font-mono text-slate-500">{row.reference}</td>
                      <td className="p-4 w-64 max-w-64">
                        <p className="text-sm font-bold text-slate-900 line-clamp-2">{row.name}</p>
                      </td>
                      <td className="p-4">
                        {row.kind === 'rule' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
                            {t('correspondence.ruleCircular' as TranslationKey)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                            {t('correspondence.policyProcedure' as TranslationKey)}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{categoryLabels[row.category] ?? row.category}</span>
                      </td>
                      <td className="p-4">
                        {row.phaseNumber < 0 ? (
                          <span className="text-slate-300 text-xs">—</span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${phaseChipClass(row.phaseNumber)}`}>
                            {row.phaseLabel}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${registryStatusColors[row.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {statusLabels[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{row.dueDate ? formatLocalizedDate(row.dueDate, language, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td className="p-4 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${row.progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 shrink-0 w-8 text-right">{row.progress}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => setPreviewRow(row)}
                          className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1 text-xs font-bold"
                        >
                          <Icon icon="lucide:eye" className="text-sm" />
                          {t('common.view')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredRegistryRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-sm text-slate-400">{t('common.noResults')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">{filteredRegistryRows.length} {t('common.items')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Summary Preview Modal ─────────────────────────────────────────────── */}
      {previewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setPreviewRow(null)}
          />
          {/* Panel */}
          <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden ${isRTL ? 'rtl' : ''}`}>
            {/* Header */}
            <div className={`p-5 border-b border-slate-100 ${isRTL ? 'text-right' : ''}`}>
              <div className={`flex items-start gap-3`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-400 mb-1">{previewRow.reference}</p>
                  <h2 className="text-base font-bold text-slate-900 leading-snug">{previewRow.name}</h2>
                </div>
                <button
                  onClick={() => setPreviewRow(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 shrink-0 transition-colors"
                >
                  <Icon icon="lucide:x" className="text-base" />
                </button>
              </div>
              {/* Badges */}
              <div className={`flex flex-wrap gap-1.5 mt-3`}>
                {previewRow.kind === 'rule' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {t('correspondence.ruleCircular' as TranslationKey)}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {t('correspondence.policyProcedure' as TranslationKey)}
                  </span>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${registryStatusColors[previewRow.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {statusLabels[previewRow.status] ?? previewRow.status}
                </span>
                {previewRow.phaseNumber >= 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phaseChipClass(previewRow.phaseNumber)}`}>
                    {previewRow.phaseLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Progress */}
              <div>
                <div className={`flex justify-between text-xs mb-1.5`}>
                  <span className="text-slate-500">{t('common.progress')}</span>
                  <span className="font-bold text-slate-700">{previewRow.progress}%</span>
                </div>
                <div className="bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${previewRow.progress >= 100 ? 'bg-emerald-500' : previewRow.status === 'overdue' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${previewRow.progress}%` }}
                  />
                </div>
              </div>

              {/* Key details */}
              <div className="space-y-2.5">
                <div className={`flex justify-between text-xs`}>
                  <span className="text-slate-400">{t('correspondence.category')}</span>
                  <span className="font-bold text-slate-700">{categoryLabels[previewRow.category] ?? previewRow.category}</span>
                </div>
                {previewRow.dueDate && (
                  <div className={`flex justify-between text-xs`}>
                    <span className="text-slate-400">{t('observations.dueDate')}</span>
                    <span className={`font-bold ${new Date(previewRow.dueDate) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>
                      {formatLocalizedDate(previewRow.dueDate, language, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}

                {/* Policy-specific: owner + version + next review */}
                {previewRow.kind === 'policy' && previewItem && 'owner' in previewItem && (
                  <>
                    <div className={`flex justify-between text-xs`}>
                      <span className="text-slate-400">{t('policies.policyOwner' as TranslationKey)}</span>
                      <span className="font-bold text-slate-700">{(previewItem as Policy).owner?.name}</span>
                    </div>
                    <div className={`flex justify-between text-xs`}>
                      <span className="text-slate-400">{t('policies.version' as TranslationKey)}</span>
                      <span className="font-bold text-slate-700">{(previewItem as Policy).version}</span>
                    </div>
                    {(previewItem as Policy).nextReviewDate && (
                      <div className={`flex justify-between text-xs`}>
                        <span className="text-slate-400">{t('policies.nextReview')}</span>
                        <span className="font-bold text-slate-700">{(previewItem as Policy).nextReviewDate}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Circular-specific: CAP deadline + article count */}
                {previewRow.kind === 'rule' && previewItem && 'articles' in previewItem && (
                  <>
                    {(previewItem as Circular).capDeadline && (
                      <div className={`flex justify-between text-xs`}>
                        <span className="text-slate-400">{t('regulatoryUpdates.capDeadline' as TranslationKey)}</span>
                        <span className={`font-bold ${new Date((previewItem as Circular).capDeadline!) < new Date() ? 'text-rose-600' : 'text-slate-700'}`}>
                          {formatLocalizedDate((previewItem as Circular).capDeadline, language, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div className={`flex justify-between text-xs`}>
                      <span className="text-slate-400">{t('correspondence.articles')}</span>
                      <span className="font-bold text-slate-700">{(previewItem as Circular).articles?.length ?? 0}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Description */}
              {previewItem && (
                (() => {
                  const desc = 'description' in previewItem ? (previewItem as Circular | Policy).description : undefined
                  return desc ? (
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1.5">{t('common.description')}</p>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{desc}</p>
                    </div>
                  ) : null
                })()
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={openFullDetail}
                className={`w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer`}
              >
                {t('common.viewFullDetail' as TranslationKey)}
                <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} className="text-sm" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
