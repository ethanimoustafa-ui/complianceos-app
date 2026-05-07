'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useCircularStore } from '@/stores/circular-store'
import { useDepartmentStore } from '@/stores/department-store'
import {
  useComplianceEvaluationStore,
  type ComplianceVerdict,
} from '@/stores/compliance-evaluation-store'
import { useAuthStore } from '@/stores/auth-store'

const verdictMeta: Record<ComplianceVerdict, { label: string; bg: string; text: string; dot: string; icon: string }> = {
  compliant:        { label: 'Compliant',     bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: 'lucide:check-circle' },
  'non-compliant':  { label: 'Non-compliant', bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    icon: 'lucide:x-circle' },
  na:               { label: 'N/A',           bg: 'bg-slate-50',   text: 'text-slate-600',   dot: 'bg-slate-400',   icon: 'lucide:minus-circle' },
  unknown:          { label: 'Pending',       bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: 'lucide:circle-help' },
}

export default function ComplianceReviewPage() {
  const { isRTL } = useTranslation()
  const pathname = usePathname()
  const { circulars } = useCircularStore()
  const { departments } = useDepartmentStore()
  const { evaluations, setVerdict, getDepartmentScore } = useComplianceEvaluationStore()
  const user = useAuthStore((s) => s.user)
  const evaluatorName = user?.name ?? 'Compliance Officer'

  const [activeDeptId, setActiveDeptId] = useState<string>(departments[0]?.id ?? '')
  const [search, setSearch] = useState('')

  const applicableRuleIds = useMemo(() => circulars.map((c) => c.id), [circulars])

  const departmentScores = useMemo(() => {
    return departments.map((d) => ({
      dept: d,
      ...getDepartmentScore(d.id, applicableRuleIds),
    }))
  }, [departments, applicableRuleIds, evaluations, getDepartmentScore])

  const overallScore = useMemo(() => {
    const totals = departmentScores.reduce(
      (acc, s) => {
        acc.compliant += s.compliantCount
        acc.nonCompliant += s.nonCompliantCount
        return acc
      },
      { compliant: 0, nonCompliant: 0 },
    )
    const denom = totals.compliant + totals.nonCompliant
    return denom === 0 ? 0 : Math.round((totals.compliant / denom) * 100)
  }, [departmentScores])

  const activeDept = departments.find((d) => d.id === activeDeptId)
  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return circulars
    return circulars.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.reference.toLowerCase().includes(q),
    )
  }, [circulars, search])

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">Compliance Review</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              Per-department compliance evaluation
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              Audits
            </Link>
            <Link href="/reports/compliance-review" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/compliance-review') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              Compliance Review
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              Team Performance
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              Audit Logs
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              Risks
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Overall Business Compliance</p>
            <p className="text-2xl font-bold text-emerald-600">{overallScore}%</p>
            <p className="text-[10px] text-slate-400 mt-1">Across all departments &amp; rules</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Active Rules</p>
            <p className="text-2xl font-bold text-slate-900">{circulars.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Departments</p>
            <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pending Evaluations</p>
            <p className="text-2xl font-bold text-amber-600">
              {departmentScores.reduce((acc, s) => acc + s.pendingCount, 0)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Per-department compliance</h2>
            <p className="text-xs text-slate-500 mt-1">
              Score derives from rules you marked compliant vs. non-compliant. N/A rules are excluded; pending rules count toward the open queue.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {departmentScores.map((d) => {
              const isActive = d.dept.id === activeDeptId
              const scoreColor = d.score >= 80 ? 'text-emerald-600' : d.score >= 50 ? 'text-amber-600' : 'text-rose-600'
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
                    <p className={cn('text-2xl font-bold', scoreColor)}>{d.score}%</p>
                  </div>
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
                  {isRTL ? activeDept.nameAr : activeDept.name} — rules checklist
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Mark whether the department complies with each rule. The score above updates immediately.
                </p>
              </div>
              <div className="relative">
                <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rules..."
                  className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredRules.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">No rules to evaluate.</div>
              ) : (
                filteredRules.map((rule) => {
                  const evaluation = evaluations[`${rule.id}::${activeDept.id}`]
                  const verdict = evaluation?.verdict ?? 'unknown'
                  return (
                    <div key={rule.id} className="p-5 hover:bg-slate-50/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {rule.reference}
                            </span>
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', verdictMeta[verdict].bg, verdictMeta[verdict].text)}>
                              {verdictMeta[verdict].label}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 truncate">{rule.title}</p>
                          {evaluation?.evaluatedAt && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Last marked by {evaluation.evaluatedBy ?? 'unknown'} on{' '}
                              {new Date(evaluation.evaluatedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {(['compliant', 'non-compliant', 'na', 'unknown'] as ComplianceVerdict[]).map((v) => {
                            const meta = verdictMeta[v]
                            const isSelected = verdict === v
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setVerdict(rule.id, activeDept.id, v, evaluatorName)}
                                className={cn(
                                  'flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all cursor-pointer',
                                  isSelected
                                    ? cn(meta.bg, meta.text, 'border-transparent')
                                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300',
                                )}
                              >
                                <Icon icon={meta.icon} className="text-xs" />
                                {meta.label}
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
          </div>
        )}
      </div>
    </div>
  )
}
