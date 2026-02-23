'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useRiskStore } from '@/stores/risk-store'
import { useTeamStore } from '@/stores/team-store'
import { exportRisksLocalized } from '@/lib/export'
import type { TranslationKey } from '@/i18n'
import { ChecklistSection } from '@/components/observations/detail/checklist-section'

// Types
type RiskCategory = 'operational' | 'financial' | 'compliance' | 'strategic' | 'reputational'
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
  history: RiskHistoryEntry[]
  createdAt: Date
  updatedAt: Date
}

// Configs
const riskCategoryConfig: Record<RiskCategory, { label: string; icon: string; color: string }> = {
  operational: { label: 'Operational', icon: 'lucide:settings', color: 'bg-blue-100 text-blue-700' },
  financial: { label: 'Financial', icon: 'lucide:dollar-sign', color: 'bg-emerald-100 text-emerald-700' },
  compliance: { label: 'Compliance', icon: 'lucide:shield', color: 'bg-purple-100 text-purple-700' },
  strategic: { label: 'Strategic', icon: 'lucide:target', color: 'bg-amber-100 text-amber-700' },
  reputational: { label: 'Reputational', icon: 'lucide:users', color: 'bg-rose-100 text-rose-700' },
}

const riskStatusConfig: Record<RiskStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-rose-100 text-rose-700' },
  mitigating: { label: 'Mitigating', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700' },
}

const riskCategoryLabelKeys: Record<RiskCategory, string> = {
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

  // Risk store
  const storeRisks = useRiskStore((s) => s.risks)
  const createRisk = useRiskStore((s) => s.create)
  const updateRisk = useRiskStore((s) => s.update)
  const updateRiskStatus = useRiskStore((s) => s.updateStatus)
  const deleteRisk = useRiskStore((s) => s.delete)
  const addMitigationItem = useRiskStore((s) => s.addMitigationItem)
  const editMitigationItem = useRiskStore((s) => s.editMitigationItem)
  const toggleMitigationItem = useRiskStore((s) => s.toggleMitigationItem)
  const removeMitigationItem = useRiskStore((s) => s.removeMitigationItem)
  const markReviewed = useRiskStore((s) => s.markReviewed)
  const teamMembers = useTeamStore((s) => s.members)

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

  const resetAddRiskForm = () => {
    setNewRiskName(''); setNewRiskCategory(''); setNewRiskOwnerId(''); setNewRiskLikelihood(3); setNewRiskImpact(3)
    setNewRiskDescription(''); setNewRiskMitigation(''); setNewRiskMonitoringFrequency('monthly'); setEditingRiskId(null)
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
        history: [...(existingStoreRisk?.history || []), editHistoryEntry],
      })
    } else {
      await createRisk({
        title: newRiskName, description: newRiskDescription, category: newRiskCategory, likelihood: newRiskLikelihood, impact: newRiskImpact,
        status: 'identified',
        owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, department: owner.department, workload: owner.workload },
        mitigationPlan: newRiskMitigation || undefined, mitigationProgress: 0, monitoringFrequency: newRiskMonitoringFrequency,
      })
    }
    resetAddRiskForm(); setShowAddRiskModal(false)
  }

  // Sync selectedRisk
  useEffect(() => {
    if (selectedRisk) {
      const updated = risks.find(r => r.id === selectedRisk.id)
      if (updated && (updated.status !== selectedRisk.status || updated.updatedAt.getTime() !== selectedRisk.updatedAt.getTime())) {
        setSelectedRisk(updated)
      }
    }
  }, [risks]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return nextReview.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  const totalRiskPages = Math.max(1, Math.ceil(sortedRisks.length / RISKS_PER_PAGE))
  const paginatedRisks = sortedRisks.slice((riskPage - 1) * RISKS_PER_PAGE, riskPage * RISKS_PER_PAGE)

  useEffect(() => { setRiskPage(1) }, [riskSearchTerm, riskCategoryFilter, riskStatusFilter])

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">
              {pathname.startsWith('/reports/audits') ? t('reports.auditManagement' as TranslationKey) : t('reports.auditReports' as TranslationKey)}
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {pathname.startsWith('/reports/audits') ? t('reports.organizationAudits' as TranslationKey) : t('reports.analyticsFindings' as TranslationKey)}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/reports/audits" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/audits') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsTab' as TranslationKey)}
            </Link>
            <Link href="/reports/executive" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/executive') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.executiveView' as TranslationKey)}
            </Link>
            <Link href="/reports/detailed" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/detailed') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.auditsLogs' as TranslationKey)}
            </Link>
            <Link href="/reports/risks" className={cn('px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer', pathname.startsWith('/reports/risks') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900')}>
              {t('reports.tabs.risks' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
            title={t('reports.exportReports')}
            onClick={() => exportRisksLocalized(sortedRisks, 'risk-register', t, isRTL)}
          >
            <Icon icon="lucide:download-cloud" className="text-lg" />
          </button>
          <Button className="shadow-lg shadow-emerald-100" onClick={() => setShowAddRiskModal(true)}>
            <Icon icon="lucide:plus" />
            {t('reports.addRisk' as TranslationKey)}
          </Button>
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
                  <select value={monitoringFrequencyFilter} onChange={(e) => setMonitoringFrequencyFilter(e.target.value as MonitoringFrequency | 'all')} className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="all">{t('common.all')}</option>
                    <option value="weekly">{t('reports.weekly' as TranslationKey)}</option>
                    <option value="monthly">{t('reports.monthly' as TranslationKey)}</option>
                    <option value="quarterly">{t('reports.quarterly' as TranslationKey)}</option>
                    <option value="semi_annual">{t('reports.semiAnnual' as TranslationKey)}</option>
                    <option value="annual">{t('reports.annual' as TranslationKey)}</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <div className="space-y-4">
              {(['operational', 'financial', 'compliance', 'strategic', 'reputational'] as RiskCategory[]).map(category => {
                const count = filteredByMonitoringFrequency.filter(r => r.category === category).length
                if (count === 0) return null
                const config = riskCategoryConfig[category]
                const dueCount = getDueCountForCategory(category)
                const nextReview = getNextReviewForCategory(category)
                const avgProgress = getAvgProgressForCategory(category)
                return (
                  <div key={category} className="p-3 border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.color)}><Icon icon={config.icon} className="text-sm" /></div>
                        <div className={isRTL ? 'text-right' : ''}>
                          <span className="text-sm font-bold text-slate-700">{t(riskCategoryLabelKeys[category] as TranslationKey)}</span>
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
              <select value={riskCategoryFilter} onChange={(e) => setRiskCategoryFilter(e.target.value as RiskCategory | '')} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">{t('reports.allCategories' as TranslationKey)}</option>
                <option value="operational">{t('reports.operational' as TranslationKey)}</option>
                <option value="financial">{t('reports.financial' as TranslationKey)}</option>
                <option value="compliance">{t('reports.compliance' as TranslationKey)}</option>
                <option value="strategic">{t('reports.strategic' as TranslationKey)}</option>
                <option value="reputational">{t('reports.reputational' as TranslationKey)}</option>
              </select>
              <select value={riskStatusFilter} onChange={(e) => setRiskStatusFilter(e.target.value as RiskStatus | '')} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">{t('reports.allStatuses' as TranslationKey)}</option>
                <option value="open">{t('reports.open' as TranslationKey)}</option>
                <option value="mitigating">{t('reports.mitigating' as TranslationKey)}</option>
                <option value="accepted">{t('reports.accepted' as TranslationKey)}</option>
                <option value="closed">{t('reports.closed' as TranslationKey)}</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
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
                  {paginatedRisks.map(risk => {
                    const score = getRiskScore(risk.likelihood, risk.impact)
                    const level = getRiskLevel(score)
                    const categoryConfig = riskCategoryConfig[risk.category]
                    const statusConf = riskStatusConfig[risk.status]
                    return (
                      <tr key={risk.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div><span className="text-xs font-bold text-slate-400">{risk.id}</span><p className="text-sm font-bold text-slate-900">{risk.name}</p><p className="text-xs text-slate-500 line-clamp-1">{risk.description}</p></div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit', categoryConfig.color)}>
                            <Icon icon={categoryConfig.icon} className="text-xs" />{t(riskCategoryLabelKeys[risk.category] as TranslationKey)}
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
                            <img src={risk.owner.avatar} className="w-7 h-7 rounded-full border border-slate-200" alt={risk.owner.name} />
                            <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-700">{risk.owner.name}</p><p className="text-[10px] text-slate-400">{risk.owner.department}</p></div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setSelectedRisk(risk); setIsRiskDrawerOpen(true) }} className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"><Icon icon="lucide:eye" className="text-lg" /></button>
                            <button onClick={() => { setRiskToDelete(risk); setShowRiskDeleteConfirm(true) }} className="text-slate-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"><Icon icon="lucide:trash-2" className="text-lg" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
          const categoryConfig = riskCategoryConfig[selectedRisk.category]
          const statusConf = riskStatusConfig[selectedRisk.status]
          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg', level.bgColor)}>{score}</div>
                  <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase">{t('reports.riskScore' as TranslationKey)}</p><p className={cn('text-sm font-bold', level.color)}>{t(level.labelKey as TranslationKey)} {t('reports.risk' as TranslationKey)}</p></div>
                </div>
                <select value={selectedRisk.status} onChange={(e) => updateRiskStatus(selectedRisk.id, uiStatusToStoreStatus(e.target.value as RiskStatus))} className={cn('px-3 py-1 text-xs font-bold rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500', statusConf.color)}>
                  <option value="open">{t('reports.open' as TranslationKey)}</option>
                  <option value="mitigating">{t('reports.mitigating' as TranslationKey)}</option>
                  <option value="accepted">{t('reports.accepted' as TranslationKey)}</option>
                  <option value="closed">{t('reports.closed' as TranslationKey)}</option>
                </select>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.category' as TranslationKey)}</p><span className={cn('text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1', categoryConfig.color)}><Icon icon={categoryConfig.icon} />{t(riskCategoryLabelKeys[selectedRisk.category] as TranslationKey)}</span></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.likelihood' as TranslationKey)}</p><p className="text-lg font-bold text-slate-900">{selectedRisk.likelihood}/5</p></div>
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.impact' as TranslationKey)}</p><p className="text-lg font-bold text-slate-900">{selectedRisk.impact}/5</p></div>
              </div>
              <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase mb-2">{t('reports.description' as TranslationKey)}</p><p className="text-sm text-slate-600">{selectedRisk.description}</p></div>
              <div className="p-4 bg-slate-50 rounded-xl flex items-center gap-3">
                <img src={selectedRisk.owner.avatar} className="w-10 h-10 rounded-full border-2 border-white" alt={selectedRisk.owner.name} />
                <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase">{t('reports.owner' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.owner.name}</p><p className="text-xs text-slate-500">{selectedRisk.owner.department}</p></div>
              </div>
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
                <div className="p-4 bg-slate-50 rounded-xl"><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.nextReview' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.nextReviewDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '-'}</p></div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}><p className="text-xs font-bold text-slate-400 uppercase mb-1">{t('reports.lastReview' as TranslationKey)}</p><p className="text-sm font-bold text-slate-900">{selectedRisk.lastReviewDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '-'}</p></div>
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
                            <span className="text-[10px] text-slate-400">{entry.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
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
                <button className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs hover:bg-emerald-700 transition-all cursor-pointer" onClick={() => {
                  setEditingRiskId(selectedRisk.id); setNewRiskName(selectedRisk.name); setNewRiskCategory(selectedRisk.category); setNewRiskDescription(selectedRisk.description)
                  setNewRiskLikelihood(selectedRisk.likelihood); setNewRiskImpact(selectedRisk.impact); setNewRiskMitigation(selectedRisk.mitigationPlan || '')
                  setNewRiskMonitoringFrequency(selectedRisk.monitoringFrequency)
                  const matchingMember = teamMembers.find(m => m.name === selectedRisk.owner.name)
                  setNewRiskOwnerId(matchingMember?.id || ''); setShowAddRiskModal(true); setIsRiskDrawerOpen(false)
                }}>{t('reports.editRisk' as TranslationKey)}</button>
                <button className="bg-rose-100 text-rose-600 py-3 px-4 rounded-xl font-bold text-xs hover:bg-rose-200 transition-all cursor-pointer" onClick={() => { setRiskToDelete(selectedRisk); setShowRiskDeleteConfirm(true) }}><Icon icon="lucide:trash-2" className="text-base" /></button>
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
            <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.category' as TranslationKey)} *</label><select value={newRiskCategory} onChange={(e) => setNewRiskCategory(e.target.value as RiskCategory | '')} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="">{t('reports.selectCategory' as TranslationKey)}</option><option value="operational">{t('reports.operational' as TranslationKey)}</option><option value="financial">{t('reports.financial' as TranslationKey)}</option><option value="compliance">{t('reports.compliance' as TranslationKey)}</option><option value="strategic">{t('reports.strategic' as TranslationKey)}</option><option value="reputational">{t('reports.reputational' as TranslationKey)}</option></select></div>
            <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.owner' as TranslationKey)} *</label><select value={newRiskOwnerId} onChange={(e) => setNewRiskOwnerId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="">{t('reports.selectOwner' as TranslationKey)}</option>{teamMembers.filter(m => m.status === 'active').map((member) => (<option key={member.id} value={member.id}>{member.name} - {member.department}</option>))}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.likelihood' as TranslationKey)} *</label><select value={newRiskLikelihood} onChange={(e) => setNewRiskLikelihood(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="1">1 - {t('riskRegister.rare' as TranslationKey)}</option><option value="2">2 - {t('riskRegister.unlikely' as TranslationKey)}</option><option value="3">3 - {t('riskRegister.possible' as TranslationKey)}</option><option value="4">4 - {t('riskRegister.likely' as TranslationKey)}</option><option value="5">5 - {t('riskRegister.almostCertain' as TranslationKey)}</option></select></div>
            <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.impact' as TranslationKey)} *</label><select value={newRiskImpact} onChange={(e) => setNewRiskImpact(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="1">1 - {t('riskRegister.negligible' as TranslationKey)}</option><option value="2">2 - {t('riskRegister.minor' as TranslationKey)}</option><option value="3">3 - {t('riskRegister.moderate' as TranslationKey)}</option><option value="4">4 - {t('riskRegister.major' as TranslationKey)}</option><option value="5">5 - {t('riskRegister.catastrophic' as TranslationKey)}</option></select></div>
          </div>
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.description' as TranslationKey)} *</label><textarea rows={3} value={newRiskDescription} onChange={(e) => setNewRiskDescription(e.target.value)} placeholder={t('reports.enterRiskDescription' as TranslationKey)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.mitigationPlan' as TranslationKey)}</label><textarea rows={2} value={newRiskMitigation} onChange={(e) => setNewRiskMitigation(e.target.value)} placeholder={t('reports.enterMitigationPlan' as TranslationKey)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div><label className="text-xs font-bold text-slate-700 uppercase mb-2 block">{t('reports.monitoringFrequency' as TranslationKey)}</label><select value={newRiskMonitoringFrequency} onChange={(e) => setNewRiskMonitoringFrequency(e.target.value as MonitoringFrequency)} className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"><option value="weekly">{t('reports.weekly' as TranslationKey)}</option><option value="monthly">{t('reports.monthly' as TranslationKey)}</option><option value="quarterly">{t('reports.quarterly' as TranslationKey)}</option><option value="semi_annual">{t('reports.semiAnnual' as TranslationKey)}</option><option value="annual">{t('reports.annual' as TranslationKey)}</option></select></div>
          <div className="flex gap-3 mt-6">
            <Button className="flex-1" disabled={!newRiskName || !newRiskCategory || !newRiskOwnerId || !newRiskDescription} onClick={handleCreateRisk}>
              <Icon icon={editingRiskId ? 'lucide:save' : 'lucide:plus'} />
              {editingRiskId ? t('common.saveChanges') : t('reports.createRisk' as TranslationKey)}
            </Button>
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
      />
    </div>
  )
}
