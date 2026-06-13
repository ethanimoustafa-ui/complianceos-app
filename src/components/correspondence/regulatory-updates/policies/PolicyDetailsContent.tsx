'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/format'
import { dicebearAvatar } from '@/lib/avatar'
import { renderFieldLabel } from '@/lib/timeline-message'
import { api } from '@/lib/api-client'
import { usePolicyStore } from '@/stores/policy-store'
import { useAuthStore } from '@/stores/auth-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { useCan } from '@/lib/permissions'
import { EditableSelect } from '@/components/ui/editable-select'
import { InlineDeadlinePicker } from '@/components/ui/inline-deadline-picker'
// C(#31)/B(#30): consume a calendar deep-link → open the workflow tab + glow
// the targeted step.
import { useDeepLinkTab, useDeepLinkHighlight } from '@/hooks/useDeepLink'
// P3 (W29): skeleton loaders for detail sections during initial fetch.
import { Skeleton } from '@/components/ui/skeleton'
import { FrameworkChips } from '@/components/ui/framework-chips'
import {
  formatPolicyStatus,
  formatPolicyApprovalTier,
  formatPolicyWorkflowStepStatus,
} from '@/lib/format/enum'
// Wave-19.7 — approval-tier labels are user-configurable. Read from the
// enum-values store first and fall back to the legacy static map.
import { useEnumValuesStore } from '@/stores/enum-values-store'
import type {
  Policy, PolicyStatus, PolicyApprovalTier, PolicyActivityEntry,
  PolicyAttachment, PolicyEvidence, PolicyWorkflowStep,
} from '@/types'

type DetailTab = 'overview' | 'workflow' | 'activity'

type NotePromptFor =
  | 'submit' | 'advance' | 'initiate' | 'undo'
  | 'approve-step' | 'deny-step' | 'log-response'
  | 'notify-manager-prompt' | 'manager-approved'
  | 'manager-rejected'
  | null

type Props = {
  policy: Policy
  initialTab?: DetailTab
  onClose: () => void
  onSubmitForReview: () => void
  onApprove: () => void
  onInitiateReview: () => void
  onDeleteOpen: () => void
  onEditOpen: () => void
  onArchive: () => void
  onUnarchive: () => void
  showToast: (msg: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

// P2: aligned with migration 074 tier keys. `management` kept for backward compat.
const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  board:           { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  management:      { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  managerial:      { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  sharia:          { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  agm:             { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  audit_committee: { bg: 'bg-cyan-100',    text: 'text-cyan-700'    },
  other:           { bg: 'bg-slate-100',   text: 'text-slate-700'   },
}

const STATUS_COLORS: Record<PolicyStatus, string> = {
  draft:              'bg-slate-100 text-slate-600',
  'under-review':     'bg-amber-100 text-amber-700',
  approved:           'bg-emerald-100 text-emerald-700',
  expired:            'bg-rose-100 text-rose-700',
  overdue:            'bg-rose-100 text-rose-700',
  'requires-review':  'bg-orange-100 text-orange-700',
}

const ACTION_TYPE_META: Record<string, { icon: string; color: string }> = {
  'move-to-next':     { icon: 'lucide:arrow-right',    color: 'text-slate-400'   },
  'send-email':       { icon: 'lucide:mail',            color: 'text-blue-400'    },
  'notify-manager':   { icon: 'lucide:user-check',      color: 'text-violet-400'  },
  'request-approval': { icon: 'lucide:check-square',    color: 'text-emerald-400' },
  'send-for-review':  { icon: 'lucide:send',            color: 'text-blue-400'    },
  // QA fix (#2): DB-seeded action types (policy_workflow_step_templates) were
  // missing here, so those steps rendered NO header icon. The earlier audit
  // checked the client TIER_WORKFLOWS const instead of the DB seed.
  'approve':          { icon: 'lucide:check-square',    color: 'text-emerald-400' },
  // W37: review_complete + publish both render as "Complete Step", so their
  // step-row icon is a completion check (was the clipboard "review" icon, which
  // no longer matches the collapsed label).
  'review_complete':  { icon: 'lucide:check-circle-2',  color: 'text-emerald-400' },
  'publish':          { icon: 'lucide:check-circle-2',  color: 'text-emerald-400' },
  'vote_approve':     { icon: 'lucide:vote',            color: 'text-violet-400'  },
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function PolicyDetailsContent({
  policy, initialTab, onClose, onSubmitForReview, onApprove, onInitiateReview, onDeleteOpen, onEditOpen, onArchive, onUnarchive, showToast, t, isRTL,
}: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab ?? 'overview')
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const canApprovePolicy = useCan('Approve Policy Reviews')

  // P5 (W29): activity Load More — show 10 newest first, Load More appends older.
  const TIMELINE_PAGE_SIZE = 10
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE)

  // Attachment file upload
  const docFileRef = useRef<HTMLInputElement>(null)

  // Evidence
  const [evidenceFilter, setEvidenceFilter] = useState<string>('current')
  const evidenceFileRef = useRef<HTMLInputElement>(null)

  // Add workflow step form
  const [showAddStep, setShowAddStep] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [newStepDesc, setNewStepDesc] = useState('')
  const [newStepAction, setNewStepAction] = useState('move-to-next')
  // P1: deadline for the new workflow step
  const [newStepDeadline, setNewStepDeadline] = useState<string | undefined>(undefined)
  // W27.3-β: upload + add-step in-flight spinners
  const [isAddingStep, setIsAddingStep] = useState(false)
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false)

  // Collapsible steps
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  // Inline rename state for workflow steps
  const [renamingStepIdx, setRenamingStepIdx] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dragOverBin, setDragOverBin] = useState(false)

  // Note prompt — intercepts all action buttons
  const [notePromptFor, setNotePromptFor] = useState<NotePromptFor>(null)
  const [noteText, setNoteText] = useState('')

  const { policies: allPolicies, update, addWorkflowStep, addAttachment, removeAttachment, addEvidence, removeEvidence, advanceWorkflowStep, loadMorePolicyActivity, policyActivityPagination } = usePolicyStore()
  const { user: authUser } = useAuthStore()
  const { addNotification } = useNotificationStore()
  // P6 (W34): real per-policy detail-GET in-flight flag (set by fetchById).
  const detailLoading = usePolicyStore((s) => s.detailLoading[policy.id] ?? false)
  // BUG-R4-01: per-policy workflow action in-flight flag — disables all workflow
  // action buttons while advanceWorkflowStep is running to prevent double-submits.
  const workflowProcessing = usePolicyStore((s) => s.workflowProcessing[policy.id] ?? false)
  const fresh = allPolicies.find(p => p.id === policy.id) ?? policy
  const actingUser = authUser?.name ?? fresh.owner.name
  const today = new Date().toISOString().split('T')[0]

  // P6 (W34): detect pre-fetch state — drive each section's skeleton off the
  // REAL detail-GET in-flight flag (detailLoading) AND that section's own
  // emptiness. The previous combined flag required `!fresh.description`, but
  // the LIST endpoint ships `description` (POLICY_LIST_COLUMNS), so the flag
  // was permanently false for any described policy and the workflow/document
  // skeletons never rendered. Per-section gating keeps already-known fields
  // (description) visible while detail-only collections show skeletons, and a
  // genuinely-empty policy never gets stuck (detailLoading clears on settle).
  const descriptionPrefetch = detailLoading && !fresh.description
  const documentsPrefetch =
    detailLoading && (fresh.attachments ?? []).length === 0 && !fresh.attachmentUrl
  const workflowPrefetch = detailLoading && fresh.workflowTimeline.length === 0
  const activityPrefetch = detailLoading && (fresh.activityLog ?? []).length === 0
  const versionsPrefetch = detailLoading && fresh.versionHistory.length === 0

  // C(#31)/B(#30): if the user arrived from a calendar workflow-step deadline,
  // switch to the Workflow tab, then (once the steps have rendered) scroll to
  // and glow the targeted step. The sub-item id rides the transient deep-link
  // store, never the URL.
  useDeepLinkTab((tab) => setActiveTab(tab as DetailTab))
  useDeepLinkHighlight(activeTab === 'workflow' && !workflowPrefetch && fresh.workflowTimeline.length > 0)

  // P1 (W30): archived policies are strictly view-only — hide every mutation
  // affordance (upload zone, edit button, workflow actions, etc.).
  const isArchived = !!fresh.archivedAt

  // W18-cleanup — every enum chip below routes through `src/lib/format/enum.ts`.
  // The per-component label maps that used to live here were removed in favour
  // of the shared formatter so EN/AR copy lives in the dictionaries once.

  const tierStyle = TIER_COLORS[fresh.approvalTier] ?? TIER_COLORS.management

  // Wave-19.7 — preferred tier label comes from `enum_value_definitions`.
  // Fetch on mount + fall back to the legacy static formatter when the row
  // hasn't loaded yet (or doesn't exist for this stored value).
  const fetchEnumValues = useEnumValuesStore((s) => s.fetch)
  useEffect(() => { void fetchEnumValues('policy.approval_tier') }, [fetchEnumValues])
  const tierRow = useEnumValuesStore((s) =>
    (s.byDomain['policy.approval_tier'] ?? []).find((v) => v.key === fresh.approvalTier),
  )
  const tierLabel = tierRow
    ? (isRTL ? tierRow.nameAr : tierRow.nameEn)
    : formatPolicyApprovalTier(t, fresh.approvalTier)

  const STEP_NAME_MAP: Record<string, string> = {
    'Draft Created': t('policies.stepDraftCreated'),
    'IT Review': t('policies.stepITReview'),
    'Legal Review': t('policies.stepLegalReview'),
    'Management Approval': t('policies.stepManagementApproval'),
    'Compliance Review': t('policies.stepComplianceReview'),
    'Final Approval': t('policies.stepFinalApproval'),
    'Technical Review': t('policies.stepTechnicalReview'),
    'DPO Review': t('policies.stepDPOReview'),
    'Management Review': t('policies.stepManagementReview'),
    'Risk Review': t('policies.stepRiskReview'),
    'Review Initiated': t('policies.stepReviewInitiated'),
  }

  /** Format a review cycle label in the current locale.
   *  Tries currentReviewCycleDate first, then parses "Review Month Year" strings. */
  function formatCycleLabel(label: string, isoDate?: string): string {
    const loc = isRTL ? 'ar-SA' : 'en-US'
    // W37: a review cycle is a CALENDAR concept — render the date only, never a
    // clock time. Archived cycles are stored at UTC-midnight (the `today`
    // fallback in the initiate-review route), which the old `withTime` branch
    // rendered as a spurious "~4:00 AM" in the viewer's timezone.
    const fmtDate = (d: Date) =>
      `${t('policies.reviewWord')} ${d.toLocaleDateString(loc, { month: 'long', day: 'numeric', year: 'numeric' })}`
    if (isoDate) {
      // Parse a date-only string (YYYY-MM-DD) as LOCAL midnight so it can't shift
      // a calendar day in timezones behind UTC; full timestamps parse as-is.
      const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
        ? new Date(`${isoDate}T00:00:00`)
        : new Date(isoDate)
      if (!isNaN(d.getTime())) return fmtDate(d)
    }
    // Parse stored English labels like "Review March 2026"
    const m = label.match(/^Review\s+(.+)$/i)
    if (m) {
      const parsed = new Date(m[1])
      if (!isNaN(parsed.getTime())) return fmtDate(parsed)
    }
    return label
  }

  const tabs: { id: DetailTab; label: string; icon: string }[] = [
    { id: 'overview',  label: t('policies.tabOverview'),  icon: 'lucide:layout-dashboard' },
    { id: 'workflow',  label: t('policies.tabWorkflow'),  icon: 'lucide:git-branch'       },
    { id: 'activity',  label: t('policies.tabActivity'),  icon: 'lucide:activity'         },
  ]

  // ── Evidence helpers ─────────────────────────────────────────────────
  const evidenceCycles = useMemo(() => {
    const cycles = new Map<string, string>()
    // W37: only ARCHIVED cycles that actually hold evidence are worth listing in
    // the filter. Same-day re-initiation can spawn several empty cycles with an
    // identical label ("Review Jun 9, 2026") — listing those produced confusing
    // duplicates. The current cycle is always listed (below), even when empty.
    const cyclesWithEvidence = new Set((fresh.evidence ?? []).map((e) => e.reviewCycleId))
    // History cycles first (oldest → newest) — skip empty ones.
    for (const h of fresh.reviewCycleHistory ?? []) {
      if (cyclesWithEvidence.has(h.id) && !cycles.has(h.id)) cycles.set(h.id, formatCycleLabel(h.label, h.initiatedAt))
    }
    // Current cycle
    if (fresh.currentReviewCycleId) {
      // W32-1: "Current Review" is a localized concept. The stored cycle label
      // persists the EN/AR default string captured at upload time, so it would
      // render in the uploader's language regardless of the viewer's locale.
      // Localize when the stored label is the default sentinel (or empty);
      // preserve any genuinely custom cycle name.
      const stored = fresh.currentReviewCycleLabel
      const isDefaultLabel = !stored || stored === 'Current Review' || stored === 'المراجعة الحالية'
      const raw = isDefaultLabel ? t('policies.currentReview') : stored
      cycles.set(fresh.currentReviewCycleId, formatCycleLabel(raw, fresh.currentReviewCycleDate))
    }
    // Fallback: any cycles found only in evidence entries
    for (const e of fresh.evidence ?? []) {
      if (!cycles.has(e.reviewCycleId)) cycles.set(e.reviewCycleId, formatCycleLabel(e.reviewCycleLabel, e.uploadedAt))
    }
    return cycles
    // isRTL in deps so the localized label recomputes on a live locale switch.
  }, [fresh.evidence, fresh.currentReviewCycleId, fresh.currentReviewCycleLabel, fresh.currentReviewCycleDate, fresh.reviewCycleHistory, isRTL])

  const displayedEvidence = (fresh.evidence ?? []).filter(e =>
    evidenceFilter === 'current'
      ? e.reviewCycleId === fresh.currentReviewCycleId
      : e.reviewCycleId === evidenceFilter
  )

  // ── Attachment handlers ──────────────────────────────────────────────
  // A6: route through addAttachment (POST /api/policies/{id}/attachments) so
  // uploads survive a page refresh. Previous implementation called update() which
  // doesn't include attachments in the PATCH payload — silent server-side drop.
  async function handleDocAdd(files: FileList) {
    setIsUploadingDoc(true)
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file)
        await addAttachment(fresh.id, {
          name: file.name,
          dataUrl,
          size: file.size,
          uploadedBy: actingUser,
        })
      }
      showToast(t('policies.documentUploaded'))
    } finally {
      setIsUploadingDoc(false)
    }
  }

  function handleDocRemove(attachmentId: string) {
    const removed = fresh.attachments?.find(a => a.id === attachmentId)
    const actEntry: PolicyActivityEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      date: today,
      type: 'document_removed',
      textEn: `Document "${removed?.name}" removed`,
      textAr: `تم إزالة المستند "${removed?.name}"`,
      user: actingUser,
    }
    // A6: use dedicated removeAttachment + update activityLog separately.
    removeAttachment(fresh.id, attachmentId)
    update(fresh.id, {
      activityLog: [...(fresh.activityLog ?? []), actEntry],
    })
  }

  function handleDownload(att: PolicyAttachment) {
    const a = document.createElement('a')
    a.href = att.dataUrl
    a.download = att.name
    a.click()
  }

  // ── Evidence handlers ────────────────────────────────────────────────
  // P2 fix: route through addEvidence (POST /api/policies/{id}/evidence) so
  // uploads are persisted. The old implementation called update() which only
  // PATCHes the top-level policy row — evidence is not included in that payload
  // and was silently dropped on the next refresh.
  async function handleEvidenceAdd(files: FileList) {
    setIsUploadingEvidence(true)
    try {
      const cycleId = fresh.currentReviewCycleId ?? crypto.randomUUID()
      const cycleLabel = fresh.currentReviewCycleLabel ?? t('policies.currentReview')
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file)
        await addEvidence(fresh.id, {
          name: file.name,
          dataUrl,
          uploadedBy: actingUser,
          reviewCycleId: cycleId,
          reviewCycleLabel: cycleLabel,
        })
      }
      showToast(t('policies.evidenceUploaded'))
    } finally {
      setIsUploadingEvidence(false)
    }
  }

  async function handleEvidenceRemove(evidenceId: string) {
    // BUG-P-US08 fix: call removeEvidence which hits DELETE /api/policies/{uuid}/evidence/{id}
    // The server writes the evidence_removed activity log entry.
    await removeEvidence(fresh.id, evidenceId)
  }

  function handleEvidenceDownload(ev: PolicyEvidence) {
    const a = document.createElement('a')
    a.href = ev.dataUrl
    a.download = ev.name
    a.click()
  }

  // ── Workflow step handlers ───────────────────────────────────────────
  // A7 fix: use addWorkflowStep which calls POST /api/policies/{id}/workflow/steps
  // instead of local-only update(). The store handles optimistic insert + server
  // reconciliation + rollback on failure.
  async function handleAddStep() {
    if (!newStepName.trim() || isAddingStep) return
    setIsAddingStep(true)
    try {
      // P1: pass deadline to the store so it's included in the workflow step
      await addWorkflowStep(fresh.id, {
        step: newStepName.trim(),
        description: newStepDesc.trim() || undefined,
        actionType: newStepAction,
        deadline: newStepDeadline,
      })
      setNewStepName('')
      setNewStepDesc('')
      setNewStepAction('move-to-next')
      setNewStepDeadline(undefined)
      setShowAddStep(false)
    } finally {
      setIsAddingStep(false)
    }
  }

  // ── Drag handlers ────────────────────────────────────────────────────
  function handleDragStart(idx: number) { setDragIdx(idx) }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault(); setDragOverIdx(idx)
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); setDragOverBin(false) }

  function restatusTimeline(timeline: PolicyWorkflowStep[]): PolicyWorkflowStep[] {
    let firstNonCompleted = false
    return timeline.map(s => {
      if (s.status === 'completed') return s
      if (!firstNonCompleted) { firstNonCompleted = true; return { ...s, status: 'current' as const } }
      return { ...s, status: 'pending' as const }
    })
  }

  function deriveStatusFromTimeline(
    timeline: PolicyWorkflowStep[],
    currentStatus: PolicyStatus,
  ): PolicyStatus {
    const allDone = timeline.length > 0 && timeline.every(s => s.status === 'completed')
    if (allDone) return 'approved'
    if (currentStatus === 'approved') return 'under-review'
    return currentStatus
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { handleDragEnd(); return }
    const timeline = [...fresh.workflowTimeline]
    if (timeline[targetIdx].status === 'completed') { handleDragEnd(); return }
    const [moved] = timeline.splice(dragIdx, 1)
    timeline.splice(targetIdx, 0, moved)
    // Clear stepState from non-completed steps to prevent stale approval-flow states
    const cleared = timeline.map(s =>
      s.status === 'completed' ? s : { ...s, stepState: undefined }
    )
    const newTl = restatusTimeline(cleared)
    const newStatus = deriveStatusFromTimeline(newTl, fresh.status)
    // Only persist the policy-level status change via the policy PATCH.
    // workflowTimeline is managed entirely by reorderWorkflowSteps so it
    // can't race against the step sort_order PATCHes.
    if (newStatus !== fresh.status) {
      update(fresh.id, { status: newStatus })
    }
    void usePolicyStore.getState().reorderWorkflowSteps(fresh.id, newTl)
    handleDragEnd()
  }

  // ── Workflow action handlers ─────────────────────────────────────────
  function handleManagerReceived() {
    // W37: persist the acknowledgement via the server 'acknowledge' action so it
    // sticks in the activity timeline. The old local-only update({activityLog})
    // was dropped by the policy PATCH (activityLog isn't a policy column), so the
    // entry vanished on the next fetch ("manager acknowledgements don't stick").
    const currentStep = fresh.workflowTimeline.find(s => s.status === 'current')
    void advanceWorkflowStep(fresh.id, {
      action: 'acknowledge',
      stepId: currentStep?.id,
      userName: actingUser,
    })
    showToast(t('policies.managerReceivedToast'))
  }

  function handleSendEmail(step: PolicyWorkflowStep) {
    const subject = encodeURIComponent(`Policy Review: ${fresh.name} — ${step.step}`)
    const body = encodeURIComponent(
      `Dear Team,\n\nThis is a request regarding the policy "${fresh.name}" (${fresh.id}).\n\nStep: ${step.step}\n${step.description ? 'Description: ' + step.description + '\n' : ''}\nPlease review and respond.\n\nThank you.`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
    // W37: persist via the server 'send-email' action — sets awaiting-response,
    // moves a draft policy to under-review, and writes an activity-log row
    // (the old client-only setStepState wrote NO log). Loading-driven, not optimistic.
    void advanceWorkflowStep(fresh.id, { action: 'send-email', stepId: step.id, userName: actingUser })
    showToast(t('policies.emailSentToast'))
  }

  function handleRequestApproval() {
    // W37: clicking "Submit for Approval" → server 'request-approval' action:
    // sets pending-approval, starts the review for a draft policy, and logs it.
    const currentStep = fresh.workflowTimeline.find(s => s.status === 'current')
    void advanceWorkflowStep(fresh.id, { action: 'request-approval', stepId: currentStep?.id, userName: actingUser })
  }

  // ── Note prompt ──────────────────────────────────────────────────────
  function closePrompt() {
    setNotePromptFor(null)
    setNoteText('')
  }

  function handleConfirmAction() {
    const note = noteText.trim() || undefined
    const tl = fresh.workflowTimeline
    const currentStep = tl.find(s => s.status === 'current')
    const promptType = notePromptFor
    // W37: close the note overlay immediately, then run the action SERVER-SIDE
    // with the `workflowProcessing` spinner. No optimistic local writes — the
    // advance route persists + LOGS every transition and advanceWorkflowStep
    // awaits the refetch, so the UI jumps straight to server truth instead of
    // the old "reverts then comes back" optimistic flicker.
    closePrompt()
    if (!promptType) return
    void (async () => {
      if (
        promptType === 'advance' || promptType === 'approve-step' ||
        promptType === 'log-response' || promptType === 'manager-approved'
      ) {
        // Complete the current step + advance (server derives final vs intermediate).
        await advanceWorkflowStep(fresh.id, { action: 'approve', stepId: currentStep?.id, note, userName: actingUser })
        if (usePolicyStore.getState().byId[fresh.id]?.status === 'approved') onApprove()
      } else if (promptType === 'deny-step' || promptType === 'manager-rejected') {
        await advanceWorkflowStep(fresh.id, { action: 'reject', stepId: currentStep?.id, note, userName: actingUser })
      } else if (promptType === 'notify-manager-prompt') {
        await advanceWorkflowStep(fresh.id, { action: 'notify-manager', stepId: currentStep?.id, note, userName: actingUser })
        addNotification({
          title: 'Manager Review Required',
          message: `${actingUser} requested manager review for step "${currentStep?.step ?? ''}" in policy "${fresh.name}"`,
          type: 'info' as const,
          route: '/correspondence/regulatory-updates/policies',
        })
        showToast(t('policies.managerNotifiedToast', { name: fresh.owner.name }))
      } else if (promptType === 'initiate') {
        await advanceWorkflowStep(fresh.id, { action: 'initiate-review', note, userName: actingUser })
        onInitiateReview()
      } else if (promptType === 'undo') {
        await advanceWorkflowStep(fresh.id, { action: 'undo', note, userName: actingUser })
      }
    })()
  }


  return (
    <div className={`flex flex-col md:flex-row gap-6`}>
      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Status + tier badge row */}
        <div className={`flex items-center gap-2 mb-4 flex-wrap`}>
          {/* BUG-P-R3-09C: archivedAt is authoritative — show Archived chip before status */}
          {fresh.archivedAt ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600">
              {t('common.archived')}
            </span>
          ) : (
            <span className={cn('px-3 py-1 rounded-full text-xs font-bold', STATUS_COLORS[fresh.status] ?? 'bg-slate-100 text-slate-600')}>
              {formatPolicyStatus(t, fresh.status)}
            </span>
          )}
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold', tierStyle.bg, tierStyle.text)}>
            {tierLabel}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
            {fresh.version}
          </span>
          {fresh.overdueCount && fresh.overdueCount > 0 ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600">
              {fresh.overdueCount}× overdue
            </span>
          ) : null}
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
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

        {/* ── Overview tab ──────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* P3 (W29): skeleton while detail GET is in flight. */}
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                {t('policies.description')}
              </h3>
              {descriptionPrefetch ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-4 w-3/5 rounded" />
                </div>
              ) : (
                <p className="text-sm text-slate-600 leading-relaxed">{fresh.description || '—'}</p>
              )}
            </section>

            {/* Multi-document section */}
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-2">
                {t('policies.uploadDocument')}
              </h3>
              {/* P9 (W30): skeleton while detail GET is in flight */}
              {documentsPrefetch ? (
                <div className="space-y-2 mb-2">
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : null}
              <input
                ref={docFileRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xlsx,.pptx"
                onChange={(e) => { if (e.target.files?.length) { handleDocAdd(e.target.files); e.target.value = '' } }}
              />

              {/* Legacy single attachment compat */}
              {(!fresh.attachments || fresh.attachments.length === 0) && fresh.attachmentUrl ? (
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl mb-2">
                  <Icon icon="lucide:file" className="text-slate-400 text-xl shrink-0" />
                  <p className="text-xs font-bold text-slate-600 flex-1 truncate">{fresh.attachmentUrl}</p>
                  <span className="text-[10px] text-slate-400">legacy</span>
                </div>
              ) : null}

              {/* Attachment list */}
              {(fresh.attachments ?? []).map(att => (
                <div key={att.id} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl mb-2">
                  <Icon icon="lucide:file-check" className="text-emerald-500 text-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-emerald-700 truncate">{att.name}</p>
                    <p className="text-[10px] text-emerald-500">{formatBytes(att.size)} • {att.uploadedBy}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownload(att)}
                      className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-500 transition-colors"
                      title="Download"
                    >
                      <Icon icon="lucide:download" className="text-sm" />
                    </button>
                    <button
                      onClick={() => handleDocRemove(att.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-400 transition-colors"
                      title="Remove"
                    >
                      <Icon icon="lucide:trash-2" className="text-sm" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add document button — hidden for archived policies */}
              {!isArchived && (
                <button
                  onClick={() => docFileRef.current?.click()}
                  disabled={isUploadingDoc}
                  aria-busy={isUploadingDoc || undefined}
                  className="flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 px-3 py-2 rounded-lg border border-dashed border-emerald-200 hover:border-emerald-400 transition-colors w-full justify-center mt-1 disabled:opacity-60"
                >
                  <Icon icon={isUploadingDoc ? 'lucide:loader-2' : 'lucide:plus'} className={`text-sm${isUploadingDoc ? ' animate-spin' : ''}`} />
                  {isUploadingDoc ? t('common.saving') : t('policies.uploadDocument')}
                </button>
              )}
            </section>
          </div>
        )}

        {/* ── Workflow tab ──────────────────────────────────────────── */}
        {activeTab === 'workflow' && (
          <div className="space-y-6">
            <section className="relative">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('policies.approvalWorkflow')}
                </h3>
                {/* Add Workflow Step — hidden for archived policies */}
                {!isArchived && (
                  <button
                    onClick={() => setShowAddStep((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                  >
                    <Icon icon={showAddStep ? 'lucide:x' : 'lucide:plus'} className="text-sm" />
                    {showAddStep ? t('common.cancel') : t('policies.addWorkflowStep')}
                  </button>
                )}
              </div>

              {/* Add step form */}
              {showAddStep && (
                <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      {t('policies.workflowStepName')} *
                    </label>
                    <input
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="e.g., Legal Review"
                      value={newStepName}
                      onChange={(e) => setNewStepName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      {t('policies.workflowStepDesc')}
                    </label>
                    <input
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Brief description of this step..."
                      value={newStepDesc}
                      onChange={(e) => setNewStepDesc(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      {t('policies.workflowActionType')}
                    </label>
                    <EditableSelect
                      locked
                      value={newStepAction}
                      onChange={(id) => setNewStepAction(id)}
                      items={[
                        { id: 'move-to-next', label: t('policies.actionMoveToNext') },
                        { id: 'send-email', label: t('policies.actionSendEmail') },
                        { id: 'notify-manager', label: t('policies.actionNotifyManager') },
                        { id: 'request-approval', label: t('policies.actionRequestApproval') },
                        { id: 'send-for-review', label: t('policies.actionSendForReview') },
                      ]}
                      size="sm"
                      isRTL={isRTL}
                    />
                  </div>
                  {/* P1: optional deadline for the new step */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      {t('inlineDeadlinePicker.deadline')}
                    </label>
                    <input
                      type="date"
                      value={newStepDeadline ?? ''}
                      max={fresh.nextReviewDate}
                      onChange={(e) => setNewStepDeadline(e.target.value || undefined)}
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    {fresh.nextReviewDate && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t('inlineDeadlinePicker.mustBeBefore', { date: fresh.nextReviewDate })}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" className="h-8 text-xs" onClick={() => { setShowAddStep(false); setNewStepName(''); setNewStepDesc(''); setNewStepDeadline(undefined) }}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      className="h-8 text-xs shadow-sm shadow-emerald-100"
                      disabled={!newStepName.trim() || isAddingStep}
                      aria-busy={isAddingStep || undefined}
                      onClick={() => void handleAddStep()}
                    >
                      <Icon icon={isAddingStep ? 'lucide:loader-2' : 'lucide:plus'} className={`w-3.5 h-3.5${isAddingStep ? ' animate-spin' : ''}`} />
                      {isAddingStep ? t('common.saving') : t('common.add')}
                    </Button>
                  </div>
                </div>
              )}

              {/* P3 (W29) / W39: skeleton while the detail GET is in flight —
                  shaped like the real timeline (vertical rail + step dot +
                  label/caption bars) instead of flat anonymous bars. */}
              {workflowPrefetch && (
                <div
                  className="space-y-2 relative before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100"
                  data-testid="policy-workflow-skeleton"
                  role="status"
                  aria-busy="true"
                  aria-live="polite"
                >
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative flex items-start gap-3">
                      <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-3.5 relative z-10" />
                      <div className="flex-1 rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Skeleton className="h-3.5 w-40 max-w-[50%]" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-2.5 w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Workflow steps — collapsible + drag */}
              <div className="space-y-2 relative before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                {fresh.workflowTimeline.map((step, idx) => {
                  const isCompleted = step.status === 'completed'
                  const isExpanded = expandedStep === idx
                  const isDragging = dragIdx === idx
                  const isDragOver = dragOverIdx === idx && dragIdx !== idx && !isCompleted

                  return (
                    <div
                      key={idx}
                      data-highlight-id={step.id}
                      draggable={!isCompleted && !isArchived}
                      onDragStart={() => !isCompleted && !isArchived && handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={() => handleDrop(idx)}
                      className={cn(
                        'rounded-xl border transition-all',
                        isCompleted ? 'bg-emerald-50/50 border-emerald-100' :
                        (!isArchived && step.status === 'current') ? 'bg-amber-50/50 border-amber-100' :
                        'bg-white border-slate-100',
                        isDragOver && 'border-emerald-400 ring-1 ring-emerald-300',
                        isDragging && 'opacity-40',
                      )}
                    >
                      {/* Collapsed header row */}
                      <div
                        className="flex items-center gap-3 p-3 ps-5 relative cursor-pointer select-none"
                        onClick={() => setExpandedStep(isExpanded ? null : idx)}
                      >
                        {/* Timeline dot */}
                        <div className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center shrink-0 absolute start-[-1px]',
                          isCompleted ? 'bg-emerald-500' :
                          (!isArchived && step.status === 'current') ? 'border-2 border-amber-400 bg-amber-50' :
                          'border-2 border-slate-200 bg-white'
                        )}>
                          {isCompleted && <Icon icon="lucide:check" className="text-white text-xs" />}
                        </div>

                        {/* Drag handle — hidden for archived policies (BUG-P-R2-07-B) */}
                        {!isCompleted && !isArchived && (
                          <Icon
                            icon="lucide:grip-vertical"
                            className="text-slate-300 text-sm shrink-0 cursor-grab"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}

                        {/* Step name + action icon */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 group/rename">
                            {renamingStepIdx === idx ? (
                              <input
                                autoFocus
                                value={renameDraft}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onBlur={() => {
                                  const trimmed = renameDraft.trim()
                                  if (trimmed && trimmed !== step.step) {
                                    usePolicyStore.getState().renameWorkflowStep(fresh.id, idx, trimmed, actingUser)
                                  }
                                  setRenamingStepIdx(null)
                                  setRenameDraft('')
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') {
                                    const trimmed = renameDraft.trim()
                                    if (trimmed && trimmed !== step.step) {
                                      usePolicyStore.getState().renameWorkflowStep(fresh.id, idx, trimmed, actingUser)
                                    }
                                    setRenamingStepIdx(null)
                                    setRenameDraft('')
                                  } else if (e.key === 'Escape') {
                                    setRenamingStepIdx(null)
                                    setRenameDraft('')
                                  }
                                }}
                                className="text-sm font-bold text-slate-700 bg-white border border-emerald-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 max-w-[220px]"
                              />
                            ) : (
                              <>
                                <p className="text-sm font-bold text-slate-700">{STEP_NAME_MAP[step.step] ?? step.step}</p>
                                {/* BUG-P-R2-07-B: hide rename for archived policies */}
                                {!isCompleted && !isArchived && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRenameDraft(step.step)
                                      setRenamingStepIdx(idx)
                                    }}
                                    title={t('policies.renameStep')}
                                    className="opacity-0 group-hover/rename:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                                  >
                                    <Icon icon="lucide:pencil" className="text-[10px]" />
                                  </button>
                                )}
                              </>
                            )}
                            {step.actionType && ACTION_TYPE_META[step.actionType] && (
                              <Icon icon={ACTION_TYPE_META[step.actionType].icon} className={cn('text-xs', ACTION_TYPE_META[step.actionType].color)} />
                            )}
                            {/* BUG-P-R2-07-B: hide interactive step-state chips on archived policies */}
                            {!isArchived && step.status === 'current' && step.stepState === 'pending-approval' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">{t('policies.awaitingApproval')}</span>
                            )}
                            {!isArchived && step.status === 'current' && step.stepState === 'awaiting-response' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">{t('policies.awaitingResponse')}</span>
                            )}
                            {!isArchived && step.status === 'current' && step.stepState === 'awaiting-manager' && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full">{t('policies.awaitingManagerResponse')}</span>
                            )}
                          </div>
                          {isCompleted && step.date && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Icon icon="lucide:user" className="text-[9px]" />
                              {step.user} • {step.date}
                            </p>
                          )}
                        </div>

                        {/* Phase deadline picker (skip when completed or archived) */}
                        {!isCompleted && !isArchived && (
                          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                            <InlineDeadlinePicker
                              value={step.deadline}
                              parentDeadline={fresh.nextReviewDate}
                              onChange={(next) => {
                                const result = usePolicyStore.getState().setPhaseDeadline(
                                  fresh.id,
                                  idx,
                                  next,
                                  actingUser,
                                )
                                if (!result.ok) {
                                  showToast(t('policies.deadlineRejected'))
                                  return false
                                }
                                return true
                              }}
                            />
                          </div>
                        )}
                        {isCompleted && step.deadline && (
                          <span className="text-[10px] text-slate-400 shrink-0">due {step.deadline}</span>
                        )}

                        {/* Status badge. W37: on an ARCHIVED policy, non-completed
                            steps show NO status label (no "PENDING"/"CURRENT") —
                            the whole workflow is just shown grayed/as-is; only
                            genuinely completed steps keep their "COMPLETED" tag. */}
                        {(!isArchived || isCompleted) && (
                          <span className={cn('text-[10px] font-bold uppercase shrink-0',
                            isCompleted ? 'text-emerald-600' :
                            (step.status === 'current') ? 'text-amber-600' : 'text-slate-300'
                          )}>
                            {formatPolicyWorkflowStepStatus(t, step.status)}
                          </span>
                        )}

                        <Icon
                          icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                          className="text-slate-400 text-sm shrink-0"
                        />
                      </div>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="px-5 pb-3 space-y-1 border-t border-slate-100 pt-2">
                          {step.description && <p className="text-xs text-slate-500">{step.description}</p>}
                          {(!isCompleted || !step.date) && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Icon icon="lucide:user" className="text-[9px]" />
                              {step.user || '—'}
                            </p>
                          )}
                          {step.note && (
                            <div className="mt-1.5 p-2 bg-slate-50 rounded-lg border border-slate-100">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('common.note')}</p>
                              <p className="text-[10px] text-slate-600">{step.note}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Drag-to-bin trash zone */}
                {dragIdx !== null && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOverBin(true) }}
                    onDragLeave={() => setDragOverBin(false)}
                    onDrop={() => {
                      if (dragIdx !== null) {
                        void usePolicyStore.getState().deleteWorkflowStep(fresh.id, dragIdx)
                        handleDragEnd()
                      }
                    }}
                    className={cn(
                      'mt-2 rounded-xl border-2 border-dashed p-3 flex items-center justify-center gap-2 transition-all cursor-pointer',
                      dragOverBin ? 'border-rose-400 bg-rose-50 text-rose-500' : 'border-slate-200 bg-white/50 text-slate-300'
                    )}
                  >
                    <Icon icon="lucide:trash-2" className="text-base" />
                    <span className="text-xs font-bold">{t('policies.dragToDelete')}</span>
                  </div>
                )}
              </div>

              {/* Note prompt overlay */}
              {notePromptFor !== null && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-xl flex items-center justify-center z-10 p-4">
                  <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-lg p-5 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{t('policies.moveNoteTitle')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t('policies.moveNoteSubtitle')}</p>
                    </div>
                    <textarea
                      className="flex w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                      placeholder={t('policies.stepNotePlaceholder')}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" className="text-xs h-8" onClick={closePrompt}>{t('common.cancel')}</Button>
                      <Button variant="ghost" className="text-xs h-8 text-slate-500" onClick={() => { setNoteText(''); handleConfirmAction() }}>
                        {t('policies.skipAndContinue')}
                      </Button>
                      <Button variant="primary" className="text-xs h-8 shadow-sm shadow-emerald-100" onClick={handleConfirmAction}>
                        {t('common.confirm')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Policy Actions — hidden entirely for archived policies (P1 W30) */}
            {isArchived ? (
              <section className="pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <Icon icon="lucide:archive" className="text-slate-400 text-sm" />
                  <span className="text-xs text-slate-500">{t('policies.archivePolicy')}</span>
                </div>
              </section>
            ) : (
            <section className={cn('pt-4 border-t border-slate-100 space-y-2', dragIdx !== null && 'opacity-30 pointer-events-none')}>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                {t('policies.policyActions')}
              </h3>
              {/* W37: unified action area for draft + under-review. A draft policy
                  shows the CURRENT step's action (so the button matches the step
                  icon); clicking it both STARTS the review (server moves it to
                  under-review) and performs the action — no separate "Submit for
                  Review" gate. */}
              {(fresh.status === 'draft' || fresh.status === 'under-review') && (() => {
                const currentStep = fresh.workflowTimeline.find(s => s.status === 'current')
                if (!currentStep) return null

                if (currentStep.stepState === 'pending-approval') {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <Icon icon="lucide:clock" className="text-amber-500 text-sm" />
                        <span className="text-xs font-bold text-amber-700">{t('policies.awaitingApproval')}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          className="flex-1 text-xs h-9"
                          onClick={() => setNotePromptFor('approve-step')}
                          disabled={!canApprovePolicy || workflowProcessing}
                          title={canApprovePolicy ? '' : t('rbac.deniedTooltip')}
                        >
                          {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="lucide:check-circle" className="w-3.5 h-3.5" />}
                          {t('policies.approveStep')}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 text-xs h-9 text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => setNotePromptFor('deny-step')}
                          disabled={!canApprovePolicy || workflowProcessing}
                          title={canApprovePolicy ? '' : t('rbac.deniedTooltip')}
                        >
                          {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="lucide:x-circle" className="w-3.5 h-3.5" />}
                          {t('policies.denyStep')}
                        </Button>
                      </div>
                    </div>
                  )
                }

                if (currentStep.stepState === 'awaiting-response') {
                  return (
                    <Button variant="outline" className="w-full" onClick={() => setNotePromptFor('log-response')} disabled={workflowProcessing}>
                      {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:mail-check" className="w-4 h-4" />}
                      {t('policies.receivedResponse')}
                    </Button>
                  )
                }

                if (currentStep.stepState === 'awaiting-manager') {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg">
                        <Icon icon="lucide:user-check" className="text-violet-500 text-sm" />
                        <span className="text-xs font-bold text-violet-700">{t('policies.awaitingManagerResponse')}</span>
                      </div>
                      <Button variant="primary" className="w-full text-xs h-9"
                        onClick={() => setNotePromptFor('manager-approved')} disabled={workflowProcessing}>
                        {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="lucide:check-circle" className="w-3.5 h-3.5" />}
                        {t('policies.managerApprovedProceed')}
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 text-xs h-9"
                          onClick={() => handleManagerReceived()} disabled={workflowProcessing}>
                          {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="lucide:mail-check" className="w-3.5 h-3.5" />}
                          {t('policies.managerReceived')}
                        </Button>
                        <Button variant="outline" className="flex-1 text-xs h-9 text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => setNotePromptFor('manager-rejected')} disabled={workflowProcessing}>
                          {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon icon="lucide:x-circle" className="w-3.5 h-3.5" />}
                          {t('policies.managerRejected')}
                        </Button>
                      </div>
                    </div>
                  )
                }

                // No step_state yet → show the step's ACTION button (matches the
                // step's header icon). Clicking it on a DRAFT policy starts the
                // review server-side. W37: action set collapsed per product call —
                // send-for-review / approve / vote_approve all fold into one
                // "Submit for Approval"; review_complete / publish fold into
                // "Complete Step". Each maps to a logged server transition.
                const actionType = currentStep.actionType ?? 'move-to-next'

                if (actionType === 'send-email') {
                  return (
                    <Button variant="outline" className="w-full" onClick={() => handleSendEmail(currentStep)} disabled={workflowProcessing}>
                      {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:mail" className="w-4 h-4" />}
                      {t('policies.actionSendEmail')}
                    </Button>
                  )
                }
                if (actionType === 'notify-manager') {
                  return (
                    <Button variant="outline" className="w-full" onClick={() => setNotePromptFor('notify-manager-prompt')} disabled={workflowProcessing}>
                      {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:user-check" className="w-4 h-4" />}
                      {t('policies.actionNotifyManager')}
                    </Button>
                  )
                }
                // Approval gate (collapsed): request-approval / send-for-review /
                // approve / vote_approve → one "Submit for Approval".
                if (['approve', 'vote_approve', 'request-approval', 'send-for-review'].includes(actionType)) {
                  return (
                    <Button variant="outline" className="w-full" onClick={() => handleRequestApproval()} disabled={workflowProcessing}>
                      {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:check-square" className="w-4 h-4" />}
                      {t('policies.submitForApproval')}
                    </Button>
                  )
                }
                // Completion (collapsed): review_complete / publish → "Complete
                // Step"; plain move-to-next keeps its label. Both advance.
                const isComplete = actionType === 'review_complete' || actionType === 'publish'
                return (
                  <Button variant="outline" className="w-full" onClick={() => setNotePromptFor('advance')} disabled={workflowProcessing}>
                    {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon={isComplete ? 'lucide:check-circle-2' : 'lucide:arrow-right'} className="w-4 h-4" />}
                    {isComplete ? t('policies.actionCompleteStep') : t('policies.actionMoveToNext')}
                  </Button>
                )
              })()}

              {/* P3 (W34): render a SINGLE "Initiate Review" button. Previously
                  two separate buttons (emerald "all steps completed" + amber
                  "overdue/requires-review") could both render at once for a
                  completed-but-due policy, because checkAndUpdateStatuses flips
                  approved → requires-review after mount without clearing the
                  completed timeline (that post-paint flip was the "orange appears
                  after a delay" symptom). Collapse to one — amber when due,
                  emerald otherwise. Both paths route to the same handler. */}
              {(() => {
                const allStepsCompleted = fresh.workflowTimeline.length > 0 && fresh.workflowTimeline.every(s => s.status === 'completed')
                const needsReview = fresh.status === 'expired' || fresh.status === 'overdue' || fresh.status === 'requires-review'
                if (!allStepsCompleted && !needsReview) return null
                return (
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full',
                      needsReview
                        ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                        : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50',
                    )}
                    onClick={() => setNotePromptFor('initiate')}
                    disabled={workflowProcessing}
                  >
                    {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:refresh-cw" className="w-4 h-4" />}
                    {t('policies.initiateReview')}
                  </Button>
                )
              })()}

              {/* P1-e (W29): Undo always available when at least one step completed. */}
              {fresh.workflowTimeline.some(s => s.status === 'completed') && (
                <Button variant="outline" className="w-full text-rose-600 border-rose-200 hover:bg-rose-50"
                  onClick={() => setNotePromptFor('undo')} disabled={workflowProcessing}>
                  {workflowProcessing ? <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" /> : <Icon icon="lucide:undo-2" className="w-4 h-4" />}
                  {t('policies.undoLastStep')}
                </Button>
              )}
            </section>
            )}

            {/* Evidence section */}
            <section className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('policies.evidenceSection')}
                </h3>
                <div className="flex items-center gap-2">
                  {/* P7 (W34): show the cycle filter whenever there is evidence to
                      filter or a current review cycle exists — not only when a
                      review cycle was initiated (which previously gated the
                      dropdown to old/broken policies with a duplicate review stage). */}
                  {(evidenceCycles.size > 0 || (fresh.evidence?.length ?? 0) > 0 || !!fresh.currentReviewCycleId) && (
                    <div className="flex items-center gap-1">
                      <Icon icon="lucide:filter" className="text-slate-400 text-xs shrink-0" />
                      <div className="min-w-[140px]">
                        <EditableSelect
                          locked
                          value={evidenceFilter}
                          onChange={(id) => setEvidenceFilter(id)}
                          items={[
                            { id: 'current', label: ((): string => {
                              // Disambiguate same-month cycles: the current cycle is
                              // tagged "(current)" so it never reads identically to an
                              // archived cycle that fell in the same month.
                              const sentinel = t('policies.currentReview')
                              const base = (fresh.currentReviewCycleId ? evidenceCycles.get(fresh.currentReviewCycleId) : undefined) ?? sentinel
                              return base === sentinel ? base : `${base} (${t('policies.currentCycleTag')})`
                            })() },
                            ...Array.from(evidenceCycles.entries())
                              .filter(([id]) => id !== fresh.currentReviewCycleId)
                              .map(([id, label]) => ({ id, label })),
                          ]}
                          size="sm"
                          isRTL={isRTL}
                        />
                      </div>
                    </div>
                  )}
                  {/* Add Evidence — hidden for archived policies */}
                  {!isArchived && (
                    <button
                      onClick={() => evidenceFileRef.current?.click()}
                      disabled={isUploadingEvidence}
                      aria-busy={isUploadingEvidence || undefined}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-60"
                    >
                      <Icon icon={isUploadingEvidence ? 'lucide:loader-2' : 'lucide:plus'} className={`text-sm${isUploadingEvidence ? ' animate-spin' : ''}`} />
                      {isUploadingEvidence ? t('common.saving') : t('policies.addEvidence')}
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={evidenceFileRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                onChange={(e) => { if (e.target.files?.length) { handleEvidenceAdd(e.target.files); e.target.value = '' } }}
              />
              {displayedEvidence.length === 0 ? (
                <p className="text-xs text-slate-400 italic">{t('policies.noEvidence')}</p>
              ) : (
                <div className="space-y-2">
                  {displayedEvidence.map(ev => (
                    <div key={ev.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <Icon icon="lucide:file-text" className="text-slate-400 text-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{ev.name}</p>
                        <p className="text-[10px] text-slate-400">{ev.uploadedBy} • {ev.uploadedAt.split('T')[0]}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleEvidenceDownload(ev)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                          title="Download"
                        >
                          <Icon icon="lucide:download" className="text-sm" />
                        </button>
                        <button
                          onClick={() => handleEvidenceRemove(ev.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-400 transition-colors"
                          title="Remove"
                        >
                          <Icon icon="lucide:trash-2" className="text-sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Activity tab ──────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                {t('policies.activityTimeline')}
              </h3>
              {/* P5 (W29): sorted newest-first, sliced to timelineVisible, Load More button. */}
              {(() => {
                const allEntries = [...(fresh.activityLog ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                const visibleEntries = allEntries.slice(0, timelineVisible)
                const actPagination = policyActivityPagination[fresh.id]
                const hasMore = timelineVisible < allEntries.length || actPagination?.hasMore
                const isLoadingMore = actPagination?.loadingMore ?? false
                return (
                  <>
                    <div className={`space-y-3 relative before:absolute before:start-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100`}>
                      {visibleEntries.map((entry) => (
                        <div key={entry.id} className="relative ps-8">
                          {/* P11 (W30): color-code activity dot by action type */}
                          <div className={cn(
                            'absolute start-0 top-1 w-4 h-4 rounded-full border-2',
                            entry.type === 'workflow_approved' || entry.type === 'approval_step_committed' || entry.type === 'manager_approved'
                              ? 'bg-emerald-100 border-emerald-500' :
                            entry.type === 'document_removed' || entry.type === 'evidence_removed' || entry.type === 'step_reverted' || entry.type === 'workflow_undone' || entry.type === 'step_denied' || entry.type === 'manager_rejected'
                              ? 'bg-rose-100 border-rose-400' :
                            entry.type === 'submitted_for_review' || entry.type === 'step_advanced' || entry.type === 'review_initiated' || entry.type === 'manager_acknowledged'
                              ? 'bg-blue-100 border-blue-400' :
                            entry.type === 'edited' || entry.type === 'leader_changed' || entry.type === 'leader_assigned'
                              ? 'bg-amber-100 border-amber-400' :
                            entry.type === 'created'
                              ? 'bg-violet-100 border-violet-400' :
                            'bg-slate-100 border-slate-400'
                          )} />
                          {/* Fix C — show only current language text */}
                          <p className="text-xs font-bold text-slate-900">
                            {isRTL ? entry.textAr : entry.textEn}
                          </p>
                          <p className="text-[10px] text-slate-400">{entry.date}{entry.user && ` • ${entry.user}`}</p>
                          {entry.note && (
                            <div className="mt-1 p-2 bg-slate-50 rounded-lg border border-slate-100 inline-block max-w-xs">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{t('common.note')}</p>
                              <p className="text-[10px] text-slate-600">{entry.note}</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {allEntries.length === 0 && (
                        activityPrefetch ? (
                          // Skeleton while the detail GET is in flight — the
                          // activity log is detail-only, so without this the
                          // tab shows "no activity yet" then pops in.
                          <div className="space-y-3" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="relative ps-8">
                                <Skeleton className="absolute start-0 top-1 w-4 h-4 rounded-full" />
                                <Skeleton className="h-3.5 w-2/3 mb-1.5" />
                                <Skeleton className="h-2.5 w-32" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">{t('policies.noActivityYet')}</p>
                        )
                      )}
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => {
                          setTimelineVisible((v) => v + TIMELINE_PAGE_SIZE)
                          void loadMorePolicyActivity(fresh.id)
                        }}
                        disabled={isLoadingMore}
                        className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                      >
                        <Icon icon={isLoadingMore ? 'lucide:loader-2' : 'lucide:chevron-down'} className={`text-sm${isLoadingMore ? ' animate-spin' : ''}`} />
                        {isLoadingMore ? t('common.loading') : t('common.loadMore')}
                      </button>
                    )}
                  </>
                )
              })()}
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-2">
                {t('policies.versionHistory')}
              </h3>
              <div className="space-y-2">
                {versionsPrefetch && (
                  <div className="space-y-2" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                )}
                {fresh.versionHistory.map((entry, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() => setExpandedVersion(expandedVersion === idx ? null : idx)}
                      className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-start"
                    >
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-bold font-mono shrink-0">
                        {entry.version}
                      </span>
                      <div className="flex-1 min-w-0">
                        {/* Wave-19.4 / Item-3 — dual-store: pick `textEn` vs
                            `textAr` based on the current locale (migration 057
                            retired the single-language `changes` column). */}
                        <p className="text-xs font-bold text-slate-700">{isRTL ? entry.textAr : entry.textEn}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{entry.date} • {entry.author}</p>
                      </div>
                      <Icon
                        icon={expandedVersion === idx ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                        className="text-slate-400 text-sm shrink-0 mt-0.5"
                      />
                    </button>
                    {expandedVersion === idx && (
                      <div className="bg-amber-50 rounded-xl p-3 mt-1">
                        {/* W32-4: restore the W19.4 Field / From / To diff (the
                            panel had regressed to a version/date/by metadata
                            table that didn't say what actually changed). Falls
                            back to the summary for legacy/no-diff rows. */}
                        {entry.fieldChanges && entry.fieldChanges.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                              <span>{t('regulatoryUpdates.fieldChanged')}</span>
                              <span>{t('regulatoryUpdates.changedFrom')}</span>
                              <span>{t('regulatoryUpdates.changedTo')}</span>
                            </div>
                            {entry.fieldChanges.filter((diff) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(diff.to ?? '') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(diff.from ?? '')).map((diff, i) => (
                              <div key={`${diff.field}-${i}`} className="grid grid-cols-3 gap-1 text-[10px]">
                                <span className="font-bold text-slate-600">{renderFieldLabel(diff.field, t)}</span>
                                <span className="text-rose-600 line-through truncate" title={diff.from}>{diff.from || '—'}</span>
                                <span className="text-emerald-600 truncate" title={diff.to}>{diff.to || '—'}</span>
                              </div>
                            ))}
                            <p className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-amber-100">{entry.date} • {entry.author}</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-500">{isRTL ? entry.textAr : entry.textEn}</p>
                            <p className="text-[10px] text-slate-400 mt-2">{entry.date} • {entry.author}</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── Right panel ───────────────────────────────────────────────── */}
      <div className={`w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-6`}>
        {/* Policy Leader (person responsible for follow-up) — Wave-19.3 */}
        <PolicyLeaderSection policy={fresh} t={t} readOnly={isArchived} />


        {/* Policy Owner (Business Owner — department responsible for compliance) */}
        <PolicyBusinessOwnerSection policy={fresh} t={t} readOnly={isArchived} />


        {/* Approval tier */}
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">{t('policies.approvalTier')}</h3>
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', tierStyle.bg, tierStyle.text)}>
            {tierLabel}
          </span>
        </div>

        {/* Framework tags — mirrors the circular detail's Frameworks panel. */}
        {(fresh.frameworkIds ?? []).length > 0 && (
          <div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">{t('regulatoryUpdates.frameworks')}</h3>
            <FrameworkChips ids={fresh.frameworkIds} isRTL={isRTL} max={0} />
          </div>
        )}

        {/* Review schedule */}
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">{t('policies.reviewSchedule')}</h3>
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.lastReview')}</p>
              {/* BUG-P-R3-07: use raw date string for consistency with Next Review */}
              <p className="text-sm font-bold text-slate-700">
                {fresh.lastReviewDate || '—'}
              </p>
            </div>
            {/* BUG-P-R3-09A: hide Next Review for archived policies */}
            {!fresh.archivedAt && (
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.nextReview')}</p>
              <p className={cn('text-sm font-bold', fresh.status === 'overdue' ? 'text-rose-600' : 'text-slate-700')}>
                {fresh.nextReviewDate || '—'}
              </p>
            </div>
            )}
            {fresh.approvedDate && (
              <div className="p-3 bg-white rounded-xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{t('policies.approvedDate')}</p>
                <p className="text-sm font-bold text-emerald-600">{fresh.approvedDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t border-slate-200">
          {/* P1 (W30): hide Edit Policy button for archived policies */}
          {!isArchived && (
            <Button
              variant="primary"
              className="w-full"
              onClick={onEditOpen}
              disabled={!canApprovePolicy}
              title={canApprovePolicy ? '' : t('rbac.deniedTooltip')}
            >
              <Icon icon="lucide:edit" className="w-4 h-4" />
              {t('policies.editPolicy')}
            </Button>
          )}
          {/* P6 (W29): use archivedAt (not status) to determine archive/unarchive state. */}
          {!fresh.archivedAt && (
            <Button variant="outline" className="w-full border-amber-200 text-amber-700 hover:bg-amber-50" onClick={onArchive}>
              <Icon icon="lucide:archive" className="w-4 h-4" />
              {t('policies.archivePolicy')}
            </Button>
          )}
          {fresh.archivedAt && (
            <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={onUnarchive}>
              <Icon icon="lucide:archive-restore" className="w-4 h-4" />
              {t('policies.unarchivePolicy')}
            </Button>
          )}
          <Button variant="outline" className="w-full border-rose-200 text-rose-600 hover:bg-rose-50" onClick={onDeleteOpen}>
            <Icon icon="lucide:trash-2" className="w-4 h-4" />
            {t('policies.deletePolicy')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PolicyBusinessOwnerSection({ policy, t, readOnly = false }: { policy: Policy; t: (key: any, params?: Record<string, string>) => string; readOnly?: boolean }) {
  const { departments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const { update } = usePolicyStore()
  const dept = departments.find((d) => d.id === policy.businessOwnerDepartmentId)
  return (
    <div>
      <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">
        {t('policies.policyOwner')}{' '}
        <span className="text-slate-300 font-normal normal-case text-[10px]">— {t('policies.businessOwnerHint')}</span>
      </h3>
      {/* P1 cosmetic (W31): archived → plain text, not a clickable dropdown button. */}
      {readOnly ? (
        <p className="text-sm font-bold text-slate-700">{dept?.name ?? '—'}</p>
      ) : (
      <EditableSelect
        value={policy.businessOwnerDepartmentId ?? null}
        onChange={(id) => update(policy.id, { businessOwnerDepartmentId: id || undefined })}
        items={departments.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
        placeholder={t('policies.selectBusinessOwner')}
        onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
        onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
        onDelete={(id) => removeDepartment(id)}
      />
      )}
      {dept && (
        <p className="text-[10px] text-slate-400 mt-2">
          {t('policies.businessOwnerExplain')}
        </p>
      )}
    </div>
  )
}

/**
 * Wave-19.3 / Task-B — Policy Leader picker.
 *
 * Replaces the static avatar+name block. Clicking the row opens an
 * `EditableSelect` (labels-only, no CRUD affordances) populated from the
 * team-store members. Selecting a person fires `updateLeader(...)` which
 * applies an optimistic owner update, PATCHes `/api/policies/{uuid}` with
 * `owner_id` + `owner_name` + `owner_department`, and refreshes the detail
 * GET so the server-emitted `leader_changed` / `leader_assigned` activity
 * row lands on the Activity tab. 412 conflicts surface the keyed revert
 * toast via the shared `revertMessage` helper in the store.
 */
function PolicyLeaderSection({
  policy,
  t,
  readOnly = false,
}: {
  policy: Policy
  t: (key: any, params?: Record<string, string>) => string
  readOnly?: boolean
}) {
  const members = useTeamStore((s) => s.members)
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  const updateLeader = usePolicyStore((s) => s.updateLeader)

  // Hydrate team members so the picker has options.
  useEffect(() => {
    void fetchTeam()
  }, [fetchTeam])

  // The store carries `ownerId` (canonical FK); fall back to a name-match for
  // legacy rows where only `owner_name` is set.
  const selectedId =
    policy.ownerId ??
    members.find((m) => m.name === policy.owner?.name)?.id ??
    null

  return (
    <div>
      <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">
        {t('policies.policyLeader')}
      </h3>
      <div className="flex items-center gap-3 mb-2">
        <img
          src={dicebearAvatar(policy.owner?.avatar || policy.owner?.name || '')}
          className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
          alt={policy.owner?.name ?? ''}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">
            {policy.owner?.name || '—'}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {policy.owner?.department || ''}
          </p>
        </div>
      </div>
      {/* P1 cosmetic (W31): archived → the name above is the read-only display;
          drop the clickable picker so there's no misleading edit affordance. */}
      {!readOnly && (
        <EditableSelect
          value={selectedId}
          onChange={(id) => {
            const m = members.find((mm) => mm.id === id)
            if (!m) return
            updateLeader(policy.id, m.id, m.name, m.department ?? null)
          }}
          items={members.map((m) => ({ id: m.id, label: m.name }))}
          placeholder={t('policies.policyLeader')}
          mode="labels-only"
        />
      )}
    </div>
  )
}
