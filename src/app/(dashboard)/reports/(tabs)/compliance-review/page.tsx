'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation, type TranslationKey } from '@/i18n'
import { useCircularStore } from '@/stores/circular-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useDepartmentStore } from '@/stores/department-store'
import {
  useComplianceEvaluationStore,
  type ComplianceVerdict,
  type ComplianceItemKind,
} from '@/stores/compliance-evaluation-store'
import { useAuthStore } from '@/stores/auth-store'
import { calculateComplianceReviewScore } from '@/lib/compliance-review-score'

// Color/icon channels are static; the user-visible label comes from i18n
// (`verdictLabelKeys`). Keeping these split avoids a per-render translate
// closure inside the verdict map.
const verdictStyle: Record<ComplianceVerdict, { bg: string; text: string; dot: string; icon: string }> = {
  compliant:        { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: 'lucide:check-circle' },
  'non-compliant':  { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: 'lucide:x-circle' },
  na:               { bg: 'bg-slate-50',   text: 'text-slate-600',   dot: 'bg-slate-400',   icon: 'lucide:minus-circle' },
  unknown:          { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: 'lucide:circle-help' },
}

const verdictLabelKey: Record<ComplianceVerdict, TranslationKey> = {
  compliant:        'complianceReview.verdictCompliant',
  'non-compliant':  'complianceReview.verdictNonCompliant',
  na:               'complianceReview.verdictNa',
  unknown:          'complianceReview.verdictPending',
}

interface ChecklistItem {
  kind: ComplianceItemKind
  id: string
  title: string
  reference: string
}

const PAGE_SIZE = 10

export default function ComplianceReviewPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const { circulars } = useCircularStore()
  const { policies } = usePolicyStore()
  const { departments } = useDepartmentStore()
  const { evaluations, setVerdict } = useComplianceEvaluationStore()
  const user = useAuthStore((s) => s.user)
  const evaluatorName = user?.name ?? t('complianceReview.evaluatorFallback')

  const [activeDeptId, setActiveDeptId] = useState<string>(departments[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Build per-department applicable items (rules by name match, policies by id match)
  const itemsByDept = useMemo(() => {
    const map: Record<string, ChecklistItem[]> = {}
    for (const dept of departments) {
      const ruleItems: ChecklistItem[] = circulars
        .filter((c) => c.businessOwnerDepartment === dept.name)
        .map((c) => ({ kind: 'rule' as const, id: c.id, title: c.title, reference: c.reference }))
      const policyItems: ChecklistItem[] = policies
        .filter((p) => p.businessOwnerDepartmentId === dept.id)
        .map((p) => ({ kind: 'policy' as const, id: p.id, title: p.name, reference: p.id }))
      map[dept.id] = [...ruleItems, ...policyItems]
    }
    return map
  }, [departments, circulars, policies])

  // Single source of truth: the same lib function the dashboard hero uses.
  // Guarantees the "Overall Business Compliance" KPI here equals the
  // "Compliance Health" hero ring on the dashboard (§1.B).
  const reviewScore = useMemo(
    () => calculateComplianceReviewScore({ circulars, policies, departments, evaluations }),
    [circulars, policies, departments, evaluations],
  )

  const departmentScores = useMemo(() => {
    return reviewScore.byDepartment.map((breakdown) => {
      const dept = departments.find((d) => d.id === breakdown.departmentId)!
      const items = itemsByDept[dept.id] ?? []
      return { dept, items, ...breakdown }
    })
  }, [reviewScore, departments, itemsByDept])

  const overallScore = reviewScore.overallByRecords
  const overallEvaluated = reviewScore.totalEvaluatedItems
  const overallPending = reviewScore.totalPending

  const totalItems = circulars.length + policies.length

  const activeDept = departments.find((d) => d.id === activeDeptId)
  const activeItems = activeDept ? itemsByDept[activeDept.id] ?? [] : []

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeItems
    return activeItems.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.reference.toLowerCase().includes(q),
    )
  }, [activeItems, search])

  // Reset pagination when dept or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeDeptId, search])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, safePage])

  const handleRowClick = (item: ChecklistItem) => {
    if (item.kind === 'rule') {
      router.push(`/correspondence/regulatory-updates/rules?id=${encodeURIComponent(item.id)}`)
    } else {
      router.push(`/correspondence/regulatory-updates/policies?policyId=${encodeURIComponent(item.id)}`)
    }
  }

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('complianceReview.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('complianceReview.subtitle')}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsTab')}
            </Link>
            <Link href="/reports/compliance-review" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/compliance-review') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.complianceReviewTab')}
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.teamPerformanceTab')}
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsLogs')}
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.tabs.risks')}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('complianceReview.overallBusinessCompliance')}</p>
            {overallEvaluated === 0 ? (
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-slate-400">—</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  {t('complianceReview.pendingScoreLabel')}
                </span>
              </div>
            ) : (
              <>
                <p className={cn(
                  'text-2xl font-bold',
                  overallScore >= 80 ? 'text-emerald-600' : overallScore >= 50 ? 'text-amber-600' : 'text-rose-600',
                )}>{overallScore}%</p>
                {overallPending > 0 && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1">
                    {t('complianceReview.pendingCaption', { count: String(overallPending) })}
                  </p>
                )}
              </>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              {overallEvaluated === 0
                ? t('complianceReview.notYetEvaluated')
                : t('complianceReview.overallSubLabel')}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('complianceReview.activeRules')}</p>
            <p className="text-2xl font-bold text-slate-900">{totalItems}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {t('complianceReview.activeRulesBreakdown', { rules: String(circulars.length), policies: String(policies.length) })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('complianceReview.departments')}</p>
            <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('complianceReview.pendingEvaluations')}</p>
            <p className="text-2xl font-bold text-amber-600">
              {departmentScores.reduce((acc, s) => acc + s.pendingCount, 0)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">{t('complianceReview.perDepartmentCompliance')}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {t('complianceReview.perDepartmentDescription')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {departmentScores.map((d) => {
              const isActive = d.dept.id === activeDeptId
              const scoreColor = d.score >= 80 ? 'text-emerald-600' : d.score >= 50 ? 'text-amber-600' : 'text-rose-600'
              const isFullyPending = d.evaluatedItems === 0
              return (
                <button
                  key={d.dept.id}
                  type="button"
                  onClick={() => setActiveDeptId(d.dept.id)}
                  className={cn(
                    'text-start p-4 rounded-xl border transition-all cursor-pointer',
                    isActive
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/40'
                      : 'border-slate-200 hover:border-slate-300 bg-white',
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-bold text-slate-900">
                      {isRTL ? d.dept.nameAr : d.dept.name}
                    </p>
                    {isFullyPending ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        {t('complianceReview.pendingScoreLabel')}
                      </span>
                    ) : (
                      <p className={cn('text-2xl font-bold', scoreColor)}>{d.score}%</p>
                    )}
                  </div>
                  {!isFullyPending && d.pendingCount > 0 && (
                    <p className="text-[10px] font-bold text-amber-600 mb-2">
                      {t('complianceReview.pendingCaption', { count: String(d.pendingCount) })}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {d.compliantCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      {d.nonCompliantCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {d.pendingCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      {d.naCount}
                    </span>
                    <span className="ms-auto text-[10px] text-slate-400">
                      {d.total} {d.total === 1 ? t('complianceReview.item') : t('complianceReview.items')}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {activeDept && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {t('complianceReview.checklistFor', { department: isRTL ? activeDept.nameAr : activeDept.name })}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {t('complianceReview.checklistDescription')}
                </p>
              </div>
              <div className="relative">
                <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('complianceReview.searchRulesPolicies')}
                  className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  {activeItems.length === 0
                    ? t('complianceReview.emptyOwnedNone')
                    : t('complianceReview.emptyNoSearchMatch')}
                </div>
              ) : (
                pagedItems.map((item) => {
                  const key = `${item.kind}:${item.id}::${activeDept.id}`
                  const evaluation = evaluations[key]
                  // Resolve derived verdict only when no manual eval exists.
                  // A fully-completed workflow on the underlying rule/policy
                  // (whose business owner matches the active dept) auto-marks
                  // the row "compliant" with an AUTO badge (§1.C). Clicking
                  // any verdict button still creates a manual entry that
                  // wins thereafter.
                  let verdict: ComplianceVerdict = 'unknown'
                  let isDerived = false
                  if (evaluation) {
                    verdict = evaluation.verdict
                  } else if (item.kind === 'rule') {
                    const c = circulars.find((x) => x.id === item.id)
                    if (
                      c &&
                      c.businessOwnerDepartment === activeDept.name &&
                      c.workflowSteps &&
                      c.workflowSteps.length > 0 &&
                      c.workflowSteps.every((s) => s.status === 'completed')
                    ) {
                      verdict = 'compliant'
                      isDerived = true
                    }
                  } else {
                    const p = policies.find((x) => x.id === item.id)
                    if (
                      p &&
                      p.businessOwnerDepartmentId === activeDept.id &&
                      p.workflowTimeline &&
                      p.workflowTimeline.length > 0 &&
                      p.workflowTimeline.every((s) => s.status === 'completed')
                    ) {
                      verdict = 'compliant'
                      isDerived = true
                    }
                  }
                  const kindBadge = item.kind === 'rule'
                    ? { label: t('complianceReview.kindRule'), bg: 'bg-blue-50', text: 'text-blue-700' }
                    : { label: t('complianceReview.kindPolicy'), bg: 'bg-violet-50', text: 'text-violet-700' }
                  return (
                    <div key={`${item.kind}:${item.id}`} className="p-5 hover:bg-slate-50/50">
                      <div className="flex items-start justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => handleRowClick(item)}
                          className="flex-1 min-w-0 text-start cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', kindBadge.bg, kindBadge.text)}>
                              {kindBadge.label}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {item.reference}
                            </span>
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', verdictStyle[verdict].bg, verdictStyle[verdict].text)}>
                              {t(verdictLabelKey[verdict])}
                            </span>
                            {isDerived && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                {t('complianceReview.autoBadge')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                            {item.title}
                          </p>
                          {evaluation?.evaluatedAt ? (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {t('complianceReview.lastMarkedBy', {
                                name: evaluation.evaluatedBy ?? t('inlineDeadlinePicker.unknown'),
                                date: new Date(evaluation.evaluatedAt).toLocaleDateString(),
                              })}
                            </p>
                          ) : isDerived ? (
                            <p className="text-[10px] text-blue-600 mt-1 font-medium">
                              {t('complianceReview.autoFromWorkflow')}
                            </p>
                          ) : null}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {(['compliant', 'non-compliant', 'na', 'unknown'] as ComplianceVerdict[]).map((v) => {
                            const style = verdictStyle[v]
                            const isSelected = verdict === v
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setVerdict(item.kind, item.id, activeDept.id, v, evaluatorName)}
                                className={cn(
                                  'flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
                                  isSelected
                                    ? cn(style.bg, style.text, 'border-transparent')
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300',
                                )}
                              >
                                <Icon icon={style.icon} className="text-xs" />
                                {t(verdictLabelKey[v])}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  {t('complianceReview.showingRange', {
                    from: String((safePage - 1) * PAGE_SIZE + 1),
                    to: String(Math.min(safePage * PAGE_SIZE, filteredItems.length)),
                    total: String(filteredItems.length),
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                  >
                    <Icon icon="lucide:chevron-left" className="text-slate-600 text-sm" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-xs font-bold transition-colors',
                        page === safePage
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors"
                  >
                    <Icon icon="lucide:chevron-right" className="text-slate-600 text-sm" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
