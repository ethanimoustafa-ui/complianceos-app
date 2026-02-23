'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useRequirementStore } from '@/stores/requirement-store'
import { useRiskStore } from '@/stores/risk-store'
import { useTeamStore } from '@/stores/team-store'
import { useObservationStore } from '@/stores/observation-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useAuthStore } from '@/stores/auth-store'
import { exportCorrespondenceLocalized } from '@/lib/export'
import type { Correspondence, Requirement as RequirementType } from '@/types'

// Risk type for heatmap display (mapped from risk-store)
interface HeatmapRisk {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  likelihood: 'low' | 'medium' | 'high'
  impact: number
  probability: number
}

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

export default function CorrespondenceFeedPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()

  // Stores
  const correspondenceStore = useCorrespondenceStore()
  const requirementStore = useRequirementStore()
  const riskStore = useRiskStore()
  const teamStore = useTeamStore()
  const observationStore = useObservationStore()
  const policyStore = usePolicyStore()
  const trainingStore = useTrainingStore()
  const authStore = useAuthStore()

  // Modal states
  const [isNewCorrespondenceOpen, setIsNewCorrespondenceOpen] = useState(false)
  const [isRiskMatrixOpen, setIsRiskMatrixOpen] = useState(false)
  const [isLetterDetailOpen, setIsLetterDetailOpen] = useState(false)
  const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false)
  const [isAddRequirementOpen, setIsAddRequirementOpen] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<Correspondence | null>(null)
  const [selectedCellRisks, setSelectedCellRisks] = useState<HeatmapRisk[] | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // New correspondence form state
  const [newCorrespondenceTo, setNewCorrespondenceTo] = useState('')
  const [newCorrespondenceSubject, setNewCorrespondenceSubject] = useState('')
  const [newCorrespondenceBody, setNewCorrespondenceBody] = useState('')

  // Correspondence feed filter
  const [correspondenceFilter, setCorrespondenceFilter] = useState<'active' | 'archived' | 'all'>('active')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Map risk-store data to heatmap shape
  const risks: HeatmapRisk[] = useMemo(() => {
    return riskStore.risks.map(r => {
      const score = r.likelihood * r.impact
      let severity: HeatmapRisk['severity'] = 'low'
      if (score >= 20) severity = 'critical'
      else if (score >= 12) severity = 'high'
      else if (score >= 6) severity = 'medium'

      let likelihood: HeatmapRisk['likelihood'] = 'low'
      if (r.likelihood >= 4) likelihood = 'high'
      else if (r.likelihood >= 3) likelihood = 'medium'

      return {
        id: r.id,
        name: r.title,
        severity,
        likelihood,
        impact: r.impact,
        probability: r.likelihood,
      }
    })
  }, [riskStore.risks])

  // Computed metrics
  const samaSubmissionCount = useMemo(() => {
    const now = new Date()
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    return correspondenceStore.correspondence.filter(c =>
      c.type === 'sama' && new Date(c.date) >= qStart
    ).length
  }, [correspondenceStore.correspondence])

  const currentQuarterLabel = useMemo(() => {
    const now = new Date()
    const q = Math.floor(now.getMonth() / 3) + 1
    return `Q${q} ${now.getFullYear()}`
  }, [])

  const openObservationCount = useMemo(() =>
    observationStore.observations.filter(o => o.status === 'open').length,
    [observationStore.observations]
  )

  const saudizationRate = useMemo(() => {
    const members = teamStore.members
    if (members.length === 0) return 0
    const saudiCount = members.filter(m => m.nationality === 'Saudi').length
    return Math.round((saudiCount / members.length) * 100)
  }, [teamStore.members])

  const trainingCompletionRate = useMemo(() => {
    const trainings = trainingStore.trainings
    if (trainings.length === 0) return 0
    const total = trainings.reduce((sum, t) => sum + t.completionRate, 0)
    return Math.round(total / trainings.length)
  }, [trainingStore.trainings])

  const policyStats = useMemo(() => {
    const policies = policyStore.policies
    if (policies.length === 0) return { currentPct: 0, expiredCount: 0 }
    const active = policies.filter(p => p.status === 'active').length
    const archived = policies.filter(p => p.status === 'archived').length
    return {
      currentPct: policies.length > 0 ? Math.round((active / policies.length) * 100) : 0,
      expiredCount: archived,
    }
  }, [policyStore.policies])

  // Nearest upcoming requirement
  const nearestDueRequirement = useMemo(() => {
    const now = new Date()
    return requirementStore.requirements
      .filter(r => r.status !== 'completed' && new Date(r.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] || null
  }, [requirementStore.requirements])

  // Next policy review
  const nextPolicyReview = useMemo(() => {
    const now = new Date()
    return policyStore.policies
      .filter(p => p.status === 'active' && new Date(p.nextReviewDate) > now)
      .sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime())[0] || null
  }, [policyStore.policies])

  // Top 3 requirements for summary view
  const topRequirements = useMemo(() => {
    return requirementStore.requirements.slice(0, 3)
  }, [requirementStore.requirements])

  const handleViewLetter = (letter: Correspondence) => {
    setSelectedLetter(letter)
    setIsLetterDetailOpen(true)
  }

  const handleReply = (letter: Correspondence) => {
    setSelectedLetter(letter)
    setIsReplyComposerOpen(true)
  }

  const handleArchive = (letterId: string) => {
    const letter = correspondenceStore.correspondence.find(l => l.id === letterId)
    if (letter) {
      correspondenceStore.update(letterId, { archived: !letter.archived })
      showToast(letter.archived ? t('correspondence.letterUnarchived') : t('correspondence.letterArchived'))
    }
    setIsLetterDetailOpen(false)
  }

  const handleReviewFile = () => {
    showToast(t('correspondence.openingPrmReport'))
  }

  // Risk counts for heatmap display
  const riskCounts = {
    critical: risks.filter(r => r.severity === 'critical').length,
    high: risks.filter(r => r.severity === 'high').length,
    medium: risks.filter(r => r.severity === 'medium').length,
    low: risks.filter(r => r.severity === 'low').length,
  }

  // Get risks for a specific matrix cell
  const getRisksForCell = (impact: number, likelihood: 'low' | 'medium' | 'high'): HeatmapRisk[] => {
    return risks.filter(r => r.impact === impact && r.likelihood === likelihood)
  }

  // Get cell style based on combined risk score (using inline styles for Tailwind v4 compatibility)
  const getCellStyle = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
    const score = impact * likelihoodScore
    if (score >= 16) return { bg: 'rgba(244, 63, 94, 0.2)', border: 'rgb(244, 63, 94)' }      // rose-500
    if (score >= 12) return { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' }    // orange-500
    if (score >= 8) return { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgb(251, 191, 36)' }     // amber-400
    return { bg: 'rgba(96, 165, 250, 0.2)', border: 'rgb(96, 165, 250)' }                      // blue-400
  }

  const getCellDotColor = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
    const score = impact * likelihoodScore
    if (score >= 16) return 'rgb(244, 63, 94)'    // rose-500
    if (score >= 12) return 'rgb(249, 115, 22)'   // orange-500
    if (score >= 8) return 'rgb(251, 191, 36)'    // amber-400
    return 'rgb(96, 165, 250)'                     // blue-400
  }

  const handleCellClick = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const cellRisks = getRisksForCell(impact, likelihood)
    if (cellRisks.length > 0) {
      setSelectedCellRisks(cellRisks)
    } else {
      showToast(t('correspondence.noRisksInCategory'))
    }
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('correspondence.title' as TranslationKey)}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('correspondence.subtitle' as TranslationKey)}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/sama-letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('observations.samaLetters' as TranslationKey)}
            </Link>
            <Link href="/correspondence/regulatory-updates" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates' as TranslationKey)}
            </Link>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker' as TranslationKey)}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link href="/correspondence/feed" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/feed') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:mail" className="text-base" />
              {t('correspondence.tabs.correspondence' as TranslationKey)}
            </Link>
            <Link href="/correspondence/advisory" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/advisory') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:message-circle-question" className="text-base" />
              {t('correspondence.tabs.advisory' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={() => setIsNewCorrespondenceOpen(true)}
            className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <Icon icon="lucide:plus" />
            {t('correspondence.newCorrespondence')}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        <div className="space-y-8">

          {/* Metrics Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              icon="lucide:file-check"
              iconColor="emerald"
              label={t('correspondence.samaSubmissions')}
              title={t('correspondence.samaSubmissions')}
              value={String(samaSubmissionCount)}
              subtitle={currentQuarterLabel}
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:alert-circle"
              iconColor="rose"
              label={t('correspondence.auditObservations')}
              title={t('correspondence.auditObservations')}
              value={String(openObservationCount)}
              subtitle={t('correspondence.openFindings')}
              progress={openObservationCount > 0 ? Math.min(100, openObservationCount * 8) : 0}
              progressColor="bg-rose-500"
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:shield-check"
              iconColor="blue"
              label={saudizationRate > 0 ? t('correspondence.onTarget') : ''}
              title={t('correspondence.saudizationRate')}
              value={`${saudizationRate}%`}
              subtitle={t('correspondence.target', { value: '40%' })}
              progress={saudizationRate > 0 ? Math.min(100, Math.round((saudizationRate / 40) * 100)) : 0}
              progressColor="bg-blue-500"
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:graduation-cap"
              iconColor="amber"
              label={trainingCompletionRate > 0 ? `${trainingCompletionRate}% ${t('correspondence.complete')}` : ''}
              title={t('correspondence.mandatoryTraining')}
              value={`${trainingCompletionRate}%`}
              subtitle={t('correspondence.employeesCertified')}
              progress={trainingCompletionRate}
              progressColor="bg-amber-500"
              isRTL={isRTL}
            />
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-12 gap-8">
            {/* Central Tracker: Regulatory Rules */}
            <div className="col-span-12 lg:col-span-8 space-y-8">
              {/* Regulatory Tracker */}
              <section className="glass-card rounded-3xl p-6">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-lg font-bold font-display text-slate-900">
                      {t('correspondence.regulatoryTracker')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('correspondence.trackerSubtitle')}
                    </p>
                  </div>
                  <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <button
                      onClick={() => setIsAddRequirementOpen(true)}
                      className={`text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
                    >
                      <Icon icon="lucide:plus-circle" className="text-lg" />
                      {t('correspondence.addRequirement')}
                    </button>
                    <Link
                      href="/correspondence/registry"
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                    >
                      {t('correspondence.viewFullRegistry')} {isRTL ? '\u2190' : '\u2192'}
                    </Link>
                  </div>
                </div>

                <div className="space-y-4">
                  {topRequirements.map((req) => (
                    <RequirementRow key={req.id} requirement={req} t={t} isRTL={isRTL} />
                  ))}
                  {topRequirements.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noRequirements')}</p>
                  )}
                </div>
              </section>

              {/* Letter Correspondence and Policy Status */}
              <div className="grid grid-cols-2 gap-8">
                {/* Letter Correspondence */}
                <section className="glass-card rounded-3xl p-6">
                  <div className={`flex justify-between items-center mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <h3 className={`text-sm font-bold text-slate-900 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <Icon icon="lucide:mail" className="text-slate-400" />
                      {t('correspondence.correspondenceFeed')}
                    </h3>
                    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <select
                        value={correspondenceFilter}
                        onChange={(e) => setCorrespondenceFilter(e.target.value as 'active' | 'archived' | 'all')}
                        className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="active">{t('correspondence.filterActive')}</option>
                        <option value="archived">{t('correspondence.filterArchived')}</option>
                        <option value="all">{t('correspondence.filterAll')}</option>
                      </select>
                      {correspondenceStore.correspondence.length > 0 && (
                        <button
                          onClick={() => {
                            exportCorrespondenceLocalized(correspondenceStore.correspondence, 'correspondence', t, isRTL)
                            showToast(t('correspondence.exportToCsv'))
                          }}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          <Icon icon="lucide:download" className="text-sm" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {correspondenceStore.correspondence
                      .filter(l => correspondenceFilter === 'all' ? true : correspondenceFilter === 'archived' ? l.archived : !l.archived)
                      .map((letter) => (
                        <CorrespondenceItem
                          key={letter.id}
                          letter={letter}
                          onView={() => handleViewLetter(letter)}
                          onReply={() => handleReply(letter)}
                          onArchive={() => handleArchive(letter.id)}
                          t={t}
                          isRTL={isRTL}
                        />
                      ))}
                    {correspondenceStore.correspondence
                      .filter(l => correspondenceFilter === 'all' ? true : correspondenceFilter === 'archived' ? l.archived : !l.archived)
                      .length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noCorrespondence')}</p>
                    )}
                  </div>
                </section>

                {/* Policy Status */}
                <section className="glass-card rounded-3xl p-6">
                  <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:scroll-text" className="text-slate-400" />
                    {t('correspondence.policyReview')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {t('correspondence.current')}
                      </span>
                      <p className="text-xl font-bold text-slate-900">{policyStats.currentPct}%</p>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                      <span className="text-[10px] font-black text-rose-500 uppercase">
                        {t('correspondence.expired')}
                      </span>
                      <p className="text-xl font-bold text-rose-600">{policyStats.expiredCount}</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center justify-between text-[10px] font-bold text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {nextPolicyReview ? (
                      <>
                        <span>{t('correspondence.nextReview')}: {nextPolicyReview.name}</span>
                        <span className="text-blue-600">
                          {new Date(nextPolicyReview.nextReviewDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">{t('correspondence.noUpcomingReviews')}</span>
                    )}
                  </div>
                </section>
              </div>
            </div>

            {/* Sidebar Components */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              {/* Risk Register Summary */}
              <section className="rounded-3xl p-6 bg-slate-900 text-white">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h2 className="text-lg font-bold font-display">{t('correspondence.riskHeatmap')}</h2>
                  <Icon icon="lucide:trending-up" className="text-emerald-400 text-xl" />
                </div>
                <div className="space-y-4">
                  <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('observations.severity')}</span>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('common.items')}</span>
                  </div>
                  {(() => {
                    const totalRisks = risks.length || 1
                    return (
                      <div className="space-y-3">
                        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500" style={{ width: `${(riskCounts.critical / totalRisks) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.critical')} ({riskCounts.critical})</span>
                        </div>
                        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500" style={{ width: `${(riskCounts.high / totalRisks) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.high')} ({riskCounts.high})</span>
                        </div>
                        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${(riskCounts.medium / totalRisks) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.medium')} ({riskCounts.medium})</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <button
                  className="w-full mt-6 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  onClick={() => setIsRiskMatrixOpen(true)}
                >
                  {t('correspondence.fullRiskAnalysis')}
                </button>
              </section>

              {/* Team Workload */}
              <section className="glass-card rounded-3xl p-6">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                    {t('correspondence.teamCapacity')}
                  </h2>
                  <button onClick={() => showToast('Team options menu')} className="cursor-pointer">
                    <Icon
                      icon="lucide:more-horizontal"
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    />
                  </button>
                </div>
                <div className="space-y-5">
                  {teamStore.members.map((member) => (
                    <TeamMemberRow key={member.id} member={{ name: member.name, avatar: member.avatar || member.name, load: member.workload, role: member.role }} />
                  ))}
                  {teamStore.members.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noMembers')}</p>
                  )}
                </div>
              </section>

              {/* Upcoming Submission */}
              <section className="glass-card rounded-3xl p-6 border-emerald-100 bg-emerald-50/20">
                <h2 className={`text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                  {t('correspondence.upcomingSubmission')}
                </h2>
                {nearestDueRequirement ? (
                  <div className={`bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm ${isRTL ? 'text-right' : ''}`}>
                    <p className="text-sm font-bold text-slate-900">{nearestDueRequirement.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{nearestDueRequirement.category}</p>
                    <div className={`flex items-center justify-between mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs font-bold text-rose-500">
                        {new Date(nearestDueRequirement.dueDate).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <button
                        onClick={handleReviewFile}
                        className="text-[10px] px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        {t('correspondence.reviewFile')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm ${isRTL ? 'text-right' : ''}`}>
                    <p className="text-sm text-slate-400 text-center py-2">{t('correspondence.noUpcomingSubmissions')}</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* New Correspondence Modal */}
      <Modal
        isOpen={isNewCorrespondenceOpen}
        onClose={() => setIsNewCorrespondenceOpen(false)}
        title={t('correspondence.newCorrespondence')}
        subtitle={t('common.createNew')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.to')}</label>
            <input
              type="text"
              value={newCorrespondenceTo}
              onChange={(e) => setNewCorrespondenceTo(e.target.value)}
              placeholder={t('common.enterRecipient')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.subject')}</label>
            <input
              type="text"
              value={newCorrespondenceSubject}
              onChange={(e) => setNewCorrespondenceSubject(e.target.value)}
              placeholder={t('common.enterSubject')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.message')}</label>
            <textarea
              rows={8}
              value={newCorrespondenceBody}
              onChange={(e) => setNewCorrespondenceBody(e.target.value)}
              placeholder={t('common.typeMessage')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => {
                if (!newCorrespondenceSubject || !newCorrespondenceTo) {
                  showToast(t('correspondence.fillRequiredFields'))
                  return
                }
                correspondenceStore.create({
                  subject: newCorrespondenceSubject,
                  from: authStore.user?.name || 'Compliance Department',
                  to: [newCorrespondenceTo],
                  date: new Date().toISOString(),
                  type: 'external',
                  status: 'sent',
                  body: newCorrespondenceBody,
                  attachments: [],
                  archived: false,
                })
                setNewCorrespondenceTo('')
                setNewCorrespondenceSubject('')
                setNewCorrespondenceBody('')
                setIsNewCorrespondenceOpen(false)
                showToast(t('correspondence.correspondenceSent'))
              }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:send" className="text-lg" />
              {t('correspondence.send')}
            </button>
            <button
              onClick={() => {
                if (newCorrespondenceSubject) {
                  correspondenceStore.create({
                    subject: newCorrespondenceSubject,
                    from: authStore.user?.name || 'Compliance Department',
                    to: newCorrespondenceTo ? [newCorrespondenceTo] : [],
                    date: new Date().toISOString(),
                    type: 'external',
                    status: 'draft',
                    body: newCorrespondenceBody,
                    attachments: [],
                    archived: false,
                  })
                }
                setNewCorrespondenceTo('')
                setNewCorrespondenceSubject('')
                setNewCorrespondenceBody('')
                setIsNewCorrespondenceOpen(false)
                showToast(t('correspondence.saveAsDraft'))
              }}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('correspondence.saveAsDraft')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reply Composer Modal */}
      <Modal
        isOpen={isReplyComposerOpen}
        onClose={() => setIsReplyComposerOpen(false)}
        title={t('correspondence.reply')}
        subtitle={`RE: ${selectedLetter?.reference || t('correspondence.newCorrespondence')}`}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.to')}</label>
            <input
              type="text"
              value="SAMA - Compliance Department"
              readOnly
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.subject')}</label>
            <input
              type="text"
              placeholder={t('common.enterSubject')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.message')}</label>
            <textarea
              rows={8}
              placeholder={t('common.typeReply')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => { setIsReplyComposerOpen(false); showToast(t('correspondence.replySentSuccess')); }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:send" className="text-lg" />
              {t('correspondence.sendReply')}
            </button>
            <button
              onClick={() => setIsReplyComposerOpen(false)}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Risk Matrix Modal */}
      <Modal
        isOpen={isRiskMatrixOpen}
        onClose={() => { setIsRiskMatrixOpen(false); setSelectedCellRisks(null); }}
        title={selectedCellRisks ? `${t('correspondence.riskHeatmap')}: ${t('correspondence.impact')} ${selectedCellRisks[0]?.impact}, ${t('correspondence.likelihood')} ${selectedCellRisks[0]?.likelihood}` : t('correspondence.riskAnalysisMatrix')}
        subtitle={selectedCellRisks ? `${selectedCellRisks.length} ${t('common.items')}` : t('correspondence.comprehensiveRiskAssessment')}
        size="lg"
      >
        {selectedCellRisks ? (
          // Cell Detail View
          <div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto hide-scrollbar">
              {selectedCellRisks.map(risk => {
                const severityColors: Record<string, string> = {
                  critical: 'bg-rose-100 text-rose-700 border-rose-200',
                  high: 'bg-orange-100 text-orange-700 border-orange-200',
                  medium: 'bg-amber-100 text-amber-700 border-amber-200',
                  low: 'bg-blue-100 text-blue-700 border-blue-200'
                }
                return (
                  <div key={risk.id} className={cn('p-4 border rounded-lg', severityColors[risk.severity])}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{risk.name}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">{t(`correspondence.${risk.severity}`)}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">{t('correspondence.impact')}: {risk.impact}</span>
                        </div>
                      </div>
                      <button className="text-slate-600 hover:text-slate-900 cursor-pointer">
                        <Icon icon="lucide:arrow-right" className="text-lg" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setSelectedCellRisks(null)}
              className="w-full mt-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('correspondence.backToMatrix')}
            </button>
          </div>
        ) : (
          // Matrix View
          <div>
            {/* Legend */}
            <div className="mb-6 flex items-center gap-4 justify-center pb-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-rose-500 rounded" />
                <span className="text-xs font-bold text-slate-600">{t('correspondence.critical')} ({riskCounts.critical})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded" />
                <span className="text-xs font-bold text-slate-600">{t('correspondence.high')} ({riskCounts.high})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-400 rounded" />
                <span className="text-xs font-bold text-slate-600">{t('correspondence.medium')} ({riskCounts.medium})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-400 rounded" />
                <span className="text-xs font-bold text-slate-600">{t('correspondence.low')} ({riskCounts.low})</span>
              </div>
            </div>

            {/* Matrix */}
            <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
              <div className="flex items-center justify-center mb-4">
                <span className="text-sm font-bold text-slate-600">{t('correspondence.likelihood')} {isRTL ? '\u2190' : '\u2192'}</span>
              </div>

              {/* Header Row */}
              {(() => {
                const likelihoodColumns = isRTL
                  ? ['high', 'medium', 'low'] as const
                  : ['low', 'medium', 'high'] as const;
                return (
                  <>
                    <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6 mb-4">
                      <div />
                      {likelihoodColumns.map(col => (
                        <div key={col} className="text-xs font-bold text-slate-600 text-center">
                          {t(`correspondence.${col}` as const)}
                        </div>
                      ))}
                    </div>

                    {/* Matrix Rows */}
                    <div className="relative">
                      <div className="impact-label-vertical">{t('correspondence.impact')} {isRTL ? '\u2190' : '\u2192'}</div>
                      <div className="space-y-3">
                        {[5, 4, 3, 2, 1].map(impact => {
                          const impactLabels: Record<number, string> = {
                            5: t('correspondence.critical5'),
                            4: t('correspondence.high4'),
                            3: t('correspondence.medium3'),
                            2: t('correspondence.low2'),
                            1: t('correspondence.veryLow1')
                          }
                          return (
                            <div key={impact} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6">
                              <div className="flex items-center justify-end pr-4 text-xs font-bold text-slate-600">
                                {impactLabels[impact]}
                              </div>
                              {likelihoodColumns.map(likelihood => {
                                const cellRisks = getRisksForCell(impact, likelihood)
                                const cellStyle = getCellStyle(impact, likelihood)
                                const dotColor = getCellDotColor(impact, likelihood)
                                return (
                                  <div
                                    key={likelihood}
                                    onClick={() => handleCellClick(impact, likelihood)}
                                    className="risk-matrix-cell rounded-lg p-4 flex flex-wrap gap-2 cursor-pointer border-2 transition-all hover:scale-105 hover:shadow-lg"
                                    style={{ height: '110px', backgroundColor: cellStyle.bg, borderColor: cellStyle.border }}
                                  >
                                    {cellRisks.map((risk, idx) => (
                                      <div
                                        key={risk.id}
                                        className="risk-dot w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                        style={{ backgroundColor: dotColor }}
                                        title={risk.name}
                                      >
                                        {idx + 1}
                                      </div>
                                    ))}
                                    {cellRisks.length === 0 && (
                                      <span className="text-xs text-slate-400 text-center w-full">-</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Info Box */}
            <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 ${isRTL ? 'text-right' : ''}`}>
              <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Icon icon="lucide:info" className="text-blue-600 text-xl shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-900">{t('correspondence.interactiveMatrix')}</p>
                  <p className="text-xs text-blue-700 mt-1">{t('correspondence.clickCellToView')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Letter Detail Modal */}
      <Modal
        isOpen={isLetterDetailOpen}
        onClose={() => setIsLetterDetailOpen(false)}
        title={selectedLetter?.subject || t('correspondence.letterDetails')}
        subtitle={selectedLetter ? `REF: ${selectedLetter.reference || selectedLetter.id}` : undefined}
        size="lg"
      >
        {selectedLetter && (
          <div className="space-y-4">
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.status')}</p>
              <p className="text-sm font-bold text-slate-900">{selectedLetter.status === 'sent' ? t('correspondence.sentToSama') : t('common.draft')}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.date')}</p>
              <p className="text-sm font-bold text-slate-900">{new Date(selectedLetter.date).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('correspondence.content')}</p>
              <p className="text-sm text-slate-700">{selectedLetter.body}</p>
            </div>
            {selectedLetter.assignee && (
              <div className={`bg-emerald-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('correspondence.assignedTo')}</p>
                <p className="text-sm font-bold text-slate-900">{selectedLetter.assignee}</p>
              </div>
            )}
            <div className={`flex gap-3 pt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => { setIsLetterDetailOpen(false); handleReply(selectedLetter); }}
                className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <Icon icon="lucide:reply" className="text-lg" />
                {t('correspondence.reply')}
              </button>
              <button
                onClick={() => handleArchive(selectedLetter.id)}
                className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {selectedLetter.archived ? t('correspondence.unarchive') : t('correspondence.archive')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Requirement Modal */}
      <Modal
        isOpen={isAddRequirementOpen}
        onClose={() => setIsAddRequirementOpen(false)}
        title={t('correspondence.addNewRequirement')}
        subtitle={t('correspondence.createNewEntry')}
        size="lg"
      >
        <AddRequirementForm
          t={t}
          isRTL={isRTL}
          onSuccess={() => { setIsAddRequirementOpen(false); showToast(t('correspondence.requirementAdded')); }}
          onValidationError={() => showToast(t('correspondence.fillRequiredFields'))}
        />
      </Modal>
    </div>
  )
}

// Add Requirement Form Component
function AddRequirementForm({ t, isRTL, onSuccess, onValidationError }: { t: (key: TranslationKey) => string; isRTL: boolean; onSuccess: () => void; onValidationError: () => void }) {
  const requirementStore = useRequirementStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomCategory, setShowCustomCategory] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    releaseDate: '',
    status: '',
    dueDate: '',
    description: ''
  })

  const handleSubmit = () => {
    // Validation
    if (!formData.name || !formData.category || !formData.releaseDate || !formData.status) {
      onValidationError()
      return
    }

    setIsSubmitting(true)
    requirementStore.create({
      name: formData.name,
      category: formData.category,
      releaseDate: formData.releaseDate,
      status: formData.status as RequirementType['status'],
      dueDate: formData.dueDate || formData.releaseDate,
      description: formData.description,
      progress: formData.status === 'completed' ? 100 : formData.status === 'pending' ? 0 : 10,
    })
    setIsSubmitting(false)
    onSuccess()
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.requirementName')} *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., SAMA Circular 44321/2024 - Cybersecurity Framework"
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.category')} *</label>
            <select
              value={formData.category}
              onChange={(e) => {
                setShowCustomCategory(e.target.value === 'custom')
                setFormData(prev => ({ ...prev, category: e.target.value === 'custom' ? '' : e.target.value }))
              }}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectCategory')}</option>
              <option value="Cybersecurity">{t('correspondence.cybersecurity')}</option>
              <option value="AML/CTF">{t('correspondence.amlCtf')}</option>
              <option value="Consumer Protection">{t('correspondence.consumerProtection')}</option>
              <option value="Risk Management">{t('correspondence.riskManagement')}</option>
              <option value="Data Protection">{t('correspondence.dataProtection')}</option>
              <option value="Governance">{t('correspondence.governance')}</option>
              <option value="custom">{t('correspondence.addNewCategory')}</option>
            </select>
          </div>
          {showCustomCategory ? (
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.newCategoryName')}</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder={t('common.enterCategory')}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
          ) : (
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.releaseDate')} *</label>
              <input
                type="date"
                value={formData.releaseDate}
                onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.complianceStatus')} *</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectStatus')}</option>
              <option value="pending">{t('common.pending')}</option>
              <option value="drafting">{t('correspondence.drafting')}</option>
              <option value="implementing">{t('correspondence.implementing')}</option>
              <option value="completed">{t('common.completed')}</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('observations.dueDate')}</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.descriptionOptional')}</label>
          <textarea
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('correspondence.addDetailedDescription')}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>
      </div>

      <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 ${isRTL ? 'text-right' : ''}`}>
        <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:info" className="text-blue-600 text-xl shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900">{t('correspondence.requiredFields')}</p>
            <p className="text-xs text-blue-700 mt-1">{t('correspondence.requiredFieldsNote')}</p>
          </div>
        </div>
      </div>

      <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          {isSubmitting ? (
            <>
              <Icon icon="lucide:loader-2" className="text-lg animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" className="text-lg" />
              {t('correspondence.addRequirement')}
            </>
          )}
        </button>
        <button className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer">
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

// Sub-components
function MetricCard({
  icon,
  iconColor,
  label,
  title,
  value,
  subtitle,
  progress,
  progressColor = 'bg-emerald-500',
  progressSegments,
  isRTL = false,
}: {
  icon: string
  iconColor: 'emerald' | 'rose' | 'blue' | 'amber'
  label: string
  title: string
  value: string
  subtitle: string
  progress?: number
  progressColor?: string
  progressSegments?: { color: string; flex: number }[]
  isRTL?: boolean
}) {
  const iconColors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  }

  const labelColors = {
    emerald: 'text-emerald-600 bg-emerald-50',
    rose: 'text-rose-600 bg-rose-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
  }

  return (
    <div className={`glass-card stat-card-hover p-6 rounded-2xl ${isRTL ? 'text-right' : ''}`}>
      <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`p-2 ${iconColors[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-2xl" />
        </div>
        <span className={`text-[10px] font-bold ${labelColors[iconColor]} px-2 py-0.5 rounded-full`}>
          {label}
        </span>
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      {progressSegments && (
        <div className={`mt-4 flex gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {progressSegments.map((segment, i) => (
            <div
              key={i}
              className={`h-1.5 ${segment.color} rounded-full`}
              style={{ flex: segment.flex }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequirementRow({ requirement, t, isRTL }: { requirement: RequirementType; t: (key: TranslationKey, params?: Record<string, string | number>) => string; isRTL: boolean }) {
  const statusConfig = {
    implementing: { bg: 'bg-amber-100', text: 'text-amber-700', label: t('correspondence.implementing') },
    drafting: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('correspondence.drafting') },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('correspondence.verified') },
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', label: t('common.pending') },
  }

  const config = statusConfig[requirement.status]
  const isCompleted = requirement.status === 'completed'

  // Compute due text from dueDate
  const now = new Date()
  const due = new Date(requirement.dueDate)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dueText = isCompleted ? t('common.completed') : diffDays <= 0 ? t('correspondence.overdue') : t('correspondence.dueInDays', { count: String(diffDays) })
  const isDueSoon = diffDays <= 7 && diffDays > 0

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl border ${isCompleted ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'} ${isRTL ? 'flex-row-reverse' : ''}`}
    >
      <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
          <Icon
            icon={isCompleted ? 'lucide:check-circle' : 'lucide:landmark'}
            className={isCompleted ? 'text-emerald-500' : 'text-slate-400'}
          />
        </div>
        <div className={isRTL ? 'text-right' : ''}>
          <p className="text-sm font-bold text-slate-900">{requirement.name}</p>
          <p className="text-[10px] text-slate-500">{requirement.description || requirement.category}</p>
        </div>
      </div>
      <div className={`flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={isRTL ? 'text-left' : 'text-right'}>
          <span
            className={`text-[10px] font-black uppercase ${isDueSoon ? 'text-rose-500' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            {dueText}
          </span>
          <div className="h-1 w-24 bg-slate-200 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${isCompleted ? 'bg-emerald-500' : isDueSoon ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${requirement.progress}%` }}
            />
          </div>
        </div>
        <span className={`px-3 py-1 ${config.bg} ${config.text} text-[10px] font-bold rounded-full`}>
          {config.label}
        </span>
      </div>
    </div>
  )
}

function CorrespondenceItem({
  letter,
  onView,
  onReply,
  onArchive,
  t,
  isRTL
}: {
  letter: Correspondence
  onView: () => void
  onReply: () => void
  onArchive: () => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  isRTL: boolean
}) {
  const isSent = letter.status === 'sent'

  // Format relative date
  const dateDisplay = (() => {
    const d = new Date(letter.date)
    if (isNaN(d.getTime())) return letter.date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 1) return t('correspondence.justNow')
    if (diffHours < 24) return t('correspondence.hoursAgo', { count: String(diffHours) })
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return t('correspondence.daysAgo', { count: String(diffDays) })
    return d.toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')
  })()

  return (
    <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full ${isSent ? 'bg-blue-100' : 'bg-slate-100'} flex items-center justify-center shrink-0`}
      >
        <Icon
          icon={isSent ? 'lucide:arrow-up-right' : 'lucide:pencil'}
          className={`${isSent ? 'text-blue-600' : 'text-slate-600'} text-sm`}
        />
      </div>
      <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
        <p className="text-xs font-bold text-slate-900">{letter.subject}</p>
        <p className="text-[10px] text-slate-500">{letter.body}</p>
        <p className="text-[9px] text-slate-400 mt-1">
          {letter.status === 'draft' ? t('common.draft') : dateDisplay} {letter.reference && `- REF: ${letter.reference}`}
        </p>
        {letter.assignee && (
          <p className="text-[9px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">
            {t('correspondence.assignedTo')}: {letter.assignee}
          </p>
        )}
        <div className={`flex gap-2 mt-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
          <button
            onClick={onView}
            className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
          >
            {t('common.view')}
          </button>
          {isSent && (
            <button
              onClick={onReply}
              className="text-[9px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {t('correspondence.reply')}
            </button>
          )}
          <button
            onClick={onArchive}
            className="text-[9px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            {letter.archived ? t('correspondence.unarchive') : t('correspondence.archive')}
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamMemberRow({
  member,
}: {
  member: { name: string; avatar: string; load: number; role: string }
}) {
  // Color logic matching HTML: >80 = rose, >50 = blue, else = emerald
  const getLoadColor = (load: number) => {
    if (load > 80) return { text: 'text-rose-500', bar: 'bg-rose-500' }
    if (load > 50) return { text: 'text-blue-500', bar: 'bg-blue-500' }
    return { text: 'text-emerald-500', bar: 'bg-emerald-500' }
  }

  const colors = getLoadColor(member.load)

  return (
    <div className="flex items-center gap-3">
      <img
        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
        className="w-8 h-8 rounded-full border border-slate-200"
        alt={member.name}
      />
      <div className="flex-1">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span>{member.name}</span>
          <span className={colors.text}>{member.load}%</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full">
          <div
            className={`h-full ${colors.bar} rounded-full`}
            style={{ width: `${member.load}%` }}
          />
        </div>
      </div>
    </div>
  )
}
