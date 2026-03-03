'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { differenceInCalendarDays } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { NoResultsEmptyState } from '@/components/ui/empty-state'
import { useCircularStore } from '@/stores/circular-store'
import { RegDocCard } from '@/components/reg-doc/RegDocCard'
import { RegDocFilterBar } from '@/components/reg-doc/RegDocFilterBar'
import type {
  Circular,
  CircularArticle,
  CircularAuthority,
  CircularPriority,
  CircularStatus,
  CircularApplicability,
  CAPStatus,
  ArticleRiskLevel,
  ArticleComplianceStatus,
  CircularWorkflowStep,
  ArticleVersionEntry,
  ArticleTimelineEvent,
} from '@/types'

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-in slide-in-from-bottom-4">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['Compliance', 'IT', 'Finance', 'Risk', 'Legal', 'Security', 'Operations', 'HR']

// ── File utilities ─────────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

function downloadFile(dataUrl: string, name: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}

function normalizeUrl(url: string): string {
  if (!url) return url
  if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`
  return url
}

// ── getBONotifyLabel ───────────────────────────────────────────────────────────

function getBONotifyLabel(circular: Circular, t: (key: any, params?: Record<string, string>) => string): string {
  const currentStep = circular.workflowSteps?.find((s) => s.status === 'current')
  const phase = currentStep?.phase ?? 0
  if (phase === 2) {
    if (!circular.dueDate) return t('regulatoryUpdates.notifyBoPhaseGeneral')
    const days = differenceInCalendarDays(new Date(circular.dueDate), new Date())
    if (days < 0) return t('regulatoryUpdates.notifyBoRemediationOverdue', { days: String(Math.abs(days)) })
    return t('regulatoryUpdates.notifyBoRemediationLabel', { days: String(days) })
  }
  if (!circular.capDeadline) return t('regulatoryUpdates.notifyBoPhaseGeneral')
  const days = differenceInCalendarDays(new Date(circular.capDeadline), new Date())
  if (days < 0) return t('regulatoryUpdates.notifyBoOverdue', { days: String(Math.abs(days)) })
  return t('regulatoryUpdates.notifyBoDeadlineLabel', { days: String(days) })
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, subtext, borderColor, valueColor,
}: {
  label: string; value: number; subtext: string
  borderColor: 'slate' | 'amber' | 'emerald' | 'rose'
  valueColor?: 'amber' | 'emerald' | 'rose'
}) {
  const borderColors = { slate: 'border-l-slate-400', amber: 'border-l-amber-400', emerald: 'border-l-emerald-500', rose: 'border-l-rose-500' }
  const valueColors = { amber: 'text-amber-600', emerald: 'text-emerald-600', rose: 'text-rose-600' }
  return (
    <Card className={`p-6 border-l-4 ${borderColors[borderColor]} hover:-translate-y-1 transition-transform`}>
      <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${valueColor ? valueColors[valueColor] : 'text-slate-900'}`}>{value}</span>
        <span className="text-xs text-slate-400">{subtext}</span>
      </div>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RegulatoryUpdatesRulesPage() {
  const { t, isRTL } = useTranslation()
  const {
    circulars,
    selectedCircular,
    create,
    delete: deleteCircular,
    assignBusinessOwner,
    setSelected,
    getNextReference,
    setPdfUrl,
    addTimelineEvent,
    requestCircularEdit,
    approveCircularEditStep,
    rejectCircularEditStep,
  } = useCircularStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState<CircularAuthority | 'all'>('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isBOModalOpen, setIsBOModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Create form state
  const [formTitle, setFormTitle] = useState('')
  const [formAuthority, setFormAuthority] = useState<CircularAuthority | ''>('')
  const [formPriority, setFormPriority] = useState<CircularPriority>('medium')
  const [formIssuanceDate, setFormIssuanceDate] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [formCapDeadline, setFormCapDeadline] = useState('')
  const [formReferenceUrl, setFormReferenceUrl] = useState('')
  const [formDepartments, setFormDepartments] = useState<string[]>([])
  const [formDescription, setFormDescription] = useState('')
  const [formBODept, setFormBODept] = useState('')
  const [formPdfFiles, setFormPdfFiles] = useState<Array<{ name: string; dataUrl: string; size: number }>>([])
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // BO assignment state
  const [boDept, setBoDept] = useState('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const filteredCirculars = useMemo(() => {
    return circulars.filter((c) => {
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.reference.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesAuthority = authorityFilter === 'all' || c.authority === authorityFilter
      const matchesDept =
        departmentFilter === 'all' ||
        c.departments.some((d) => d.toLowerCase() === departmentFilter.toLowerCase())
      return matchesSearch && matchesAuthority && matchesDept
    })
  }, [circulars, searchQuery, authorityFilter, departmentFilter])

  const stats = useMemo(
    () => ({
      total: circulars.length,
      inProgress: circulars.filter((c) => c.status === 'in-progress').length,
      completed: circulars.filter((c) => c.status === 'completed').length,
      overdue: circulars.filter((c) => c.status === 'overdue').length,
    }),
    [circulars]
  )

  async function handleCreate() {
    if (!formAuthority || !formTitle || !formDueDate || !formCapDeadline) return
    const created = create({
      authority: formAuthority as CircularAuthority,
      title: formTitle,
      priority: formPriority,
      status: 'pending' as CircularStatus,
      applicability: 'pending' as CircularApplicability,
      departments: formDepartments,
      businessOwnerDepartment: formBODept || undefined,
      progress: 0,
      issuanceDate: formIssuanceDate,
      dueDate: formDueDate,
      capDeadline: formCapDeadline,
      referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined,
      capStatus: 'not-started' as CAPStatus,
      articles: [],
      description: formDescription,
    })
    if (formPdfFiles[0]) {
      setPdfUrl(created.id, formPdfFiles[0].dataUrl)
    }
    showToast(t('regulatoryUpdates.circularRegistered'))
    setIsAddModalOpen(false)
    setFormTitle('')
    setFormAuthority('')
    setFormPriority('medium')
    setFormIssuanceDate('')
    setFormDueDate('')
    setFormCapDeadline('')
    setFormReferenceUrl('')
    setFormDepartments([])
    setFormDescription('')
    setFormBODept('')
    setFormPdfFiles([])
  }

  function handleAssignBO() {
    if (!selectedCircular || !boDept) return
    assignBusinessOwner(selectedCircular.id, boDept)
    addTimelineEvent(selectedCircular.id, {
      title: `Business Owner assigned: ${boDept}`,
      titleAr: `تم تعيين المالك التنفيذي: ${boDept}`,
      date: new Date().toISOString().slice(0, 10),
      user: 'Current User',
      status: 'completed',
    })
    showToast(t('regulatoryUpdates.boAssigned'))
    setIsBOModalOpen(false)
    setBoDept('')
  }

  function handleDeleteCircular() {
    const id = deleteTargetId ?? selectedCircular?.id
    if (!id) return
    deleteCircular(id)
    setIsDeleteConfirmOpen(false)
    setDeleteTargetId(null)
    showToast(t('regulatoryUpdates.circularDeleted'))
  }

  function toggleDepartment(dept: string) {
    setFormDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="text-base" />
          </Link>
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('regulatoryUpdates.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('regulatoryUpdates.subtitle')}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/sama-letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('observations.samaLetters')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:refresh-cw" className="text-emerald-600" />
              {t('observations.regulatoryUpdates')}
            </span>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link href="/correspondence/regulatory-updates/rules" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 bg-white text-slate-900 shadow-sm', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:scale" className="text-sm" />
              {t('regulatoryUpdates.tabs.rules')}
            </Link>
            <Link href="/correspondence/regulatory-updates/policies" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 text-slate-500 hover:text-slate-700', isRTL ? 'flex-row-reverse' : '')}>
              <Icon icon="lucide:file-text" className="text-sm" />
              {t('regulatoryUpdates.tabs.policies')}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button
            variant="primary"
            className="shadow-lg shadow-emerald-100"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Icon icon="lucide:plus" />
            {t('regulatoryUpdates.registerNewCircular')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label={t('regulatoryUpdates.totalActiveRules')} value={stats.total} subtext={t('regulatoryUpdates.circulars')} borderColor="slate" />
          <StatCard label={t('regulatoryUpdates.inImplementation')} value={stats.inProgress} subtext={t('regulatoryUpdates.ongoing')} borderColor="amber" valueColor="amber" />
          <StatCard label={t('regulatoryUpdates.implementedYTD')} value={stats.completed} subtext={t('regulatoryUpdates.compliant')} borderColor="emerald" valueColor="emerald" />
          <StatCard label={t('regulatoryUpdates.overdueActions')} value={stats.overdue} subtext={t('regulatoryUpdates.critical')} borderColor="rose" valueColor="rose" />
        </div>

        {/* Filter Bar */}
        <RegDocFilterBar
          variant="circular"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          authorityFilter={authorityFilter}
          onAuthorityChange={setAuthorityFilter}
          departmentFilter={departmentFilter}
          onDepartmentChange={setDepartmentFilter}
          resultCount={filteredCirculars.length}
          resultLabel={t('regulatoryUpdates.circularsFound')}
          rightSlot={
            <Link
              href="/correspondence/registry"
              className={`px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-sm ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:book-open" className="text-slate-500 text-sm" />
              {t('correspondence.viewRegistry')}
            </Link>
          }
          t={t}
          isRTL={isRTL}
        />

        {/* List */}
        {filteredCirculars.length === 0 ? (
          <NoResultsEmptyState
            onClearFilters={() => {
              setSearchQuery('')
              setAuthorityFilter('all')
              setDepartmentFilter('all')
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredCirculars.map((c) => (
              <RegDocCard
                key={c.id}
                variant="circular"
                circular={c}
                onClick={() => setSelected(c)}
                t={t}
                isRTL={isRTL}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Register New Circular Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('regulatoryUpdates.registerNewCircular')}
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">{t('regulatoryUpdates.enterCircularDetails')}</p>

          <div className="grid grid-cols-2 gap-8">
            {/* Left column */}
            <div className="space-y-4">
              {/* Authority selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.authority')} <span className="text-rose-500">*</span>
                </label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formAuthority}
                  onChange={(e) => setFormAuthority(e.target.value as CircularAuthority | '')}
                >
                  <option value="">{t('regulatoryUpdates.selectAuthority')}</option>
                  <option value="SAMA">{t('regulatoryUpdates.authoritySAMA')}</option>
                  <option value="CMA">{t('regulatoryUpdates.authorityCMA')}</option>
                  <option value="IA">{t('regulatoryUpdates.authorityIA')}</option>
                  <option value="ZATCA">{t('regulatoryUpdates.authorityZATCA')}</option>
                  <option value="MISA">{t('regulatoryUpdates.authorityMISA')}</option>
                  <option value="SAFIU">{t('regulatoryUpdates.authoritySAFIU')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.ruleTitle')} <span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder={t('regulatoryUpdates.ruleTitlePlaceholder')}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.priorityLevel')}</label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as CircularPriority)}
                  >
                    <option value="critical">{t('regulatoryUpdates.critical')}</option>
                    <option value="high">{t('regulatoryUpdates.high')}</option>
                    <option value="medium">{t('regulatoryUpdates.medium')}</option>
                    <option value="low">{t('regulatoryUpdates.low')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
                  <select
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                    value={formBODept}
                    onChange={(e) => setFormBODept(e.target.value)}
                  >
                    <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('regulatoryUpdates.issuanceDate')}
                  type="date"
                  value={formIssuanceDate}
                  onChange={(e) => setFormIssuanceDate(e.target.value)}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {t('regulatoryUpdates.implementationDeadline')} <span className="text-rose-500 ml-1">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* CAP deadline */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.capDeadline')} <span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  type="date"
                  value={formCapDeadline}
                  onChange={(e) => setFormCapDeadline(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* Reference URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('regulatoryUpdates.referenceUrl')}
                </label>
                <input
                  type="url"
                  value={formReferenceUrl}
                  onChange={(e) => setFormReferenceUrl(e.target.value)}
                  placeholder={t('regulatoryUpdates.referenceUrlPlaceholder')}
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments')}</label>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                  {DEPARTMENTS.map((dept) => (
                    <label key={dept} className={`flex items-center gap-3 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <input
                        type="checkbox"
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                        checked={formDepartments.includes(dept)}
                        onChange={() => toggleDepartment(dept)}
                      />
                      <span className="text-sm">{dept}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.description')}</label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  placeholder={t('regulatoryUpdates.addInternalComments')}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              {/* Hidden file input */}
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    setFormPdfFiles(prev => [...prev, { name: file.name, dataUrl, size: file.size }])
                  }
                  e.target.value = ''
                }}
              />
              {/* Upload zone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.addCircularFiles')}</label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-emerald-500 transition-colors"
                  onClick={() => pdfInputRef.current?.click()}
                >
                  {formPdfFiles.length > 0 ? (
                    <div className="space-y-2">
                      {formPdfFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Icon icon="lucide:file-text" className="text-emerald-600 shrink-0" />
                          <span className="text-sm font-medium text-emerald-700 flex-1 truncate">{f.name}</span>
                          <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)}KB</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setFormPdfFiles(prev => prev.filter((_, j) => j !== i)) }}
                            className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Icon icon="lucide:x" className="text-xs" />
                          </button>
                        </div>
                      ))}
                      <p className="text-xs text-slate-400 mt-1">{t('regulatoryUpdates.uploadMoreFiles')}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">{t('regulatoryUpdates.fileUploadHint')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={handleCreate}
              disabled={!formAuthority || !formTitle || !formDueDate || !formCapDeadline}
            >
              {t('regulatoryUpdates.initiateTracker')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Circular Details Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={selectedCircular !== null}
        onClose={() => setSelected(null)}
        size="xl"
        title={selectedCircular?.title ?? ''}
      >
        {selectedCircular && (
          <CircularDetailsContent
            circular={selectedCircular}
            onClose={() => setSelected(null)}
            onOpenBOModal={() => { setBoDept(selectedCircular.businessOwnerDepartment ?? ''); setIsBOModalOpen(true) }}
            onEditOpen={() => setIsEditModalOpen(true)}
            onDeleteOpen={(id) => { setDeleteTargetId(id); setIsDeleteConfirmOpen(true) }}
            t={t}
            isRTL={isRTL}
          />
        )}
      </Modal>

      {/* ── BO Assignment Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={isBOModalOpen}
        onClose={() => setIsBOModalOpen(false)}
        title={selectedCircular?.businessOwnerDepartment
          ? t('regulatoryUpdates.changeBusinessOwner')
          : t('regulatoryUpdates.assignBusinessOwner')}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
            <select
              className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
              value={boDept}
              onChange={(e) => setBoDept(e.target.value)}
            >
              <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className={`flex justify-end gap-3 pt-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={() => setIsBOModalOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleAssignBO} disabled={!boDept}>
              {selectedCircular?.businessOwnerDepartment
                ? t('regulatoryUpdates.changeBusinessOwner')
                : t('regulatoryUpdates.assignBusinessOwner')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Circular Modal ────────────────────────────────────────────── */}
      {selectedCircular && (
        <EditCircularModal
          circular={selectedCircular}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => { setIsEditModalOpen(false); showToast(t('regulatoryUpdates.circularEditRequested')) }}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title={t('regulatoryUpdates.deleteCircular')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('regulatoryUpdates.confirmDelete')}</p>
          <div className={`flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
              onClick={handleDeleteCircular}
            >
              <Icon icon="lucide:trash-2" className="w-4 h-4" />
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}

// ── CircularDetailsContent ────────────────────────────────────────────────────

type DetailTab = 'overview' | 'workflow' | 'activity'

function CircularDetailsContent({
  circular, onClose, onOpenBOModal, onEditOpen, onDeleteOpen, t, isRTL,
}: {
  circular: Circular
  onClose: () => void
  onOpenBOModal: () => void
  onEditOpen: () => void
  onDeleteOpen: (id: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [articleModal, setArticleModal] = useState<{
    open: boolean
    article?: CircularArticle
    mode: 'create' | 'edit' | 'view'
  }>({ open: false, mode: 'create' })
  const [advanceConfirm, setAdvanceConfirm] = useState<{
    open: boolean; stepId: string; stepLabel: string; step?: CircularWorkflowStep
  }>({ open: false, stepId: '', stepLabel: '' })
  const [advanceNotes, setAdvanceNotes] = useState('')
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const detailPdfRef = useRef<HTMLInputElement>(null)
  const capFileRef = useRef<HTMLInputElement>(null)
  const remFileRef = useRef<HTMLInputElement>(null)

  const {
    circulars: allCirculars,
    advanceWorkflowStep,
    addCAPAttachment,
    addRemediationAttachment,
    removeCAPAttachment,
    removeRemediationAttachment,
    setPdfUrl,
    clearPdfUrl,
    requestCircularEdit,
    approveCircularEditStep,
    rejectCircularEditStep,
  } = useCircularStore()

  // Always use fresh circular data from store
  const freshCircular = allCirculars.find(c => c.id === circular.id) ?? circular

  const priorityColors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  }
  const statusColors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    'in-progress': 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-rose-100 text-rose-700',
  }

  const currentStep = freshCircular.workflowSteps?.find((s) => s.status === 'current')
  const currentPhaseIdx = currentStep?.phase ?? 0
  const phaseLabels: Record<number, string> = {
    0: t('regulatoryUpdates.phaseCAP'),
    1: t('regulatoryUpdates.phaseCorrectiveActionPlan'),
    2: t('regulatoryUpdates.phaseRemediation'),
  }
  const phaseByIndex = [0, 1, 2] as const
  const stepsGrouped = phaseByIndex.map((phase) =>
    (freshCircular.workflowSteps ?? []).filter((s) => s.phase === phase)
  )

  async function handleNotifyAuthority(circ: Circular) {
    const subject = `CAP Submission: ${circ.reference} — ${circ.title}`
    const body = `Dear Authority,\n\nPlease find enclosed the Corrective Action Plan and Remediation Evidence for circular ${circ.reference}.\n\nRegards`
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const capFolder = zip.folder('CAP Documents')
      const remFolder = zip.folder('Remediation Evidence')

      ;(circ.capAttachments ?? []).forEach(att => {
        if (att.dataUrl) {
          capFolder?.file(att.name, att.dataUrl.split(',')[1], { base64: true })
        }
      })
      ;(circ.remediationAttachments ?? []).forEach(att => {
        if (att.dataUrl) {
          remFolder?.file(att.name, att.dataUrl.split(',')[1], { base64: true })
        }
      })

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${circ.reference}-evidence.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP generation failed', err)
    }
  }

  async function handleStepAction(step: CircularWorkflowStep) {
    if (step.actionType === 'notify-bo') {
      const subject = t('regulatoryUpdates.notifyBoPhase1Subject', { reference: freshCircular.reference })
      const body = t('regulatoryUpdates.notifyBoPhase1Body', {
        reference: freshCircular.reference,
        title: freshCircular.title,
        deadline: freshCircular.capDeadline ?? '—',
      })
      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
    } else if (step.actionType === 'notify-authority') {
      await handleNotifyAuthority(freshCircular)
    }
    advanceWorkflowStep(freshCircular.id, step.id, advanceNotes || undefined)
    setAdvanceConfirm({ open: false, stepId: '', stepLabel: '' })
    setAdvanceNotes('')
  }

  const tabs: { id: DetailTab; label: string; icon: string }[] = [
    { id: 'overview', label: t('regulatoryUpdates.tabOverview'), icon: 'lucide:layout-dashboard' },
    { id: 'workflow', label: t('regulatoryUpdates.tabWorkflow'), icon: 'lucide:git-branch' },
    { id: 'activity', label: t('regulatoryUpdates.tabActivity'), icon: 'lucide:activity' },
  ]

  return (
    <div className={`flex flex-col md:flex-row gap-6 ${isRTL ? 'md:flex-row-reverse' : ''}`}>
      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Status / Priority row */}
        <div className={`flex items-center gap-2 mb-4 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold', statusColors[freshCircular.status])}>
            {freshCircular.status.replace('-', ' ').toUpperCase()}
          </span>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold', priorityColors[freshCircular.priority])}>
            {freshCircular.priority.toUpperCase()}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
            {phaseLabels[currentPhaseIdx]}
          </span>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit ${isRTL ? 'flex-row-reverse' : ''}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                isRTL ? 'flex-row-reverse' : '',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon icon={tab.icon} className="text-sm" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Description */}
            <section className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.circularDescription')}</h3>
              {freshCircular.description ? (
                <p className="text-sm text-slate-600 leading-relaxed">{freshCircular.description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">—</p>
              )}
            </section>

            {/* PDF section */}
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-2">
                {t('regulatoryUpdates.uploadCircularPdf')}
              </h3>
              {/* Reference URL */}
              {freshCircular.referenceUrl && (
                <div className="mb-2">
                  <a href={normalizeUrl(freshCircular.referenceUrl)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                    <Icon icon="lucide:external-link" className="text-xs" />
                    {t('regulatoryUpdates.viewOnline')}
                  </a>
                </div>
              )}
              <input
                ref={detailPdfRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    setPdfUrl(freshCircular.id, dataUrl)
                  }
                  e.target.value = ''
                }}
              />
              {freshCircular.pdfUrl ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Icon icon="lucide:file-text" className="text-2xl text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-700 truncate">Circular PDF</p>
                    <p className="text-xs text-emerald-600">{t('regulatoryUpdates.pdfAttached')}</p>
                  </div>
                  <button
                    onClick={() => freshCircular.pdfUrl && downloadFile(freshCircular.pdfUrl, `${freshCircular.reference}.pdf`)}
                    className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.downloadPdf')}
                  >
                    <Icon icon="lucide:download" className="text-base" />
                  </button>
                  <button
                    onClick={() => detailPdfRef.current?.click()}
                    className="p-2 rounded-lg hover:bg-emerald-100 text-slate-500 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.uploadMoreFiles')}
                  >
                    <Icon icon="lucide:upload" className="text-base" />
                  </button>
                  <button
                    onClick={() => clearPdfUrl(freshCircular.id)}
                    className="p-2 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.removePdf')}
                  >
                    <Icon icon="lucide:trash-2" className="text-base" />
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                  onClick={() => detailPdfRef.current?.click()}
                >
                  <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{t('regulatoryUpdates.fileUploadHint')}</p>
                </div>
              )}
            </section>

            {/* Departments + Business Owner */}
            <section className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.affectedDepartments')}</h3>
              {freshCircular.departments.length > 0 ? (
                <div className={`flex flex-wrap gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  {freshCircular.departments.map((dept) => (
                    <span key={dept} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{dept}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </section>

            {/* Implementation Progress */}
            <section className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('regulatoryUpdates.implementationProgress')}</h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className={`flex justify-between text-sm font-bold ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-slate-600">{freshCircular.progress}%</span>
                  <span className="text-slate-400">{t('regulatoryUpdates.due')}: {freshCircular.dueDate}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${freshCircular.progress}%` }} />
                </div>
              </div>
            </section>

            {/* Article Breakdown */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex-1">
                  {t('regulatoryUpdates.articleBreakdown')}
                </h3>
                <button
                  onClick={() => setArticleModal({ open: true, mode: 'create' })}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer ml-4 shrink-0"
                >
                  <Icon icon="lucide:plus" />
                  {t('regulatoryUpdates.addArticle')}
                </button>
              </div>
              {freshCircular.articles.length > 0 ? (
                <div className="space-y-2">
                  {freshCircular.articles.map((art) => {
                    const doneItems = art.checklist?.filter(c => c.completed).length ?? 0
                    const totalItems = art.checklist?.length ?? 0
                    return (
                      <button
                        key={art.id}
                        className="w-full p-3 bg-white border border-slate-100 rounded-xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors text-left cursor-pointer"
                        onClick={() => setArticleModal({ open: true, article: art, mode: 'view' })}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-600">{art.articleNumber}</span>
                          <div className="flex items-center gap-2">
                            {totalItems > 0 && <span className="text-[10px] font-bold text-slate-500">{doneItems}/{totalItems}</span>}
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                              art.complianceStatus === 'compliant' ? 'bg-emerald-100 text-emerald-700' :
                              art.complianceStatus === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                              art.complianceStatus === 'non-compliant' ? 'bg-rose-100 text-rose-700' :
                              'bg-slate-100 text-slate-600'
                            )}>{art.complianceStatus}</span>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-slate-700 mt-1">{art.title}</p>
                        {totalItems > 0 && (
                          <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${(doneItems / totalItems) * 100}%` }} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">{t('regulatoryUpdates.notStarted')}</p>
              )}
            </section>
          </div>
        )}

        {/* ── Workflow tab ─────────────────────────────────────────────────── */}
        {activeTab === 'workflow' && (
          <div className="space-y-6">
            {/* Phase steps */}
            {phaseByIndex.map((phase) => (
              <section key={phase}>
                <h3 className={`text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ${isRTL ? 'text-right' : ''}`}>
                  {phaseLabels[phase]}
                </h3>
                <div className="space-y-2 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {stepsGrouped[phase].map((step) => (
                    <WorkflowStepRow
                      key={step.id}
                      step={step}
                      onAdvance={() => setAdvanceConfirm({ open: true, stepId: step.id, stepLabel: step.label, step })}
                      isRTL={isRTL}
                    />
                  ))}
                  {stepsGrouped[phase].length === 0 && (
                    <p className="text-xs text-slate-400 pl-8">—</p>
                  )}
                </div>
              </section>
            ))}

            {/* CAP Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('regulatoryUpdates.correctiveActionPlanDocuments')}
                </h3>
                <button
                  onClick={() => capFileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <Icon icon="lucide:upload" className="text-xs" />
                  {t('regulatoryUpdates.uploadCapDocument')}
                </button>
              </div>
              <input
                ref={capFileRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    addCAPAttachment(freshCircular.id, { name: file.name, size: file.size, dataUrl, type: file.type })
                  }
                  e.target.value = ''
                }}
              />
              {(freshCircular.capAttachments?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  {(freshCircular.capAttachments ?? []).map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Icon icon="lucide:file-text" className="text-slate-400 shrink-0 text-sm" />
                      <span className="text-xs text-slate-700 flex-1 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">{att.uploadedAt?.slice(0, 10)}</span>
                      {att.dataUrl && (
                        <button
                          onClick={() => downloadFile(att.dataUrl!, att.name)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <Icon icon="lucide:download" className="text-xs" />
                        </button>
                      )}
                      <button
                        onClick={() => removeCAPAttachment(freshCircular.id, att.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('regulatoryUpdates.noAttachments')}</p>
              )}
            </section>

            {/* Remediation Evidence Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('regulatoryUpdates.remediationEvidenceDocuments')}
                </h3>
                <button
                  onClick={() => remFileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <Icon icon="lucide:upload" className="text-xs" />
                  {t('regulatoryUpdates.uploadRemediationDoc')}
                </button>
              </div>
              <input
                ref={remFileRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    addRemediationAttachment(freshCircular.id, { name: file.name, size: file.size, dataUrl, type: file.type })
                  }
                  e.target.value = ''
                }}
              />
              {(freshCircular.remediationAttachments?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  {(freshCircular.remediationAttachments ?? []).map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Icon icon="lucide:file-text" className="text-slate-400 shrink-0 text-sm" />
                      <span className="text-xs text-slate-700 flex-1 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">{att.uploadedAt?.slice(0, 10)}</span>
                      {att.dataUrl && (
                        <button
                          onClick={() => downloadFile(att.dataUrl!, att.name)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <Icon icon="lucide:download" className="text-xs" />
                        </button>
                      )}
                      <button
                        onClick={() => removeRemediationAttachment(freshCircular.id, att.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('regulatoryUpdates.noAttachments')}</p>
              )}
            </section>
          </div>
        )}

        {/* ── Activity tab ─────────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Timeline */}
            <section>
              <h3 className={`text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                {t('regulatoryUpdates.activityTimeline')}
              </h3>
              {(freshCircular.timeline?.length ?? 0) > 0 ? (
                <div className="space-y-4 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                  {[...(freshCircular.timeline ?? [])].reverse().map((event) => (
                    <div key={event.id} className={`relative pl-8 ${isRTL ? 'pl-0 pr-8' : ''}`}>
                      <div
                        className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-1 w-4 h-4 rounded-full border-2 ${
                          event.status === 'completed'
                            ? 'bg-emerald-100 border-emerald-500'
                            : event.status === 'active'
                              ? 'bg-blue-100 border-blue-500'
                              : 'bg-slate-100 border-slate-300'
                        }`}
                      />
                      <p className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'} ${isRTL ? 'text-right' : ''}`}>
                        {isRTL && event.titleAr ? event.titleAr : event.title}
                      </p>
                      <p className={`text-[10px] ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-400'} ${isRTL ? 'text-right' : ''}`}>
                        {event.date}{event.user && ` • ${event.user}`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </section>

            {/* Version history — clickable */}
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                {t('regulatoryUpdates.versionHistory')}
              </h3>
              {(freshCircular.versions?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {[...(freshCircular.versions ?? [])].reverse().map((ver) => (
                    <div key={ver.version}>
                      <button
                        onClick={() => setExpandedVersion(expandedVersion === ver.version ? null : ver.version)}
                        className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
                      >
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">v{ver.version}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700">{ver.changes}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{ver.date} • {ver.author}</p>
                        </div>
                        {ver.approved && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm shrink-0 mt-0.5" />}
                        <Icon icon={expandedVersion === ver.version ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-slate-400 text-sm shrink-0 mt-0.5" />
                      </button>
                      {expandedVersion === ver.version && ver.fieldChanges && Object.keys(ver.fieldChanges).length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                            <span>{t('regulatoryUpdates.fieldChanged')}</span>
                            <span>{t('regulatoryUpdates.changedFrom')}</span>
                            <span>{t('regulatoryUpdates.changedTo')}</span>
                          </div>
                          {Object.entries(ver.fieldChanges).map(([field, diff]) => (
                            <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                              <span className="font-bold text-slate-600">{field}</span>
                              <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                              <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </section>
          </div>
        )}
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className={`w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-5 ${isRTL ? 'md:-mr-6 md:ml-0' : ''}`}>
        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.authority')}</h3>
          <p className="text-sm font-bold text-slate-900">{freshCircular.authority}</p>
          <p className="text-xs font-mono text-slate-500">{freshCircular.reference}</p>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.applicability')}</h3>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-bold',
            freshCircular.applicability === 'applicable' ? 'bg-emerald-100 text-emerald-700' :
            freshCircular.applicability === 'not-applicable' ? 'bg-slate-100 text-slate-600' :
            'bg-amber-100 text-amber-700'
          )}>
            {freshCircular.applicability === 'applicable' ? t('regulatoryUpdates.applicable') :
             freshCircular.applicability === 'not-applicable' ? t('regulatoryUpdates.notApplicable') :
             t('regulatoryUpdates.applicabilityPending')}
          </span>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.currentPhase')}</h3>
          <p className="text-xs font-bold text-violet-700">{phaseLabels[currentPhaseIdx]}</p>
          {currentStep && (
            <p className="text-[10px] text-slate-500 mt-0.5">{isRTL ? currentStep.labelAr : currentStep.label}</p>
          )}
        </div>

        {/* Key Dates */}
        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">
            {t('regulatoryUpdates.keyDates')}
          </h3>
          <div className="space-y-1.5">
            {freshCircular.issuanceDate && (
              <div className={`flex justify-between text-xs gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-500">{t('regulatoryUpdates.issuanceDate')}</span>
                <span className="font-bold text-slate-700 shrink-0">{freshCircular.issuanceDate}</span>
              </div>
            )}
            {freshCircular.dueDate && (
              <div className={`flex justify-between text-xs gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-500">{t('regulatoryUpdates.implementationDeadline')}</span>
                <span className={`font-bold shrink-0 ${
                  new Date(freshCircular.dueDate) < new Date() ? 'text-rose-600' : 'text-slate-700'
                }`}>
                  {freshCircular.dueDate}
                </span>
              </div>
            )}
            {freshCircular.capDeadline && (
              <div className={`flex justify-between text-xs gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-500">{t('regulatoryUpdates.capDeadline')}</span>
                <span className={`font-bold shrink-0 ${
                  new Date(freshCircular.capDeadline) < new Date() ? 'text-rose-600' : 'text-slate-700'
                }`}>
                  {freshCircular.capDeadline}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className={isRTL ? 'text-right' : ''}>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.businessOwner')}</h3>
          {freshCircular.businessOwnerDepartment ? (
            <p className="text-sm font-bold text-slate-700">{freshCircular.businessOwnerDepartment}</p>
          ) : (
            <p className="text-xs text-slate-400">—</p>
          )}
        </div>

        {/* Pending edit approval chain */}
        {freshCircular.pendingEdit?.status === 'pending' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-2">{t('regulatoryUpdates.editApprovalPending')}</p>
            {freshCircular.pendingEdit.fieldChanges && Object.keys(freshCircular.pendingEdit.fieldChanges).length > 0 && (
              <div className="mb-3 space-y-1">
                <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                  <span>{t('regulatoryUpdates.fieldChanged')}</span>
                  <span>{t('regulatoryUpdates.changedFrom')}</span>
                  <span>{t('regulatoryUpdates.changedTo')}</span>
                </div>
                {Object.entries(freshCircular.pendingEdit.fieldChanges).map(([field, diff]) => (
                  <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                    <span className="font-bold text-slate-600">{field}</span>
                    <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                    <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            {freshCircular.pendingEdit.approvals.map(step => (
              <div key={step.id} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-700">{isRTL ? step.roleAr : step.role}</span>
                {step.status === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => approveCircularEditStep(freshCircular.id, step.id, '')}
                      className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded cursor-pointer hover:bg-emerald-700"
                    >
                      {t('regulatoryUpdates.approveEdit')}
                    </button>
                    <button
                      onClick={() => rejectCircularEditStep(freshCircular.id, step.id, '')}
                      className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] rounded cursor-pointer hover:bg-rose-200"
                    >
                      {t('regulatoryUpdates.rejectEdit')}
                    </button>
                  </div>
                )}
                {step.status === 'approved' && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm" />}
                {step.status === 'rejected' && <Icon icon="lucide:x-circle" className="text-rose-500 text-sm" />}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-3 border-t border-slate-200">
          <Button variant="outline" className="w-full" onClick={onEditOpen}>
            <Icon icon="lucide:pencil" className="w-4 h-4" />
            {t('regulatoryUpdates.editCircular')}
          </Button>
          <Button variant="outline" className="w-full" onClick={onOpenBOModal}>
            <Icon icon="lucide:user-check" className="w-4 h-4" />
            {freshCircular.businessOwnerDepartment
              ? t('regulatoryUpdates.changeBusinessOwner')
              : t('regulatoryUpdates.assignBusinessOwner')}
          </Button>
          {freshCircular.businessOwnerDepartment && (
            <Button variant="outline" className="w-full" onClick={() => {
              const phase = currentPhaseIdx
              if (phase === 2) {
                const subject = t('regulatoryUpdates.notifyBoPhase2Subject', { reference: freshCircular.reference })
                const body = t('regulatoryUpdates.notifyBoPhase2Body', {
                  reference: freshCircular.reference,
                  title: freshCircular.title,
                  deadline: freshCircular.dueDate ?? '—',
                })
                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
              } else {
                const subject = t('regulatoryUpdates.notifyBoPhase1Subject', { reference: freshCircular.reference })
                const body = t('regulatoryUpdates.notifyBoPhase1Body', {
                  reference: freshCircular.reference,
                  title: freshCircular.title,
                  deadline: freshCircular.capDeadline ?? '—',
                })
                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
              }
            }}>
              <Icon icon="lucide:mail" className="w-4 h-4" />
              {getBONotifyLabel(freshCircular, t)}
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => onDeleteOpen(freshCircular.id)}
          >
            <Icon icon="lucide:trash-2" className="w-4 h-4" />
            {t('regulatoryUpdates.deleteCircular')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>

      {/* ── Article Detail Modal ──────────────────────────────────────────── */}
      {articleModal.open && (
        <ArticleDetailModal
          circularId={freshCircular.id}
          article={articleModal.article
            ? freshCircular.articles.find(a => a.id === articleModal.article!.id) ?? articleModal.article
            : undefined
          }
          mode={articleModal.mode}
          onClose={() => setArticleModal({ open: false, mode: 'create' })}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── Advance Step Confirm ──────────────────────────────────────────── */}
      {(() => {
        const confirmStep = freshCircular.workflowSteps?.find(s => s.id === advanceConfirm.stepId)
        const actionLabel = confirmStep ? (isRTL ? confirmStep.actionLabelAr : confirmStep.actionLabel) : t('regulatoryUpdates.advanceStep')
        const requiresNotes = confirmStep?.requiresNotes ?? false
        return (
          <Modal
            isOpen={advanceConfirm.open}
            onClose={() => { setAdvanceConfirm({ open: false, stepId: '', stepLabel: '' }); setAdvanceNotes('') }}
            title={actionLabel}
            size="sm"
          >
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                <span className="font-bold">{advanceConfirm.stepLabel}</span>
              </p>
              {confirmStep?.actionType === 'notify-bo' ? (
                <p className="text-sm text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {t('regulatoryUpdates.notifyBoModalHint')}
                </p>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {requiresNotes ? t('common.notes') : t('regulatoryUpdates.stepNotes')}
                    {requiresNotes && <span className="text-rose-500 ml-1">*</span>}
                  </label>
                  <textarea
                    className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                    value={advanceNotes}
                    onChange={(e) => setAdvanceNotes(e.target.value)}
                    placeholder={requiresNotes ? t('regulatoryUpdates.notesRequired') : t('regulatoryUpdates.stepNotes')}
                  />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => { setAdvanceConfirm({ open: false, stepId: '', stepLabel: '' }); setAdvanceNotes('') }}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => confirmStep && handleStepAction(confirmStep)}
                  disabled={requiresNotes && !advanceNotes.trim()}
                >
                  {actionLabel}
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

// ── WorkflowStepRow ───────────────────────────────────────────────────────────

function WorkflowStepRow({
  step, onAdvance, isRTL,
}: {
  step: CircularWorkflowStep
  onAdvance: () => void
  isRTL: boolean
}) {
  const dotColors: Record<string, string> = {
    completed: 'bg-emerald-100 border-emerald-500',
    current: 'bg-blue-100 border-blue-500',
    pending: 'bg-slate-100 border-slate-300',
  }
  const actionLabel = isRTL ? step.actionLabelAr : step.actionLabel
  return (
    <div className={`relative pl-8 py-2 ${isRTL ? 'pl-0 pr-8' : ''}`}>
      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-3 w-4 h-4 rounded-full border-2 ${dotColors[step.status]}`} />
      <div className={`flex items-start justify-between gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
          <p className={cn(
            'text-sm font-bold',
            step.status === 'completed' ? 'text-slate-500 line-through' :
            step.status === 'current' ? 'text-slate-900' : 'text-slate-300'
          )}>
            {isRTL ? step.labelAr : step.label}
          </p>
          {step.date && (
            <p className="text-[10px] text-slate-400 mt-0.5">{step.date}{step.user && ` • ${step.user}`}</p>
          )}
          {step.notes && (
            <p className="text-[10px] text-slate-500 italic mt-0.5">{step.notes}</p>
          )}
        </div>
        {step.status === 'current' && (
          <button
            onClick={onAdvance}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
          >
            {actionLabel}
          </button>
        )}
        {step.status === 'completed' && (
          <Icon icon="lucide:check-circle" className="text-emerald-500 text-base shrink-0 mt-0.5" />
        )}
      </div>
    </div>
  )
}

// ── ArticleDetailModal ────────────────────────────────────────────────────────

type ArticleTab = 'details' | 'versions' | 'activity'

function ArticleDetailModal({
  circularId, article, mode, onClose, t, isRTL,
}: {
  circularId: string
  article?: CircularArticle
  mode: 'create' | 'edit' | 'view'
  onClose: () => void
  t: (key: any) => string
  isRTL: boolean
}) {
  const { addArticle, updateArticle, deleteArticle, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useCircularStore()

  const [currentMode, setCurrentMode] = useState(mode)
  const [activeArticleTab, setActiveArticleTab] = useState<ArticleTab>('details')
  const [artNumber, setArtNumber] = useState(article?.articleNumber ?? '')
  const [artTitle, setArtTitle] = useState(article?.title ?? '')
  const [artDescription, setArtDescription] = useState(article?.description ?? '')
  const [artRiskLevel, setArtRiskLevel] = useState<ArticleRiskLevel>(article?.riskLevel ?? 'medium')
  const [artComplianceStatus, setArtComplianceStatus] = useState<ArticleComplianceStatus>(article?.complianceStatus ?? 'not-started')
  const [artDept, setArtDept] = useState(article?.responsibleDepartment ?? '')
  const [artAssignedTo, setArtAssignedTo] = useState(article?.assignedTo ?? '')
  const [localChecklist, setLocalChecklist] = useState(article?.checklist ?? [])
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [expandedArticleVersion, setExpandedArticleVersion] = useState<number | null>(null)

  const isEditable = currentMode === 'edit' || currentMode === 'create'

  const riskColors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  }
  const complianceColors: Record<string, string> = {
    compliant: 'bg-emerald-100 text-emerald-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    'non-compliant': 'bg-rose-100 text-rose-700',
    'not-started': 'bg-slate-100 text-slate-600',
  }

  function handleSave() {
    const data = {
      articleNumber: artNumber,
      title: artTitle,
      description: artDescription,
      riskLevel: artRiskLevel,
      complianceStatus: artComplianceStatus,
      responsibleDepartment: artDept,
      assignedTo: artAssignedTo || undefined,
      checklist: currentMode === 'create' ? localChecklist : (article?.checklist ?? []),
      attachments: article?.attachments ?? [],
    }
    if (currentMode === 'create') {
      addArticle(circularId, data)
    } else if (currentMode === 'edit' && article) {
      updateArticle(circularId, article.id, data)
    }
    onClose()
  }

  function handleAddChecklistItem() {
    if (!newChecklistTitle.trim()) return
    if (article) {
      addChecklistItem(circularId, article.id, newChecklistTitle.trim())
    } else {
      // create mode — add to localChecklist
      setLocalChecklist(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
        title: newChecklistTitle.trim(),
        completed: false,
        order: prev.length,
      }])
    }
    setNewChecklistTitle('')
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={currentMode === 'create' ? t('regulatoryUpdates.addArticle') : article?.title ?? ''}
      size="lg"
    >
      <div className="space-y-5">
        {/* View mode header badges */}
        {currentMode === 'view' && article && (
          <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
            <span className="text-xs font-bold text-emerald-600">{article.articleNumber}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[article.riskLevel])}>{article.riskLevel}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[article.complianceStatus])}>{article.complianceStatus}</span>
          </div>
        )}

        {/* Article tabs (only in view mode when article exists) */}
        {currentMode === 'view' && article && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {(['details', 'versions', 'activity'] as ArticleTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveArticleTab(tab)}
                className={cn('px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer',
                  activeArticleTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab === 'details' ? t('regulatoryUpdates.tabOverview') :
                 tab === 'versions' ? t('regulatoryUpdates.articleVersionHistory') :
                 t('regulatoryUpdates.articleActivity')}
              </button>
            ))}
          </div>
        )}

        {/* Details tab (or create/edit mode) */}
        {(activeArticleTab === 'details' || currentMode !== 'view') && (
          <div className="space-y-4">
            {/* Article number + department */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleNumber')}</label>
                {isEditable ? (
                  <Input placeholder={t('regulatoryUpdates.articleNumberPlaceholder')} value={artNumber} onChange={(e) => setArtNumber(e.target.value)} />
                ) : (
                  <p className="text-sm font-bold text-emerald-600">{artNumber || '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.responsibleDepartment')}</label>
                {isEditable ? (
                  <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" value={artDept} onChange={(e) => setArtDept(e.target.value)}>
                    <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <p className="text-sm text-slate-700">{artDept || '—'}</p>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleTitle')}</label>
              {isEditable ? (
                <Input placeholder={t('regulatoryUpdates.articleTitlePlaceholder')} value={artTitle} onChange={(e) => setArtTitle(e.target.value)} />
              ) : (
                <p className="text-sm font-bold text-slate-900">{artTitle || '—'}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleDescription')}</label>
              {isEditable ? (
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  value={artDescription}
                  onChange={(e) => setArtDescription(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-600">{artDescription || '—'}</p>
              )}
            </div>

            {/* Risk + Compliance status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.riskLevel')}</label>
                {isEditable ? (
                  <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" value={artRiskLevel} onChange={(e) => setArtRiskLevel(e.target.value as ArticleRiskLevel)}>
                    <option value="critical">{t('regulatoryUpdates.critical')}</option>
                    <option value="high">{t('regulatoryUpdates.high')}</option>
                    <option value="medium">{t('regulatoryUpdates.medium')}</option>
                    <option value="low">{t('regulatoryUpdates.low')}</option>
                  </select>
                ) : (
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[artRiskLevel])}>{artRiskLevel}</span>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.complianceStatus')}</label>
                {isEditable ? (
                  <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" value={artComplianceStatus} onChange={(e) => setArtComplianceStatus(e.target.value as ArticleComplianceStatus)}>
                    <option value="compliant">{t('regulatoryUpdates.compliant')}</option>
                    <option value="in-progress">{t('regulatoryUpdates.inProgress')}</option>
                    <option value="non-compliant">{t('regulatoryUpdates.nonCompliant')}</option>
                    <option value="not-started">{t('regulatoryUpdates.notStarted')}</option>
                  </select>
                ) : (
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[artComplianceStatus])}>{artComplianceStatus}</span>
                )}
              </div>
            </div>

            {/* Checklist — always visible */}
            <div>
              <div className="border-b border-slate-100 pb-2 mb-3">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('regulatoryUpdates.articleChecklist')}</h4>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-3">
                {(article ? article.checklist : localChecklist).map((item) => (
                  <div key={item.id} className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => {
                        if (article) {
                          toggleChecklistItem(circularId, article.id, item.id)
                        } else {
                          setLocalChecklist(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i))
                        }
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                    />
                    <span className={cn('text-sm flex-1', item.completed ? 'line-through text-slate-400' : 'text-slate-700')}>{item.title}</span>
                    <button
                      onClick={() => {
                        if (article) {
                          deleteChecklistItem(circularId, article.id, item.id)
                        } else {
                          setLocalChecklist(prev => prev.filter(i => i.id !== item.id))
                        }
                      }}
                      className="cursor-pointer p-1 text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                    >
                      <Icon icon="lucide:x" className="text-xs" />
                    </button>
                  </div>
                ))}
                {(article ? article.checklist : localChecklist).length === 0 && (
                  <p className="text-xs text-slate-400">—</p>
                )}
              </div>
              <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Input
                  placeholder={t('regulatoryUpdates.checklistItemPlaceholder')}
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem() }}
                  className="flex-1 h-11"
                />
                <button
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistTitle.trim()}
                  className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Icon icon="lucide:plus" className="text-xs" />
                  {t('regulatoryUpdates.addChecklistItem')}
                </button>
              </div>
            </div>

            {/* Attachments (view only) */}
            {article && (article.attachments?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.articleAttachments')}</h4>
                <div className="space-y-1">
                  {article.attachments.map((att) => (
                    <div key={att.id} className={`flex items-center gap-2 p-2 bg-slate-50 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <Icon icon="lucide:paperclip" className="text-slate-400 shrink-0 text-xs" />
                      <span className="text-xs text-slate-700">{att.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Versions tab */}
        {activeArticleTab === 'versions' && currentMode === 'view' && article && (
          <div className="space-y-2">
            {(article.versions?.length ?? 0) > 0 ? (
              [...(article.versions ?? [])].reverse().map((ver) => (
                <div key={ver.version}>
                  <button
                    onClick={() => setExpandedArticleVersion(expandedArticleVersion === ver.version ? null : ver.version)}
                    className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
                  >
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">v{ver.version}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700">{ver.summary}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ver.date} • {ver.author}</p>
                    </div>
                    {ver.approved && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm shrink-0 mt-0.5" />}
                    <Icon icon={expandedArticleVersion === ver.version ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-slate-400 text-sm shrink-0 mt-0.5" />
                  </button>
                  {expandedArticleVersion === ver.version && Object.keys(ver.fieldChanges ?? {}).length > 0 && (
                    <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                        <span>{t('regulatoryUpdates.fieldChanged')}</span>
                        <span>{t('regulatoryUpdates.changedFrom')}</span>
                        <span>{t('regulatoryUpdates.changedTo')}</span>
                      </div>
                      {Object.entries(ver.fieldChanges ?? {}).map(([field, diff]) => (
                        <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                          <span className="font-bold text-slate-600">{field}</span>
                          <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                          <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {expandedArticleVersion === ver.version && Object.keys(ver.fieldChanges ?? {}).length === 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 mt-1">
                      <p className="text-xs text-slate-400">{ver.summary}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>
        )}

        {/* Activity tab */}
        {activeArticleTab === 'activity' && currentMode === 'view' && article && (
          <div>
            {(article.timeline?.length ?? 0) > 0 ? (
              <div className="space-y-4 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                {[...(article.timeline ?? [])].reverse().map((event) => (
                  <div key={event.id} className="relative pl-8">
                    <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 ${
                      event.status === 'completed' ? 'bg-emerald-100 border-emerald-500' :
                      event.status === 'active' ? 'bg-blue-100 border-blue-500' :
                      'bg-slate-100 border-slate-300'
                    }`} />
                    <p className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'}`}>
                      {isRTL && event.titleAr ? event.titleAr : event.title}
                    </p>
                    <p className={`text-[10px] ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-400'}`}>
                      {event.date}{event.user && ` • ${event.user}`}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className={`flex justify-between items-center pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {currentMode === 'view' && article && (
              <>
                <Button variant="outline" onClick={() => setCurrentMode('edit')}>
                  <Icon icon="lucide:pencil" className="w-4 h-4" />
                  {t('common.edit')}
                </Button>
                {!deleteConfirm ? (
                  <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteConfirm(true)}>
                    <Icon icon="lucide:trash-2" className="w-4 h-4" />
                    {t('regulatoryUpdates.deleteArticle')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-600 font-bold">{t('common.confirm')}?</span>
                    <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => { deleteArticle(circularId, article.id); onClose() }}>
                      {t('common.delete')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>{t('common.cancel')}</Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            {isEditable && (
              <Button variant="primary" onClick={handleSave} disabled={!artTitle || !artNumber || !artDept}>
                {t('common.save')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── EditCircularModal ─────────────────────────────────────────────────────────

function EditCircularModal({
  circular, isOpen, onClose, onSaved, t, isRTL,
}: {
  circular: Circular
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  t: (key: any) => string
  isRTL: boolean
}) {
  const { requestCircularEdit } = useCircularStore()

  const [formTitle, setFormTitle] = useState(circular.title)
  const [formAuthority, setFormAuthority] = useState<CircularAuthority>(circular.authority)
  const [formPriority, setFormPriority] = useState<CircularPriority>(circular.priority)
  const [formIssuanceDate, setFormIssuanceDate] = useState(circular.issuanceDate)
  const [formDueDate, setFormDueDate] = useState(circular.dueDate)
  const [formCapDeadline, setFormCapDeadline] = useState(circular.capDeadline ?? '')
  const [formReferenceUrl, setFormReferenceUrl] = useState(circular.referenceUrl ?? '')
  const [formDepartments, setFormDepartments] = useState<string[]>(circular.departments)
  const [formDescription, setFormDescription] = useState(circular.description ?? '')
  const [formBODept, setFormBODept] = useState(circular.businessOwnerDepartment ?? '')

  function toggleDept(dept: string) {
    setFormDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    )
  }

  function handleRequestEdit() {
    const editData: Partial<Circular> = {
      title: formTitle,
      authority: formAuthority,
      priority: formPriority,
      issuanceDate: formIssuanceDate,
      dueDate: formDueDate,
      capDeadline: formCapDeadline || undefined,
      referenceUrl: formReferenceUrl ? normalizeUrl(formReferenceUrl) : undefined,
      departments: formDepartments,
      description: formDescription,
      businessOwnerDepartment: formBODept || undefined,
    }
    requestCircularEdit(circular.id, editData)
    onSaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('regulatoryUpdates.editCircular')} size="xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.authority')}</label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                value={formAuthority}
                onChange={(e) => setFormAuthority(e.target.value as CircularAuthority)}
              >
                <option value="SAMA">{t('regulatoryUpdates.authoritySAMA')}</option>
                <option value="CMA">{t('regulatoryUpdates.authorityCMA')}</option>
                <option value="IA">{t('regulatoryUpdates.authorityIA')}</option>
                <option value="ZATCA">{t('regulatoryUpdates.authorityZATCA')}</option>
                <option value="MISA">{t('regulatoryUpdates.authorityMISA')}</option>
                <option value="SAFIU">{t('regulatoryUpdates.authoritySAFIU')}</option>
              </select>
            </div>

            <Input
              label={t('regulatoryUpdates.ruleTitle')}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.priorityLevel')}</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as CircularPriority)}
                >
                  <option value="critical">{t('regulatoryUpdates.critical')}</option>
                  <option value="high">{t('regulatoryUpdates.high')}</option>
                  <option value="medium">{t('regulatoryUpdates.medium')}</option>
                  <option value="low">{t('regulatoryUpdates.low')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
                  value={formBODept}
                  onChange={(e) => setFormBODept(e.target.value)}
                >
                  <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('regulatoryUpdates.issuanceDate')}
                type="date"
                value={formIssuanceDate}
                onChange={(e) => setFormIssuanceDate(e.target.value)}
              />
              <Input
                label={t('regulatoryUpdates.implementationDeadline')}
                type="date"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>

            {/* CAP deadline */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.capDeadline')}</label>
              <input
                type="date"
                value={formCapDeadline}
                onChange={(e) => setFormCapDeadline(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Reference URL */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.referenceUrl')}</label>
              <input
                type="url"
                value={formReferenceUrl}
                onChange={(e) => setFormReferenceUrl(e.target.value)}
                placeholder={t('regulatoryUpdates.referenceUrlPlaceholder')}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments')}</label>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-44 overflow-y-auto">
                {DEPARTMENTS.map((dept) => (
                  <label key={dept} className={`flex items-center gap-3 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                      checked={formDepartments.includes(dept)}
                      onChange={() => toggleDept(dept)}
                    />
                    <span className="text-sm">{dept}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.circularDescription')}</label>
              <textarea
                className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleRequestEdit} disabled={!formTitle}>{t('common.saveChanges')}</Button>
        </div>
      </div>
    </Modal>
  )
}
