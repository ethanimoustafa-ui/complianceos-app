'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useRiskStore } from '@/stores/risk-store'
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'
import { formatTimelineDate } from '@/lib/format-date'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRiskCategoryStore } from '@/stores/risk-category-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { getCategoryConfig } from '@/lib/category-config'
import { InlineDeadlinePicker } from '@/components/ui/inline-deadline-picker'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import type { ReviewSchedule, RegulatoryBodyId } from '@/types'
import { FrameworkTagSelector } from '@/components/ui/framework-tag-selector'
import { exportRisksLocalized } from '@/lib/export'
import type { TranslationKey } from '@/i18n'
import { useFormattedDate } from '@/hooks/useFormattedDate'
import { ChecklistSection } from '@/components/observations/detail/checklist-section'
import { Gate } from '@/components/auth/gate'
import { dicebearAvatar } from '@/lib/avatar'
import { paginate } from '@/lib/pagination'

// Types
// RiskCategory is now an opaque string (managed via useRiskCategoryStore).
// Default seed ids (operational | financial | compliance | strategic | reputational)
// remain valid; new user-added ids fall through to the neutral fallbackColor.
type RiskCategory = string
type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'closed'
type MonitoringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
type HistoryAction = 'created' | 'status_changed' | 'score_updated' | 'mitigation_updated' | 'reviewed' | 'assigned' | 'note_added' | 'checklist_added' | 'checklist_toggled' | 'checklist_edited' | 'checklist_removed'

interface RiskHistoryEntry {
  id: number
  timestamp: Date
  user: string
  action: HistoryAction
  previousValue?: string
  newValue?: string
  notes?: string
}

interface RiskRegisterItem {
  id: string
  name: string
  description: string
  category: RiskCategory
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  owner: { name: string; avatar: string; department: string }
  status: RiskStatus
  mitigationPlan?: string
  mitigationChecklist?: { id: string; text: string; completed: boolean }[]
  mitigationProgress: number
  monitoringFrequency: MonitoringFrequency
  lastReviewDate?: Date
  nextReviewDate?: Date
  reviewSchedule?: ReviewSchedule
  history: RiskHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}

// Thin wrapper around the central category-config helper. Always returns a
// renderable shape — if the id is a user-added category not in the seed
// palette, we fall back to neutral slate via getCategoryConfig.
function getRiskCatConfig(id: string | undefined | null): { label: string; icon: string; color: string } {
  const conf = getCategoryConfig('risk', id)
  return {
    label: conf.label,
    icon: conf.icon ?? 'lucide:tag',
    color: conf.pill ?? `${conf.bg} ${conf.text}`,
  }
}

const riskStatusConfig: Record<RiskStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-rose-100 text-rose-700' },
  mitigating: { label: 'Mitigating', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700' },
}

const riskCategoryLabelKeys: Record<string, string> = {
  operational: 'reports.operational', financial: 'reports.financial', compliance: 'reports.compliance',
  strategic: 'reports.strategic', reputational: 'reports.reputational',
}

const riskStatusLabelKeys: Record<RiskStatus, string> = {
  open: 'reports.open', mitigating: 'reports.mitigating', accepted: 'reports.accepted', closed: 'reports.closed',
}

// Helpers
function getRiskScore(likelihood: number, impact: number): number { return likelihood * impact }

function getRiskLevel(score: number): { labelKey: string; color: string; bgColor: string } {
  if (score >= 20) return { labelKey: 'reports.critical', color: 'text-rose-700', bgColor: 'bg-rose-500' }
  if (score >= 12) return { labelKey: 'reports.high', color: 'text-orange-700', bgColor: 'bg-orange-500' }
  if (score >= 6) return { labelKey: 'reports.medium', color: 'text-amber-700', bgColor: 'bg-amber-400' }
  return { labelKey: 'reports.low', color: 'text-emerald-700', bgColor: 'bg-emerald-400' }
}

function getMatrixCellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact
  if (score >= 20) return 'bg-rose-500/20 border-rose-500 hover:bg-rose-500/30'
  if (score >= 12) return 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30'
  if (score >= 6) return 'bg-amber-400/20 border-amber-400 hover:bg-amber-400/30'
  return 'bg-emerald-400/20 border-emerald-400 hover:bg-emerald-400/30'
}

function getRiskDotColor(score: number): string {
  if (score >= 20) return 'bg-rose-500'
  if (score >= 12) return 'bg-orange-500'
  if (score >= 6) return 'bg-amber-400'
  return 'bg-emerald-400'
}

export default function ReportsRisksPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()
  const { formatDate } = useFormattedDate()

  // Risk store
  const storeRisks = useRiskStore((s) => s.risks)
  // `byId` is the authoritative read source for detail rendering — see the
  // read-side defense further down (avoids the "Not Found" flash audits had
  // when fetchById landed before the list refetch).
  const risksById = useRiskStore((s) => s.byId)
  const riskStore = useRiskStore()
  const isMutating = useRiskStore((s) => s.isMutating)
  const fetchRiskById = useRiskStore((s) => s.fetchById)
  // RISKS-STORE may expose `isDetailLoaded` — guard the read so we never
  // explode if the predicate is missing (returns `false` → skeletons render).
  const isDetailLoadedFn = (riskStore as unknown as { isDetailLoaded?: (id: string) => boolean })
    .isDetailLoaded
  const isDetailLoaded = (id: string): boolean =>
    typeof isDetailLoadedFn === 'function'
      ? isDetailLoadedFn(id)
      : Boolean(risksById[id]?.history && risksById[id]!.history.length > 0)
  const createRisk = useRiskStore((s) => s.create)
  const updateRisk = useRiskStore((s) => s.update)
  const updateRiskStatus = useRiskStore((s) => s.updateStatus)
  const deleteRisk = useRiskStore((s) => s.delete)
  const addMitigationItem = useRiskStore((s) => s.addMitigationItem)
  const editMitigationItem = useRiskStore((s) => s.editMitigationItem)
  const toggleMitigationItem = useRiskStore((s) => s.toggleMitigationItem)
  const removeMitigationItem = useRiskStore((s) => s.removeMitigationItem)
  const markReviewed = useRiskStore((s) => s.markReviewed)
  const assignDept = useRiskStore((s) => s.assignDepartment)
  const setMitigationDeadlineAction = useRiskStore((s) => s.setMitigationDeadline)
  const sendToDepartment = useRiskStore((s) => s.sendToDepartment)
  const submitDepartmentPlan = useRiskStore((s) => s.submitDepartmentPlan)
  const acceptDepartmentPlan = useRiskStore((s) => s.acceptDepartmentPlan)
  const toggleDeptPlanItem = useRiskStore((s) => s.toggleDepartmentPlanItem)
  const { departments: deptList, addDepartment: addDept, updateDepartment: updateDept, removeDepartment: removeDept } = useDepartmentStore()
  const authUser = useAuthStore((s) => s.user)
  const actingUser = authUser?.name ?? 'Compliance Officer'
  const teamMembers = useTeamStore((s) => s.members)
  // Editable risk categories — opaque string ids (default seeds + user-added).
  const riskCategoryItems = useRiskCategoryStore((s) => s.categories)
  const addRiskCategory = useRiskCategoryStore((s) => s.add)
  const editRiskCategory = useRiskCategoryStore((s) => s.update)
  const removeRiskCategory = useRiskCategoryStore((s) => s.remove)

  // Hydrate server-state on mount (Fix-1).
  const fetchRisks = useRiskStore((s) => s.fetchAll)
  // Wave-2 Agent E: first-fetch skeleton.
  const risksLoading = useRiskStore((s) => s.isLoading)
  const risksLastFetched = useRiskStore((s) => s.lastFetched)
  const showRisksSkeleton =
    risksLoading && storeRisks.length === 0 && risksLastFetched === null
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  const fetchDepartments = useDepartmentStore((s) => s.fetchAll)
  const fetchRiskCategories = useRiskCategoryStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchRisks()
    void fetchTeam()
    void fetchDepartments()
    void fetchRiskCategories()
  }, [fetchRisks, fetchTeam, fetchDepartments, fetchRiskCategories])

  // Likelihood/Impact labels are calculation-bound (1..5 drive the risk score)
  // and must not be user-editable. Render directly from the canonical i18n
  // dictionary — see SPRINT-FOLLOWUP-PLAN §2.1.
  const likelihoodDefaultKey = (n: 1 | 2 | 3 | 4 | 5): TranslationKey =>
    (['riskRegister.rare', 'riskRegister.unlikely', 'riskRegister.possible', 'riskRegister.likely', 'riskRegister.almostCertain'][n - 1]) as TranslationKey
  const impactDefaultKey = (n: 1 | 2 | 3 | 4 | 5): TranslationKey =>
    (['riskRegister.negligible', 'riskRegister.minor', 'riskRegister.moderate', 'riskRegister.major', 'riskRegister.catastrophic'][n - 1]) as TranslationKey
  const renderLikelihoodLabel = (n: 1 | 2 | 3 | 4 | 5): string => t(likelihoodDefaultKey(n))
  const renderImpactLabel = (n: 1 | 2 | 3 | 4 | 5): string => t(impactDefaultKey(n))

  // Map store risks to RiskRegisterItem
  const risks: RiskRegisterItem[] = useMemo(() => {
    const statusMap: Record<string, RiskStatus> = { identified: 'open', mitigating: 'mitigating', accepted: 'accepted', resolved: 'closed' }
    return storeRisks.map((r) => ({
      id: r.id, name: r.title, description: r.description, category: r.category as RiskCategory,
      likelihood: r.likelihood, impact: r.impact,
      owner: { name: r.owner.name, avatar: r.owner.avatar || '', department: r.owner.department },
      status: statusMap[r.status] || ('open' as RiskStatus),
      mitigationPlan: r.mitigationPlan, mitigationChecklist: r.mitigationChecklist, mitigationProgress: r.mitigationProgress,
      monitoringFrequency: r.monitoringFrequency,
      lastReviewDate: r.lastReviewDate ? new Date(r.lastReviewDate) : undefined,
      nextReviewDate: r.nextReviewDate ? new Date(r.nextReviewDate) : undefined,
      reviewSchedule: r.reviewSchedule,
      history: r.history.map((h, idx) => ({
        id: idx + 1, timestamp: new Date(h.timestamp), user: h.user, action: h.action as HistoryAction,
        previousValue: h.previousValue, newValue: h.newValue, notes: h.notes,
      })),
      createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt),
    }))
  }, [storeRisks])

  // State
  const [riskSearchTerm, setRiskSearchTerm] = useState('')
  const [riskCategoryFilter, setRiskCategoryFilter] = useState<RiskCategory | ''>('')
  const [riskStatusFilter, setRiskStatusFilter] = useState<RiskStatus | ''>('')
  const [selectedRisk, setSelectedRisk] = useState<RiskRegisterItem | null>(null)
  const [isRiskDrawerOpen, setIsRiskDrawerOpen] = useState(false)
  const [monitoringFrequencyFilter, setMonitoringFrequencyFilter] = useState<MonitoringFrequency | 'all'>('all')
  const [matrixCellSelection, setMatrixCellSelection] = useState<{ cellKey: string; index: number } | null>(null)
  const [riskToDelete, setRiskToDelete] = useState<RiskRegisterItem | null>(null)
  const [showRiskDeleteConfirm, setShowRiskDeleteConfirm] = useState(false)
  const [riskPage, setRiskPage] = useState(1)
  const RISKS_PER_PAGE = 10
  const [showAddRiskModal, setShowAddRiskModal] = useState(false)
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null)
  const [newRiskName, setNewRiskName] = useState('')
  const [newRiskCategory, setNewRiskCategory] = useState<RiskCategory | ''>('')
  const [newRiskOwnerId, setNewRiskOwnerId] = useState('')
  const [newRiskLikelihood, setNewRiskLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [newRiskImpact, setNewRiskImpact] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [newRiskDescription, setNewRiskDescription] = useState('')
  const [newRiskMitigation, setNewRiskMitigation] = useState('')
  const [newRiskMonitoringFrequency, setNewRiskMonitoringFrequency] = useState<MonitoringFrequency>('monthly')
  const [newRiskSchedule, setNewRiskSchedule] = useState<ReviewSchedule>({ cadence: 'monthly', dayOfMonth: 1 })
  const [frameworkIds, setFrameworkIds] = useState<RegulatoryBodyId[]>([])

  // Propose mitigation plan (department-side workflow) form state
  const [proposePlanOpen, setProposePlanOpen] = useState(false)
  const [proposePlanText, setProposePlanText] = useState('')
  const [proposePlanItems, setProposePlanItems] = useState<Array<{ text: string; deadline?: string }>>([
    { text: '', deadline: undefined },
  ])
  const resetProposePlanForm = () => {
    setProposePlanOpen(false)
    setProposePlanText('')
    setProposePlanItems([{ text: '', deadline: undefined }])
  }
  const submitProposePlan = (riskId: string) => {
    const validItems = proposePlanItems.filter((it) => it.text.trim().length > 0)
    if (proposePlanText.trim().length === 0 || validItems.length === 0) return
    const submittedBy = authUser?.name ?? 'Department User'
    submitDepartmentPlan(riskId, proposePlanText.trim(), validItems, submittedBy)
    resetProposePlanForm()
  }

  const resetAddRiskForm = () => {
    setNewRiskName(''); setNewRiskCategory(''); setNewRiskOwnerId(''); setNewRiskLikelihood(3); setNewRiskImpact(3)
    setNewRiskDescription(''); setNewRiskMitigation(''); setNewRiskMonitoringFrequency('monthly');
    setNewRiskSchedule({ cadence: 'monthly', dayOfMonth: 1 }); setFrameworkIds([]); setEditingRiskId(null)
  }

  const handleCreateRisk = async () => {
    if (!newRiskName || !newRiskCategory || !newRiskOwnerId || !newRiskDescription) return
    const owner = teamMembers.find(m => m.id === newRiskOwnerId)
    if (!owner) return

    if (editingRiskId) {
      const existingStoreRisk = storeRisks.find(r => r.id === editingRiskId)
      const editHistoryEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), user: owner.name, action: 'mitigation_updated' as const, notes: 'Risk details updated' }
      await updateRisk(editingRiskId, {
        title: newRiskName, description: newRiskDescription, category: newRiskCategory, likelihood: newRiskLikelihood, impact: newRiskImpact,
        owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, department: owner.department, workload: owner.workload },
        mitigationPlan: newRiskMitigation || undefined, monitoringFrequency: newRiskMonitoringFrequency,
        reviewSchedule: newRiskSchedule, frameworkIds,
        history: [...(existingStoreRisk?.history || []), editHistoryEntry],
      })
    } else {
      await createRisk({
        title: newRiskName, description: newRiskDescription, category: newRiskCategory, likelihood: newRiskLikelihood, impact: newRiskImpact,
        status: 'identified',
        owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, department: owner.department, workload: owner.workload },
        mitigationPlan: newRiskMitigation || undefined, mitigationProgress: 0, monitoringFrequency: newRiskMonitoringFrequency,
        reviewSchedule: newRiskSchedule, frameworkIds,
      })
    }
    resetAddRiskForm(); setShowAddRiskModal(false)
  }

  // Deep-link: open a specific risk from ?id= query param
  const searchParams = useSearchParams()
  const deepLinkIdRef = useRef(searchParams.get('id'))
  useEffect(() => {
    const id = deepLinkIdRef.current
    if (!id || risks.length === 0) return
    const target = risks.find(r => r.id === id)
    if (target) {
      deepLinkIdRef.current = null
      setSelectedRisk(target)
      setIsRiskDrawerOpen(true)
    }
  }, [risks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selectedRisk.
  // Read-side defense (mirrors audits' "Not Found" fix): prefer `byId[id]`
  // (fresh from `fetchById`) over the list, fall back to `risks.find(...)`.
  // This guarantees the drawer keeps rendering header info even if the
  // list-refetch hasn't landed yet.
  useEffect(() => {
    if (!selectedRisk) return
    const fromList = risks.find((r) => r.id === selectedRisk.id)
    const fromById = risksById[selectedRisk.id]
    // Prefer list-shape (already mapped to UI fields); only fall back to
    // synthesising from byId when the list doesn't have it.
    const updated =
      fromList ??
      (fromById
        ? (() => {
            const statusMap: Record<string, RiskStatus> = { identified: 'open', mitigating: 'mitigating', accepted: 'accepted', resolved: 'closed' }
            return {
              id: fromById.id,
              name: fromById.title,
              description: fromById.description,
              category: fromById.category as RiskCategory,
              likelihood: fromById.likelihood,
              impact: fromById.impact,
              owner: {
                name: fromById.owner.name,
                avatar: fromById.owner.avatar || '',
                department: fromById.owner.department,
              },
              status: statusMap[fromById.status] || ('open' as RiskStatus),
              mitigationPlan: fromById.mitigationPlan,
              mitigationChecklist: fromById.mitigationChecklist,
              mitigationProgress: fromById.mitigationProgress,
              monitoringFrequency: fromById.monitoringFrequency,
              lastReviewDate: fromById.lastReviewDate ? new Date(fromById.lastReviewDate) : undefined,
              nextReviewDate: fromById.nextReviewDate ? new Date(fromById.nextReviewDate) : undefined,
              reviewSchedule: fromById.reviewSchedule,
              history: (fromById.history ?? []).map((h, idx) => ({
                id: idx + 1,
                timestamp: new Date(h.timestamp),
                user: h.user,
                action: h.action as HistoryAction,
                previousValue: h.previousValue,
                newValue: h.newValue,
                notes: h.notes,
              })),
              createdAt: new Date(fromById.createdAt),
              updatedAt: new Date(fromById.updatedAt),
            } as RiskRegisterItem
          })()
        : null)
    if (!updated) return
    const changed =
      updated.status !== selectedRisk.status ||
      updated.updatedAt.getTime() !== selectedRisk.updatedAt.getTime() ||
      updated.history.length !== selectedRisk.history.length ||
      (updated.mitigationChecklist?.length ?? 0) !== (selectedRisk.mitigationChecklist?.length ?? 0)
    if (changed) setSelectedRisk(updated)
  }, [risks, risksById]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detail hydration: when the drawer opens, fetch the full risk so
  // detail-only sub-resources (history, checklist, dept proposed plan, etc.)
  // land in `byId`. List rows alone don't carry those.
  useEffect(() => {
    if (isRiskDrawerOpen && selectedRisk?.id && !selectedRisk.id.startsWith('temp-')) {
      void fetchRiskById(selectedRisk.id)
    }
  }, [isRiskDrawerOpen, selectedRisk?.id, fetchRiskById])

  const uiStatusToStoreStatus = (uiStatus: RiskStatus): 'identified' | 'mitigating' | 'accepted' | 'resolved' => {
    const map: Record<RiskStatus, 'identified' | 'mitigating' | 'accepted' | 'resolved'> = { open: 'identified', mitigating: 'mitigating', accepted: 'accepted', closed: 'resolved' }
    return map[uiStatus]
  }

  // Labels
  const monitoringFrequencyLabels: Record<MonitoringFrequency, string> = {
    weekly: t('reports.weekly' as TranslationKey), monthly: t('reports.monthly' as TranslationKey),
    quarterly: t('reports.quarterly' as TranslationKey), semi_annual: t('reports.semiAnnual' as TranslationKey), annual: t('reports.annual' as TranslationKey),
  }
  const historyActionLabels: Record<HistoryAction, string> = {
    created: t('reports.created' as TranslationKey), status_changed: t('reports.statusChanged' as TranslationKey),
    score_updated: t('reports.scoreUpdated' as TranslationKey), mitigation_updated: t('reports.mitigationUpdated' as TranslationKey),
    reviewed: t('reports.reviewed' as TranslationKey), assigned: t('reports.assigned' as TranslationKey),
    note_added: t('reports.noteAdded' as TranslationKey), checklist_added: t('reports.checklistAdded' as TranslationKey),
    checklist_toggled: t('reports.checklistToggled' as TranslationKey), checklist_edited: t('reports.checklistEdited' as TranslationKey),
    checklist_removed: t('reports.checklistRemoved' as TranslationKey),
  }
  const historyActionColors: Record<HistoryAction, string> = {
    created: 'bg-emerald-500', status_changed: 'bg-blue-500', score_updated: 'bg-amber-500', mitigation_updated: 'bg-purple-500',
    reviewed: 'bg-indigo-500', assigned: 'bg-slate-500', note_added: 'bg-teal-500', checklist_added: 'bg-emerald-400',
    checklist_toggled: 'bg-sky-500', checklist_edited: 'bg-orange-400', checklist_removed: 'bg-rose-400',
  }

  // Monitoring frequency helpers
  const filteredByMonitoringFrequency = risks.filter(risk => monitoringFrequencyFilter === 'all' || risk.monitoringFrequency === monitoringFrequencyFilter)
  const getDueCountForCategory = (category: RiskCategory) => filteredByMonitoringFrequency.filter(r => r.category === category && r.nextReviewDate && new Date(r.nextReviewDate) <= new Date()).length
  const getNextReviewForCategory = (category: RiskCategory): string => {
    const catRisks = filteredByMonitoringFrequency.filter(r => r.category === category && r.nextReviewDate)
    if (catRisks.length === 0) return '-'
    const nextReview = catRisks.map(r => r.nextReviewDate!).sort((a, b) => a.getTime() - b.getTime())[0]
    return formatDate(nextReview)
  }
  const getAvgProgressForCategory = (category: RiskCategory): number => {
    const catRisks = filteredByMonitoringFrequency.filter(r => r.category === category)
    if (catRisks.length === 0) return 0
    return Math.round(catRisks.reduce((sum, r) => sum + r.mitigationProgress, 0) / catRisks.length)
  }

  // Filter and sort
  const filteredRisks = useMemo(() => {
    return risks.filter(risk => {
      const q = riskSearchTerm.toLowerCase()
      const matchesSearch = !q || risk.name.toLowerCase().includes(q) || risk.description.toLowerCase().includes(q) || risk.category.toLowerCase().includes(q) || risk.owner.name.toLowerCase().includes(q)
      const matchesCategory = !riskCategoryFilter || risk.category === riskCategoryFilter
      const matchesStatus = !riskStatusFilter || risk.status === riskStatusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [risks, riskSearchTerm, riskCategoryFilter, riskStatusFilter])

  type RiskSortField = 'name' | 'category' | 'riskScore' | 'status' | 'owner'
  const [riskSortField, setRiskSortField] = useState<RiskSortField | null>(null)
  const [riskSortDirection, setRiskSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleRiskSort = (field: RiskSortField) => {
    if (riskSortField === field) { setRiskSortDirection(riskSortDirection === 'asc' ? 'desc' : 'asc') } else { setRiskSortField(field); setRiskSortDirection('desc') }
  }
  const clearRiskSort = (e: React.MouseEvent) => { e.stopPropagation(); setRiskSortField(null); setRiskSortDirection('desc') }

  const RiskSortIcon = ({ field }: { field: RiskSortField }) => {
    if (riskSortField !== field) return <Icon icon="lucide:arrow-up-down" className={`text-[10px] inline ${isRTL ? 'mr-1' : 'ml-1'} opacity-30`} />
    return (
      <span className={`inline-flex items-center ${isRTL ? 'mr-1' : 'ml-1'} gap-0.5`}>
        <Icon icon={riskSortDirection === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'} className="text-[10px] text-emerald-600" />
        <Icon icon="lucide:x" className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer transition-colors" onClick={clearRiskSort} />
      </span>
    )
  }

  const riskStatusOrder: Record<RiskStatus, number> = { open: 0, mitigating: 1, accepted: 2, closed: 3 }
  const sortedRisks = useMemo(() => {
    if (!riskSortField) return filteredRisks
    return [...filteredRisks].sort((a, b) => {
      let comparison = 0
      switch (riskSortField) {
        case 'name': comparison = a.name.localeCompare(b.name); break
        case 'category': comparison = a.category.localeCompare(b.category); break
        case 'riskScore': comparison = getRiskScore(a.likelihood, a.impact) - getRiskScore(b.likelihood, b.impact); break
        case 'status': comparison = riskStatusOrder[a.status] - riskStatusOrder[b.status]; break
        case 'owner': comparison = a.owner.name.localeCompare(b.owner.name); break
      }
      return riskSortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredRisks, riskSortField, riskSortDirection])

  const { items: paginatedRisks, totalPages: totalRiskPages } = paginate(sortedRisks, riskPage, RISKS_PER_PAGE)

  useEffect(() => { setRiskPage(1) }, [riskSearchTerm, riskCategoryFilter, riskStatusFilter])

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {t('reports.headerRiskRegister' as TranslationKey)}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('reports.headerRiskRegisterSubtitle' as TranslationKey)}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsTab' as TranslationKey)}
            </Link>
            <Link href="/reports/compliance-review" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/compliance-review') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.complianceReviewTab' as TranslationKey)}
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.teamPerformanceTab' as TranslationKey)}
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsLogs' as TranslationKey)}
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.tabs.risks' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          <button
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
            title={t('reports.exportReports')}
            onClick={() => exportRisksLocalized(sortedRisks, 'risk-register', t, isRTL)}
          >
            <Icon icon="lucide:download-cloud" className="text-lg" />
          </button>
          <Gate perm="Manage Audit Findings">
            <Button className="shadow-lg shadow-emerald-100" onClick={() => setShowAddRiskModal(true)}>
              <Icon icon="lucide:plus" />
              {t('reports.addRisk' as TranslationKey)}
            </Button>
          </Gate>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* Risk Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-rose-50 rounded-xl"><Icon icon="lucide:alert-triangle" className="text-2xl text-rose-600" /></div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{risks.filter(r => r.status === 'open').length}</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.openRisks' as TranslationKey)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 rounded-xl"><Icon icon="lucide:clock" className="text-2xl text-amber-600" /></div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{risks.filter(r => r.status === 'mitigating').length}</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.mitigating' as TranslationKey)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-xl"><Icon icon="lucide:check-circle" className="text-2xl text-blue-600" /></div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{risks.filter(r => r.status === 'accepted').length}</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.accepted' as TranslationKey)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl"><Icon icon="lucide:shield-check" className="text-2xl text-emerald-600" /></div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{risks.filter(r => r.status === 'closed').length}</p>
                <p className="text-xs text-slate-500 font-bold uppercase">{t('reports.closed' as TranslationKey)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Risk Matrix and Category Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 5x5 Risk Matrix */}
          <Card className="p-6">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Icon icon="lucide:grid-3x3" className="text-slate-400" />
                {t('reports.riskMatrix' as TranslationKey)}
              </CardTitle>
            </CardHeader>
            <div className="relative">
              <div className={`absolute ${isRTL ? '-right-6' : '-left-6'} top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap`}>
                {t('reports.impact' as TranslationKey)}
              </div>
              <div className="pl-4">
                <div className="grid grid-cols-5 gap-1">
                  {[5, 4, 3, 2, 1].map(impact => (
                    [1, 2, 3, 4, 5].map(likelihood => {
                      const risksInCell = risks.filter(r => r.likelihood === likelihood && r.impact === impact)
                      const cellKey = `${impact}-${likelihood}`
                      const currentSelection = matrixCellSelection?.cellKey === cellKey ? matrixCellSelection.index : 0
                      return (
                        <button
                          key={cellKey}
                          className={cn('aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all cursor-pointer relative', getMatrixCellColor(likelihood, impact), matrixCellSelection?.cellKey === cellKey && 'ring-2 ring-slate-900 ring-offset-1')}
                          onClick={() => {
                            if (risksInCell.length > 0) {
                              if (matrixCellSelection?.cellKey === cellKey) {
                                const nextIndex = (currentSelection + 1) % risksInCell.length
                                setMatrixCellSelection({ cellKey, index: nextIndex }); setSelectedRisk(risksInCell[nextIndex])
                              } else {
                                setMatrixCellSelection({ cellKey, index: 0 }); setSelectedRisk(risksInCell[0])
                              }
                              setIsRiskDrawerOpen(true)
                            }
                          }}
                        >
                          {risksInCell.length > 0 && (
                            <>
                              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold', getRiskDotColor(getRiskScore(likelihood, impact)))}>{risksInCell.length}</div>
                              {risksInCell.length > 1 && matrixCellSelection?.cellKey === cellKey && (
                                <span className="absolute -bottom-0.5 text-[8px] font-bold text-slate-600 bg-white px-1 rounded">{currentSelection + 1}/{risksInCell.length}</span>
                              )}
                            </>
                          )}
                        </button>
                      )
                    })
                  ))}
                </div>
                <div className="text-center mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reports.likelihood' as TranslationKey)}</div>
              </div>
              <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-slate-100">
                {[{ color: 'bg-rose-500', key: 'reports.critical' }, { color: 'bg-orange-500', key: 'reports.high' }, { color: 'bg-amber-400', key: 'reports.medium' }, { color: 'bg-emerald-400', key: 'reports.low' }].map(l => (
                  <div key={l.key} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded ${l.color}`} />
                    <span className="text-[10px] font-bold text-slate-500">{t(l.key as TranslationKey)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Category Distribution with Monitoring */}
          <Card className="p-6">
            <CardHeader className="p-0 mb-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon icon="lucide:pie-chart" className="text-slate-400" />
                  {t('reports.risksByCategory' as TranslationKey)}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{t('reports.monitoringFrequency' as TranslationKey)}:</span>
                  <EditableSelect
                    locked
                    size="sm"
                    className="min-w-[140px]"
                    value={monitoringFrequencyFilter}
                    onChange={(id) => setMonitoringFrequencyFilter(id as MonitoringFrequency | 'all')}
                    items={[
                      { id: 'all', label: t('common.all') },
                      { id: 'weekly', label: t('reports.weekly' as TranslationKey) },
                      { id: 'monthly', label: t('reports.monthly' as TranslationKey) },
                      { id: 'quarterly', label: t('reports.quarterly' as TranslationKey) },
                      { id: 'semi_annual', label: t('reports.semiAnnual' as TranslationKey) },
                      { id: 'annual', label: t('reports.annual' as TranslationKey) },
                    ]}
                    isRTL={isRTL}
                  />
                </div>
              </div>
            </CardHeader>
            <div className="space-y-4">
              {(() => {
                // Render every category that's either a seed (in the store) or
                // referenced by at least one persisted risk. This keeps the legacy
                // five-category bar visible AND surfaces any user-added categories.
                const idsFromStore = riskCategoryItems.map((c) => c.id)
                const idsFromRisks = Array.from(new Set(filteredByMonitoringFrequency.map((r) => r.category)))
                const allIds = Array.from(new Set([...idsFromStore, ...idsFromRisks]))
                return allIds
              })().map(category => {
                const count = filteredByMonitoringFrequency.filter(r => r.category === category).length
                if (count === 0) return null
                const config = getRiskCatConfig(category)
                const categoryItem = riskCategoryItems.find((c) => c.id === category)
                const dueCount = getDueCountForCategory(category)
                const nextReview = getNextReviewForCategory(category)
                const avgProgress = getAvgProgressForCategory(category)
                return (
                  <div key={category} className="p-3 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.color)}><Icon icon={config.icon} className="text-sm" /></div>
                        <div className={isRTL ? 'text-right' : ''}>
                          <span className="text-sm font-bold text-slate-700">{
                            riskCategoryLabelKeys[category]
                              ? t(riskCategoryLabelKeys[category] as TranslationKey)
                              : (isRTL && categoryItem?.labelAr ? categoryItem.labelAr : (categoryItem?.label ?? config.label))
                          }</span>
                          <span className="text-xs text-slate-400 ml-2">{count} {t('reports.risk' as TranslationKey)}{count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            {[...Array(Math.min(count, 5))].map((_, i) => (
                              <div key={i} className={cn('w-2 h-2 rounded-full', i < dueCount ? 'bg-rose-500' : 'bg-slate-200')} />
                            ))}
                          </div>
                          <span className={cn('text-[10px] font-bold', dueCount > 0 ? 'text-rose-600' : 'text-slate-400')}>
                            {dueCount} {t('reports.dueForReview' as TranslationKey)}
                          </span>
                        </div>
                        <div className={`text-right ${isRTL ? 'text-left' : ''}`}>
                          <p className="text-[10px] text-slate-400">{t('reports.nextReview' as TranslationKey)}</p>
                          <p className="text-xs font-bold text-slate-600">{nextReview}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>{t('reports.progress' as TranslationKey)}</span>
                        <span className="font-bold text-slate-600">{avgProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${avgProgress}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Risk List */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900">{t('reports.riskList' as TranslationKey)}</CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 text-sm`} />
                <input type="text" placeholder={t('reports.searchRisks' as TranslationKey)} value={riskSearchTerm} onChange={(e) => setRiskSearchTerm(e.target.value)} className={`${isRTL ? 'pr-9 pl-3' : 'pl-9 pr-3'} py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-48 transition-all`} />
              </div>
              <EditableSelect
                size="sm"
                className="min-w-[160px]"
                value={riskCategoryFilter || null}
                onChange={(id) => setRiskCategoryFilter((id || '') as RiskCategory | '')}
                items={[
                  { id: '', label: t('reports.allCategories' as TranslationKey), isDefault: true },
                  ...riskCategoryItems.map((c) => ({ id: c.id, label: c.label, labelAr: c.labelAr })),
                ]}
                onAdd={(label, labelAr) => addRiskCategory(label, labelAr)}
                onEdit={(id, label, labelAr) => id ? editRiskCategory(id, { label, labelAr }) : undefined}
                onDelete={(id) => { if (id) removeRiskCategory(id) }}
                isRTL={isRTL}
              />
              <EditableSelect
                locked
                size="sm"
                className="min-w-[140px]"
                value={riskStatusFilter || null}
                onChange={(id) => setRiskStatusFilter((id || '') as RiskStatus | '')}
                items={[
                  { id: '', label: t('reports.allStatuses' as TranslationKey) },
                  { id: 'open', label: t('reports.open' as TranslationKey) },
                  { id: 'mitigating', label: t('reports.mitigating' as TranslationKey) },
                  { id: 'accepted', label: t('reports.accepted' as TranslationKey) },
                  { id: 'closed', label: t('reports.closed' as TranslationKey) },
                ]}
                isRTL={isRTL}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {showRisksSkeleton ? (
              <div className="p-6">
                <ListSkeleton rows={5} columns={6} />
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-y border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left cursor-pointer hover:text-slate-600 transition-colors select-none" onClick={() => handleRiskSort('name')}>{t('reports.risk' as TranslationKey)} <RiskSortIcon field="name" /></th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left cursor-pointer hover:text-slate-600 transition-colors select-none" onClick={() => handleRiskSort('category')}>{t('reports.category' as TranslationKey)} <RiskSortIcon field="category" /></th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left cursor-pointer hover:text-slate-600 transition-colors select-none" onClick={() => handleRiskSort('riskScore')}>{t('reports.score' as TranslationKey)} <RiskSortIcon field="riskScore" /></th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left cursor-pointer hover:text-slate-600 transition-colors select-none" onClick={() => handleRiskSort('status')}>{t('common.status')} <RiskSortIcon field="status" /></th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left cursor-pointer hover:text-slate-600 transition-colors select-none" onClick={() => handleRiskSort('owner')}>{t('reports.owner' as TranslationKey)} <RiskSortIcon field="owner" /></th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRisks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-4 bg-slate-100 rounded-full">
                            <Icon icon="lucide:shield-off" className="text-3xl text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 mb-1">{t('reports.noRisksFound' as TranslationKey)}</p>
                            <p className="text-xs text-slate-500">{t('reports.addFirstRisk' as TranslationKey)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {paginatedRisks.map(risk => {
                    const score = getRiskScore(risk.likelihood, risk.impact)
                    const level = getRiskLevel(score)
                    const categoryConfig = getRiskCatConfig(risk.category)
                    const riskCatItem = riskCategoryItems.find((c) => c.id === risk.category)
                    const statusConf = riskStatusConfig[risk.status]
                    return (
                      <tr
                        key={risk.id}
                        className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => { setSelectedRisk(risk); setIsRiskDrawerOpen(true) }}
                      >
                        <td className="px-6 py-4">
                          <div><span className="text-xs font-bold text-slate-400">{risk.id}</span><p className="text-sm font-bold text-slate-900">{risk.name}</p><p className="text-xs text-slate-500 line-clamp-1">{risk.description}</p></div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit', categoryConfig.color)}>
                            <Icon icon={categoryConfig.icon} className="text-xs" />{
                              riskCategoryLabelKeys[risk.category]
                                ? t(riskCategoryLabelKeys[risk.category] as TranslationKey)
                                : (isRTL && riskCatItem?.labelAr ? riskCatItem.labelAr : (riskCatItem?.label ?? categoryConfig.label))
                            }
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-3 h-3 rounded', level.bgColor)} />
                            <span className={cn('text-sm font-bold', level.color)}>{score}</span>
                            <span className="text-xs text-slate-400">({t(level.labelKey as TranslationKey)})</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', statusConf.color)}>{t(riskStatusLabelKeys[risk.status] as TranslationKey)}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <img src={dicebearAvatar(risk.owner.avatar || risk.owner.name)} className="w-7 h-7 rounded-full border border-slate-200" alt={risk.owner.name} />
                            <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-700">{risk.owner.name}</p><p className="text-[10px] text-slate-400">{risk.owner.department}</p></div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setSelectedRisk(risk); setIsRiskDrawerOpen(true) }} className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"><Icon icon="lucide:eye" className="text-lg" /></button>
                            <button onClick={(e) => { e.stopPropagation(); setRiskToDelete(risk); setShowRiskDeleteConfirm(true) }} className="text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"><Icon icon="lucide:trash-2" className="text-lg" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
            {sortedRisks.length > RISKS_PER_PAGE && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                <span className="text-xs text-slate-500" dir="ltr">{(riskPage - 1) * RISKS_PER_PAGE + 1}–{Math.min(riskPage * RISKS_PER_PAGE, sortedRisks.length)} / {sortedRisks.length}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setRiskPage((p) => Math.max(1, p - 1))} disabled={riskPage === 1} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="w-3.5 h-3.5" /></button>
                  <span className="text-xs font-bold text-slate-700" dir="ltr">{riskPage} / {totalRiskPages}</span>
                  <button onClick={() => setRiskPage((p) => Math.min(totalRiskPages, p + 1))} disabled={riskPage === totalRiskPages} className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"><Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk Detail Drawer */}
      <Drawer isOpen={isRiskDrawerOpen} onClose={() => setIsRiskDrawerOpen(false)} title={selectedRisk?.name || t('reports.riskDetails' as TranslationKey)} hideBackdrop isRTL={isRTL}>
        {selectedRisk && (() => {
          const score = getRiskScore(selectedRisk.likelihood, selectedRisk.impact)
          const level = getRiskLevel(score)
          const categoryConfig = getRiskCatConfig(selectedRisk.category)
          const selectedCatItem = riskCategoryItems.find((c) => c.id === selectedRisk.category)
          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg', level.bgColor)}>{score}</div>
                  <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase">{t('reports.riskScore' as TranslationKey)}</p><p className={cn('text-sm font-bold', level.color)}>{t(level.labelKey as TranslationKey)} {t('reports.risk' as TranslationKey)}</p></div>
                </div>
                <EditableSelect
                  locked
                  size="sm"
                  className="min-w-[140px]"
                  value={selectedRisk.status}
                  onChange={(id) => updateRiskStatus(selectedRisk.id, uiStatusToStoreStatus(id as RiskStatus))}
                  items={[
                    { id: 'open', label: t('reports.open' as TranslationKey) },
                    { id: 'mitigating', label: t('reports.mitigating' as TranslationKey) },
                    { id: 'accepted', label: t('reports.accepted' as TranslationKey) },
                    { id: 'closed', label: t('reports.closed' as TranslationKey) },
                  ]}
                  isRTL={isRTL}
                />
              </div>
              <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.category' as TranslationKey)}</p><span className={cn('text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1', categoryConfig.color)}><Icon icon={categoryConfig.icon} />{
                  riskCategoryLabelKeys[selectedRisk.category]
                    ? t(riskCategoryLabelKeys[selectedRisk.category] as TranslationKey)
                    : (isRTL && selectedCatItem?.labelAr ? selectedCatItem.labelAr : (selectedCatItem?.label ?? categoryConfig.label))
                }</span></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.likelihood' as TranslationKey)}</p><p className="text-lg font-bold text-slate-900">{selectedRisk.likelihood}/5</p><p className="text-xs text-slate-500 mt-0.5">{renderLikelihoodLabel(selectedRisk.likelihood)}</p></div>
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.impact' as TranslationKey)}</p><p className="text-lg font-bold text-slate-900">{selectedRisk.impact}/5</p><p className="text-xs text-slate-500 mt-0.5">{renderImpactLabel(selectedRisk.impact)}</p></div>
              </div>
              <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.description' as TranslationKey)}</p><p className="text-sm text-slate-600">{selectedRisk.description}</p></div>
              <div className="p-4 bg-slate-50 rounded-xl flex items-center gap-3">
                <img src={dicebearAvatar(selectedRisk.owner.avatar || selectedRisk.owner.name)} className="w-10 h-10 rounded-full border-2 border-white" alt={selectedRisk.owner.name} />
                <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase">{t('reports.owner' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.owner.name}</p><p className="text-xs text-slate-500">{selectedRisk.owner.department}</p></div>
              </div>

              {/* Officer-driven mitigation workflow */}
              {(() => {
                const storeRisk = storeRisks.find((r) => r.id === selectedRisk.id)
                if (!storeRisk) return null
                const wfStatus = storeRisk.mitigationWorkflowStatus ?? 'pending-assignment'
                const wfMeta: Record<string, { bg: string; text: string; label: string }> = {
                  'not-started':        { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Not started' },
                  'pending-assignment': { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Pending assignment' },
                  'sent-to-department': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Sent to department' },
                  'plan-proposed':      { bg: 'bg-violet-100', text: 'text-violet-700', label: 'Plan proposed' },
                  'plan-accepted':      { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Plan accepted' },
                  'in-progress':        { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In progress' },
                  'mitigated':          { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Mitigated' },
                  'overdue':            { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Overdue' },
                }
                // Defensive fallback: never crash on an unknown workflow status.
                const meta = wfMeta[wfStatus] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: wfStatus }
                const canSend = !!storeRisk.intendedDepartmentId && !!storeRisk.mitigationDeadline && wfStatus === 'pending-assignment'
                return (
                  <div className="p-4 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mitigation Workflow</p>
                      <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full', meta.bg, meta.text)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Intended department</p>
                        <EditableSelect
                          value={storeRisk.intendedDepartmentId ?? null}
                          onChange={(id) => assignDept(storeRisk.id, id)}
                          items={deptList.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                          placeholder="Assign a department..."
                          onAdd={(label, labelAr) => addDept(label, labelAr ?? label).id}
                          onEdit={(id, label, labelAr) => updateDept(id, { name: label, nameAr: labelAr ?? label })}
                          onDelete={(id) => removeDept(id)}
                          isRTL={isRTL}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Mitigation deadline</p>
                        <InlineDeadlinePicker
                          value={storeRisk.mitigationDeadline}
                          onChange={(next) => {
                            setMitigationDeadlineAction(storeRisk.id, next)
                          }}
                          label="deadline"
                          size="md"
                        />
                      </div>
                      {wfStatus === 'pending-assignment' && (
                        <button
                          type="button"
                          disabled={!canSend}
                          onClick={() => sendToDepartment(storeRisk.id, actingUser)}
                          className={cn(
                            'w-full mt-1 py-2 text-xs font-bold rounded-lg transition-all',
                            canSend
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                          )}
                        >
                          <Icon icon="lucide:send" className="inline-block mr-1" />
                          Send to department
                        </button>
                      )}
                      {wfStatus === 'sent-to-department' && (
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-500 italic">
                            Awaiting mitigation plan from{' '}
                            {deptList.find((d) => d.id === storeRisk.intendedDepartmentId)?.name ?? 'department'}.
                          </p>
                          {!proposePlanOpen && (
                            <button
                              type="button"
                              onClick={() => setProposePlanOpen(true)}
                              className="w-full py-2 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-all cursor-pointer"
                            >
                              <Icon icon="lucide:clipboard-plus" className="inline-block mr-1" />
                              {t('risks.proposeMitigationPlanCta' as TranslationKey)}
                            </button>
                          )}
                          {proposePlanOpen && (() => {
                            const validItems = proposePlanItems.filter((it) => it.text.trim().length > 0)
                            const isValid = proposePlanText.trim().length > 0 && validItems.length > 0
                            return (
                              <div className="mt-1 p-3 bg-violet-50/60 rounded-lg border border-violet-200 space-y-3">
                                <p className="text-xs font-bold text-violet-700 uppercase tracking-wider">
                                  {t('risks.proposeMitigationPlan' as TranslationKey)}
                                </p>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">
                                    {t('risks.planDescription' as TranslationKey)}
                                  </label>
                                  <textarea
                                    rows={3}
                                    value={proposePlanText}
                                    onChange={(e) => setProposePlanText(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">
                                    {t('risks.checklistItems' as TranslationKey)}
                                  </label>
                                  <div className="space-y-2">
                                    {proposePlanItems.map((item, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2 p-2 bg-white rounded-md border border-slate-200"
                                      >
                                        <input
                                          type="text"
                                          value={item.text}
                                          placeholder={t('risks.itemTextPlaceholder' as TranslationKey)}
                                          onChange={(e) => {
                                            const next = [...proposePlanItems]
                                            next[idx] = { ...next[idx], text: e.target.value }
                                            setProposePlanItems(next)
                                          }}
                                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                        <InlineDeadlinePicker
                                          value={item.deadline}
                                          onChange={(next) => {
                                            const updated = [...proposePlanItems]
                                            updated[idx] = { ...updated[idx], deadline: next }
                                            setProposePlanItems(updated)
                                          }}
                                          parentDeadline={storeRisk.mitigationDeadline}
                                          label="deadline"
                                          size="sm"
                                        />
                                        {proposePlanItems.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setProposePlanItems(
                                                proposePlanItems.filter((_, i) => i !== idx),
                                              )
                                            }
                                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                            aria-label="Remove item"
                                          >
                                            <Icon icon="lucide:x" className="text-sm" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setProposePlanItems([
                                        ...proposePlanItems,
                                        { text: '', deadline: undefined },
                                      ])
                                    }
                                    className="mt-2 text-[11px] font-bold text-violet-700 hover:text-violet-900 cursor-pointer flex items-center gap-1"
                                  >
                                    <Icon icon="lucide:plus" className="text-xs" />
                                    {t('risks.addChecklistItem' as TranslationKey)}
                                  </button>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    disabled={!isValid}
                                    onClick={() => submitProposePlan(storeRisk.id)}
                                    className={cn(
                                      'flex-1 py-2 text-xs font-bold rounded-lg transition-all',
                                      isValid
                                        ? 'bg-violet-600 text-white hover:bg-violet-700 cursor-pointer'
                                        : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                                    )}
                                  >
                                    {t('risks.submit' as TranslationKey)}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetProposePlanForm}
                                    className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                                  >
                                    {t('risks.cancel' as TranslationKey)}
                                  </button>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                      {storeRisk.departmentProposedPlan && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Department-proposed plan</p>
                          <p className="text-xs text-slate-700 whitespace-pre-line">{storeRisk.departmentProposedPlan.plan}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Submitted by {storeRisk.departmentProposedPlan.submittedBy} on{' '}
                            {new Date(storeRisk.departmentProposedPlan.submittedAt).toLocaleDateString()}
                          </p>
                          {storeRisk.departmentProposedPlan.checklist.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {storeRisk.departmentProposedPlan.checklist.map((it) => (
                                <li key={it.id} className="flex items-center gap-2 text-[11px] text-slate-700">
                                  <Icon icon="lucide:circle" className="text-[10px] text-slate-400" />
                                  <span>{it.text}</span>
                                  {it.deadline && (
                                    <span className="ms-auto text-[10px] text-slate-400">{it.deadline}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {wfStatus === 'plan-proposed' && (
                            <button
                              type="button"
                              onClick={() => acceptDepartmentPlan(storeRisk.id, actingUser)}
                              className="mt-3 w-full py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all cursor-pointer shadow-sm shadow-emerald-100 flex items-center justify-center gap-1.5"
                            >
                              <Icon icon="lucide:check-circle-2" className="text-sm" />
                              Accept plan and start tracking
                            </button>
                          )}
                          {(wfStatus === 'in-progress' || wfStatus === 'mitigated') && (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] font-bold text-slate-500 uppercase">Officer evaluation</p>
                              {(storeRisk.mitigationChecklist ?? []).map((item) => (
                                <label key={item.id} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.completed}
                                    onChange={() => toggleDeptPlanItem(storeRisk.id, item.id, actingUser)}
                                    className="rounded border-slate-300"
                                  />
                                  <span className={item.completed ? 'line-through text-slate-400' : ''}>
                                    {item.text}
                                  </span>
                                  {item.deadline && (
                                    <span className="ms-auto text-[10px] text-slate-400">{item.deadline}</span>
                                  )}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
              <div className={isRTL ? 'text-right' : ''}>
                {selectedRisk.mitigationPlan && <div className="mb-4"><p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.mitigationPlan' as TranslationKey)}</p><p className="text-sm text-slate-600">{selectedRisk.mitigationPlan}</p></div>}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-slate-500">{t('reports.progress' as TranslationKey)}</span><span className="text-xs font-bold text-emerald-600">{selectedRisk.mitigationProgress}%</span></div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${selectedRisk.mitigationProgress}%` }} /></div>
                </div>
                <ChecklistSection items={selectedRisk.mitigationChecklist || []} onAdd={(text) => addMitigationItem(selectedRisk.id, text)} onEdit={(itemId, newText) => editMitigationItem(selectedRisk.id, itemId, newText)} onRemove={(itemId) => removeMitigationItem(selectedRisk.id, itemId)} onToggle={(itemId) => toggleMitigationItem(selectedRisk.id, itemId)} isRTL={isRTL} titleKey="reports.mitigationChecklist" completionKey="reports.mitigationComplete" addPlaceholderKey="reports.addMitigationItem" removeTooltipKey="reports.removeMitigationItem" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.monitoringFrequency' as TranslationKey)}</p><span className="text-sm font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{monitoringFrequencyLabels[selectedRisk.monitoringFrequency]}</span></div>
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.nextReview' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.nextReviewDate ? formatDate(selectedRisk.nextReviewDate) : '-'}</p></div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className={`flex items-center justify-between`}>
                  <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.lastReview' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.lastReviewDate ? formatDate(selectedRisk.lastReviewDate) : '-'}</p></div>
                  <button onClick={() => markReviewed(selectedRisk.id)} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all cursor-pointer">{t('reports.markAsReviewed' as TranslationKey)}</button>
                </div>
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-3">{t('reports.auditTrail' as TranslationKey)}</p>
                <div className="relative">
                  <div className={`absolute ${isRTL ? 'right-[7px]' : 'left-[7px]'} top-3 bottom-3 w-0.5 bg-slate-200`} />
                  <div className="space-y-4">
                    {[...selectedRisk.history].reverse().map((entry) => (
                      <div key={entry.id} className="relative flex gap-3">
                        <div className={cn('w-4 h-4 rounded-full shrink-0 z-10 border-2 border-white', historyActionColors[entry.action])} />
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{formatDate(entry.timestamp)}</span>
                            <span className="text-[10px] text-slate-400">-</span>
                            <span className="text-[10px] font-bold text-slate-600">{entry.user}</span>
                          </div>
                          <p className="text-xs text-slate-900 mt-1">
                            <span className="font-bold">{historyActionLabels[entry.action]}</span>
                            {entry.previousValue && entry.newValue && <span className="text-slate-500">: {entry.previousValue} → {entry.newValue}</span>}
                            {!entry.previousValue && entry.newValue && <span className="text-slate-500">: {entry.newValue}</span>}
                          </p>
                          {entry.notes && <p className="text-[10px] text-slate-500 mt-1 italic">"{entry.notes}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all cursor-pointer" onClick={() => { const sanitizedName = selectedRisk.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(); exportRisksLocalized([selectedRisk], `risk-${sanitizedName}-${new Date().toISOString().slice(0, 10)}`, t, isRTL) }}>{t('reports.exportRisk' as TranslationKey)}</button>
                <Gate perm="Manage Audit Findings">
                  <button className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all cursor-pointer" onClick={() => {
                    setEditingRiskId(selectedRisk.id); setNewRiskName(selectedRisk.name); setNewRiskCategory(selectedRisk.category); setNewRiskDescription(selectedRisk.description)
                    setNewRiskLikelihood(selectedRisk.likelihood); setNewRiskImpact(selectedRisk.impact); setNewRiskMitigation(selectedRisk.mitigationPlan || '')
                    setNewRiskMonitoringFrequency(selectedRisk.monitoringFrequency)
                    setNewRiskSchedule(selectedRisk.reviewSchedule ?? { cadence: 'monthly', dayOfMonth: 1 })
                    const storeRisk = storeRisks.find(r => r.id === selectedRisk.id)
                    setFrameworkIds(storeRisk?.frameworkIds ?? [])
                    const matchingMember = teamMembers.find(m => m.name === selectedRisk.owner.name)
                    setNewRiskOwnerId(matchingMember?.id || ''); setShowAddRiskModal(true); setIsRiskDrawerOpen(false)
                  }}>{t('reports.editRisk' as TranslationKey)}</button>
                </Gate>
                <Gate perm="Manage Audit Findings">
                  <button className="bg-rose-100 text-rose-600 py-3 px-4 rounded-xl font-bold text-xs hover:bg-rose-200 transition-all cursor-pointer" onClick={() => { setRiskToDelete(selectedRisk); setShowRiskDeleteConfirm(true) }}><Icon icon="lucide:trash-2" className="text-base" /></button>
                </Gate>
              </div>
            </div>
          )
        })()}
      </Drawer>

      {/* Add/Edit Risk Modal */}
      <Modal isOpen={showAddRiskModal} onClose={() => { resetAddRiskForm(); setShowAddRiskModal(false) }} title={editingRiskId ? t('reports.editRisk' as TranslationKey) : t('reports.addNewRisk' as TranslationKey)} subtitle={editingRiskId ? undefined : t('reports.createNewRiskEntry' as TranslationKey)} size="lg">
        <div className="space-y-4">
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.riskName' as TranslationKey)} *</label><input type="text" value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} placeholder={t('reports.enterRiskName' as TranslationKey)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.category' as TranslationKey)} *</label>
              <EditableSelect
                value={newRiskCategory || null}
                onChange={(id) => setNewRiskCategory(id as RiskCategory | '')}
                items={riskCategoryItems}
                placeholder={t('reports.selectCategory' as TranslationKey)}
                onAdd={(label, labelAr) => addRiskCategory(label, labelAr)}
                onEdit={(id, label, labelAr) => editRiskCategory(id, { label, labelAr })}
                onDelete={(id) => removeRiskCategory(id)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.owner' as TranslationKey)} *</label>
              <EditableSelect
                locked
                value={newRiskOwnerId || null}
                onChange={(id) => setNewRiskOwnerId(id)}
                items={teamMembers.filter(m => m.status === 'active').map((member) => ({
                  id: member.id,
                  label: `${member.name} - ${member.department}`,
                }))}
                placeholder={t('reports.selectOwner' as TranslationKey)}
                isRTL={isRTL}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.likelihood' as TranslationKey)} *</label>
              <EditableSelect
                locked
                value={String(newRiskLikelihood)}
                onChange={(id) => setNewRiskLikelihood(Number(id) as 1 | 2 | 3 | 4 | 5)}
                items={[1, 2, 3, 4, 5].map((n) => ({
                  id: String(n),
                  label: `${n} - ${renderLikelihoodLabel(n as 1 | 2 | 3 | 4 | 5)}`,
                }))}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.impact' as TranslationKey)} *</label>
              <EditableSelect
                locked
                value={String(newRiskImpact)}
                onChange={(id) => setNewRiskImpact(Number(id) as 1 | 2 | 3 | 4 | 5)}
                items={[1, 2, 3, 4, 5].map((n) => ({
                  id: String(n),
                  label: `${n} - ${renderImpactLabel(n as 1 | 2 | 3 | 4 | 5)}`,
                }))}
                isRTL={isRTL}
              />
            </div>
          </div>
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.description' as TranslationKey)} *</label><textarea rows={3} value={newRiskDescription} onChange={(e) => setNewRiskDescription(e.target.value)} placeholder={t('reports.enterRiskDescription' as TranslationKey)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.mitigationPlan' as TranslationKey)}</label><textarea rows={2} value={newRiskMitigation} onChange={(e) => setNewRiskMitigation(e.target.value)} placeholder={t('reports.enterMitigationPlan' as TranslationKey)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <ReviewSchedulePicker value={newRiskSchedule} onChange={setNewRiskSchedule} t={t} isRTL={isRTL} />
          <FrameworkTagSelector value={frameworkIds} onChange={setFrameworkIds} label="Frameworks" />
          <div className="flex gap-3 mt-6">
            <LoadingButton
              className="flex-1"
              loading={isMutating}
              disabled={!newRiskName || !newRiskCategory || !newRiskOwnerId || !newRiskDescription}
              onClick={handleCreateRisk}
            >
              <Icon icon={editingRiskId ? 'lucide:save' : 'lucide:plus'} />
              {editingRiskId ? t('common.saveChanges') : t('reports.createRisk' as TranslationKey)}
            </LoadingButton>
            <button onClick={() => { resetAddRiskForm(); setShowAddRiskModal(false) }} className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer">{t('common.cancel')}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Risk Confirmation */}
      <DeleteConfirmationDialog
        isOpen={showRiskDeleteConfirm}
        onClose={() => { setShowRiskDeleteConfirm(false); setRiskToDelete(null) }}
        onConfirm={async () => {
          if (riskToDelete) {
            await deleteRisk(riskToDelete.id)
            if (selectedRisk?.id === riskToDelete.id) { setSelectedRisk(null); setIsRiskDrawerOpen(false) }
          }
        }}
        itemType={t('reports.risk' as TranslationKey)}
        itemName={riskToDelete?.name || ''}
        description={
          riskToDelete
            ? `This will permanently delete the risk "${riskToDelete.name}" and all its mitigation plans, checklist, history, and attachments. This cannot be undone.`
            : undefined
        }
      />
    </div>
  )
}
