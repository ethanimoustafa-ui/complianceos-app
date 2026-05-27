'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useCircularStore } from '@/stores/circular-store'
import { useLetterStore } from '@/stores/letter-store'
import { useRiskStore } from '@/stores/risk-store'
import { useTeamStore } from '@/stores/team-store'
import { useObservationStore } from '@/stores/observation-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useAuthStore } from '@/stores/auth-store'
import { exportCorrespondenceLocalized } from '@/lib/export'
import type { Correspondence, Circular } from '@/types'
import { useFormattedDate } from '@/hooks/useFormattedDate'
import { formatDateWithPreference } from '@/lib/date-format'
import { formatLocalizedQuarter } from '@/lib/format-date'
import { useUserPreferencesStore } from '@/stores/user-preferences-store'
import { dicebearAvatar } from '@/lib/avatar'
import { Gate } from '@/components/auth/gate'
import { useTeamWorkloads } from '@/hooks/useWorkload'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { resolveAuthorityCode } from '@/lib/authority-display'
import { formatPolicyStatus } from '@/lib/format/enum'
import { useCorrespondenceTypeStore } from '@/stores/correspondence-type-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { Skeleton } from '@/components/ui/skeleton'

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

type UpcomingItem = {
  id: string
  name: string
  subtitle: string
  dueDate: string
  source: 'registry' | 'sama-letter' | 'observation'
  authority?: string
}

export default function CorrespondenceFeedPage() {
  const { t, isRTL, language } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { formatDate } = useFormattedDate()

  // Stores
  const correspondenceStore = useCorrespondenceStore()
  const circularStore = useCircularStore()
  const riskStore = useRiskStore()
  const teamStore = useTeamStore()
  const observationStore = useObservationStore()
  const letterStore = useLetterStore()
  const policyStore = usePolicyStore()
  const trainingStore = useTrainingStore()
  const authStore = useAuthStore()
  const teamWorkloads = useTeamWorkloads(teamStore.members)

  // F3: skeleton gating — show shimmer on first fetch (isLoading + empty list).
  const isFeedLoading = correspondenceStore.isLoading && correspondenceStore.correspondence.length === 0
  const isCircularsLoading = circularStore.isLoading && circularStore.circulars.length === 0
  const isTeamLoading = teamStore.isLoading && teamStore.members.length === 0

  // Correspondence type store — seeded with the legacy literal union, but
  // user-added types persist and round-trip via the widened Correspondence.type.
  const correspondenceTypes = useCorrespondenceTypeStore((s) => s.types)
  const addCorrespondenceType = useCorrespondenceTypeStore((s) => s.add)
  const updateCorrespondenceType = useCorrespondenceTypeStore((s) => s.update)
  const removeCorrespondenceType = useCorrespondenceTypeStore((s) => s.remove)

  // Hydrate server-state on mount — refreshing the page must repopulate the
  // many Zustand slices this feed aggregates (Fix-1).
  const fetchCorrespondence = useCorrespondenceStore((s) => s.fetchAll)
  const fetchCirculars = useCircularStore((s) => s.fetchAll)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const fetchRisks = useRiskStore((s) => s.fetchAll)
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  const fetchObservations = useObservationStore((s) => s.fetchAll)
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  const fetchEmployees = useTrainingStore((s) => s.fetchEmployees)
  const fetchCourses = useTrainingStore((s) => s.fetchCourses)
  const fetchCorrespondenceTypes = useCorrespondenceTypeStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchCorrespondence()
    void fetchCirculars()
    void fetchLetters()
    void fetchRisks()
    void fetchTeam()
    void fetchObservations()
    void fetchPolicies()
    void fetchEmployees()
    void fetchCourses()
    void fetchCorrespondenceTypes()
  }, [
    fetchCorrespondence,
    fetchCirculars,
    fetchLetters,
    fetchRisks,
    fetchTeam,
    fetchObservations,
    fetchPolicies,
    fetchEmployees,
    fetchCourses,
    fetchCorrespondenceTypes,
  ])

  // Modal states
  const [isNewCorrespondenceOpen, setIsNewCorrespondenceOpen] = useState(false)
  const [isRiskMatrixOpen, setIsRiskMatrixOpen] = useState(false)
  const [isLetterDetailOpen, setIsLetterDetailOpen] = useState(false)
  const [isFeedAllOpen, setIsFeedAllOpen] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<Correspondence | null>(null)
  const [selectedCellRisks, setSelectedCellRisks] = useState<HeatmapRisk[] | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // New correspondence form state
  const [newCorrespondenceTo, setNewCorrespondenceTo] = useState('')
  const [newCorrespondenceSubject, setNewCorrespondenceSubject] = useState('')
  const [newCorrespondenceBody, setNewCorrespondenceBody] = useState('')
  const [newCorrespondenceType, setNewCorrespondenceType] = useState<Correspondence['type']>('internal')
  const [newCorrespondenceAssignee, setNewCorrespondenceAssignee] = useState('')

  // Correspondence feed filter
  const [correspondenceFilter, setCorrespondenceFilter] = useState<'active' | 'archived' | 'all'>('active')
  const [typeFilter, setTypeFilter] = useState<Correspondence['type'] | 'all'>('all')

  // Mutation busy states (parity with circulars/policies — every save
  // surfaces an inline spinner and disables to prevent double-fire).
  const [sendBusy, setSendBusy] = useState(false)
  const [saveDraftBusy, setSaveDraftBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  // H2: soft-delete busy + confirm state.
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

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

  // F5: Letter Submissions metric — count sent letters from letterStore (the
  // formal SAMA letters module) within the current quarter.  The old formula
  // only looked at correspondenceStore (the ad-hoc correspondence feed, a
  // different table) so it never updated when a letter was sent via the
  // Letters module.  Use `cache: 'no-store'` semantics — read live from the
  // store; fetchLetters is called in the useEffect above.
  const samaSubmissionCount = useMemo(() => {
    const now = new Date()
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    // Count sent letters from the Letters module in the current quarter.
    const letterCount = letterStore.letters.filter(l =>
      l.status === 'sent' && l.sentDate && new Date(l.sentDate) >= qStart
    ).length
    // Also include sama-typed entries from the correspondence feed (legacy path).
    const feedCount = correspondenceStore.correspondence.filter(c =>
      c.type === 'sama' && new Date(c.date) >= qStart
    ).length
    return letterCount + feedCount
  }, [letterStore.letters, correspondenceStore.correspondence])

  // W24-1 — locale-aware quarter label. AR → "الربع الثاني ٢٠٢٦", EN → "Q2 2026".
  const currentQuarterLabel = useMemo(() => {
    return formatLocalizedQuarter(language)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

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
    if (policies.length === 0) return { currentPct: 0, overdueCount: 0 }
    const now = new Date()
    const active = policies.filter(p => p.status === 'approved').length
    const overdue = policies.filter(p => p.status === 'approved' && new Date(p.nextReviewDate) < now).length
    return {
      currentPct: Math.round((active / policies.length) * 100),
      overdueCount: overdue,
    }
  }, [policyStore.policies])

  const circularStats = useMemo(() => {
    const circs = circularStore.circulars
    if (circs.length === 0) return { currentPct: 0, overdueCount: 0 }
    const now = new Date()
    const overdue = circs.filter(c => c.status === 'overdue' || (c.dueDate && new Date(c.dueDate) < now && c.status !== 'completed')).length
    return {
      currentPct: Math.round(((circs.length - overdue) / circs.length) * 100),
      overdueCount: overdue,
    }
  }, [circularStore.circulars])

  const nextCircularsDue = useMemo(() => {
    const now = new Date()
    const upcoming = circularStore.circulars
      .filter(c => c.status !== 'completed' && c.dueDate && new Date(c.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    if (upcoming.length === 0) return []
    const nearestDay = new Date(upcoming[0].dueDate).setHours(0, 0, 0, 0)
    return upcoming.filter(c => new Date(c.dueDate).setHours(0, 0, 0, 0) === nearestDay)
  }, [circularStore.circulars])

  // Upcoming items from all sources
  const upcomingItems = useMemo((): UpcomingItem[] => {
    const now = new Date()
    const items: UpcomingItem[] = []

    // Circulars (dueDate)
    circularStore.circulars
      .filter(c => c.status !== 'completed' && c.dueDate && new Date(c.dueDate) > now)
      .forEach(c => items.push({
        id: c.id, name: c.title, subtitle: c.authority,
        dueDate: c.dueDate, source: 'registry'
      }))

    // Letters (responseDeadline) — kept legacy `source: 'sama-letter'` for routing back-compat
    letterStore.letters
      .filter(l => l.responseDeadline && new Date(l.responseDeadline) > now && l.status !== 'response-received')
      .forEach(l => items.push({
        id: l.id, name: l.subject, subtitle: l.type,
        dueDate: l.responseDeadline!, source: 'sama-letter',
        authority: l.authority,
      }))

    // Observations (dueDate)
    observationStore.observations
      .filter(o => !['resolved', 'closed'].includes(o.status) && new Date(o.dueDate) > now)
      .forEach(o => items.push({
        id: o.id, name: o.title, subtitle: o.source,
        dueDate: o.dueDate, source: 'observation'
      }))

    return items.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 3)
  }, [circularStore.circulars, letterStore.letters, observationStore.observations])

  // Next policy review
  const nextPolicyReview = useMemo(() => {
    const now = new Date()
    return policyStore.policies
      .filter(p => p.status === 'approved' && new Date(p.nextReviewDate) > now)
      .sort((a, b) => new Date(a.nextReviewDate).getTime() - new Date(b.nextReviewDate).getTime())[0] || null
  }, [policyStore.policies])

  // H3: top N regulatory items interleaved — 5 circulars + 5 policies sorted
  // by recency so the Regulatory Tracker is never empty when either store has data.
  const topCirculars = useMemo(() => {
    const order: Record<string, number> = { 'in-progress': 0, overdue: 1, pending: 2, completed: 3 }
    return [...circularStore.circulars]
      .sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2))
      .slice(0, 5)
  }, [circularStore.circulars])

  // H3: top 5 recent policies to interleave in Regulatory Tracker when no
  // circulars are available yet.
  const topPolicies = useMemo(() => {
    return [...policyStore.policies]
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime())
      .slice(0, 5)
  }, [policyStore.policies])

  // Deep-link: auto-open correspondence when ?id= is present
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    const letter = correspondenceStore.correspondence.find(l => l.id === id)
    if (letter) handleViewLetter(letter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, correspondenceStore.correspondence])

  const handleViewLetter = (letter: Correspondence) => {
    setSelectedLetter(letter)
    setIsLetterDetailOpen(true)
  }

  // Defensive read pattern: the byId map wins, falling back to the array
  // index, then the local `selectedLetter` state. Avoids the "Not Found"
  // flash on freshly-created rows.
  const detailLetter: Correspondence | null = selectedLetter
    ? (correspondenceStore.byId[selectedLetter.id]
        ?? correspondenceStore.correspondence.find((l) => l.id === selectedLetter.id)
        ?? selectedLetter)
    : null

  const handleArchive = async (letterId: string) => {
    const letter = correspondenceStore.correspondence.find(l => l.id === letterId)
    if (letter) {
      setArchiveBusy(true)
      try {
        await correspondenceStore.update(letterId, { archived: !letter.archived })
        showToast(letter.archived ? t('correspondence.letterUnarchived') : t('correspondence.letterArchived'))
      } finally {
        setArchiveBusy(false)
      }
    }
    setIsLetterDetailOpen(false)
  }

  // H2: hard-delete with audit trail (DELETE /api/correspondence/[id] calls
  // writeAudit before the DB delete).
  const handleDelete = async (letterId: string) => {
    setDeleteBusy(true)
    try {
      await correspondenceStore.delete(letterId)
      showToast(t('correspondence.correspondenceDeleted' as TranslationKey))
      setIsLetterDetailOpen(false)
      setDeleteConfirmId(null)
    } catch {
      showToast(t('correspondence.deleteFailed' as TranslationKey))
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleReviewItem = (item: UpcomingItem) => {
    const routes: Record<UpcomingItem['source'], string> = {
      'registry':    '/correspondence/registry',
      'sama-letter': '/correspondence/letters',
      'observation': '/correspondence/observations',
    }
    router.push(`${routes[item.source]}?id=${item.id}`)
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
    <div className={`flex flex-col h-full overflow-hidden`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4`}>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('correspondence.title' as TranslationKey)}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('correspondence.subtitle' as TranslationKey)}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters' as TranslationKey)}
            </Link>
            <Link href="/correspondence/regulatory-updates" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates' as TranslationKey)}
            </Link>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker' as TranslationKey)}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg`}>
            <Link href="/correspondence/feed" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/feed') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:mail" className="text-base" />
              {t('correspondence.tabs.correspondence' as TranslationKey)}
            </Link>
            <Link href="/correspondence/advisory" className={cn('px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2', pathname.startsWith('/correspondence/advisory') ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:message-circle-question" className="text-base" />
              {t('correspondence.tabs.advisory' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          <Gate perm="Manage Audit Findings">
            <button
              onClick={() => setIsNewCorrespondenceOpen(true)}
              className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
            >
              <Icon icon="lucide:plus" />
              {t('correspondence.logCommunication' as TranslationKey)}
            </button>
          </Gate>
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
              label={t('correspondence.letterSubmissions')}
              title={t('correspondence.letterSubmissions')}
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
                <div className={`flex justify-between items-center mb-6`}>
                  <div>
                    <h2 className="text-lg font-bold font-display text-slate-900">
                      {t('correspondence.regulatoryTracker')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('correspondence.trackerSubtitle')}
                    </p>
                  </div>
                  <Link
                    href="/correspondence/registry"
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    {t('correspondence.viewFullRegistry')} {isRTL ? '\u2190' : '\u2192'}
                  </Link>
                </div>

                <div className="space-y-4">
                  {/* F3: skeleton while circulars are first-loading */}
                  {isCircularsLoading && Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                      <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-3/5" />
                        <Skeleton className="h-2 w-2/5" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                    </div>
                  ))}
                  {!isCircularsLoading && topCirculars.map((circ) => (
                    <CircularRow
                      key={circ.id}
                      circular={circ}
                      isRTL={isRTL}
                      t={t}
                      onClick={() => router.push(`/correspondence/regulatory-updates/rules`)}
                    />
                  ))}
                  {/* F3: always show policies alongside circulars (not just as
                      a fallback). topPolicies is always rendered so the tracker
                      is never empty when policies exist even if circulars do too. */}
                  {!isCircularsLoading && topPolicies.map((policy) => (
                    <div
                      key={policy.id}
                      onClick={() => router.push(`/correspondence/regulatory-updates/policies`)}
                      className="flex items-center justify-between p-4 rounded-xl border bg-slate-50 border-slate-100 cursor-pointer hover:bg-slate-100/80"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
                          <Icon icon="lucide:scroll-text" className="text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{policy.name}</p>
                          <p className="text-[10px] text-slate-500">{policy.category}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-[10px] font-bold rounded-full ${
                        policy.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        policy.status === 'overdue' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {formatPolicyStatus(t, policy.status)}
                      </span>
                    </div>
                  ))}
                  {!isCircularsLoading && topCirculars.length === 0 && topPolicies.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noRequirements')}</p>
                  )}
                </div>
              </section>

              {/* Letter Correspondence and Policy Status */}
              <div className="grid grid-cols-2 gap-8">
                {/* Letter Correspondence */}
                <section className="glass-card rounded-3xl p-6">
                  <div className={`flex justify-between items-center mb-4`}>
                    <h3 className={`text-sm font-bold text-slate-900 flex items-center gap-2`}>
                      <Icon icon="lucide:mail" className="text-slate-400" />
                      {t('correspondence.correspondenceFeed')}
                    </h3>
                    <div className={`flex items-center gap-2`}>
                      <div className="min-w-[110px]">
                        <EditableSelect
                          locked
                          value={correspondenceFilter}
                          onChange={(id) => setCorrespondenceFilter(id as 'active' | 'archived' | 'all')}
                          items={[
                            { id: 'active', label: t('correspondence.filterActive') },
                            { id: 'archived', label: t('correspondence.filterArchived') },
                            { id: 'all', label: t('correspondence.filterAll') },
                          ]}
                          size="sm"
                          isRTL={isRTL}
                        />
                      </div>
                      <div className="min-w-[140px]">
                        <EditableSelect
                          value={typeFilter}
                          onChange={(id) => setTypeFilter(id as Correspondence['type'] | 'all')}
                          items={[
                            { id: 'all', label: t('correspondence.allTypes' as TranslationKey) },
                            ...correspondenceTypes.map((tt) => ({ id: tt.id, label: tt.label, labelAr: tt.labelAr, isDefault: tt.isDefault })),
                          ]}
                          onAdd={(label, labelAr) => addCorrespondenceType(label, labelAr)}
                          onEdit={(id, label, labelAr) => updateCorrespondenceType(id, { label, labelAr })}
                          onDelete={(id) => removeCorrespondenceType(id)}
                          size="sm"
                          isRTL={isRTL}
                        />
                      </div>
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
                  {isFeedLoading ? (
                    /* F3: shimmer while correspondence list is first-loading */
                    <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 hide-scrollbar">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex gap-3">
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-3/5" />
                            <Skeleton className="h-2 w-4/5" />
                            <Skeleton className="h-2 w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                  (() => {
                    const filtered = correspondenceStore.correspondence
                      .filter(l => correspondenceFilter === 'all' ? true : correspondenceFilter === 'archived' ? l.archived : !l.archived)
                      .filter(l => typeFilter === 'all' ? true : l.type === typeFilter)
                    return (
                      <>
                        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 hide-scrollbar">
                          {filtered.map((letter) => (
                            <CommunicationLogItem
                              key={letter.id}
                              letter={letter}
                              onView={() => handleViewLetter(letter)}
                              onArchive={() => handleArchive(letter.id)}
                              onDelete={() => {
                                if (deleteConfirmId === letter.id) {
                                  void handleDelete(letter.id)
                                } else {
                                  setDeleteConfirmId(letter.id)
                                }
                              }}
                              t={t}
                              isRTL={isRTL}
                            />
                          ))}
                          {filtered.length === 0 && (
                            <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noCorrespondence')}</p>
                          )}
                        </div>
                        {filtered.length > 0 && (
                          <button
                            onClick={() => setIsFeedAllOpen(true)}
                            className="mt-4 w-full py-2 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            {t('correspondence.viewAll' as TranslationKey)} ({filtered.length})
                            <Icon icon="lucide:external-link" className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    )
                  })()
                  )}
                </section>

                {/* Policy Status + Rules & Circulars */}
                <section className="glass-card rounded-3xl p-6">
                  {/* Policy Review */}
                  <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2`}>
                    <Icon icon="lucide:scroll-text" className="text-slate-400" />
                    {t('correspondence.policyReview')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {t('correspondence.current')}
                      </span>
                      <p className="text-xl font-bold text-slate-900">{policyStats.currentPct}%</p>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100`}>
                      <span className="text-[10px] font-black text-rose-500 uppercase">
                        {t('correspondence.overdue' as TranslationKey)}
                      </span>
                      <p className="text-xl font-bold text-rose-600">{policyStats.overdueCount}</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center justify-between text-[10px] font-bold text-slate-500`}>
                    {nextPolicyReview ? (
                      <>
                        <span>{t('correspondence.nextReview')}: {nextPolicyReview.name}</span>
                        <span className="text-blue-600">
                          {formatDate(nextPolicyReview.nextReviewDate)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">{t('correspondence.noUpcomingReviews')}</span>
                    )}
                  </div>

                  <div className="my-5 border-t border-slate-100" />

                  {/* Rules & Circulars Review */}
                  <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2`}>
                    <Icon icon="lucide:landmark" className="text-slate-400" />
                    {t('correspondence.rulesAndCirculars' as TranslationKey)}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {t('correspondence.current')}
                      </span>
                      <p className="text-xl font-bold text-slate-900">{circularStats.currentPct}%</p>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100`}>
                      <span className="text-[10px] font-black text-rose-500 uppercase">
                        {t('correspondence.overdue' as TranslationKey)}
                      </span>
                      <p className="text-xl font-bold text-rose-600">{circularStats.overdueCount}</p>
                    </div>
                  </div>
                  <div className={`mt-4 text-[10px] font-bold text-slate-500`}>
                    {nextCircularsDue.length > 0 ? (
                      <>
                        <div className={`flex items-center justify-between mb-1.5`}>
                          <span>{t('correspondence.nextDeadline' as TranslationKey)}</span>
                          <span className="text-blue-600">
                            {formatDate(nextCircularsDue[0].dueDate)}
                          </span>
                        </div>
                        <ul className={`space-y-0.5`}>
                          {nextCircularsDue.map(c => (
                            <li key={c.id} className="text-slate-600 truncate">· {c.title}</li>
                          ))}
                        </ul>
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
                <div className={`flex justify-between items-center mb-6`}>
                  <h2 className="text-lg font-bold font-display">{t('correspondence.riskHeatmap')}</h2>
                  <Icon icon="lucide:trending-up" className="text-emerald-400 text-xl" />
                </div>
                <div className="space-y-4">
                  <div className={`flex items-center justify-between`}>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('observations.severity')}</span>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('common.items')}</span>
                  </div>
                  {(() => {
                    const totalRisks = risks.length || 1
                    return (
                      <div className="space-y-3">
                        <div className={`flex items-center gap-3`}>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500" style={{ width: `${(riskCounts.critical / totalRisks) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.critical')} ({riskCounts.critical})</span>
                        </div>
                        <div className={`flex items-center gap-3`}>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500" style={{ width: `${(riskCounts.high / totalRisks) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.high')} ({riskCounts.high})</span>
                        </div>
                        <div className={`flex items-center gap-3`}>
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
                <div className={`flex justify-between items-center mb-6`}>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                    {t('correspondence.teamCapacity')}
                  </h2>
                  <Link
                    href="/team"
                    className={`text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1`}
                  >
                    {t('correspondence.viewAll' as TranslationKey)}
                    <Icon icon={'lucide:arrow-right'} className="text-sm" />
                  </Link>
                </div>
                <div className="space-y-5">
                  {/* F3: shimmer rows while team is first-loading */}
                  {isTeamLoading && Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-2/5" />
                        <Skeleton className="h-2 w-full rounded-full" />
                      </div>
                    </div>
                  ))}
                  {!isTeamLoading && teamStore.members.map((member) => (
                    <TeamMemberRow key={member.id} member={{ name: member.name, avatar: member.avatar || member.name, load: teamWorkloads[member.id]?.percentage ?? member.workload, role: member.role }} />
                  ))}
                  {!isTeamLoading && teamStore.members.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">{t('correspondence.noMembers')}</p>
                  )}
                </div>
              </section>

              {/* Upcoming Submission */}
              <section className="glass-card rounded-3xl p-6 border-emerald-100 bg-emerald-50/20">
                <h2 className={`text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4`}>
                  {t('correspondence.upcomingSubmission')}
                </h2>
                {upcomingItems.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingItems.map(item => {
                      const sourceChip: Record<UpcomingItem['source'], string> = {
                        'registry':    'bg-emerald-100 text-emerald-700',
                        'sama-letter': 'bg-blue-100 text-blue-700',
                        'observation': 'bg-rose-100 text-rose-700',
                      }
                      return (
                        <div key={item.id} className={`bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm`}>
                          <div className={`flex items-start justify-between gap-2`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${sourceChip[item.source]}`}>
                              {item.source === 'registry' ? 'Registry' : item.source === 'sama-letter' ? (item.authority || 'Letter') : 'Obs'}
                            </span>
                          </div>
                          <div className={`flex items-center justify-between mt-3 pt-3 border-t border-slate-100`}>
                            <span className="text-xs font-bold text-rose-500">
                              {formatDate(item.dueDate)}
                            </span>
                            <button
                              onClick={() => handleReviewItem(item)}
                              className="text-[10px] px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
                            >
                              {t('correspondence.reviewFile')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm`}>
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
        title={t('correspondence.logCommunication' as TranslationKey)}
        subtitle={t('common.createNew')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
              {t('correspondence.typeLabel' as TranslationKey)}
            </label>
            <EditableSelect
              value={newCorrespondenceType}
              onChange={(id) => setNewCorrespondenceType(id)}
              items={correspondenceTypes.map((tt) => ({ id: tt.id, label: tt.label, labelAr: tt.labelAr, isDefault: tt.isDefault }))}
              onAdd={(label, labelAr) => addCorrespondenceType(label, labelAr)}
              onEdit={(id, label, labelAr) => updateCorrespondenceType(id, { label, labelAr })}
              onDelete={(id) => removeCorrespondenceType(id)}
              isRTL={isRTL}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.to')}</label>
            <input
              type="text"
              value={newCorrespondenceTo}
              onChange={(e) => setNewCorrespondenceTo(e.target.value)}
              placeholder={t('common.enterRecipient')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('common.subject')}</label>
            <input
              type="text"
              value={newCorrespondenceSubject}
              onChange={(e) => setNewCorrespondenceSubject(e.target.value)}
              placeholder={t('common.enterSubject')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>
              {t('correspondence.assignedTo')}
            </label>
            <EditableSelect
              value={newCorrespondenceAssignee || null}
              onChange={(id) => setNewCorrespondenceAssignee(id)}
              items={teamStore.members.map((m) => ({ id: m.id, label: `${m.name} — ${m.role}` }))}
              placeholder={t('common.unassigned' as TranslationKey)}
              isRTL={isRTL}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.message')}</label>
            <textarea
              rows={8}
              value={newCorrespondenceBody}
              onChange={(e) => setNewCorrespondenceBody(e.target.value)}
              placeholder={t('common.typeMessage')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
          <div className={`flex gap-3 mt-6`}>
            <button
              disabled={sendBusy || saveDraftBusy}
              aria-busy={sendBusy || undefined}
              onClick={async () => {
                if (!newCorrespondenceSubject || !newCorrespondenceTo) {
                  showToast(t('correspondence.fillRequiredFields'))
                  return
                }
                setSendBusy(true)
                try {
                  await correspondenceStore.create({
                    subject: newCorrespondenceSubject,
                    from: authStore.user?.name || 'Compliance Department',
                    to: [newCorrespondenceTo],
                    date: new Date().toISOString(),
                    type: newCorrespondenceType,
                    assignee: newCorrespondenceAssignee || undefined,
                    status: 'sent',
                    body: newCorrespondenceBody,
                    attachments: [],
                    archived: false,
                  })
                  setNewCorrespondenceTo('')
                  setNewCorrespondenceSubject('')
                  setNewCorrespondenceBody('')
                  setNewCorrespondenceType('internal')
                  setNewCorrespondenceAssignee('')
                  setIsNewCorrespondenceOpen(false)
                  showToast(t('correspondence.correspondenceSent'))
                } finally {
                  setSendBusy(false)
                }
              }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60`}
            >
              <Icon icon={sendBusy ? 'lucide:loader-2' : 'lucide:send'} className={`text-lg ${sendBusy ? 'animate-spin' : ''}`} />
              {t('correspondence.send')}
            </button>
            <button
              disabled={sendBusy || saveDraftBusy}
              aria-busy={saveDraftBusy || undefined}
              onClick={async () => {
                if (newCorrespondenceSubject) {
                  setSaveDraftBusy(true)
                  try {
                    await correspondenceStore.create({
                      subject: newCorrespondenceSubject,
                      from: authStore.user?.name || 'Compliance Department',
                      to: newCorrespondenceTo ? [newCorrespondenceTo] : [],
                      date: new Date().toISOString(),
                      type: newCorrespondenceType,
                      assignee: newCorrespondenceAssignee || undefined,
                      status: 'draft',
                      body: newCorrespondenceBody,
                      attachments: [],
                      archived: false,
                    })
                  } finally {
                    setSaveDraftBusy(false)
                  }
                }
                setNewCorrespondenceTo('')
                setNewCorrespondenceSubject('')
                setNewCorrespondenceBody('')
                setNewCorrespondenceType('internal')
                setNewCorrespondenceAssignee('')
                setIsNewCorrespondenceOpen(false)
                showToast(t('correspondence.saveAsDraft'))
              }}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saveDraftBusy && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {t('correspondence.saveAsDraft')}
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
                  <button
                    key={risk.id}
                    onClick={() => {
                      setIsRiskMatrixOpen(false)
                      setSelectedCellRisks(null)
                      router.push(`/reports/risks?id=${risk.id}`)
                    }}
                    className={cn('w-full p-4 border rounded-lg text-left cursor-pointer transition-opacity hover:opacity-80', severityColors[risk.severity])}
                    title="View in Risk Register"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{risk.name}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">{t(`correspondence.${risk.severity}`)}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">{t('correspondence.impact')}: {risk.impact}</span>
                        </div>
                      </div>
                      <Icon icon="lucide:arrow-right" className="text-lg text-slate-600 shrink-0 mt-0.5" />
                    </div>
                  </button>
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
            <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200`}>
              <div className={`flex items-start gap-3`}>
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
        title={detailLetter?.subject || t('correspondence.letterDetails')}
        subtitle={detailLetter ? `REF: ${detailLetter.reference || detailLetter.id}` : undefined}
        size="lg"
      >
        {detailLetter && (
          <div className="space-y-4">
            <div className={`bg-slate-50 p-4 rounded-lg`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.status')}</p>
              <p className="text-sm font-bold text-slate-900">{detailLetter.status === 'sent' ? t('correspondence.sentToSama') : t('common.draft')}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.date')}</p>
              <p className="text-sm font-bold text-slate-900">{formatDate(detailLetter.date)}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('correspondence.content')}</p>
              <p className="text-sm text-slate-700">{detailLetter.body}</p>
            </div>
            {detailLetter.assignee && (
              <div className={`bg-emerald-50 p-4 rounded-lg`}>
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('correspondence.assignedTo')}</p>
                <p className="text-sm font-bold text-slate-900">{detailLetter.assignee}</p>
              </div>
            )}
            <div className={`flex gap-3 pt-4`}>
              <button
                onClick={() => handleArchive(detailLetter.id)}
                disabled={archiveBusy || deleteBusy}
                aria-busy={archiveBusy || undefined}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {archiveBusy && <Icon icon="lucide:loader-2" className="animate-spin" />}
                {detailLetter.archived ? t('correspondence.unarchive') : t('correspondence.archive')}
              </button>
              {/* H2: Delete button — opens confirm dialog, then calls DELETE /api/correspondence/[id] */}
              {deleteConfirmId === detailLetter.id ? (
                <div className="flex gap-2 flex-1">
                  <button
                    onClick={() => handleDelete(detailLetter.id)}
                    disabled={deleteBusy}
                    aria-busy={deleteBusy || undefined}
                    className="flex-1 bg-rose-600 text-white py-3 rounded-lg font-bold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  >
                    {deleteBusy ? <Icon icon="lucide:loader-2" className="animate-spin" /> : <Icon icon="lucide:trash-2" />}
                    {t('common.confirm')}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    disabled={deleteBusy}
                    className="px-4 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(detailLetter.id)}
                  disabled={archiveBusy || deleteBusy}
                  className="px-4 bg-rose-50 text-rose-600 py-3 rounded-lg font-bold hover:bg-rose-100 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  <Icon icon="lucide:trash-2" />
                  {t('common.delete')}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* View All Correspondence Feed Modal */}
      <Modal
        isOpen={isFeedAllOpen}
        onClose={() => setIsFeedAllOpen(false)}
        title={t('correspondence.correspondenceFeed' as TranslationKey)}
        subtitle={t('correspondence.viewAllSubtitle' as TranslationKey)}
        size="xl"
      >
        {(() => {
          const filtered = correspondenceStore.correspondence
            .filter(l => correspondenceFilter === 'all' ? true : correspondenceFilter === 'archived' ? l.archived : !l.archived)
            .filter(l => typeFilter === 'all' ? true : l.type === typeFilter)
          return (
            <div className={`flex flex-col gap-4 ${isRTL ? 'rtl' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  {filtered.length} {t('correspondence.items' as TranslationKey)}
                </span>
                <div className="flex gap-2">
                  <div className="min-w-[110px]">
                    <EditableSelect
                      locked
                      value={correspondenceFilter}
                      onChange={(id) => setCorrespondenceFilter(id as 'active' | 'archived' | 'all')}
                      items={[
                        { id: 'active', label: t('correspondence.filterActive') },
                        { id: 'archived', label: t('correspondence.filterArchived') },
                        { id: 'all', label: t('correspondence.filterAll') },
                      ]}
                      size="sm"
                      isRTL={isRTL}
                    />
                  </div>
                  <div className="min-w-[140px]">
                    <EditableSelect
                      value={typeFilter}
                      onChange={(id) => setTypeFilter(id as Correspondence['type'] | 'all')}
                      items={[
                        { id: 'all', label: t('correspondence.allTypes' as TranslationKey) },
                        ...correspondenceTypes.map((tt) => ({ id: tt.id, label: tt.label, labelAr: tt.labelAr, isDefault: tt.isDefault })),
                      ]}
                      onAdd={(label, labelAr) => addCorrespondenceType(label, labelAr)}
                      onEdit={(id, label, labelAr) => updateCorrespondenceType(id, { label, labelAr })}
                      onDelete={(id) => removeCorrespondenceType(id)}
                      size="sm"
                      isRTL={isRTL}
                    />
                  </div>
                  {filtered.length > 0 && (
                    <button
                      onClick={() => {
                        exportCorrespondenceLocalized(filtered, 'correspondence', t, isRTL)
                        showToast(t('correspondence.exportToCsv'))
                      }}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer flex items-center gap-1 px-2"
                    >
                      <Icon icon="lucide:download" className="text-sm" />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3 hide-scrollbar">
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">{t('correspondence.noCorrespondence')}</p>
                ) : (
                  filtered.map((letter) => (
                    <CommunicationLogItem
                      key={letter.id}
                      letter={letter}
                      onView={() => { setIsFeedAllOpen(false); handleViewLetter(letter) }}
                      onArchive={() => handleArchive(letter.id)}
                      onDelete={() => {
                        if (deleteConfirmId === letter.id) {
                          void handleDelete(letter.id)
                        } else {
                          setDeleteConfirmId(letter.id)
                        }
                      }}
                      t={t}
                      isRTL={isRTL}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })()}
      </Modal>

    </div>
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
    <div className={`glass-card stat-card-hover p-6 rounded-2xl`}>
      <div className={`flex justify-between items-start mb-4`}>
        <div className={`p-2 ${iconColors[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-2xl" />
        </div>
        <span className={`text-[10px] font-bold ${labelColors[iconColor]} px-2 py-0.5 rounded-full`}>
          {label}
        </span>
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className={`flex items-baseline gap-2`}>
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      {progressSegments && (
        <div className={`mt-4 flex gap-1`}>
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

function CircularRow({ circular, t, onClick }: {
  circular: Circular;
  isRTL: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onClick?: () => void;
}) {
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const authorityCode = resolveAuthorityCode(circular.authority, frameworks)
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    'in-progress': { bg: 'bg-amber-100', text: 'text-amber-700', label: t('correspondence.inProgressStatus' as TranslationKey) },
    overdue:       { bg: 'bg-rose-100', text: 'text-rose-700', label: t('correspondence.overdue') },
    pending:       { bg: 'bg-slate-100', text: 'text-slate-700', label: t('correspondence.pendingStatus' as TranslationKey) },
    completed:     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('correspondence.completedStatus' as TranslationKey) },
  }
  const config = statusConfig[circular.status] ?? statusConfig.pending
  const isCompleted = circular.status === 'completed'
  const now = new Date()
  const due = new Date(circular.dueDate)
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dueText = isCompleted
    ? t('correspondence.completedStatus' as TranslationKey)
    : diffDays <= 0
      ? t('correspondence.overdue')
      : t('correspondence.dueInDaysShort' as TranslationKey, { count: String(diffDays) })
  const isDueSoon = !isCompleted && diffDays <= 7

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-4 rounded-xl border ${isCompleted ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'} ${onClick ? 'cursor-pointer hover:bg-slate-100/80' : ''}`}
    >
      <div className={`flex items-center gap-4`}>
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
          <Icon
            icon={isCompleted ? 'lucide:check-circle' : 'lucide:scale'}
            className={isCompleted ? 'text-emerald-500' : 'text-slate-400'}
          />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{circular.title}</p>
          <p className="text-[10px] text-slate-500">{authorityCode} · {circular.reference}</p>
        </div>
      </div>
      <div className={`flex items-center gap-6`}>
        <div className={'text-end'}>
          <span className={`text-[10px] font-black uppercase ${isDueSoon ? 'text-rose-500' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
            {dueText}
          </span>
          <div className="h-1 w-24 bg-slate-200 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${isCompleted ? 'bg-emerald-500' : isDueSoon ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${circular.progress}%` }}
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

function CommunicationLogItem({
  letter,
  onView,
  onArchive,
  onDelete,
  t,
  isRTL
}: {
  letter: Correspondence
  onView: () => void
  onArchive: () => void
  // F1: per-row soft-delete callback (optional — omit to hide the button).
  onDelete?: () => void
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
    const dateFormatPref = useUserPreferencesStore.getState().dateFormat
    return formatDateWithPreference(d, dateFormatPref, isRTL ? 'ar' : undefined)
  })()

  return (
    <div className={`flex gap-3`}>
      <div
        className={`w-8 h-8 rounded-full ${isSent ? 'bg-blue-100' : 'bg-slate-100'} flex items-center justify-center shrink-0`}
      >
        <Icon
          icon={isSent ? 'lucide:arrow-up-right' : 'lucide:pencil'}
          className={`${isSent ? 'text-blue-600' : 'text-slate-600'} text-sm`}
        />
      </div>
      <div className={`flex-1`}>
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
        {/* F1: flex-wrap so action buttons don't overflow narrow cards */}
        <div className={`flex flex-wrap gap-x-2 gap-y-1 mt-2`}>
          <button
            onClick={onView}
            className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer shrink-0"
          >
            {t('common.view')}
          </button>
          <button
            onClick={onArchive}
            className="text-[9px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer shrink-0"
          >
            {letter.archived ? t('correspondence.unarchive') : t('correspondence.archive')}
          </button>
          {/* F1: per-row delete button */}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="text-[9px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
            >
              {t('common.delete')}
            </button>
          )}
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
        src={dicebearAvatar(member.avatar)}
        className="w-8 h-8 rounded-full border border-slate-200"
        alt={member.name}
      />
      <div className="flex-1">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span>{member.name}</span>
          <span className={colors.text}>{member.load}%</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full`}
            style={{ width: `${Math.min(member.load, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
