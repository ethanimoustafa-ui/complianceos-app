'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { NoDataEmptyState, NoResultsEmptyState } from '@/components/ui/empty-state'
import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'
import { formatTimelineDate, formatLocalizedDate } from '@/lib/format-date'
import { paginate } from '@/lib/pagination'
import { TablePagination } from '@/components/ui/table-pagination'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { Gate, EntityGate } from '@/components/auth/gate'
import { useCanCreateEntity } from '@/lib/permissions'
import { useLetterStore } from '@/stores/letter-store'
import { useAuthStore } from '@/stores/auth-store'
import type { Letter, LetterType, LetterStatus, LetterTemplate, TemplateStatus, CircularAuthority } from '@/types'
import { useLetterTemplateStore } from '@/stores/letter-template-store'
import { formatBytes as fmtBytes } from '@/lib/format'
import { dicebearAvatar } from '@/lib/avatar'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { resolveAuthorityCode } from '@/lib/authority-display'
import {
  getAuthorityFullName,
  getAuthorityColors,
  getAuthorityDepartments,
  getDepartmentLabel,
  getDepartmentEmail,
  getDefaultDepartmentId,
} from '@/lib/letter-authority'
import { useLetterTypeStore } from '@/stores/letter-type-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { PlaceholderDefEditor } from '@/components/correspondence/letter-placeholders/PlaceholderDefEditor'
import { InlineChipEditor } from '@/components/correspondence/letter-placeholders/InlineChipEditor'
import {
  placeholderValuesComplete,
  autoPromoteTypedTokens,
  renderTemplate,
} from '@/lib/letter-placeholders'
import { downloadPdf, PdfError } from '@/lib/pdf-client'
import { formatDualDates } from '@/lib/pdf/latex/hijri'
import type { PlaceholderDef, PlaceholderValue } from '@/types'
import {
  Toast,
  LetterSortHeader,
  translateTimelineTitle,
  StatCard,
  TemplateCard,
  CreateLetterForm,
  ApprovalStepActions,
  ApprovalChainConfigModal,
  TemplateEditForm,
  getEmailSubjectFor,
  buildLetterEmailBody,
  getRecipientDefaults,
  templateTypeCards,
} from '@/components/correspondence/letters'
import type { LetterSortCol, LetterSortState } from '@/components/correspondence/letters'

export default function LettersPage() {
  const { t, isRTL } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const store = useLetterStore()
  const templateStore = useLetterTemplateStore()
  const letterTypeStore = useLetterTypeStore()
  const { user } = useAuthStore()
  const currentUser = user?.name || 'Current User'
  const teamMembers = useTeamStore(s => s.members)
  const storeFrameworks = useFrameworkConfigStore(s => s.frameworks)
  // Defensive read pattern (mirrors circular/policy parity): the live byId
  // map wins, falling back to the array index, then to the store's
  // `selectedLetter` slot. This avoids the "Not Found" flash on freshly
  // created rows that audits previously exhibited.
  const storeSelected = store.selectedLetter
  const selectedLetter = storeSelected
    ? (store.byId[storeSelected.id] ?? store.letters.find((l) => l.id === storeSelected.id) ?? storeSelected)
    : null
  // Detail-loaded boundary: list rows ship minimal data; the full record
  // (approval chain, attachments, timeline) only arrives after fetchById
  // completes. The old heuristic treated any non-draft letter as "loaded",
  // so those sections popped in with no skeleton for most letters. Gate each
  // section on the store's REAL per-letter detail-GET flag AND that section
  // still being empty — re-opens of an already-hydrated letter render
  // instantly instead of flashing skeletons over known content.
  const letterDetailFetching = useLetterStore((s) =>
    storeSelected ? (s.detailLoading[storeSelected.id] ?? false) : false,
  )
  const approvalChainPrefetch =
    !!selectedLetter && letterDetailFetching && (selectedLetter.approvalChain?.length ?? 0) === 0
  const attachmentsPrefetch =
    !!selectedLetter && letterDetailFetching && (selectedLetter.attachments?.length ?? 0) === 0
  const timelinePrefetch =
    !!selectedLetter && letterDetailFetching && (selectedLetter.timeline?.length ?? 0) === 0
  const isMutating = useLetterStore((s) => s.isMutating)
  const [confirmDeleteLetterId, setConfirmDeleteLetterId] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  // W41: approval-chain configure modal (per-letter or per-authority scope).
  const [chainConfigOpen, setChainConfigOpen] = useState(false)
  // L4: spinner state for the Print/Download PDF button (slow job-queue pipeline).
  const [pdfBusy, setPdfBusy] = useState(false)
  const [sendBusy, setSendBusy] = useState(false)
  const [responseBusy, setResponseBusy] = useState(false)
  // W29-L2: "Mark Response Received" — reveals optional note modal before firing.
  const [responseNoteModalLetterId, setResponseNoteModalLetterId] = useState<string | null>(null)
  const [responseNoteText, setResponseNoteText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  // L3: "saved at HH:mm" indicator for the letter body editor.
  const [bodySavedAt, setBodySavedAt] = useState<Date | null>(null)
  const letterContentRef = useRef<HTMLDivElement>(null)

  // Hydrate server-state on mount (Fix-1). Without this, reload wipes the
  // letter list, templates, and lookup tables.
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const fetchTemplates = useLetterTemplateStore((s) => s.fetchAll)
  const fetchLetterTypes = useLetterTypeStore((s) => s.fetchAll)
  const fetchTeam = useTeamStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchLetters()
    void fetchTemplates()
    void fetchLetterTypes()
    void fetchTeam()
  }, [fetchLetters, fetchTemplates, fetchLetterTypes, fetchTeam])

  // Wave-2 Agent E: first-fetch skeleton. Once `lastFetched` is non-null we
  // never show the skeleton again — refetches keep the list visible.
  const lettersLoading = useLetterStore((s) => s.isLoading)
  const lettersLastFetched = useLetterStore((s) => s.lastFetched)
  const showLettersSkeleton =
    lettersLoading && store.letters.length === 0 && lettersLastFetched === null
  // W29-L7: deepLinkId is read early; isAwaitingDeepLink is derived below after
  // `view` state is declared (avoids "used before assignment" TS error).
  const deepLinkId = searchParams.get('id')

  // Helper to get translated template name and description based on template ID
  const getTranslatedTemplateName = useCallback((templateId: string, originalName: string) => {
    const nameMap: Record<string, string> = {
      'tmpl-001': t('letters.templateKeyFunctionAppointment'),
      'tmpl-002': t('letters.templateProductLaunchRequest'),
      'tmpl-003': t('letters.templateCircularClarification'),
      'tmpl-004': t('letters.templateRegulatoryInterpretation'),
      'tmpl-005': t('letters.templateQuarterlyAmlReport'),
      'tmpl-006': t('letters.templateAnnualComplianceReport'),
      'tmpl-007': t('letters.templateIncidentNotification'),
      'tmpl-008': t('letters.templateSystemOutageReport'),
    }
    return nameMap[templateId] || originalName
  }, [t])

  const getTranslatedTemplateDescription = useCallback((templateId: string, originalDescription: string) => {
    const descMap: Record<string, string> = {
      'tmpl-001': t('letters.templateKeyFunctionDesc'),
      'tmpl-002': t('letters.templateProductLaunchDesc'),
      'tmpl-003': t('letters.templateCircularClarificationDesc'),
      'tmpl-004': t('letters.templateRegulatoryInterpretationDesc'),
      'tmpl-005': t('letters.templateQuarterlyAmlDesc'),
      'tmpl-006': t('letters.templateAnnualComplianceDesc'),
      'tmpl-007': t('letters.templateIncidentNotificationDesc'),
      'tmpl-008': t('letters.templateSystemOutageDesc'),
    }
    return descMap[templateId] || originalDescription
  }, [t])

  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard')
  // W29-L7: suppress list flash on hard-refresh with ?id= param.
  // Derived AFTER `view` is declared.
  const isAwaitingDeepLink = !!(deepLinkId && view !== 'detail')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedLetterType, setSelectedLetterType] = useState<LetterType>('non-objection')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [language, setLanguage] = useState<'en' | 'ar'>(isRTL ? 'ar' : 'en')
  const [pendingSend, setPendingSend] = useState(false)

  // Template Management State
  const [isTemplateManagementOpen, setIsTemplateManagementOpen] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateTypeFilter, setTemplateTypeFilter] = useState<LetterType | 'All'>('All')
  const [templateStatusFilter, setTemplateStatusFilter] = useState<TemplateStatus | 'All'>('All')

  // Template Actions State (templates sourced from persistent store)
  const [createFromTemplate, setCreateFromTemplate] = useState<LetterTemplate | null>(null)
  // Gate the empty-state quick-add CTA the same as every other create path
  // (letter:create) — keep the "no letters yet" message, drop the Add button.
  const canCreateLetter = useCanCreateEntity('letter')
  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate | null>(null)
  const [isViewTemplateModalOpen, setIsViewTemplateModalOpen] = useState(false)
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  // L8/M1: loading spinners for async template actions
  const [isCopyingTemplateId, setIsCopyingTemplateId] = useState<string | null>(null)
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const { totalYTD, sentThisQ, pendingDrafts, overdueReplies } = useMemo(() => {
    const year = new Date().getFullYear()
    const quarter = Math.floor(new Date().getMonth() / 3)
    return {
      totalYTD: store.letters.filter(l => new Date(l.createdAt).getFullYear() === year).length,
      sentThisQ: store.letters.filter(l => {
        if (l.status !== 'sent' && l.status !== 'response-received') return false
        const d = l.sentDate ? new Date(l.sentDate) : new Date(l.updatedAt)
        return d.getFullYear() === year && Math.floor(d.getMonth() / 3) === quarter
      }).length,
      pendingDrafts: store.letters.filter(l => l.status === 'draft').length,
      overdueReplies: store.letters.filter(l => l.status === 'overdue').length,
    }
  }, [store.letters])

  // Sort state
  const [sort, setSort] = useState<LetterSortState>(null)
  const handleLetterSort = (col: LetterSortCol) =>
    setSort(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })

  // Search + filter state (table)
  const [letterSearch, setLetterSearch] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState<Set<CircularAuthority>>(new Set())
  const [dateFilter, setDateFilter] = useState<'any' | '30d' | '90d' | '365d'>('any')
  const [showFilterPopover, setShowFilterPopover] = useState(false)
  const filterPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showFilterPopover) return
    const handler = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setShowFilterPopover(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterPopover])

  const toggleAuthorityFilter = (a: CircularAuthority) => {
    setAuthorityFilter(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a); else next.add(a)
      return next
    })
  }

  const resetFilters = () => {
    setAuthorityFilter(new Set())
    setDateFilter('any')
    setLetterSearch('')
  }

  // Filtered + sorted letters
  const filteredLetters = useMemo(() => {
    const q = letterSearch.trim().toLowerCase()
    const dateThreshold = (() => {
      if (dateFilter === 'any') return 0
      const days = dateFilter === '30d' ? 30 : dateFilter === '90d' ? 90 : 365
      return Date.now() - days * 24 * 60 * 60 * 1000
    })()
    return store.letters.filter((l) => {
      if (authorityFilter.size > 0 && !authorityFilter.has(l.authority)) return false
      if (dateThreshold > 0 && new Date(l.updatedAt).getTime() < dateThreshold) return false
      if (q) {
        const fullEn = getAuthorityFullName(l.authority, 'en').toLowerCase()
        const fullAr = getAuthorityFullName(l.authority, 'ar')
        const haystack = [
          l.subject,
          l.subjectAr ?? '',
          l.reference,
          l.authority,
          fullEn,
          fullAr,
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [store.letters, letterSearch, authorityFilter, dateFilter])

  // Sorted letters (post-filter)
  const sortedLetters = useMemo(() => {
    if (!sort) return filteredLetters
    const { col, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    const statusOrder: Record<LetterStatus, number> = {
      draft: 0, 'pending-approval': 1, approved: 2, sent: 3, 'response-received': 4, overdue: 5, rejected: 6,
    }
    return [...filteredLetters].sort((a, b) => {
      switch (col) {
        case 'authority': return mul * a.authority.localeCompare(b.authority)
        case 'reference': return mul * a.reference.localeCompare(b.reference)
        case 'type':      return mul * a.type.localeCompare(b.type)
        case 'subject':   return mul * a.subject.localeCompare(b.subject)
        case 'status':    return mul * ((statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0))
        case 'updatedAt': return mul * a.updatedAt.localeCompare(b.updatedAt)
        default: return 0
      }
    })
  }, [filteredLetters, sort])

  // Pagination — keep the Recent Correspondence table from dragging down the
  // page when there are many letters (mirrors the risks/observations tables).
  const LETTERS_PER_PAGE = 10
  const [letterPage, setLetterPage] = useState(1)
  useEffect(() => { setLetterPage(1) }, [letterSearch, dateFilter, sort, authorityFilter])
  const { items: pagedLetters, totalPages: letterTotalPages } = paginate(sortedLetters, letterPage, LETTERS_PER_PAGE)

  // Actions dropdown state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; buttonTop: number } | null>(null)

  useEffect(() => {
    if (!openMenuId) return
    const handler = () => { setOpenMenuId(null); setMenuPosition(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  // Inline edit state
  const [editSubject, setEditSubject]         = useState('')
  const [editBody, setEditBody]               = useState('')
  const [editSubjectAr, setEditSubjectAr]     = useState('')
  const [editBodyAr, setEditBodyAr]           = useState('')
  const [editAssignedTo, setEditAssignedTo]       = useState('')
  const [editDepartment, setEditDepartment]       = useState<string>('')
  const [editingMeta, setEditingMeta]             = useState<'assignedTo' | 'samaDepartment' | null>(null)
  const [editSignerName, setEditSignerName]           = useState('')
  const [editSignerTitle, setEditSignerTitle]         = useState('')
  const [editSignerNameAr, setEditSignerNameAr]       = useState('')
  const [editSignerTitleAr, setEditSignerTitleAr]     = useState('')
  const [editRecipientName, setEditRecipientName]     = useState('')
  const [editRecipientOrg, setEditRecipientOrg]       = useState('')
  const [editRecipientCity, setEditRecipientCity]     = useState('')
  const [editRecipientNameAr, setEditRecipientNameAr] = useState('')
  const [editRecipientOrgAr, setEditRecipientOrgAr]   = useState('')
  const [editRecipientCityAr, setEditRecipientCityAr] = useState('')
  // Placeholder defs + values for draft-edit mode. The InlineChipEditor reads
  // both; on field-level save we persist defs back to the Letter.
  const [editPlaceholderDefs, setEditPlaceholderDefs] = useState<PlaceholderDef[]>([])
  const [editPlaceholderValues, setEditPlaceholderValues] = useState<Record<string, PlaceholderValue | undefined>>({})
  // L2: Activity timeline "Load More" — default 10 visible, each click adds 10.
  const TIMELINE_PAGE_SIZE = 10
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE)

  useEffect(() => {
    if (selectedLetter) {
      setEditSubject(selectedLetter.subject)
      setEditBody(selectedLetter.body)
      setEditSubjectAr(selectedLetter.subjectAr || '')
      setEditBodyAr(selectedLetter.bodyAr || '')
      setEditAssignedTo(selectedLetter.assignedTo || '')
      const fallbackDept = getDefaultDepartmentId(selectedLetter.authority)
      setEditDepartment(selectedLetter.samaDepartment || fallbackDept)
      setEditSignerName(selectedLetter.signerName || selectedLetter.createdBy || '')
      setEditSignerTitle(selectedLetter.signerTitle || 'Head of Compliance')
      setEditSignerNameAr(selectedLetter.signerNameAr || 'فيليكس هندرسون')
      setEditSignerTitleAr(selectedLetter.signerTitleAr || 'رئيس إدارة الالتزام')
      // Recipient defaults derived from authority + department
      const recipientDefaults = getRecipientDefaults(selectedLetter.authority, selectedLetter.samaDepartment || fallbackDept)
      setEditRecipientName(selectedLetter.recipientName ?? recipientDefaults.en.name)
      setEditRecipientOrg(selectedLetter.recipientOrg ?? recipientDefaults.en.org)
      setEditRecipientCity(selectedLetter.recipientCity ?? recipientDefaults.en.city)
      setEditRecipientNameAr(selectedLetter.recipientNameAr ?? recipientDefaults.ar.name)
      setEditRecipientOrgAr(selectedLetter.recipientOrgAr ?? recipientDefaults.ar.org)
      setEditRecipientCityAr(selectedLetter.recipientCityAr ?? recipientDefaults.ar.city)
      // Reconcile defs against the letter's body+subject (EN+AR) so user-typed
      // {{tokens}} are auto-promoted to defs even if the letter wasn't saved
      // through CreateLetterForm. Existing defs win on key match.
      const merged = autoPromoteTypedTokens(
        `${selectedLetter.body ?? ''}\n${selectedLetter.bodyAr ?? ''}`,
        `${selectedLetter.subject ?? ''}\n${selectedLetter.subjectAr ?? ''}`,
        selectedLetter.placeholderDefs,
      )
      setEditPlaceholderDefs(merged)
      setEditPlaceholderValues(selectedLetter.placeholderValues ?? {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLetter?.id])

  // Sync language to app language whenever a letter is opened (isRTL intentionally not in deps
  // so the toggle still works within a session)
  useEffect(() => {
    if (selectedLetter) setLanguage(isRTL ? 'ar' : 'en')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLetter?.id])

  // H4: Reset timeline pagination whenever a different letter is opened.
  useEffect(() => {
    setTimelineVisible(TIMELINE_PAGE_SIZE)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLetter?.id])

  // W40: a REJECTED letter is revisable (same editing surface as draft) so the
  // author can address the rejection reason and resubmit.
  const isDraft = selectedLetter?.status === 'draft' || selectedLetter?.status === 'rejected'
  const saveField = (patch: Partial<Letter>) => {
    if (selectedLetter) store.update(selectedLetter.id, patch)
  }

  // G1 / W25.1-RESIDUAL-1: Refs that always hold the latest draft body state
  // so flush handlers (beforeunload, visibilitychange, route change) can save
  // without stale closures.
  const pendingDraftBodyRef = useRef<{
    letterId: string | null
    subject: string
    subjectAr: string
    body: string
    bodyAr: string
    defs: PlaceholderDef[]
    dirty: boolean
  }>({ letterId: null, subject: '', subjectAr: '', body: '', bodyAr: '', defs: [], dirty: false })

  // W25.1-RESIDUAL-1: debounce timer ref + in-flight serialisation flag.
  // Only ONE PATCH may be in-flight at a time; if a new idle-flush fires while
  // a PATCH is still pending we skip it (the next idle-flush will include the
  // latest content because pendingDraftBodyRef is always current).
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patchInFlightRef = useRef(false)
  // L5: track whether any body/subject editor is focused so we can suppress
  // server-reconciliation resets mid-keystroke.
  const bodyEditorFocusedRef = useRef(false)

  // W25.1-RESIDUAL-1: actual network write — called after the debounce delay
  // or immediately by flush triggers. Serialised: skipped when a PATCH is
  // already in-flight (the next debounce flush will carry the latest content).
  // On 412 (precondition_failed / stale ETag): refetch the letter to get a
  // fresh updated_at token, then retry once. On second 412: surface a conflict
  // toast so the user knows the letter was modified elsewhere.
  const dispatchPatch = useCallback((pending: {
    letterId: string
    subject: string
    subjectAr: string
    body: string
    bodyAr: string
    defs: PlaceholderDef[]
  }) => {
    if (patchInFlightRef.current) return // serialise — skip intermediate flush
    patchInFlightRef.current = true

    const payload = {
      subject: pending.subject,
      subjectAr: pending.subjectAr,
      body: pending.body,
      bodyAr: pending.bodyAr,
      placeholderDefs: pending.defs,
    }

    store.update(pending.letterId, payload)
      .then(() => {
        // L3: update "saved at HH:mm" indicator on successful write.
        setBodySavedAt(new Date())
      })
      .catch(async (err: unknown) => {
        const is412 =
          (err instanceof Error && err.message?.includes('412')) ||
          // ApiClientError has a `.status` property
          (err != null && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 412) ||
          (err != null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'precondition_failed')
        if (!is412) return // non-412 errors are already stored by the store
        // Refetch to get the fresh updated_at token, then retry once.
        try {
          await store.fetchById(pending.letterId)
          await store.update(pending.letterId, payload)
          setBodySavedAt(new Date())
        } catch {
          // Second 412 (or any error on retry) — surface conflict toast.
          showToast(t('letters.bodyConflictReload'))
        }
      })
      .finally(() => {
        patchInFlightRef.current = false
        // If content changed while we were in-flight, the next idle debounce
        // will fire and pick up the new content from pendingDraftBodyRef.
      })
  }, [store, showToast, t, setBodySavedAt])

  // Body/subject save path used by InlineChipEditor — also runs the
  // auto-promote pass so any newly-typed `{{token}}` becomes a real
  // placeholder def stored on the letter.
  //
  // W25.1-RESIDUAL-1: debounced save — timer fires ~500 ms after the last
  // keystroke (leading:false, trailing:true). Only updates the ref and local
  // state on every call; the network PATCH is deferred to the debounce flush.
  const saveDraftBody = (patch: Partial<Pick<Letter, 'subject' | 'subjectAr' | 'body' | 'bodyAr'>>) => {
    if (!selectedLetter) return
    const merged = {
      subject:   patch.subject   ?? editSubject,
      subjectAr: patch.subjectAr ?? editSubjectAr,
      body:      patch.body      ?? editBody,
      bodyAr:    patch.bodyAr    ?? editBodyAr,
    }
    const nextDefs = autoPromoteTypedTokens(
      `${merged.body}\n${merged.bodyAr}`,
      `${merged.subject}\n${merged.subjectAr}`,
      editPlaceholderDefs,
    )
    // L5: only update defs state when the defs array has actually changed so we
    // don't trigger an unnecessary InlineChipEditor rebuild on every keystroke.
    if (JSON.stringify(nextDefs) !== JSON.stringify(editPlaceholderDefs)) {
      setEditPlaceholderDefs(nextDefs)
    }
    // Update the pending ref so flush handlers always have the latest state.
    pendingDraftBodyRef.current = {
      letterId: selectedLetter.id,
      subject: merged.subject,
      subjectAr: merged.subjectAr,
      body: merged.body,
      bodyAr: merged.bodyAr,
      defs: nextDefs,
      dirty: true,
    }
    // Debounce: cancel any outstanding timer, schedule a new one.
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      const p = pendingDraftBodyRef.current
      if (!p.dirty || !p.letterId) return
      p.dirty = false
      dispatchPatch(p as { letterId: string; subject: string; subjectAr: string; body: string; bodyAr: string; defs: PlaceholderDef[] })
    }, 500)
  }

  // G1 / W25.1-RESIDUAL-1: Flush any pending body edit immediately (called by
  // all flush triggers: blur, route change, visibility, beforeunload).
  // Cancels the debounce timer and dispatches immediately.
  const flushDraftBody = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    const pending = pendingDraftBodyRef.current
    if (!pending.dirty || !pending.letterId) return
    pending.dirty = false
    dispatchPatch(pending as { letterId: string; subject: string; subjectAr: string; body: string; bodyAr: string; defs: PlaceholderDef[] })
  }, [dispatchPatch])

  // G1: Set up flush triggers — beforeunload, visibilitychange.
  useEffect(() => {
    const onBeforeUnload = () => flushDraftBody()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraftBody()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [flushDraftBody])

  // G1: Flush when navigating away from detail view (view state change).
  const prevViewRef = useRef(view)
  useEffect(() => {
    if (prevViewRef.current === 'detail' && view !== 'detail') {
      flushDraftBody()
    }
    prevViewRef.current = view
  }, [view, flushDraftBody])

  const updateDraftPlaceholderValue = (key: string, v: PlaceholderValue | undefined) => {
    if (!selectedLetter) return
    const next = { ...editPlaceholderValues, [key]: v }
    setEditPlaceholderValues(next)
    store.update(selectedLetter.id, { placeholderValues: next })
  }

  // Attachment upload
  const attachFileRef = useRef<HTMLInputElement>(null)

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !selectedLetter) return
    const letterId = selectedLetter.id
    // Sequentially upload each file. We could parallelise but uploads are
    // typically small and serial keeps the UX (and any failure recovery)
    // predictable. The store's uploadAttachment:
    //   1) PUTs to Supabase Storage bucket `sama_letter_attachments`
    //   2) POSTs metadata to /api/letters/[id]/attachments
    //   3) Updates the store with the canonical row from the API response
    // Refetch the letter at the end so the timeline reflects any server-side
    // recomputation. (Fix-3 wave.)
    setAttachBusy(true)
    try {
      for (const f of Array.from(files)) {
        await store.uploadAttachment(letterId, f)
      }
      showToast('Attachment uploaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload attachment'
      console.error('[letters] attachment upload failed:', err)
      showToast(message)
    } finally {
      setAttachBusy(false)
      e.target.value = ''
    }
  }

  // Filter templates based on search and filters
  const filteredTemplates = templateStore.templates.filter((template) => {
    const matchesSearch =
      templateSearch === '' ||
      template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      template.description.toLowerCase().includes(templateSearch.toLowerCase())
    const matchesType = templateTypeFilter === 'All' || template.type === templateTypeFilter
    const matchesStatus = templateStatusFilter === 'All' || template.status === templateStatusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  // Template Action Handlers
  const handleViewTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsViewTemplateModalOpen(true)
  }

  const handleEditTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsEditTemplateModalOpen(true)
  }

  const handleDuplicateTemplate = async (template: LetterTemplate) => {
    setIsCopyingTemplateId(template.id)
    try {
      await templateStore.create({ ...template, name: `${template.name} (Copy)`, status: 'Draft' })
      showToast('Template duplicated successfully')
    } finally {
      setIsCopyingTemplateId(null)
    }
  }

  const handleDeleteTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedTemplate) return
    setIsDeletingTemplate(true)
    try {
      await templateStore.delete(selectedTemplate.id)
      showToast('Template deleted successfully')
      setIsDeleteConfirmOpen(false)
      setSelectedTemplate(null)
    } finally {
      setIsDeletingTemplate(false)
    }
  }

  const handleCreateTemplate = () => {
    setSelectedTemplate(null)
    setIsEditTemplateModalOpen(true)
  }

  const handleSaveTemplate = async (templateData: Partial<LetterTemplate>) => {
    const typeColors: Record<string, string> = {
      'non-objection': 'emerald', inquiry: 'blue', submission: 'amber', notification: 'rose',
    }
    const typeIcons: Record<string, string> = {
      'non-objection': 'lucide:user-check', inquiry: 'lucide:help-circle', submission: 'lucide:file-up', notification: 'lucide:alert-triangle',
    }
    try {
      if (selectedTemplate) {
        await templateStore.update(selectedTemplate.id, templateData)
        showToast('Template updated successfully')
      } else {
        const resolvedType = templateData.type || 'non-objection'
        await templateStore.create({
          name: templateData.name || 'Untitled Template',
          type: resolvedType,
          // L2: use user-picked icon/color; fall back to type-based defaults only
          // when the TemplateEditForm didn't surface them (legacy call sites).
          icon: templateData.icon || typeIcons[resolvedType] || 'lucide:mail',
          color: templateData.color || typeColors[resolvedType] || 'slate',
          description: templateData.description || '',
          status: templateData.status || 'Draft',
          ...templateData,
        })
        showToast('Template created successfully')
      }
    } catch {
      // store.error is already set by the store; toast a fallback.
      showToast('Failed to save template — please try again')
      return
    }
    setIsEditTemplateModalOpen(false)
    setSelectedTemplate(null)
  }

  const handleUseTemplate = (template: LetterTemplate) => {
    setCreateFromTemplate(template)
    setSelectedLetterType(template.type)
    setIsCreateModalOpen(true)
  }

  const handleViewLetter = useCallback((letter: Letter) => {
    store.setSelected(letter)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // L4: Preserve ?id= in the URL so F5 (hard refresh) re-opens the same
    // detail view instead of falling back to the list. Only update the URL
    // if the id has changed (avoids spurious history entries).
    if (searchParams.get('id') !== letter.id) {
      router.replace(`${pathname}?id=${letter.id}`)
    }
    // Refresh the full detail (approval chain, attachments, timeline) which
    // the list endpoint may have truncated. Errors are swallowed by the
    // store; UI continues to render from cached row data.
    void store.fetchById(letter.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, pathname, store])

  // AC61 (W34-QA): tracks the last ?id= already flagged as not-found so the toast
  // fires once per bad id (not on every store.letters reconciliation).
  const deepLinkNotFoundRef = useRef<string | null>(null)

  // Deep-link: auto-switch to detail view when ?id= is present.
  // On hard refresh, store.letters is empty until fetchAll resolves; we wait
  // for the list to contain the target letter before opening it.
  // Guard with view !== 'detail' so reconciliation after fetchAll doesn't
  // reopen the detail once the user has navigated away via handleBackToDashboard.
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id || view === 'detail') return
    const letter = store.letters.find(l => l.id === id)
    if (letter) { handleViewLetter(letter); return }
    // AC61 (W34-QA): once the first list fetch has resolved and the id still
    // matches nothing (unknown / hard-deleted / RLS-hidden), don't sit on the
    // awaiting-skeleton forever — surface a toast and strip ?id so the view
    // degrades to the list (isAwaitingDeepLink becomes false).
    if (lettersLastFetched === null) return
    if (deepLinkNotFoundRef.current === id) return
    deepLinkNotFoundRef.current = id
    showToast(t('letters.letterNotFound'))
    router.replace(pathname)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, store.letters, lettersLastFetched])

  // L8: Auto-open Template Databank when ?view=templates is in the URL.
  // Runs once on mount (and whenever searchParams changes) so a hard refresh
  // preserves the templates view state.
  useEffect(() => {
    if (searchParams.get('view') === 'templates') {
      setIsTemplateManagementOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBackToDashboard = () => {
    setView('dashboard')
    store.setSelected(null)
    // L4: clear ?id= so refresh from list view doesn't re-open the detail.
    router.replace(pathname)
  }

  const handleOpenCreateModal = (type: LetterType = 'non-objection') => {
    setSelectedLetterType(type)
    setIsCreateModalOpen(true)
  }

  const handleDownloadPdf = useCallback(async () => {
    if (!selectedLetter) return

    // L4: show a spinner on the button while the (slow) PDF job-queue pipeline runs.
    setPdfBusy(true)
    try {
    // PDF is rendered server-side by the xelatex microservice (engine: 'latex')
    // via the `sama-letter` LaTeX template (src/lib/pdf/latex). The job is
    // enqueued as `pdf.latex`; the cron worker (or the dev-inline path) compiles
    // it, so Arabic text, the Tasheel letterhead, dual Hijri/Gregorian dates,
    // signature block and page numbering all come out properly typeset.
    const subjectRaw = language === 'ar' ? (selectedLetter.subjectAr || selectedLetter.subject) : selectedLetter.subject
    const bodyRaw    = language === 'ar' ? (selectedLetter.bodyAr    || selectedLetter.body)    : selectedLetter.body
    const subject = renderTemplate(subjectRaw, selectedLetter.placeholderValues ?? {})
    const body    = renderTemplate(bodyRaw,    selectedLetter.placeholderValues ?? {})

    const recipientName = (language === 'ar' ? selectedLetter.recipientNameAr : selectedLetter.recipientName) ?? ''
    const recipientOrg  = (language === 'ar' ? selectedLetter.recipientOrgAr  : selectedLetter.recipientOrg)  ?? undefined
    const recipientCity = (language === 'ar' ? selectedLetter.recipientCityAr : selectedLetter.recipientCity) ?? undefined
    const signerName    = (language === 'ar' ? selectedLetter.signerNameAr    : selectedLetter.signerName)    ?? currentUser
    const signerTitle   = (language === 'ar' ? selectedLetter.signerTitleAr   : selectedLetter.signerTitle)   ?? undefined

    // Dual Hijri (Umm al-Qura) + Gregorian dating, matching the real SAMA letter.
    const { hijriDate, gregorianDate } = formatDualDates(new Date(selectedLetter.createdAt))

    try {
      await downloadPdf(
        {
          template: 'sama-letter',
          locale: language,
          options: { engine: 'latex' },
          data: {
            reference: selectedLetter.reference,
            hijriDate,
            gregorianDate,
            recipientName,
            recipientOrg,
            recipientCity,
            subject,
            body,
            attachments: (selectedLetter.attachments ?? []).map((a) => a.name),
            signerName,
            signerTitle,
            signatureImageUrl: selectedLetter.signatureImageUrl,
          },
        },
        `Letter-${selectedLetter.reference}-${language}.pdf`,
      )
    } catch (err) {
      const message = err instanceof PdfError ? err.message : 'Failed to generate PDF'
      console.error('[letters] PDF generation failed:', err)
      showToast(message)
      return
    }

    // Bundle attachments into a zip alongside the PDF (unchanged from legacy).
    if (selectedLetter.attachments && selectedLetter.attachments.length > 0) {
      const { zip } = await import('fflate')
      const fileEntries: Record<string, Uint8Array> = {}
      for (const att of selectedLetter.attachments) {
        try {
          const res = await fetch(att.url)
          const buf = await res.arrayBuffer()
          fileEntries[att.name] = new Uint8Array(buf)
        } catch {
          // skip unreachable attachments (e.g. placeholder '#' URLs in seed data)
        }
      }
      if (Object.keys(fileEntries).length > 0) {
        zip(fileEntries, (zipErr, data) => {
          if (zipErr) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blob = new Blob([data as unknown as BlobPart], { type: 'application/zip' })
          const zipUrl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = zipUrl
          a.download = `SAMA-${selectedLetter.reference}-attachments.zip`
          a.click()
          URL.revokeObjectURL(zipUrl)
        })
      }
    }
    } finally {
      setPdfBusy(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLetter, language, currentUser, showToast])

  // Pure mail helper — opens mailto and marks the letter sent. Safe to call without a PDF download
  // (e.g. from the summary table where the letter content DOM is not rendered).
  // L1: await send + catch so errors are surfaced instead of silently dropped.
  const openAuthorityMail = useCallback(async (letter: Letter, lang: 'en' | 'ar') => {
    const toEmail = getDepartmentEmail(letter.authority, letter.samaDepartment) ?? ''
    const subjectText = getEmailSubjectFor(letter.type, lang)
    const letterSubj = lang === 'ar'
      ? (letter.subjectAr || letter.subject)
      : letter.subject
    const emailSubject = `${subjectText} — ${letter.reference}: ${letterSubj}`
    const emailBody = buildLetterEmailBody(letter.type, lang, letter.reference, letterSubj)
    const mailto = `mailto:${toEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    window.open(mailto, '_blank')
    try {
      await store.send(letter.id)
    } catch (err: unknown) {
      const is409 =
        err != null && typeof err === 'object' && 'status' in err &&
        (err as { status: number }).status === 409
      if (!is409) {
        showToast(t('letters.sendFailed' as Parameters<typeof t>[0]) || 'Failed to mark letter as sent')
      }
      // 409 = already sent; treat as success (idempotent)
    }
    showToast(t('letters.pdfDownloadedAttachToEmail'))
  }, [store, showToast, t])

  // Detail-view send: downloads PDF first, then opens mail using the letter's language toggle
  const handleSendToSama = useCallback(async () => {
    if (!selectedLetter) return
    await handleDownloadPdf()
    await openAuthorityMail(selectedLetter, language)
  }, [selectedLetter, handleDownloadPdf, openAuthorityMail, language])

  // Auto-trigger send after navigating from table to detail view
  useEffect(() => {
    if (pendingSend && view === 'detail' && selectedLetter?.status === 'approved') {
      setPendingSend(false)
      handleSendToSama()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, view, selectedLetter?.id])

  // W24-1 — locale-aware date formatter. Uses 'ar-SA-u-nu-arab' in AR mode
  // so Arabic-Indic numerals and Arabic month names are used consistently.
  const formatDate = (iso: string): string => {
    try {
      return formatLocalizedDate(iso, language, { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return iso
    }
  }

  const formatBytes = (bytes: number): string => fmtBytes(bytes, bytes < 1024 * 1024 ? 0 : 1)

  const getTypeLabel = (type: LetterType): string => {
    switch (type) {
      case 'non-objection': return t('letters.nonObjection')
      case 'inquiry': return t('letters.inquiry')
      case 'submission': return t('letters.submission')
      case 'notification': return t('letters.notification')
      default: {
        // Custom letter type — pull label from the editable type store.
        const item = letterTypeStore.types.find((tt) => tt.id === type)
        return item ? (isRTL && item.labelAr ? item.labelAr : item.label) : type
      }
    }
  }

  const getTypeBadgeColor = (type: LetterType): string => {
    switch (type) {
      case 'non-objection': return 'bg-emerald-50 text-emerald-700'
      case 'inquiry': return 'bg-blue-50 text-blue-700'
      case 'submission': return 'bg-amber-50 text-amber-700'
      case 'notification': return 'bg-rose-50 text-rose-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const getStatusDisplay = (status: Letter['status']) => {
    switch (status) {
      case 'sent': return { color: 'text-blue-600', dotColor: 'bg-blue-600' }
      case 'draft': return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'approved': return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'pending-approval': return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'response-received': return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'overdue': return { color: 'text-rose-600', dotColor: 'bg-rose-600' }
      case 'rejected': return { color: 'text-rose-600', dotColor: 'bg-rose-600' }
      default: return { color: 'text-slate-600', dotColor: 'bg-slate-600' }
    }
  }

  const getStatusLabel = (status: Letter['status']): string => {
    switch (status) {
      case 'draft': return t('letters.drafting')
      case 'pending-approval': return t('letters.pendingApproval')
      case 'approved': return t('letters.approvedForSending')
      case 'sent': return t('letters.statusSentToAuthority')
      case 'response-received': return t('letters.statusResponseReceived')
      case 'overdue': return t('letters.statusOverdue')
      case 'rejected': return t('letters.statusRejected')
      default: return status
    }
  }

  // Authority badge helper used in table & detail metadata
  const renderAuthorityBadge = (authority: CircularAuthority, opts?: { showFull?: boolean; size?: 'sm' | 'md' }) => {
    const colors = getAuthorityColors(authority)
    const code = resolveAuthorityCode(authority, storeFrameworks)
    const size = opts?.size ?? 'sm'
    const full = opts?.showFull
      ? getAuthorityFullName(authority, isRTL ? 'ar' : 'en')
      : null
    return (
      <span className={`inline-flex items-center gap-1 ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'} font-bold rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {code}
        {full && <span className="font-medium opacity-75 truncate max-w-[160px]">{full}</span>}
      </span>
    )
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <Link
            href="/correspondence/feed"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} className="text-base" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('letters.pageTitleLetters')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('letters.pageSubtitleLetters')}
            </p>
          </div>

          <div className="hidden lg:block h-8 w-px bg-slate-200 mx-2" />

          <div className="hidden lg:flex gap-2">
            <Link
              href="/correspondence/letters"
              className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg transition-all border border-emerald-100 flex items-center gap-2`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('letters.tabLetters')}
            </Link>
            <Link
              href="/correspondence/regulatory-updates"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2`}
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('observations.regulatoryUpdates')}
            </Link>
            <Link
              href="/correspondence/observations"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2`}
            >
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('regulatoryUpdates.observationsTracker')}
            </Link>
          </div>
        </div>

        <div className={`flex items-center gap-4`}>
          <div className={`hidden md:flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg`}>
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2`}>
              <span>{t('common.livePulse')}</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          <EntityGate action="create" entity="letter">
            <button
              onClick={() => handleOpenCreateModal()}
              className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
            >
              <Icon icon="lucide:plus" />
              {t('letters.draftNewLetter')}
            </button>
          </EntityGate>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        {isTemplateManagementOpen ? (
          /* Template Management Databank View */
          <div>
            {/* Header */}
            <div className={`flex justify-between items-center mb-8`}>
              <div className={`flex items-center gap-4`}>
                <button
                  onClick={() => {
                    setIsTemplateManagementOpen(false)
                    setTemplateSearch('')
                    setTemplateTypeFilter('All')
                    setTemplateStatusFilter('All')
                    // L8: clear ?view=templates so refresh from list view doesn't
                    // re-open the template databank. Preserve ?id= if present.
                    const next = new URLSearchParams(searchParams.toString())
                    next.delete('view')
                    const qs = next.toString()
                    router.replace(qs ? `${pathname}?${qs}` : pathname)
                  }}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-display">{t('letters.templateDatabank')}</h2>
                  <p className="text-sm text-slate-500">{t('letters.manageOrganizeTemplates')}</p>
                </div>
              </div>
              <Gate perm="Manage Letter Templates">
                <button
                  onClick={handleCreateTemplate}
                  className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
                >
                  <Icon icon="lucide:plus" />
                  {t('letters.createTemplate')}
                </button>
              </Gate>
            </div>

            {/* Filters Section */}
            <div className="glass-card rounded-2xl p-6 mb-6">
              <div className={`flex flex-wrap gap-4 items-center`}>
                {/* Search Input */}
                <div className="relative flex-1 min-w-[280px]">
                  <Icon
                    icon="lucide:search"
                    className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                  />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder={t('letters.searchTemplates')}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none`}
                  />
                </div>

                {/* Type Filter — BUG-R3-05: bound to useLetterTypeStore so
                    user-added types appear here. A synthetic "All" item is
                    prepended (isDefault so it can't be deleted/edited). */}
                <div className={`flex items-center gap-2`}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('common.type')}:</label>
                  <div className="min-w-[150px]">
                    <EditableSelect
                      value={templateTypeFilter}
                      onChange={(id) => setTemplateTypeFilter(id as LetterType | 'All')}
                      items={[
                        { id: 'All', label: t('letters.allTypes'), labelAr: t('letters.allTypes'), isDefault: true },
                        ...letterTypeStore.types.map((tt) => ({
                          id: tt.id,
                          label: tt.label,
                          labelAr: tt.labelAr,
                          isDefault: tt.isDefault,
                        })),
                      ]}
                      onAdd={(label, labelAr) => letterTypeStore.add(label, labelAr)}
                      onEdit={(id, label, labelAr) => {
                        if (id === 'All') return
                        letterTypeStore.update(id, { label, labelAr: labelAr ?? label })
                      }}
                      onDelete={(id) => {
                        if (id === 'All') return
                        letterTypeStore.remove(id)
                      }}
                      isRTL={isRTL}
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div className={`flex items-center gap-2`}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('common.status')}:</label>
                  <div className="min-w-[130px]">
                    <EditableSelect
                      locked
                      items={[
                        { id: 'All', label: t('letters.allStatus') },
                        { id: 'Active', label: t('common.active') },
                        { id: 'Draft', label: t('common.draft') },
                      ]}
                      value={templateStatusFilter}
                      onChange={(id) => setTemplateStatusFilter(id as TemplateStatus | 'All')}
                      isRTL={isRTL}
                    />
                  </div>
                </div>

                {/* Results Count */}
                <div className={`text-sm text-slate-500`}>
                  <span className="font-bold text-slate-900">{filteredTemplates.length}</span> {t('letters.templatesFound')}
                </div>
              </div>
            </div>

            {/* Templates Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                    <tr>
                      <th className={`px-6 py-4`}>{t('letters.templateName')}</th>
                      <th className={`px-6 py-4`}>{t('common.type')}</th>
                      <th className={`px-6 py-4`}>{t('common.description')}</th>
                      <th className={`px-6 py-4`}>{t('common.status')}</th>
                      <th className={`px-6 py-4`}>{t('letters.lastModified')}</th>
                      <th className="px-6 py-4 text-center">{t('letters.usageCount')}</th>
                      <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTemplates.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4">
                          {(templateSearch || templateTypeFilter !== 'All' || templateStatusFilter !== 'All') ? (
                            <NoResultsEmptyState
                              onClearFilters={() => {
                                setTemplateSearch('')
                                setTemplateTypeFilter('All')
                                setTemplateStatusFilter('All')
                              }}
                              searchTerm={templateSearch || undefined}
                            />
                          ) : (
                            <NoDataEmptyState
                              title={t('emptyStates.templates.title')}
                              description={t('emptyStates.templates.description')}
                              ctaLabel={t('emptyStates.templates.cta')}
                              onAdd={handleCreateTemplate}
                            />
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredTemplates.map((template) => (
                        <tr
                          key={template.id}
                          className="hover:bg-slate-50 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                template.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                                template.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                                template.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                                'bg-rose-50 text-rose-600'
                              }`}>
                                <Icon icon={template.icon} className="text-lg" />
                              </div>
                              <span className="text-sm font-bold text-slate-900">{getTranslatedTemplateName(template.id, template.name)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(template.type)}`}>
                              {template.type === 'non-objection' ? t('letters.nonObjection') :
                               template.type === 'inquiry' ? t('letters.inquiry') :
                               template.type === 'submission' ? t('letters.submission') :
                               t('letters.notification')}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-500 truncate max-w-xs">{getTranslatedTemplateDescription(template.id, template.description)}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`flex items-center gap-1.5 text-xs font-bold ${
                              template.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                template.status === 'Active' ? 'bg-emerald-600' : 'bg-amber-600'
                              }`} />
                              {template.status === 'Active' ? t('common.active') : t('common.draft')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400">{template.lastModified}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-bold text-slate-900">{template.usageCount}</span>
                            <span className={`text-xs text-slate-400 ${isRTL ? 'mr-1' : 'ml-1'}`}>{t('letters.uses')}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <EntityGate action="create" entity="letter">
                                <button
                                  onClick={() => handleUseTemplate(template)}
                                  className="p-1.5 hover:bg-emerald-100 rounded text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                  title={t('letters.useTemplate')}
                                >
                                  <Icon icon="lucide:arrow-right-circle" />
                                </button>
                              </EntityGate>
                              <button
                                onClick={() => handleViewTemplate(template)}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="View"
                              >
                                <Icon icon="lucide:eye" />
                              </button>
                              <Gate perm="Manage Letter Templates">
                                <button
                                  onClick={() => handleEditTemplate(template)}
                                  className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                  title="Edit"
                                >
                                  <Icon icon="lucide:pencil" />
                                </button>
                              </Gate>
                              <button
                                onClick={() => handleDuplicateTemplate(template)}
                                disabled={isCopyingTemplateId === template.id}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-60"
                                title="Duplicate"
                              >
                                <Icon icon={isCopyingTemplateId === template.id ? 'lucide:loader-2' : 'lucide:copy'}
                                  className={isCopyingTemplateId === template.id ? 'animate-spin' : ''} />
                              </button>
                              <Gate perm="Manage Letter Templates">
                                <button
                                  onClick={() => handleDeleteTemplate(template)}
                                  className="p-1.5 hover:bg-rose-100 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Icon icon="lucide:trash-2" />
                                </button>
                              </Gate>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : isAwaitingDeepLink ? (
          /* W29-L7: Deep-link pending — show skeleton instead of list flash */
          <div className="p-6">
            <ListSkeleton rows={5} columns={6} />
          </div>
        ) : view === 'dashboard' ? (
          <div>
            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <StatCard
                label={t('letters.totalLettersYTD')}
                value={String(totalYTD)}
                subtext={t('letters.fromPreviousYear')}
                subtextIcon="lucide:trending-up"
                subtextColor="emerald"
                borderColor="emerald"
                isRTL={isRTL}
              />
              <StatCard
                label={t('letters.sentThisQuarter')}
                value={String(sentThisQ)}
                subtext={t('letters.lastSent')}
                borderColor="blue"
                isRTL={isRTL}
              />
              <StatCard
                label={t('letters.pendingDrafts')}
                value={String(pendingDrafts).padStart(2, '0')}
                subtext={t('letters.dueThisWeek')}
                subtextIcon="lucide:clock"
                subtextColor="amber"
                borderColor="amber"
                isRTL={isRTL}
              />
              <StatCard
                label={t('letters.overdueReplies')}
                value={String(overdueReplies).padStart(2, '0')}
                subtext={t('letters.criticalEscalation')}
                subtextColor="rose"
                borderColor="rose"
                isRTL={isRTL}
              />
            </div>

            {/* Letter Templates */}
            <div className="mb-10">
              <div className={`flex items-baseline justify-between mb-6`}>
                <h2 className="text-lg font-bold font-display text-slate-900">{t('letters.letterTemplates')}</h2>
                <Gate perm="Manage Letter Templates">
                  <button
                    onClick={() => {
                      setIsTemplateManagementOpen(true)
                      // L8: encode templates view in URL so hard refresh restores it.
                      // Preserve any existing ?id= param (combine search params).
                      const next = new URLSearchParams(searchParams.toString())
                      next.set('view', 'templates')
                      router.replace(`${pathname}?${next.toString()}`)
                    }}
                    className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                  >
                    {t('letters.manageTemplates')} {isRTL ? '\u2190' : '\u2192'}
                  </button>
                </Gate>
              </div>
              {/* W41: the quick strip shows PINNED templates (user-chosen via
                  the template editor's pin toggle) — clicking starts a letter
                  prefilled FROM that exact template. Falls back to the most
                  used templates, then to the legacy type cards on a fresh
                  tenant. Authority-agnostic: SAMA / CMA / ZATCA / anything. */}
              {(() => {
                const active = templateStore.templates.filter((tp) => tp.status === 'Active')
                const pinnedTemplates = active.filter((tp) => tp.pinned)
                const quickTemplates = (pinnedTemplates.length > 0 ? pinnedTemplates : active)
                  .slice()
                  .sort((a, b) => b.usageCount - a.usageCount)
                  .slice(0, 4)
                if (quickTemplates.length === 0) {
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {templateTypeCards.map((template) => {
                        const translatedType = template.type === 'non-objection' ? t('letters.nonObjection') :
                                               template.type === 'inquiry' ? t('letters.inquiry') :
                                               template.type === 'submission' ? t('letters.submission') :
                                               t('letters.notification')
                        return (
                          <EntityGate key={template.type} action="create" entity="letter">
                            <TemplateCard
                              type={translatedType}
                              icon={template.icon}
                              color={template.color}
                              description={t('letters.startFromScratch')}
                              onClick={() => handleOpenCreateModal(template.type)}
                            />
                          </EntityGate>
                        )
                      })}
                    </div>
                  )
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {quickTemplates.map((tpl) => (
                      <EntityGate key={tpl.id} action="create" entity="letter">
                        <TemplateCard
                          type={tpl.name}
                          icon={tpl.icon}
                          color={tpl.color}
                          description={`${(tpl.defaultAuthority ?? 'sama').toUpperCase()} · ${getTypeLabel(tpl.type)}`}
                          onClick={() => handleUseTemplate(tpl)}
                        />
                      </EntityGate>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Recent Letters Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className={`px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/50`}>
                <h2 className="font-bold text-slate-900">{t('letters.recentCorrespondence')}</h2>
                <div className={`flex gap-3`}>
                  <div className="relative">
                    <Icon
                      icon="lucide:search"
                      className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
                    />
                    <input
                      type="text"
                      value={letterSearch}
                      onChange={(e) => setLetterSearch(e.target.value)}
                      placeholder={t('letters.searchByNameRefAuthority')}
                      className={`${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 bg-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-72`}
                    />
                  </div>
                  <div className="relative" ref={filterPopoverRef}>
                    <button
                      onClick={() => setShowFilterPopover(s => !s)}
                      className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                        authorityFilter.size > 0 || dateFilter !== 'any'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={t('letters.filtersTitle')}
                    >
                      <Icon icon="lucide:filter" />
                      {(authorityFilter.size > 0 || dateFilter !== 'any') && (
                        <span className="text-[10px] font-bold">
                          {authorityFilter.size + (dateFilter !== 'any' ? 1 : 0)}
                        </span>
                      )}
                    </button>
                    {showFilterPopover && (
                      <div className={`absolute z-30 mt-2 ${isRTL ? 'left-0' : 'right-0'} w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 space-y-4`}>
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{t('letters.filtersTitle')}</h3>
                          <button onClick={resetFilters} className="text-[10px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer">
                            {t('letters.filterReset')}
                          </button>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('letters.filterByAuthority')}</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {storeFrameworks
                              .filter((f) => f.enabled && f.correspondenceBased)
                              .map((f) => {
                                const a = f.id
                                const checked = authorityFilter.has(a)
                                const colors = getAuthorityColors(a)
                                return (
                                  <button
                                    key={a}
                                    onClick={() => toggleAuthorityFilter(a)}
                                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                      checked
                                        ? `${colors.bg} ${colors.text} ${colors.border}`
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {resolveAuthorityCode(a, storeFrameworks)}
                                  </button>
                                )
                              })}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('letters.filterByDate')}</p>
                          <div className="space-y-1">
                            {([
                              ['any',  t('letters.dateAnyTime')],
                              ['30d',  t('letters.dateLast30Days')],
                              ['90d',  t('letters.dateLast90Days')],
                              ['365d', t('letters.dateLast365Days')],
                            ] as const).map(([val, label]) => (
                              <button
                                key={val}
                                onClick={() => setDateFilter(val)}
                                className={`w-full ${isRTL ? 'text-right' : 'text-left'} px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                  dateFilter === val
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {showLettersSkeleton ? (
                <div className="p-6">
                  <ListSkeleton rows={5} columns={6} />
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className={`w-full`}>
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                    <tr>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('letters.tableAuthority')} col="authority" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('letters.reference')} col="reference" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('common.type')} col="type" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('letters.subject')} col="subject" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('common.status')} col="status" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      {/* W40 (story 2): sent + response-due surfaced on the row. */}
                      <th className={`px-6 py-4`}>{t('letters.tableSent')}</th>
                      <th className={`px-6 py-4`}>{t('letters.tableResponseReceived')}</th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('letters.lastModified')} col="updatedAt" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedLetters.map((letter) => {
                      const statusDisplay = getStatusDisplay(letter.status)
                      return (
                        <tr
                          key={letter.id}
                          onClick={() => handleViewLetter(letter)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4">{renderAuthorityBadge(letter.authority)}</td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-bold text-slate-900 font-display">
                              {letter.reference}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-block whitespace-nowrap px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(letter.type)}`}
                            >
                              {getTypeLabel(letter.type)}
                            </span>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <p className="text-sm text-slate-600 font-medium truncate flex items-center gap-1.5">
                              <span className="truncate">{isRTL && letter.subjectAr ? letter.subjectAr : letter.subject}</span>
                              {/* W41 (story 2): attachment + PDF indicators. */}
                              {(letter.attachmentCount ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400 shrink-0">
                                  <Icon icon="lucide:paperclip" className="text-[11px]" />
                                  {letter.attachmentCount}
                                </span>
                              )}
                              {letter.hasPdf && (
                                <span className="px-1 py-0.5 bg-rose-50 text-rose-500 text-[9px] font-black rounded shrink-0">
                                  PDF
                                </span>
                              )}
                            </p>
                            {letter.body && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {letter.body.replace(/<[^>]*>/g, '').slice(0, 80)}
                              </p>
                            )}
                            {letter.recipientName && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(letter.recipientName) && (
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                <span className="font-medium">{t('letters.recipientDept')}:</span>{' '}
                                {letter.recipientName}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`flex items-center gap-1.5 text-xs font-bold ${statusDisplay.color}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dotColor}`} />
                              {getStatusLabel(letter.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                            {letter.sentDate ? formatDate(letter.sentDate) : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm whitespace-nowrap">
                            {/* When the authority actually responded — more
                                meaningful than a synthetic "due" date the
                                regulator isn't bound by. */}
                            {letter.responseReceivedDate ? (
                              <span className="text-emerald-600 font-medium">{formatDate(letter.responseReceivedDate)}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400">{formatDate(letter.updatedAt)}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (openMenuId === letter.id) {
                                  setOpenMenuId(null)
                                  setMenuPosition(null)
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setMenuPosition({ x: rect.right, y: rect.bottom, buttonTop: rect.top })
                                  setOpenMenuId(letter.id)
                                }
                              }}
                              className={`p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-all cursor-pointer ${openMenuId === letter.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              <Icon icon="lucide:more-vertical" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {sortedLetters.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-6 py-4">
                          {(letterSearch || authorityFilter.size > 0 || dateFilter !== 'any') ? (
                            <NoResultsEmptyState
                              onClearFilters={resetFilters}
                              searchTerm={letterSearch || undefined}
                            />
                          ) : (
                            <NoDataEmptyState
                              title={t('emptyStates.letters.title')}
                              description={t('emptyStates.letters.description')}
                              ctaLabel={t('emptyStates.letters.cta')}
                              onAdd={canCreateLetter ? () => handleOpenCreateModal() : undefined}
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}
              {sortedLetters.length > LETTERS_PER_PAGE && (
                <TablePagination
                  currentPage={letterPage}
                  totalPages={letterTotalPages}
                  totalItems={sortedLetters.length}
                  itemsPerPage={LETTERS_PER_PAGE}
                  onPageChange={setLetterPage}
                />
              )}
            </div>
          </div>
        ) : (
          // Detail View
          <div>
            <div className={`flex justify-between items-center mb-6`}>
              <div className={`flex items-center gap-4`}>
                <button
                  onClick={handleBackToDashboard}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-display">
                    {selectedLetter?.reference}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {selectedLetter ? getTypeLabel(selectedLetter.type) : ''} &bull; {formatDate(selectedLetter?.updatedAt || '')}
                  </p>
                </div>
              </div>
              <div className={`flex gap-3`}>
                {/* Print PDF — export-gated in detail view */}
                <EntityGate action="export" entity="letter">
                  <button
                    onClick={handleDownloadPdf}
                    disabled={pdfBusy}
                    aria-busy={pdfBusy || undefined}
                    className={`px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <Icon icon={pdfBusy ? 'lucide:loader-2' : 'lucide:printer'} className={pdfBusy ? 'animate-spin' : ''} />
                    {pdfBusy ? t('letters.generatingPdf' as Parameters<typeof t>[0]) : t('letters.printPdf')}
                  </button>
                </EntityGate>
                {/* Status-specific primary actions */}
                {/* W40: rejected letters resubmit through the same action. */}
                {(selectedLetter?.status === 'draft' || selectedLetter?.status === 'rejected') && (
                  <button
                    onClick={async () => {
                      if (!selectedLetter) return
                      setSubmitBusy(true)
                      try { await store.submitForApproval(selectedLetter.id) } finally { setSubmitBusy(false) }
                    }}
                    disabled={submitBusy}
                    aria-busy={submitBusy || undefined}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-60`}
                  >
                    <Icon icon={submitBusy ? 'lucide:loader-2' : 'lucide:send'} className={submitBusy ? 'animate-spin' : ''} />
                    {selectedLetter?.status === 'rejected'
                      ? t('letters.resubmitForApproval')
                      : t('letters.submitForApproval')}
                  </button>
                )}
                {/* W28-BUG-B2 — Admin direct-approve when no chain configured.
                    L2: the terminal Reject button + modal were removed. Rejection now
                    goes through the per-step Reject in the Approval Chain card
                    (ApprovalStepActions → /reject-step), which returns the letter to
                    'draft' so the author can refine and resubmit instead of killing it. */}
                {/* W41: the top-level direct Approve/Reject buttons were
                    removed — approval verdicts flow through the per-step
                    actions in the Approval Chain card (chains now seed on
                    every submission and are configurable). */}
                {selectedLetter?.status === 'approved' && (
                  <button
                    onClick={async () => {
                      setSendBusy(true)
                      try { await handleSendToSama() } finally { setSendBusy(false) }
                    }}
                    disabled={sendBusy}
                    aria-busy={sendBusy || undefined}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-60`}
                  >
                    <Icon icon={sendBusy ? 'lucide:loader-2' : 'lucide:send'} className={sendBusy ? 'animate-spin' : ''} />
                    {t('letters.send')}
                  </button>
                )}
                {(selectedLetter?.status === 'sent' || selectedLetter?.status === 'overdue') && (
                  <button
                    onClick={() => {
                      if (!selectedLetter) return
                      // W29-L2: open optional-note modal instead of firing immediately.
                      setResponseNoteText('')
                      setResponseNoteModalLetterId(selectedLetter.id)
                    }}
                    disabled={responseBusy}
                    aria-busy={responseBusy || undefined}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer disabled:opacity-60`}
                  >
                    <Icon icon={responseBusy ? 'lucide:loader-2' : 'lucide:check-circle'} className={responseBusy ? 'animate-spin' : ''} />
                    {t('letters.markResponseReceived')}
                  </button>
                )}
              </div>
            </div>

            {/* W40: rejected-state banner — the reviewer's reason stays visible
                until the author revises and resubmits. */}
            {selectedLetter?.status === 'rejected' && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl" data-pdf-hide>
                <Icon icon="lucide:octagon-x" className="text-rose-600 text-lg shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-rose-700">{t('letters.rejectedBanner')}</p>
                  {selectedLetter.rejectionReason && (
                    <p className="text-sm text-rose-600 mt-1">{selectedLetter.rejectionReason}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-12 gap-8">
              {/* Letter Content */}
              <div className="col-span-12 lg:col-span-8">
                {/* L3: "saved at HH:mm" indicator — appears above the letter content
                    when an auto-save PATCH has completed. Fades out after 4s. */}
                {isDraft && bodySavedAt && (
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium" data-pdf-hide>
                    <Icon icon="lucide:check-circle" className="text-[13px]" />
                    {t('letters.savedAt', {
                      time: bodySavedAt.toLocaleTimeString(
                        isRTL ? 'ar-SA' : 'en-US',
                        { hour: '2-digit', minute: '2-digit' },
                      ),
                    })}
                  </div>
                )}
                <div
                  ref={letterContentRef}
                  dir={language === 'en' ? 'ltr' : 'rtl'}
                  className="bg-white rounded-2xl border border-slate-200 p-12 relative overflow-hidden"
                  style={{ boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)', minHeight: '600px' }}
                >
                  {/* Header */}
                  <div className="flex justify-between border-b-2 border-slate-100 pb-8 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-emerald-400">
                        <Icon icon="lucide:shield-check" className="text-3xl" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">
                          ComplianceOS Bank
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          Headquarters, Riyadh KSA
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex rounded-lg bg-slate-100 p-1 mb-2" data-pdf-hide>
                        <button
                          onClick={() => setLanguage('en')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            language === 'en'
                              ? 'bg-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                        <button
                          onClick={() => setLanguage('ar')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            language === 'ar'
                              ? 'bg-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Arabic
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Letter Content */}
                  {language === 'en' ? (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="text-sm text-slate-900 space-y-0.5">
                          {isDraft ? (
                            <>
                              <p className="font-bold flex items-center gap-1">
                                <span className="shrink-0">To:</span>
                                <input
                                  value={editRecipientName}
                                  onChange={e => setEditRecipientName(e.target.value)}
                                  onBlur={() => saveField({ recipientName: editRecipientName })}
                                  className="font-bold bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none w-full"
                                  placeholder="Department…"
                                />
                              </p>
                              <input
                                value={editRecipientOrg}
                                onChange={e => setEditRecipientOrg(e.target.value)}
                                onBlur={() => saveField({ recipientOrg: editRecipientOrg })}
                                className="bg-transparent border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none w-full"
                                placeholder="Organisation…"
                              />
                              <input
                                value={editRecipientCity}
                                onChange={e => setEditRecipientCity(e.target.value)}
                                onBlur={() => saveField({ recipientCity: editRecipientCity })}
                                className="bg-transparent border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none w-full"
                                placeholder="City, Country…"
                              />
                            </>
                          ) : (
                            <>
                              <p className="font-bold">To: {editRecipientName}</p>
                              <p>{editRecipientOrg}</p>
                              <p>{editRecipientCity}</p>
                            </>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-slate-500">Date: 12 October 2024</p>
                          <p className="text-slate-500">Ref: {selectedLetter?.reference}</p>
                        </div>
                      </div>

                      <div className="py-4">
                        {isDraft ? (
                          <div className="font-black text-lg text-slate-900 border-b border-dashed border-slate-300 focus-within:border-emerald-400 py-1">
                            <InlineChipEditor
                              value={editSubject}
                              onChange={(v) => {
                                setEditSubject(v)
                                saveDraftBody({ subject: v })
                              }}
                              onFocus={() => { bodyEditorFocusedRef.current = true }}
                              onBlur={() => { bodyEditorFocusedRef.current = false; flushDraftBody() }}
                              placeholderDefs={editPlaceholderDefs}
                              placeholderValues={editPlaceholderValues}
                              onPlaceholderChange={updateDraftPlaceholderValue}
                              dir="ltr"
                              multiline={false}
                              textSize="text-lg"
                              placeholder="Enter subject…"
                            />
                          </div>
                        ) : (
                          <h4 className="font-black text-lg text-slate-900">Subject: {selectedLetter?.subject}</h4>
                        )}
                      </div>

                      <div className="text-slate-700 text-sm leading-relaxed space-y-4">
                        <p>Dear Sir/Madam,</p>
                        {isDraft ? (
                          <div className="border border-dashed border-slate-200 focus-within:border-emerald-300 rounded p-2 min-h-[10rem]">
                            <InlineChipEditor
                              value={editBody}
                              onChange={(v) => {
                                setEditBody(v)
                                saveDraftBody({ body: v })
                              }}
                              onFocus={() => { bodyEditorFocusedRef.current = true }}
                              onBlur={() => { bodyEditorFocusedRef.current = false; flushDraftBody() }}
                              placeholderDefs={editPlaceholderDefs}
                              placeholderValues={editPlaceholderValues}
                              onPlaceholderChange={updateDraftPlaceholderValue}
                              dir="ltr"
                              textSize="text-sm"
                              placeholder="Type your message here… (use {{token}} for placeholders)"
                            />
                          </div>
                        ) : selectedLetter?.body ? (
                          selectedLetter.body.split('\n\n').map((para, i) => (
                            <p key={i}>{para}</p>
                          ))
                        ) : (
                          <p className="text-slate-400 italic">{t('letters.typeMessageHere')}</p>
                        )}
                        <p className="pt-8">Yours sincerely,</p>
                        <div>
                          {isDraft ? (
                            <>
                              <input
                                value={editSignerName}
                                onChange={e => setEditSignerName(e.target.value)}
                                onBlur={() => saveField({ signerName: editSignerName })}
                                className="font-black text-slate-900 bg-transparent w-full border-0 border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none py-0.5 text-sm"
                                placeholder="Signer name…"
                              />
                              <input
                                value={editSignerTitle}
                                onChange={e => setEditSignerTitle(e.target.value)}
                                onBlur={() => saveField({ signerTitle: editSignerTitle })}
                                className="text-slate-500 bg-transparent w-full border-0 border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none py-0.5 text-sm mt-1"
                                placeholder="Title…"
                              />
                              {selectedLetter?.signatureImageUrl && (
                                <img src={selectedLetter.signatureImageUrl} alt="signature preview"
                                  className="mt-3 h-10 max-w-[140px] object-contain opacity-60"
                                  onError={(ev) => { ev.currentTarget.style.display = 'none' }} />
                              )}
                            </>
                          ) : (
                            <>
                              <p className="font-black text-slate-900">{editSignerName}</p>
                              <p className="text-slate-500">{editSignerTitle}</p>
                              {selectedLetter?.signatureImageUrl && (
                                <img
                                  src={selectedLetter.signatureImageUrl}
                                  alt="signature"
                                  className="mt-3 h-12 max-w-[160px] object-contain"
                                  onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
                      <div className="flex justify-between items-start">
                        <div className="text-lg text-slate-900 space-y-0.5">
                          {isDraft ? (
                            <>
                              <p className="font-bold flex items-center gap-1">
                                <span className="shrink-0">إلى:</span>
                                <input
                                  value={editRecipientNameAr}
                                  onChange={e => setEditRecipientNameAr(e.target.value)}
                                  onBlur={() => saveField({ recipientNameAr: editRecipientNameAr })}
                                  className="font-bold bg-transparent border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none w-full text-lg"
                                  placeholder="الإدارة…"
                                />
                              </p>
                              <input
                                value={editRecipientOrgAr}
                                onChange={e => setEditRecipientOrgAr(e.target.value)}
                                onBlur={() => saveField({ recipientOrgAr: editRecipientOrgAr })}
                                className="bg-transparent border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none w-full text-lg"
                                placeholder="اسم الجهة…"
                              />
                              <input
                                value={editRecipientCityAr}
                                onChange={e => setEditRecipientCityAr(e.target.value)}
                                onBlur={() => saveField({ recipientCityAr: editRecipientCityAr })}
                                className="bg-transparent border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none w-full text-lg"
                                placeholder="المدينة، الدولة…"
                              />
                            </>
                          ) : (
                            <>
                              <p className="font-bold">إلى: {editRecipientNameAr}</p>
                              <p>{editRecipientOrgAr}</p>
                              <p>{editRecipientCityAr}</p>
                            </>
                          )}
                        </div>
                        <div className="text-left text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <p className="text-slate-500">التاريخ: 12 أكتوبر 2024</p>
                          <p className="text-slate-500">المرجع: {selectedLetter?.reference}</p>
                        </div>
                      </div>

                      <div className="py-4">
                        {isDraft ? (
                          <div className="font-bold text-2xl text-slate-900 border-b border-dashed border-slate-300 focus-within:border-emerald-400 py-1">
                            <InlineChipEditor
                              value={editSubjectAr}
                              onChange={(v) => {
                                setEditSubjectAr(v)
                                saveDraftBody({ subjectAr: v })
                              }}
                              onFocus={() => { bodyEditorFocusedRef.current = true }}
                              onBlur={() => { bodyEditorFocusedRef.current = false; flushDraftBody() }}
                              placeholderDefs={editPlaceholderDefs}
                              placeholderValues={editPlaceholderValues}
                              onPlaceholderChange={updateDraftPlaceholderValue}
                              dir="rtl"
                              fontFamily="'Amiri', serif"
                              multiline={false}
                              textSize="text-2xl"
                              placeholder="أدخل الموضوع…"
                            />
                          </div>
                        ) : (
                          <h4 className="font-bold text-2xl text-slate-900">
                            الموضوع: {selectedLetter?.subjectAr || selectedLetter?.subject}
                          </h4>
                        )}
                      </div>

                      <div className="text-slate-700 text-lg leading-relaxed space-y-4">
                        <p>السادة الكرام،</p>
                        {isDraft ? (
                          <div className="border border-dashed border-slate-200 focus-within:border-emerald-300 rounded p-2 min-h-[10rem]">
                            <InlineChipEditor
                              value={editBodyAr}
                              onChange={(v) => {
                                setEditBodyAr(v)
                                saveDraftBody({ bodyAr: v })
                              }}
                              onFocus={() => { bodyEditorFocusedRef.current = true }}
                              onBlur={() => { bodyEditorFocusedRef.current = false; flushDraftBody() }}
                              placeholderDefs={editPlaceholderDefs}
                              placeholderValues={editPlaceholderValues}
                              onPlaceholderChange={updateDraftPlaceholderValue}
                              dir="rtl"
                              fontFamily="'Amiri', serif"
                              textSize="text-lg"
                              placeholder="اكتب رسالتك هنا… (استخدم {{token}} لإضافة عناصر نائبة)"
                            />
                          </div>
                        ) : selectedLetter?.bodyAr ? (
                          selectedLetter.bodyAr.split('\n\n').map((para, i) => (
                            <p key={i}>{para}</p>
                          ))
                        ) : selectedLetter?.body ? (
                          selectedLetter.body.split('\n\n').map((para, i) => (
                            <p key={i}>{para}</p>
                          ))
                        ) : (
                          <p className="text-slate-400 italic">{t('letters.typeMessageHere')}</p>
                        )}
                        <p className="pt-8">وتقبلوا خالص التحية والتقدير،،</p>
                        <div>
                          {isDraft ? (
                            <>
                              <input
                                value={editSignerNameAr}
                                onChange={e => setEditSignerNameAr(e.target.value)}
                                onBlur={() => saveField({ signerNameAr: editSignerNameAr })}
                                className="font-bold text-slate-900 bg-transparent w-full border-0 border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none py-0.5 text-lg"
                                placeholder="اسم الموقع…"
                              />
                              <input
                                value={editSignerTitleAr}
                                onChange={e => setEditSignerTitleAr(e.target.value)}
                                onBlur={() => saveField({ signerTitleAr: editSignerTitleAr })}
                                className="text-slate-500 bg-transparent w-full border-0 border-b border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none py-0.5 text-sm mt-1"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                                placeholder="المسمى الوظيفي…"
                              />
                              {selectedLetter?.signatureImageUrl && (
                                <img src={selectedLetter.signatureImageUrl} alt="signature preview"
                                  className="mt-3 h-10 max-w-[140px] object-contain opacity-60"
                                  onError={(ev) => { ev.currentTarget.style.display = 'none' }} />
                              )}
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-slate-900">{editSignerNameAr}</p>
                              <p className="text-slate-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {editSignerTitleAr}
                              </p>
                              {selectedLetter?.signatureImageUrl && (
                                <img
                                  src={selectedLetter.signatureImageUrl}
                                  alt="signature"
                                  className="mt-3 h-12 max-w-[160px] object-contain"
                                  onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="col-span-12 lg:col-span-4 space-y-6">
                {/* Metadata */}
                <section className={`glass-card p-6 rounded-2xl`}>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                    {t('letters.metadata')}
                  </h4>
                  <div className="space-y-4">
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('common.category')}</span>
                      <span className="text-xs font-bold text-slate-900">
                        {selectedLetter ? getTypeLabel(selectedLetter.type) : ''}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('letters.authorityField')}</span>
                      {selectedLetter && renderAuthorityBadge(selectedLetter.authority, { showFull: true })}
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('letters.recipientDept')}</span>
                      {editingMeta === 'samaDepartment' && selectedLetter ? (
                        <div className="min-w-[180px]">
                          <EditableSelect
                            locked
                            items={getAuthorityDepartments(selectedLetter.authority).map((d) => ({
                              id: d.id,
                              label: d.en,
                              labelAr: d.ar,
                            }))}
                            value={editDepartment}
                            onChange={(id) => {
                              setEditDepartment(id)
                              saveField({ samaDepartment: id as import('@/types').SAMADepartment })
                              setEditingMeta(null)
                            }}
                            isRTL={isRTL}
                            size="sm"
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => setEditingMeta('samaDepartment')}
                          className="text-xs font-bold text-slate-900 cursor-pointer hover:text-emerald-600 transition-colors group/dept flex items-center gap-1 break-words max-w-[180px]"
                          title={
                            selectedLetter
                              ? (getDepartmentLabel(selectedLetter.authority, editDepartment, isRTL ? 'ar' : 'en') || '—')
                              : 'Click to edit'
                          }
                        >
                          {selectedLetter
                            ? (getDepartmentLabel(selectedLetter.authority, editDepartment, isRTL ? 'ar' : 'en') || '—')
                            : ''}
                          <Icon icon="lucide:pencil" className="text-[9px] text-slate-300 group-hover/dept:text-emerald-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('letters.createdBy')}</span>
                      <div className={`flex items-center gap-2`}>
                        <img
                          src={dicebearAvatar('Felix')}
                          className="w-5 h-5 rounded-full"
                          alt="Felix"
                        />
                        <span className="text-xs font-bold text-slate-900">
                          {selectedLetter?.createdBy}
                        </span>
                      </div>
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('calendar.assignedTo')}</span>
                      {editingMeta === 'assignedTo' ? (
                        <div className="min-w-[200px]">
                          <EditableSelect
                            locked
                            autoOpen
                            items={teamMembers
                              .filter((m) => m.status === 'active')
                              .map((m) => ({
                                // L6 (W28.1): use UUID as id so PATCH sends a valid UUID
                                // (assigned_to column is uuid FK → profiles). Display name
                                // is the label; resolved back to name on read from teamMembers.
                                id: m.id,
                                label: `${m.name} — ${m.department}`,
                              }))}
                            value={editAssignedTo}
                            onChange={(memberId) => {
                              setEditAssignedTo(memberId)
                              saveField({ assignedTo: memberId || undefined })
                              setEditingMeta(null)
                            }}
                            placeholder={t('common.select')}
                            isRTL={isRTL}
                            size="sm"
                          />
                        </div>
                      ) : (
                        <span
                          onClick={() => setEditingMeta('assignedTo')}
                          className="text-xs font-bold text-emerald-600 cursor-pointer hover:text-emerald-700 transition-colors group/name flex items-center gap-1"
                          title="Click to edit"
                        >
                          {selectedLetter?.assignedTo
                            // L6: assignedTo stores a UUID; resolve to display name via teamMembers.
                            // Fall back to the raw value (name-string legacy rows) if no UUID match.
                            ? (teamMembers.find((m) => m.id === selectedLetter.assignedTo)?.name ?? selectedLetter.assignedTo)
                            : <span className="text-slate-300 font-normal italic">{t('letters.unassigned')}</span>}
                          <Icon icon="lucide:pencil" className="text-[9px] text-slate-300 group-hover/name:text-emerald-400" />
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {/* W29-L2: Response note — shown once response has been received */}
                {selectedLetter?.status === 'response-received' && (
                  <section className="glass-card p-6 rounded-2xl">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                      {t('letters.responseSection' as Parameters<typeof t>[0]) || 'Response'}
                    </h4>
                    {selectedLetter.responseNote ? (
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {selectedLetter.responseNote}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        {t('letters.noResponseNote' as Parameters<typeof t>[0]) || 'No response note recorded.'}
                      </p>
                    )}
                    {selectedLetter.responseReceivedDate && (
                      <p className="text-[10px] text-slate-400 mt-2">
                        {formatDate(selectedLetter.responseReceivedDate)}
                      </p>
                    )}
                  </section>
                )}

                {/* Approval Chain — skeleton until full detail arrives */}
                {approvalChainPrefetch && (
                  <section className="glass-card p-6 rounded-2xl space-y-3" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </section>
                )}
                {selectedLetter &&
                  (selectedLetter.approvalChain.length > 0 ||
                    ['draft', 'rejected', 'pending-approval'].includes(selectedLetter.status)) && (
                  <section className={`glass-card p-6 rounded-2xl`}>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        {t('letters.approvalChain')}
                      </h4>
                      {/* W41: configure the chain (this letter / authority-wide). */}
                      <Gate perm="Approve SAMA Letters">
                        <button
                          onClick={() => setChainConfigOpen(true)}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          <Icon icon="lucide:settings-2" className="text-xs" />
                          {t('letters.configureChain')}
                        </button>
                      </Gate>
                    </div>
                    <div className="space-y-4">
                      {(() => {
                        const hasRejection = selectedLetter.approvalChain.some(s => s.status === 'rejected')
                        return selectedLetter.approvalChain.map((step) => {
                          // W41: chains carry free-text roles — translate the
                          // three legacy roles, render anything else verbatim.
                          const roleLabel = step.role === 'Compliance Officer'
                            ? t('letters.step1ComplianceOfficer')
                            : step.role === 'Department Head'
                            ? t('letters.step2DepartmentHead')
                            : step.role === 'CEO'
                            ? t('letters.step3CEO')
                            : step.role
                          const isFirstPending = selectedLetter.approvalChain.find(s => s.status === 'pending')?.step === step.step
                          // Downstream steps stay neutral when any rejection exists
                          const isActive = !hasRejection && step.status === 'pending' && isFirstPending
                          return (
                            <div key={step.step} className="space-y-2">
                              <div className={`flex items-center gap-3`}>
                                {step.status === 'approved' ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 border-2 border-emerald-500 flex items-center justify-center shrink-0">
                                    <Icon icon="lucide:check" className="text-emerald-600 text-xs" />
                                  </div>
                                ) : step.status === 'rejected' ? (
                                  <div className="w-6 h-6 rounded-full bg-rose-100 border-2 border-rose-500 flex items-center justify-center shrink-0">
                                    <Icon icon="lucide:x" className="text-rose-600 text-xs" />
                                  </div>
                                ) : isActive ? (
                                  <div className="w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center shrink-0">
                                    <Icon icon="lucide:clock" className="text-blue-600 text-xs animate-pulse" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-slate-300 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-900">{roleLabel}</p>
                                  {step.status === 'approved' && (
                                    <p className="text-[10px] text-emerald-600">{t('letters.stepApproved')} · {step.approvedAt ? formatTimelineDate(step.approvedAt, isRTL) : ''}</p>
                                  )}
                                  {step.status === 'rejected' && (
                                    <p className="text-[10px] text-rose-600">{t('letters.stepRejected')} · {step.rejectedAt ? formatTimelineDate(step.rejectedAt, isRTL) : ''}</p>
                                  )}
                                  {step.status === 'pending' && (
                                    <p className="text-[10px] text-slate-400">
                                      {isActive ? t('letters.stepAwaitingApproval') : t('letters.stepPending')}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {isActive && selectedLetter.status === 'pending-approval' && (
                                <ApprovalStepActions
                                  letterId={selectedLetter.id}
                                  step={step.step as 1 | 2 | 3}
                                  approverName={currentUser}
                                />
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </section>
                )}

                {/* Placeholders — only on drafts */}
                {isDraft && selectedLetter && (
                  <section className="glass-card p-6 rounded-2xl">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                      {t('letterChips.configurePlaceholders')}
                    </h4>
                    <p className="text-[10px] text-slate-400 mb-3">
                      {t('letterChips.configureHint')}
                    </p>
                    {(() => {
                      const completion = placeholderValuesComplete(editPlaceholderDefs, editPlaceholderValues)
                      if (editPlaceholderDefs.length === 0) {
                        return (
                          <p className="text-[11px] italic text-slate-400 px-2 py-3">
                            {t('letterChips.noPlaceholders')}
                          </p>
                        )
                      }
                      return (
                        <>
                          <div className={cn(
                            'mb-3 px-3 py-2 rounded-lg border flex items-center gap-2 text-[11px] font-medium',
                            completion.complete
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                              : 'bg-amber-50/60 border-amber-200 text-amber-800',
                          )}>
                            <Icon icon={completion.complete ? 'lucide:check-circle-2' : 'lucide:alert-circle'} />
                            <span>
                              {completion.complete
                                ? t('letters.placeholdersAllFilled')
                                : t('letters.placeholdersPending').replace('{count}', String(completion.missing.length))}
                            </span>
                          </div>
                          <PlaceholderDefEditor
                            defs={editPlaceholderDefs}
                            bodyEn={`${editBody}\n${editBodyAr}`}
                            subjectEn={`${editSubject}\n${editSubjectAr}`}
                            onChange={(next) => {
                              setEditPlaceholderDefs(next)
                              if (selectedLetter) store.update(selectedLetter.id, { placeholderDefs: next })
                            }}
                          />
                        </>
                      )
                    })()}
                  </section>
                )}

                {/* Attachments */}
                <section className={`glass-card p-6 rounded-2xl`}>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                    {t('letters.attachments')} ({selectedLetter?.attachments?.length || 0})
                  </h4>
                  <div className="space-y-3">
                    {attachmentsPrefetch && (
                      <div data-skeleton="true" role="status" aria-busy="true" aria-live="polite" className="space-y-3">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    )}
                    {selectedLetter && !attachmentsPrefetch && (selectedLetter.attachments?.length ?? 0) === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">
                        {t('letters.noAttachments' as Parameters<typeof t>[0])}
                      </p>
                    )}
                    {selectedLetter?.attachments?.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-white hover:shadow-sm transition-all"
                      >
                        <div
                          className={`w-8 h-8 ${attachment.type === 'application/pdf' || attachment.type === 'pdf' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'} flex items-center justify-center rounded-lg`}
                        >
                          <Icon icon="lucide:file-text" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-900 truncate">
                            {attachment.name}
                          </p>
                          <p className="text-[9px] text-slate-400">{formatBytes(attachment.size)}</p>
                        </div>
                        <Icon
                          icon="lucide:download"
                          className="text-slate-300 group-hover:text-slate-600"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            // W40: persist the removal — the old local-only
                            // store.update left the DB row + storage object
                            // behind, so the attachment came back on reload.
                            void store.removeAttachment(selectedLetter!.id, attachment.id)
                          }}
                          className="text-slate-300 hover:text-rose-500 transition-colors cursor-pointer ml-auto"
                        >
                          <Icon icon="lucide:x" className="text-xs" />
                        </button>
                      </div>
                    ))}
                    <input ref={attachFileRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
                    <button
                      onClick={() => attachFileRef.current?.click()}
                      disabled={attachBusy}
                      aria-busy={attachBusy || undefined}
                      className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5">
                      {attachBusy && <Icon icon="lucide:loader-2" className="animate-spin text-[11px]" />}
                      {t('letters.addAttachment')}
                    </button>
                  </div>
                </section>

                {/* Activity Timeline \u2014 newest first; skeleton until detail loads */}
                <section className={`glass-card p-6 rounded-2xl`}>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
                    {t('letters.activityTimeline')}
                  </h4>
                  {timelinePrefetch ? (
                    <div className="space-y-4" data-skeleton="true" role="status" aria-busy="true" aria-live="polite">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : (selectedLetter?.timeline?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      {t('letters.noActivityYet' as Parameters<typeof t>[0]) || 'No activity yet.'}
                    </p>
                  ) : (
                    <>
                    <div className="space-y-6 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                      {/* L2: server returns timeline newest-first (date DESC); no reverse needed. */}
                      {(selectedLetter?.timeline ?? []).slice(0, timelineVisible).map((event) => (
                        <div key={event.id} className="relative pl-8">
                          <div
                            className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 ${
                              event.status === 'completed'
                                ? 'bg-emerald-100 border-emerald-500'
                                : event.status === 'active'
                                  ? 'bg-blue-100 border-blue-500'
                                  : 'bg-slate-100 border-slate-300'
                            }`}
                          />
                          <p className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'}`}>
                            {translateTimelineTitle(event.title, t as (key: string) => string)}
                          </p>
                          <p className={`text-[10px] ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-400'}`}>
                            {event.date ? formatTimelineDate(event.date, isRTL) : ''}
                            {` \u2022 ${event.user ?? 'Unknown user'}`}
                          </p>
                        </div>
                      ))}
                    </div>
                    {(selectedLetter?.timeline?.length ?? 0) > timelineVisible && (
                      <button
                        onClick={() => setTimelineVisible((n) => n + TIMELINE_PAGE_SIZE)}
                        className="w-full mt-4 py-2 text-[10px] font-bold text-slate-400 hover:text-emerald-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        {t('letters.loadMore' as Parameters<typeof t>[0])}
                        {' '}({(selectedLetter?.timeline?.length ?? 0) - timelineVisible})
                      </button>
                    )}
                    </>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Letter Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); setCreateFromTemplate(null) }}
        size="xl"
      >
        <CreateLetterForm
          selectedType={selectedLetterType}
          onTypeChange={setSelectedLetterType}
          onClose={() => { setIsCreateModalOpen(false); setCreateFromTemplate(null) }}
          onSuccess={(mode) => {
            setIsCreateModalOpen(false)
            setCreateFromTemplate(null)
            // AC29 (W34-QA): the draft-save path and the submit-for-approval path
            // share this callback — branch the toast so a draft doesn't claim it
            // was "submitted for approval".
            showToast(mode === 'draft' ? t('letters.draftSaved') : t('letters.letterSubmittedForApproval'))
          }}
          template={createFromTemplate ?? undefined}
        />
      </Modal>

      {/* View Template Modal */}
      <Modal
        isOpen={isViewTemplateModalOpen}
        onClose={() => {
          setIsViewTemplateModalOpen(false)
          setSelectedTemplate(null)
        }}
        size="md"
      >
        {selectedTemplate && (
          <div className="p-8">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  selectedTemplate.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                  selectedTemplate.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                  selectedTemplate.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                  'bg-rose-50 text-rose-600'
                }`}>
                  <Icon icon={selectedTemplate.icon} className="text-2xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-display">{getTranslatedTemplateName(selectedTemplate.id, selectedTemplate.name)}</h2>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(selectedTemplate.type)}`}>
                    {selectedTemplate.type === 'non-objection' ? t('letters.nonObjection') :
                     selectedTemplate.type === 'inquiry' ? t('letters.inquiry') :
                     selectedTemplate.type === 'submission' ? t('letters.submission') :
                     t('letters.notification')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsViewTemplateModalOpen(false)
                  setSelectedTemplate(null)
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Icon icon="lucide:x" className="text-2xl text-slate-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('common.description')}
                </label>
                <p className="text-sm text-slate-600">{getTranslatedTemplateDescription(selectedTemplate.id, selectedTemplate.description)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('common.status')}
                  </label>
                  <span className={`flex items-center gap-1.5 text-sm font-bold ${
                    selectedTemplate.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedTemplate.status === 'Active' ? 'bg-emerald-600' : 'bg-amber-600'
                    }`} />
                    {selectedTemplate.status === 'Active' ? t('common.active') : t('common.draft')}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('letters.usageCount')}
                  </label>
                  <span className="text-sm font-bold text-slate-900">{selectedTemplate.usageCount} {t('letters.timesUsed')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('letters.createdDate')}
                  </label>
                  <span className="text-sm text-slate-600">{selectedTemplate.createdDate}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('letters.lastModified')}
                  </label>
                  <span className="text-sm text-slate-600">{selectedTemplate.lastModified}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setIsViewTemplateModalOpen(false)
                  setSelectedTemplate(null)
                }}
                className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {t('common.close')}
              </button>
              {selectedTemplate && (
                <EntityGate action="create" entity="letter">
                  <button
                    onClick={() => {
                      setIsViewTemplateModalOpen(false)
                      handleUseTemplate(selectedTemplate)
                    }}
                    className={`px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 flex items-center gap-2 cursor-pointer`}
                  >
                    <Icon icon="lucide:arrow-right-circle" />
                    {t('letters.useTemplate')}
                  </button>
                </EntityGate>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit/Create Template Modal */}
      <Modal
        isOpen={isEditTemplateModalOpen}
        onClose={() => {
          setIsEditTemplateModalOpen(false)
          setSelectedTemplate(null)
        }}
        size="xl"
      >
        <TemplateEditForm
          template={selectedTemplate}
          onClose={() => {
            setIsEditTemplateModalOpen(false)
            setSelectedTemplate(null)
          }}
          onSave={handleSaveTemplate}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false)
          setSelectedTemplate(null)
        }}
        size="sm"
      >
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
              <Icon icon="lucide:alert-triangle" className="text-3xl text-rose-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">{t('letters.deleteTemplate')}</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {t('letters.deleteTemplateConfirm')} <strong>{selectedTemplate?.name}</strong>? {t('letters.actionCannotBeUndone')}
          </p>
          <div className={`flex gap-3`}>
            <button
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                setSelectedTemplate(null)
              }}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeletingTemplate}
              className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {isDeletingTemplate && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {t('letters.deleteTemplate')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Action Dropdown Portal */}
      {openMenuId && menuPosition && (() => {
        const letter = store.letters.find(l => l.id === openMenuId)
        if (!letter) return null
        const dropdownApproxHeight = 180
        const flipUp = menuPosition.y + dropdownApproxHeight > window.innerHeight
        return createPortal(
          <div
            style={{
              position: 'fixed',
              right: `${window.innerWidth - menuPosition.x}px`,
              ...(flipUp
                ? { bottom: `${window.innerHeight - menuPosition.buttonTop + 4}px` }
                : { top: `${menuPosition.y + 4}px` }),
              zIndex: 9999,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px]"
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            <button onClick={() => { handleViewLetter(letter); setOpenMenuId(null); setMenuPosition(null) }}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
              <Icon icon="lucide:eye" className="text-slate-400" /> {t('common.view')}
            </button>
            {(letter.status === 'draft' || letter.status === 'rejected') && (
              <button
                disabled={isMutating}
                onClick={async () => {
                  setOpenMenuId(null); setMenuPosition(null)
                  await store.submitForApproval(letter.id)
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer disabled:opacity-50">
                <Icon icon="lucide:send" className="text-slate-400" />{' '}
                {letter.status === 'rejected' ? t('letters.resubmitForApproval') : t('letters.submitForApproval')}
              </button>
            )}
            {letter.status === 'approved' && (
              <button onClick={(e) => { e.stopPropagation(); handleViewLetter(letter); setPendingSend(true); setOpenMenuId(null); setMenuPosition(null) }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                <Icon icon="lucide:send" className="text-emerald-500" /> {t('letters.send')}
              </button>
            )}
            {(letter.status === 'sent' || letter.status === 'overdue') && (
              <button
                disabled={isMutating}
                onClick={async () => {
                  setOpenMenuId(null); setMenuPosition(null)
                  await store.markResponseReceived(letter.id)
                }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer disabled:opacity-50">
                <Icon icon="lucide:check-circle" className="text-emerald-500" /> {t('letters.markResponseReceived')}
              </button>
            )}
            <div className="border-t border-slate-100 my-1" />
            <EntityGate action="delete" entity="letter">
              <button onClick={(e) => {
                e.stopPropagation()
                setOpenMenuId(null)
                setMenuPosition(null)
                setConfirmDeleteLetterId(letter.id)
              }}
                className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer">
                <Icon icon="lucide:trash-2" /> {t('letters.delete' as Parameters<typeof t>[0])}
              </button>
            </EntityGate>
          </div>,
          document.body
        )
      })()}

      {/* W41: configurable approval chain — per-letter or per-authority. */}
      {selectedLetter && (
        <ApprovalChainConfigModal
          isOpen={chainConfigOpen}
          onClose={() => setChainConfigOpen(false)}
          letterId={selectedLetter.id}
          letterStatus={selectedLetter.status}
          authority={selectedLetter.authority}
          currentSteps={selectedLetter.approvalChain}
          onApplied={() => {
            store.fetchById(selectedLetter.id)
            showToast(t('letters.chainSaved'))
          }}
        />
      )}

      {/* W29-L2: Mark Response Received — optional note modal */}
      <Modal
        isOpen={responseNoteModalLetterId !== null}
        onClose={() => { if (!responseBusy) { setResponseNoteModalLetterId(null); setResponseNoteText('') } }}
        size="sm"
      >
        <div className="p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            {t('letters.markResponseReceived')}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {t('letters.responseNoteOptional' as Parameters<typeof t>[0]) || 'Optionally add a note about the response received.'}
          </p>
          <textarea
            value={responseNoteText}
            onChange={(e) => setResponseNoteText(e.target.value)}
            placeholder={t('letters.responseNotePlaceholder' as Parameters<typeof t>[0]) || 'e.g. Acknowledged by SAMA via email on 28 May 2026'}
            rows={4}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={() => { setResponseNoteModalLetterId(null); setResponseNoteText('') }}
              disabled={responseBusy}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={async () => {
                if (!responseNoteModalLetterId) return
                const id = responseNoteModalLetterId
                setResponseBusy(true)
                try {
                  await store.markResponseReceived(id, responseNoteText.trim() || null)
                  setResponseNoteModalLetterId(null)
                  setResponseNoteText('')
                  showToast(t('letters.responseReceivedSuccess' as Parameters<typeof t>[0]) || 'Response marked as received.')
                } finally {
                  setResponseBusy(false)
                }
              }}
              disabled={responseBusy}
              aria-busy={responseBusy || undefined}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {responseBusy && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Strong Delete Letter Confirm — phrased to match circular/policy parity */}
      <Modal
        isOpen={confirmDeleteLetterId !== null}
        onClose={() => { if (!deleteBusy) setConfirmDeleteLetterId(null) }}
        size="sm"
      >
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
              <Icon icon="lucide:alert-triangle" className="text-3xl text-rose-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
            {t('letters.deleteLetter' as Parameters<typeof t>[0])}
          </h2>
          <p className="text-sm text-slate-500 text-center mb-6 leading-relaxed">
            This will permanently delete the letter and all its attachments, approval workflow steps, and activity. This cannot be undone.
          </p>
          <div className={`flex gap-3`}>
            <button
              onClick={() => setConfirmDeleteLetterId(null)}
              disabled={deleteBusy}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={async () => {
                if (!confirmDeleteLetterId) return
                const id = confirmDeleteLetterId
                const isViewing = selectedLetter?.id === id
                setDeleteBusy(true)
                try {
                  await store.delete(id)
                  setConfirmDeleteLetterId(null)
                  if (isViewing) handleBackToDashboard()
                } finally {
                  setDeleteBusy(false)
                }
              }}
              disabled={deleteBusy}
              aria-busy={deleteBusy || undefined}
              className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {deleteBusy && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {t('letters.deleteLetter' as Parameters<typeof t>[0])}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
