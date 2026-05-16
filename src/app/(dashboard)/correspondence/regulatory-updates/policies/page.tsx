'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { NoResultsEmptyState } from '@/components/ui/empty-state'
import { usePolicyStore } from '@/stores/policy-store'
import { CardSkeleton } from '@/components/ui/skeleton'
import { RegDocCard } from '@/components/correspondence/regulatory-updates/RegDocCard'
import { RegDocFilterBar } from '@/components/correspondence/regulatory-updates/RegDocFilterBar'
import { StatCard } from '@/components/correspondence/regulatory-updates/rules/StatCard'
import { PolicyDetailsContent } from '@/components/correspondence/regulatory-updates/policies/PolicyDetailsContent'
import { DeletePolicyModal } from '@/components/correspondence/regulatory-updates/policies/DeletePolicyModal'
import type { PolicyStatus, PolicyCategory, PolicyApprovalTier, PolicyVersionEntry, PolicyActivityEntry, ReviewSchedule } from '@/types'
import { ReviewSchedulePicker } from '@/components/ui/ReviewSchedulePicker'
import { computeNextReview, cadenceToReviewCycleDays } from '@/lib/review-schedule'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { paginate } from '@/lib/pagination'
import { usePolicyCategoryStore } from '@/stores/policy-category-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { exportPoliciesLocalized } from '@/lib/export'
import { Gate } from '@/components/auth/gate'

// Toast component
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

// Shared upload zone used by both modals
function UploadZone({
  file,
  fileRef,
  label,
  required,
  t,
}: {
  file: File | null
  fileRef: React.RefObject<HTMLInputElement | null>
  label: string
  required?: boolean
  t: (key: any, params?: Record<string, string>) => string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && ' *'}
      </label>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xlsx,.pptx"
        onChange={() => {}} // handled externally via ref
      />
      {file ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors"
        >
          <Icon icon="lucide:file-check" className="text-emerald-500 text-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-700 truncate">{file.name}</p>
            <p className="text-[10px] text-emerald-500">{t('policies.clickToChange')}</p>
          </div>
          <Icon icon="lucide:refresh-cw" className="text-emerald-400 text-sm shrink-0" />
        </div>
      ) : (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-emerald-500 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {t('policies.dropFileHere')} <span className="text-emerald-600 font-bold">{t('policies.browse')}</span>
          </p>
        </div>
      )}
    </div>
  )
}

const TIER_WORKFLOWS: Record<PolicyApprovalTier, Array<{ step: string; description: string; actionType: string }>> = {
  board: [
    { step: 'Legal Review',           description: 'Initial legal assessment',             actionType: 'send-for-review'    },
    { step: 'Audit Committee Review', description: 'Reviewed by Audit Committee',          actionType: 'request-approval'   },
    { step: 'Board Approval',         description: 'Final approval by Board of Directors', actionType: 'request-approval'   },
  ],
  management: [
    { step: 'Department Review',   description: 'Review by relevant department head', actionType: 'send-for-review'  },
    { step: 'Compliance Review',   description: 'Compliance team assessment',         actionType: 'request-approval' },
    { step: 'Management Approval', description: 'Final approval by Management',       actionType: 'request-approval' },
  ],
  sharia: [
    { step: 'Legal Review',            description: 'Initial legal assessment',           actionType: 'send-for-review'  },
    { step: 'Sharia Committee Review', description: 'Review by Sharia Supervisory Board', actionType: 'request-approval' },
    { step: 'Sharia Board Approval',   description: 'Final approval by Sharia Board',     actionType: 'request-approval' },
  ],
  agm: [
    { step: 'Management Review', description: 'Executive management review',         actionType: 'notify-manager'   },
    { step: 'AGM Preparation',   description: 'Preparation of AGM documentation',   actionType: 'send-email'       },
    { step: 'AGM Approval',      description: 'Approval by Annual General Meeting', actionType: 'request-approval' },
  ],
}

export default function RegulatoryUpdatesPoliciesPage() {
  const { t, isRTL } = useTranslation()
  const {
    policies, selectedPolicy, create, update,
    setSelected, reviewAlerts, checkAndUpdateStatuses,
    fetchAll: fetchAllPolicies,
  } = usePolicyStore()

  // Hydrate from the API on mount — otherwise the page renders the empty
  // initial Zustand state and never sees server-side rows (reload-survival
  // bug). Pulled in by Fix-B; mirrors the pattern in /reports/audits.
  useEffect(() => { fetchAllPolicies() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Wave-2 Agent E: first-fetch skeleton.
  const policiesLoading = usePolicyStore((s) => s.isLoading)
  const policiesLastFetched = usePolicyStore((s) => s.lastFetched)
  const showPoliciesSkeleton =
    policiesLoading && policies.length === 0 && policiesLastFetched === null
  const { user: currentUser } = useAuthStore()
  const teamMembers = useTeamStore(s => s.members)
  // Editable policy categories
  const policyCategoryItems = usePolicyCategoryStore((s) => s.categories)
  const addPolicyCategory = usePolicyCategoryStore((s) => s.add)
  const editPolicyCategory = usePolicyCategoryStore((s) => s.update)
  const removePolicyCategory = usePolicyCategoryStore((s) => s.remove)
  // Department store — for affected departments + business-owner department
  // pickers (round-3 §4 propagation).
  const departments = useDepartmentStore((s) => s.departments)
  const addDepartment = useDepartmentStore((s) => s.addDepartment)
  const updateDepartment = useDepartmentStore((s) => s.updateDepartment)
  const removeDepartment = useDepartmentStore((s) => s.removeDepartment)

  // Derive owners from team store — active members with name, avatar, department
  const OWNERS = useMemo(() =>
    teamMembers
      .filter(m => m.status === 'active')
      .map(m => ({ name: m.name, avatar: m.name, department: m.department }))
  , [teamMembers])

  const searchParams = useSearchParams()
  const [deepLinkTab, setDeepLinkTab] = useState<'overview' | 'workflow' | 'activity' | undefined>(undefined)

  // Bug A: Deep-link from URL params (?policyId=...&tab=workflow)
  useEffect(() => {
    const policyId = searchParams.get('policyId')
    const tab = searchParams.get('tab')
    if (policyId) {
      const match = policies.find(p => p.id === policyId)
      if (match) {
        setSelected(match)
        if (tab === 'workflow' || tab === 'activity' || tab === 'overview') {
          setDeepLinkTab(tab)
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [policySearchQuery, setPolicySearchQuery] = useState('')
  const [policyCategoryFilter, setPolicyCategoryFilter] = useState<PolicyCategory | 'all'>('all')
  const [policyStatusFilter, setPolicyStatusFilter] = useState<PolicyStatus | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10
  const [isCreatePolicyModalOpen, setIsCreatePolicyModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [newlyCreatedIds, setNewlyCreatedIds] = useState<string[]>([])

  // ── Template picker ─────────────────────────────────────────────────
  const {
    templates: policyTemplates,
    incrementUsage: incrementPolicyTemplateUsage,
    fetchAll: fetchAllPolicyTemplates,
  } = usePolicyTemplateStore()
  const fetchAllPolicyCategories = usePolicyCategoryStore((s) => s.fetchAll)
  useEffect(() => {
    fetchAllPolicyTemplates()
    fetchAllPolicyCategories()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedPolicyTemplateId, setSelectedPolicyTemplateId] = useState('')

  function handlePolicyTemplateSelect(templateId: string) {
    setSelectedPolicyTemplateId(templateId)
    if (!templateId) return
    const tmpl = policyTemplates.find((t) => t.id === templateId)
    if (!tmpl) return
    setFormName(tmpl.name)
    setFormDescription(tmpl.defaultDescription)
    setFormCategory(tmpl.category)
    setFormTier(tmpl.approvalTier)
  }

  // ── Create form state ────────────────────────────────────────────────
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState<PolicyCategory | ''>('')
  const [formTier, setFormTier] = useState<PolicyApprovalTier | ''>('')
  const [formVersion, setFormVersion] = useState('v1.0')
  const [formReviewSchedule, setFormReviewSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })
  const [formOwnerIdx, setFormOwnerIdx] = useState(0)
  const [formDescription, setFormDescription] = useState('')
  const [formDocFile, setFormDocFile] = useState<File | null>(null)
  const formDocFileRef = useRef<HTMLInputElement>(null)
  // §4 — Affected Departments multi-select + Business Owner Department single
  // select. Both bind to useDepartmentStore so adding/removing in Settings
  // immediately reflects here. Stored as department ids on the Policy.
  const [formAffectedDepartments, setFormAffectedDepartments] = useState<string[]>([])
  const [formBusinessOwnerDepartmentId, setFormBusinessOwnerDepartmentId] = useState<string>('')

  // ── Edit form state ──────────────────────────────────────────────────
  const [formEditName, setFormEditName] = useState('')
  const [formEditCategory, setFormEditCategory] = useState<PolicyCategory | ''>('')
  const [formEditTier, setFormEditTier] = useState<PolicyApprovalTier | ''>('')
  const [formEditVersion, setFormEditVersion] = useState('')
  const [formEditReviewSchedule, setFormEditReviewSchedule] = useState<ReviewSchedule>({ cadence: 'yearly', dayOfMonth: 1 })
  const [formEditOwnerIdx, setFormEditOwnerIdx] = useState(0)
  const [formEditDescription, setFormEditDescription] = useState('')
  const [formEditDocFile, setFormEditDocFile] = useState<File | null>(null)
  const formEditDocFileRef = useRef<HTMLInputElement>(null)
  const [formEditAffectedDepartments, setFormEditAffectedDepartments] = useState<string[]>([])
  const [formEditBusinessOwnerDepartmentId, setFormEditBusinessOwnerDepartmentId] = useState<string>('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Check and update overdue/requires-review on mount
  useEffect(() => { checkAndUpdateStatuses() }, [])

  const alerts = useMemo(() => reviewAlerts(), [policies])

  // Populate edit form whenever modal opens
  useEffect(() => {
    if (isEditModalOpen && selectedPolicy) {
      setFormEditName(selectedPolicy.name)
      setFormEditCategory(selectedPolicy.category)
      setFormEditTier(selectedPolicy.approvalTier)
      setFormEditVersion(selectedPolicy.version)
      setFormEditReviewSchedule(selectedPolicy.reviewSchedule ?? { cadence: 'yearly', dayOfMonth: 1 })
      const ownerIdx = OWNERS.findIndex((o) => o.name === selectedPolicy.owner.name)
      setFormEditOwnerIdx(ownerIdx >= 0 ? ownerIdx : 0)
      setFormEditDescription(selectedPolicy.description)
      setFormEditDocFile(null)
      setFormEditAffectedDepartments(selectedPolicy.affectedDepartments ?? [])
      setFormEditBusinessOwnerDepartmentId(selectedPolicy.businessOwnerDepartmentId ?? '')
    }
  }, [isEditModalOpen])

  // Wire file input onChange via ref for create
  useEffect(() => {
    const el = formDocFileRef.current
    if (!el) return
    const handler = () => { const f = el.files?.[0]; if (f) setFormDocFile(f) }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  }, [isCreatePolicyModalOpen])

  // Wire file input onChange via ref for edit
  useEffect(() => {
    const el = formEditDocFileRef.current
    if (!el) return
    const handler = () => { const f = el.files?.[0]; if (f) setFormEditDocFile(f) }
    el.addEventListener('change', handler)
    return () => el.removeEventListener('change', handler)
  }, [isEditModalOpen])

  const filteredPolicies = useMemo(() => {
    return policies
      .filter((policy) => {
        const matchesSearch =
          policy.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
          policy.description.toLowerCase().includes(policySearchQuery.toLowerCase())
        const matchesCategory = policyCategoryFilter === 'all' || policy.category === policyCategoryFilter
        const matchesStatus = policyStatusFilter === 'all' || policy.status === policyStatusFilter
        return matchesSearch && matchesCategory && matchesStatus
      })
      .sort((a, b) => {
        if (!a.nextReviewDate) return 1
        if (!b.nextReviewDate) return -1
        return a.nextReviewDate.localeCompare(b.nextReviewDate)
      })
  }, [policies, policySearchQuery, policyCategoryFilter, policyStatusFilter])

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [policySearchQuery, policyCategoryFilter, policyStatusFilter])

  const { items: paginatedPolicies, totalPages } = useMemo(
    () => paginate(filteredPolicies, currentPage, PAGE_SIZE),
    [filteredPolicies, currentPage]
  )

  const policyStats = useMemo(() => ({
    total: policies.length,
    approved: policies.filter((p) => p.status === 'approved').length,
    underReview: policies.filter((p) => p.status === 'under-review').length,
    draft: policies.filter((p) => p.status === 'draft').length,
    expired: policies.filter((p) => p.status === 'expired').length,
  }), [policies])

  function resetCreateForm() {
    setFormName('')
    setFormCategory('')
    setFormTier('')
    setFormVersion('v1.0')
    setFormReviewSchedule({ cadence: 'yearly', dayOfMonth: 1 })
    setFormOwnerIdx(0)
    setFormDescription('')
    setFormDocFile(null)
    setSelectedPolicyTemplateId('')
    setFormAffectedDepartments([])
    setFormBusinessOwnerDepartmentId('')
  }

  function handleCreate() {
    // Required: name, category, approval tier, description. File upload is
    // optional at create time — users can attach a document later from the
    // policy detail view. Anything else still falls back to defaults.
    if (!formName || !formCategory || !formTier || !formDescription) return
    const owner = OWNERS[formOwnerIdx]
    const today = new Date().toISOString().split('T')[0]
    const selectedTmpl = selectedPolicyTemplateId ? policyTemplates.find((t) => t.id === selectedPolicyTemplateId) : null
    const tierSteps = (selectedTmpl?.defaultWorkflowSteps?.length ? selectedTmpl.defaultWorkflowSteps : null)
      ?? TIER_WORKFLOWS[formTier as PolicyApprovalTier]
      ?? TIER_WORKFLOWS.management
    const workflowTimeline = [
      { step: 'Draft Created', date: today, user: owner.name, status: 'completed' as const, actionType: 'move-to-next' },
      { step: tierSteps[0].step, description: tierSteps[0].description, actionType: tierSteps[0].actionType, date: '', user: '', status: 'current' as const },
      ...tierSteps.slice(1).map(s => ({ step: s.step, description: s.description, actionType: s.actionType, date: '', user: '', status: 'pending' as const })),
    ]
    const cycleId = Date.now().toString()
    const cycleLabel = `Review ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    const activityLog: PolicyActivityEntry[] = [{
      id: cycleId,
      timestamp: new Date().toISOString(),
      date: today,
      type: 'created',
      textEn: `Policy created by ${owner.name}`,
      textAr: `تم إنشاء السياسة بواسطة ${owner.name}`,
      user: owner.name,
    }]
    const newPolicy = create({
      name: formName,
      description: formDescription,
      status: 'draft',
      category: formCategory as PolicyCategory,
      version: formVersion || 'v1.0',
      approvalTier: formTier as PolicyApprovalTier,
      owner,
      affectedDepartments: formAffectedDepartments,
      businessOwnerDepartmentId: formBusinessOwnerDepartmentId || undefined,
      lastReviewDate: '',
      nextReviewDate: computeNextReview(formReviewSchedule),
      reviewCycleDays: cadenceToReviewCycleDays(formReviewSchedule.cadence),
      reviewSchedule: formReviewSchedule,
      attachmentUrl: formDocFile?.name ?? '',
      currentReviewCycleId: cycleId,
      currentReviewCycleLabel: cycleLabel,
      reviewCycleHistory: [],
      versionHistory: [
        { version: formVersion || 'v1.0', date: today, author: owner.name, changes: 'Initial draft' },
      ],
      workflowTimeline,
      activityLog,
    })
    if (selectedPolicyTemplateId) incrementPolicyTemplateUsage(selectedPolicyTemplateId)
    showToast(t('policies.policyCreated'))
    setNewlyCreatedIds(prev => [...prev, newPolicy.id])
    setIsCreatePolicyModalOpen(false)
    resetCreateForm()
  }

  function handleEdit() {
    if (!selectedPolicy || !formEditName || !formEditCategory || !formEditTier || !formEditDescription) return
    const owner = OWNERS[formEditOwnerIdx]
    const today = new Date().toISOString().split('T')[0]
    const newVersion = formEditVersion || selectedPolicy.version
    const changes: string[] = []
    if (formEditName !== selectedPolicy.name) changes.push(`Name: "${selectedPolicy.name}" → "${formEditName}"`)
    if (formEditDescription !== selectedPolicy.description) changes.push('Description updated')
    if (formEditCategory !== selectedPolicy.category) changes.push(`Category: ${selectedPolicy.category} → ${formEditCategory}`)
    if (newVersion !== selectedPolicy.version) changes.push(`Version: ${selectedPolicy.version} → ${newVersion}`)
    if (formEditTier !== selectedPolicy.approvalTier) changes.push(`Approval tier: ${selectedPolicy.approvalTier} → ${formEditTier}`)
    if (owner.name !== selectedPolicy.owner.name) changes.push(`Owner: ${selectedPolicy.owner.name} → ${owner.name}`)
    const editNextReview = computeNextReview(formEditReviewSchedule)
    if (editNextReview !== selectedPolicy.nextReviewDate) changes.push(`Next review: ${selectedPolicy.nextReviewDate} → ${editNextReview}`)
    if (formEditDocFile) changes.push(`Document replaced: "${formEditDocFile.name}"`)
    const changesText = changes.length > 0 ? changes.join('; ') : 'Minor update'
    const versionEntry: PolicyVersionEntry = {
      version: newVersion,
      date: today,
      author: owner.name,
      changes: changesText,
    }
    const actingUser = currentUser?.name ?? owner.name
    const activityEntry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'edited',
      textEn: `Policy updated — ${changesText}`,
      textAr: `تم تحديث السياسة — ${changesText}`,
      user: actingUser,
    }
    update(selectedPolicy.id, {
      name: formEditName,
      description: formEditDescription,
      category: formEditCategory as PolicyCategory,
      version: newVersion,
      approvalTier: formEditTier as PolicyApprovalTier,
      owner,
      affectedDepartments: formEditAffectedDepartments,
      businessOwnerDepartmentId: formEditBusinessOwnerDepartmentId || undefined,
      nextReviewDate: computeNextReview(formEditReviewSchedule),
      reviewCycleDays: cadenceToReviewCycleDays(formEditReviewSchedule.cadence),
      reviewSchedule: formEditReviewSchedule,
      ...(formEditDocFile ? { attachmentUrl: formEditDocFile.name } : {}),
      versionHistory: [...selectedPolicy.versionHistory, versionEntry],
      activityLog: [...(selectedPolicy.activityLog ?? []), activityEntry],
    })
    showToast(t('policies.policyUpdated'))
    setIsEditModalOpen(false)
  }

  const createMissingFields = [
    !formName && 'Policy Name',
    !formCategory && 'Category',
    !formTier && 'Approval Tier',
    !formDescription && 'Description',
  ].filter(Boolean) as string[]
  const createFormValid = createMissingFields.length === 0
  const editFormValid = !!(formEditName && formEditCategory && formEditTier && formEditDescription)

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-4`}>
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={'lucide:arrow-left'} className="text-base" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('regulatoryUpdates.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('regulatoryUpdates.subtitle')}</p>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className="hidden lg:flex gap-2">
            <Link href="/correspondence/letters" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters')}
            </Link>
            <span className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center gap-2`}>
              <Icon icon="lucide:refresh-cw" className="text-emerald-600" />
              {t('observations.regulatoryUpdates')}
            </span>
            <Link href="/correspondence/observations" className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-2`}>
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
          <div className="hidden lg:block h-8 w-px bg-slate-200" />
          <div className={`flex bg-slate-100 p-1 rounded-lg`}>
            <Link href="/correspondence/regulatory-updates/rules" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 text-slate-500 hover:text-slate-700')}>
              <Icon icon="lucide:scale" className="text-sm" />
              {t('regulatoryUpdates.tabs.rules')}
            </Link>
            <Link href="/correspondence/regulatory-updates/policies" className={cn('px-9.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 bg-white text-slate-900 shadow-sm')}>
              <Icon icon="lucide:file-text" className="text-sm" />
              {t('regulatoryUpdates.tabs.policies')}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4`}>
          <button
            type="button"
            className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
            title={t('policies.exportPolicies')}
            onClick={() => {
              const depts = useDepartmentStore.getState().departments
              const resolveDept = (id: string | undefined) =>
                id ? depts.find((d) => d.id === id)?.name ?? '' : ''
              exportPoliciesLocalized(filteredPolicies, 'policies', t, isRTL, resolveDept)
            }}
          >
            <Icon icon="lucide:download-cloud" className="text-lg" />
          </button>
          <Gate perm="Approve Policy Reviews">
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={() => setIsCreatePolicyModalOpen(true)}
            >
              <Icon icon="lucide:plus" />
              {t('policies.createPolicy')}
            </Button>
          </Gate>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        {/* Review Alert Banner */}
        {alerts.length > 0 && (
          <div className={`mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3`}>
            <Icon icon="lucide:bell" className="text-amber-500 text-xl shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                {t('policies.reviewAlertTitle', { count: String(alerts.length) })}
              </p>
              <p className="text-xs text-amber-600">{t('policies.reviewAlertBody')}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <StatCard label={t('policies.totalPolicies')} value={policyStats.total} subtext={t('policies.documents')} borderColor="slate" />
          <StatCard label={t('policies.approved')} value={policyStats.approved} subtext={t('policies.active')} borderColor="emerald" valueColor="emerald" />
          <StatCard label={t('policies.underReview')} value={policyStats.underReview} subtext={t('policies.pending')} borderColor="amber" valueColor="amber" />
          <StatCard label={t('policies.draft')} value={policyStats.draft} subtext={t('policies.inProgress')} borderColor="slate" />
          <StatCard label={t('policies.expired')} value={policyStats.expired} subtext={t('policies.needsReview')} borderColor="rose" valueColor="rose" />
        </div>

        {/* Filter Bar */}
        <RegDocFilterBar
          variant="policy"
          searchQuery={policySearchQuery}
          onSearchChange={setPolicySearchQuery}
          categoryFilter={policyCategoryFilter}
          onCategoryChange={setPolicyCategoryFilter}
          statusFilter={policyStatusFilter}
          onStatusChange={setPolicyStatusFilter}
          resultCount={filteredPolicies.length}
          resultLabel={t('policies.policiesFound')}
          rightSlot={
            <Link
              href="/correspondence/registry"
              className={`px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg flex items-center gap-1.5 hover:bg-slate-50 transition-colors shadow-sm`}
            >
              <Icon icon="lucide:book-open" className="text-slate-500 text-sm" />
              {t('correspondence.viewRegistry')}
            </Link>
          }
          t={t}
          isRTL={isRTL}
        />

        {/* Policy Cards */}
        {showPoliciesSkeleton ? (
          <CardSkeleton count={4} className="grid-cols-1" />
        ) : filteredPolicies.length === 0 ? (
          <NoResultsEmptyState
            onClearFilters={() => {
              setPolicySearchQuery('')
              setPolicyCategoryFilter('all')
              setPolicyStatusFilter('all')
            }}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4">
              {paginatedPolicies.map((p) => (
                <RegDocCard
                  key={p.id}
                  variant="policy"
                  policy={p}
                  onClick={() => setSelected(p)}
                  isNew={newlyCreatedIds.includes(p.id)}
                  t={t}
                  isRTL={isRTL}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredPolicies.length)} of {filteredPolicies.length}
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-left" className="text-slate-600 text-sm" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={cn('w-8 h-8 rounded-lg text-xs font-bold transition-colors',
                        page === currentPage ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}>
                      {page}
                    </button>
                  ))}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                    className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50 transition-colors">
                    <Icon icon="lucide:chevron-right" className="text-slate-600 text-sm" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Policy Details Modal */}
      <Modal
        isOpen={selectedPolicy !== null}
        onClose={() => setSelected(null)}
        title={selectedPolicy?.name ?? t('policies.policyDetails')}
        size="xl"
      >
        {selectedPolicy && (
          <PolicyDetailsContent
            policy={selectedPolicy}
            initialTab={deepLinkTab}
            onClose={() => { setSelected(null); setDeepLinkTab(undefined) }}
            onSubmitForReview={() => showToast(t('policies.submitForReviewToast'))}
            onApprove={() => showToast(t('policies.approveToast'))}
            onInitiateReview={() => showToast(t('policies.initiateReviewToast'))}
            onDeleteOpen={() => setIsDeleteModalOpen(true)}
            onEditOpen={() => setIsEditModalOpen(true)}
            onArchive={() => {
              update(selectedPolicy.id, {
                status: 'expired',
                activityLog: [...(selectedPolicy.activityLog ?? []), {
                  id: Date.now().toString(),
                  timestamp: new Date().toISOString(),
                  date: new Date().toISOString().split('T')[0],
                  type: 'edited' as const,
                  textEn: 'Policy archived',
                  textAr: 'تم أرشفة السياسة',
                  user: currentUser?.name ?? 'Unknown',
                }],
              })
              showToast(t('policies.archivedToast'))
              setSelected(null)
            }}
            onUnarchive={() => {
              update(selectedPolicy.id, {
                status: 'approved',
                activityLog: [...(selectedPolicy.activityLog ?? []), {
                  id: Date.now().toString(),
                  timestamp: new Date().toISOString(),
                  date: new Date().toISOString().split('T')[0],
                  type: 'edited' as const,
                  textEn: 'Policy unarchived',
                  textAr: 'تمت استعادة السياسة',
                  user: currentUser?.name ?? 'Unknown',
                }],
              })
              showToast(t('policies.unarchivedToast'))
              setSelected(null)
            }}
            showToast={showToast}
            t={t}
            isRTL={isRTL}
          />
        )}
      </Modal>

      {/* Delete Policy Modal */}
      <DeletePolicyModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        targetId={selectedPolicy?.id ?? null}
        onDeleted={(msg) => { setIsDeleteModalOpen(false); setSelected(null); showToast(msg) }}
        t={t}
      />

      {/* Edit Policy Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('policies.editPolicy')}
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">{t('policies.createPolicySubtitle')}</p>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <Input
                label={`${t('policies.policyName')} *`}
                placeholder={t('policies.policyNamePlaceholder')}
                value={formEditName}
                onChange={(e) => setFormEditName(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')} *</label>
                <EditableSelect
                  value={formEditCategory || null}
                  onChange={(id) => setFormEditCategory(id as PolicyCategory | '')}
                  items={policyCategoryItems}
                  placeholder={t('policies.selectCategory')}
                  onAdd={(label, labelAr) => addPolicyCategory(label, labelAr)}
                  onEdit={(id, label, labelAr) => editPolicyCategory(id, { label, labelAr })}
                  onDelete={(id) => removePolicyCategory(id)}
                  isRTL={isRTL}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')} *</label>
                <EditableSelect
                  locked
                  value={formEditTier || null}
                  onChange={(id) => setFormEditTier(id as PolicyApprovalTier | '')}
                  items={[
                    { id: 'board', label: t('policies.approvalTierBoard') },
                    { id: 'management', label: t('policies.approvalTierManagement') },
                    { id: 'sharia', label: t('policies.approvalTierSharia') },
                    { id: 'agm', label: t('policies.approvalTierAGM') },
                  ]}
                  placeholder={t('policies.selectApprovalTier')}
                  isRTL={isRTL}
                />
              </div>

              <Input
                label={t('policies.version')}
                placeholder="v1.0"
                value={formEditVersion}
                onChange={(e) => setFormEditVersion(e.target.value)}
              />

              <ReviewSchedulePicker
                value={formEditReviewSchedule}
                onChange={setFormEditReviewSchedule}
                t={t}
                isRTL={isRTL}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectOwner')}</label>
                <EditableSelect
                  value={String(formEditOwnerIdx)}
                  onChange={(id) => setFormEditOwnerIdx(Number(id))}
                  items={OWNERS.map((o, idx) => ({ id: String(idx), label: `${o.name} — ${o.department}` }))}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept' as any)}</label>
                <EditableSelect
                  value={formEditBusinessOwnerDepartmentId || null}
                  onChange={(id) => setFormEditBusinessOwnerDepartmentId(id)}
                  items={departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
                  onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                  onDelete={(id) => removeDepartment(id)}
                  placeholder={t('regulatoryUpdates.selectDepartment' as any)}
                  isRTL={isRTL}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments' as any)}</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                  {departments.map((dept) => (
                    <label key={dept.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                        checked={formEditAffectedDepartments.includes(dept.id)}
                        onChange={() => setFormEditAffectedDepartments((prev) =>
                          prev.includes(dept.id) ? prev.filter((d) => d !== dept.id) : [...prev, dept.id]
                        )}
                      />
                      <span className="text-sm">{isRTL ? dept.nameAr : dept.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')} *</label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  placeholder={t('policies.descriptionPlaceholder')}
                  value={formEditDescription}
                  onChange={(e) => setFormEditDescription(e.target.value)}
                />
              </div>
              <div>
                <UploadZone
                  file={formEditDocFile}
                  fileRef={formEditDocFileRef}
                  label={t('policies.uploadDocument')}
                  required
                  t={t}
                />
              </div>
            </div>
          </div>

          <div className={`flex justify-end gap-3 pt-4 border-t border-slate-100`}>
            <Button variant="ghost" onClick={() => setIsEditModalOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="shadow-lg shadow-emerald-100"
              onClick={handleEdit}
              disabled={!editFormValid}
            >
              {t('common.saveChanges')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Policy Modal */}
      <Modal
        isOpen={isCreatePolicyModalOpen}
        onClose={() => { setIsCreatePolicyModalOpen(false); resetCreateForm() }}
        title={t('policies.createNewPolicy')}
        size="xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500 -mt-2">{t('policies.createPolicySubtitle')}</p>

          {/* Template picker — locked because templates are managed in Settings,
              not inline. */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.selectTemplate')}</label>
            <EditableSelect
              locked
              value={selectedPolicyTemplateId || null}
              onChange={(id) => handlePolicyTemplateSelect(id)}
              items={[
                { id: '', label: t('settings.noTemplate') },
                ...policyTemplates.map((tmpl) => ({ id: tmpl.id, label: tmpl.name })),
              ]}
              placeholder={t('settings.noTemplate')}
              isRTL={isRTL}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <Input
                label={`${t('policies.policyName')} *`}
                placeholder={t('policies.policyNamePlaceholder')}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectCategory')} *</label>
                <EditableSelect
                  value={formCategory || null}
                  onChange={(id) => setFormCategory(id as PolicyCategory | '')}
                  items={policyCategoryItems}
                  placeholder={t('policies.selectCategory')}
                  onAdd={(label, labelAr) => addPolicyCategory(label, labelAr)}
                  onEdit={(id, label, labelAr) => editPolicyCategory(id, { label, labelAr })}
                  onDelete={(id) => removePolicyCategory(id)}
                  isRTL={isRTL}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.approvalTier')} *</label>
                <EditableSelect
                  locked
                  value={formTier || null}
                  onChange={(id) => setFormTier(id as PolicyApprovalTier | '')}
                  items={[
                    { id: 'board', label: t('policies.approvalTierBoard') },
                    { id: 'management', label: t('policies.approvalTierManagement') },
                    { id: 'sharia', label: t('policies.approvalTierSharia') },
                    { id: 'agm', label: t('policies.approvalTierAGM') },
                  ]}
                  placeholder={t('policies.selectApprovalTier')}
                  isRTL={isRTL}
                />
              </div>

              <Input
                label={t('policies.version')}
                placeholder="v1.0"
                value={formVersion}
                onChange={(e) => setFormVersion(e.target.value)}
              />

              <ReviewSchedulePicker
                value={formReviewSchedule}
                onChange={setFormReviewSchedule}
                t={t}
                isRTL={isRTL}
              />
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.selectOwner')}</label>
                <EditableSelect
                  value={String(formOwnerIdx)}
                  onChange={(id) => setFormOwnerIdx(Number(id))}
                  items={OWNERS.map((o, idx) => ({ id: String(idx), label: `${o.name} — ${o.department}` }))}
                  isRTL={isRTL}
                />
              </div>
              {/* §4 — Business Owner Department (decoupled from team-member owner) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept' as any)}</label>
                <EditableSelect
                  value={formBusinessOwnerDepartmentId || null}
                  onChange={(id) => setFormBusinessOwnerDepartmentId(id)}
                  items={departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                  onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
                  onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                  onDelete={(id) => removeDepartment(id)}
                  placeholder={t('regulatoryUpdates.selectDepartment' as any)}
                  isRTL={isRTL}
                />
              </div>
              {/* §4 — Affected Departments multi-select */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.affectedDepartments' as any)}</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                  {departments.map((dept) => (
                    <label key={dept.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                        checked={formAffectedDepartments.includes(dept.id)}
                        onChange={() => setFormAffectedDepartments((prev) =>
                          prev.includes(dept.id) ? prev.filter((d) => d !== dept.id) : [...prev, dept.id]
                        )}
                      />
                      <span className="text-sm">{isRTL ? dept.nameAr : dept.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('policies.description')} *</label>
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[120px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  placeholder={t('policies.descriptionPlaceholder')}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <UploadZone
                file={formDocFile}
                fileRef={formDocFileRef}
                label={t('policies.uploadDocument')}
                required
                t={t}
              />
            </div>
          </div>

          <div className={`flex flex-col gap-3 pt-4 border-t border-slate-100`}>
            {!createFormValid && (
              <p className="text-xs text-rose-600 self-end">
                Missing required: {createMissingFields.join(', ')}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => { setIsCreatePolicyModalOpen(false); resetCreateForm() }}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                className="shadow-lg shadow-emerald-100"
                onClick={handleCreate}
                disabled={!createFormValid}
              >
                {t('policies.createPolicy')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
