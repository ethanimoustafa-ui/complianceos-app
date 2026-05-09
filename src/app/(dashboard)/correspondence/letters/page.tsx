'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useAuthStore } from '@/stores/auth-store'
import type { SAMALetter, SAMALetterType, SAMALetterStatus, Attachment, LetterTemplate, TemplateStatus, CircularAuthority } from '@/types'
import { useSAMATemplateStore } from '@/stores/sama-template-store'
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
import { useSAMALetterTypeStore } from '@/stores/sama-letter-type-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { PlaceholderDefEditor } from '@/components/correspondence/sama-letters/PlaceholderDefEditor'
import { InlineChipEditor } from '@/components/correspondence/sama-letters/InlineChipEditor'
import {
  placeholderValuesComplete,
  autoPromoteTypedTokens,
} from '@/lib/letter-placeholders'
import type { PlaceholderDef, PlaceholderValue } from '@/types'
import {
  Toast,
  LetterSortHeader,
  translateTimelineTitle,
  StatCard,
  TemplateCard,
  CreateLetterForm,
  ApprovalStepActions,
  TemplateEditForm,
  getEmailSubjectFor,
  buildLetterEmailBody,
  getRecipientDefaults,
  templateTypeCards,
} from '@/components/correspondence/letters'
import type { LetterSortCol, LetterSortState } from '@/components/correspondence/letters'

export default function SAMALettersPage() {
  const { t, isRTL } = useTranslation()
  const searchParams = useSearchParams()
  const store = useSAMALetterStore()
  const templateStore = useSAMATemplateStore()
  const letterTypeStore = useSAMALetterTypeStore()
  const { user } = useAuthStore()
  const currentUser = user?.name || 'Current User'
  const teamMembers = useTeamStore(s => s.members)
  const storeFrameworks = useFrameworkConfigStore(s => s.frameworks)
  const selectedLetter = store.selectedLetter
  const letterContentRef = useRef<HTMLDivElement>(null)

  // Helper to get translated template name and description based on template ID
  const getTranslatedTemplateName = useCallback((templateId: string, originalName: string) => {
    const nameMap: Record<string, string> = {
      'tmpl-001': t('samaLetters.templateKeyFunctionAppointment'),
      'tmpl-002': t('samaLetters.templateProductLaunchRequest'),
      'tmpl-003': t('samaLetters.templateCircularClarification'),
      'tmpl-004': t('samaLetters.templateRegulatoryInterpretation'),
      'tmpl-005': t('samaLetters.templateQuarterlyAmlReport'),
      'tmpl-006': t('samaLetters.templateAnnualComplianceReport'),
      'tmpl-007': t('samaLetters.templateIncidentNotification'),
      'tmpl-008': t('samaLetters.templateSystemOutageReport'),
    }
    return nameMap[templateId] || originalName
  }, [t])

  const getTranslatedTemplateDescription = useCallback((templateId: string, originalDescription: string) => {
    const descMap: Record<string, string> = {
      'tmpl-001': t('samaLetters.templateKeyFunctionDesc'),
      'tmpl-002': t('samaLetters.templateProductLaunchDesc'),
      'tmpl-003': t('samaLetters.templateCircularClarificationDesc'),
      'tmpl-004': t('samaLetters.templateRegulatoryInterpretationDesc'),
      'tmpl-005': t('samaLetters.templateQuarterlyAmlDesc'),
      'tmpl-006': t('samaLetters.templateAnnualComplianceDesc'),
      'tmpl-007': t('samaLetters.templateIncidentNotificationDesc'),
      'tmpl-008': t('samaLetters.templateSystemOutageDesc'),
    }
    return descMap[templateId] || originalDescription
  }, [t])

  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedLetterType, setSelectedLetterType] = useState<SAMALetterType>('non-objection')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [language, setLanguage] = useState<'en' | 'ar'>(isRTL ? 'ar' : 'en')
  const [pendingSend, setPendingSend] = useState(false)

  // Template Management State
  const [isTemplateManagementOpen, setIsTemplateManagementOpen] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateTypeFilter, setTemplateTypeFilter] = useState<SAMALetterType | 'All'>('All')
  const [templateStatusFilter, setTemplateStatusFilter] = useState<TemplateStatus | 'All'>('All')

  // Template Actions State (templates sourced from persistent store)
  const [createFromTemplate, setCreateFromTemplate] = useState<LetterTemplate | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate | null>(null)
  const [isViewTemplateModalOpen, setIsViewTemplateModalOpen] = useState(false)
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

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
    const statusOrder: Record<SAMALetterStatus, number> = {
      draft: 0, 'pending-approval': 1, approved: 2, sent: 3, 'response-received': 4, overdue: 5,
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
  // both; on field-level save we persist defs back to the SAMALetter.
  const [editPlaceholderDefs, setEditPlaceholderDefs] = useState<PlaceholderDef[]>([])
  const [editPlaceholderValues, setEditPlaceholderValues] = useState<Record<string, PlaceholderValue | undefined>>({})

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

  const isDraft = selectedLetter?.status === 'draft'
  const saveField = (patch: Partial<SAMALetter>) => {
    if (selectedLetter) store.update(selectedLetter.id, patch)
  }

  // Body/subject save path used by InlineChipEditor — also runs the
  // auto-promote pass so any newly-typed `{{token}}` becomes a real
  // placeholder def stored on the letter.
  const saveDraftBody = (patch: Partial<Pick<SAMALetter, 'subject' | 'subjectAr' | 'body' | 'bodyAr'>>) => {
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
    setEditPlaceholderDefs(nextDefs)
    store.update(selectedLetter.id, { ...patch, placeholderDefs: nextDefs })
  }

  const updateDraftPlaceholderValue = (key: string, v: PlaceholderValue | undefined) => {
    if (!selectedLetter) return
    const next = { ...editPlaceholderValues, [key]: v }
    setEditPlaceholderValues(next)
    store.update(selectedLetter.id, { placeholderValues: next })
  }

  // Attachment upload
  const attachFileRef = useRef<HTMLInputElement>(null)

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !selectedLetter) return
    const newAttachments: Attachment[] = Array.from(files).map(f => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || 'application/octet-stream',
      size: f.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user?.name || 'Unknown',
    }))
    store.update(selectedLetter.id, {
      attachments: [...selectedLetter.attachments, ...newAttachments],
    })
    e.target.value = ''
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

  const handleDuplicateTemplate = (template: LetterTemplate) => {
    templateStore.create({ ...template, name: `${template.name} (Copy)`, status: 'Draft' })
    showToast('Template duplicated successfully')
  }

  const handleDeleteTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      templateStore.delete(selectedTemplate.id)
      showToast('Template deleted successfully')
      setIsDeleteConfirmOpen(false)
      setSelectedTemplate(null)
    }
  }

  const handleCreateTemplate = () => {
    setSelectedTemplate(null)
    setIsEditTemplateModalOpen(true)
  }

  const handleSaveTemplate = (templateData: Partial<LetterTemplate>) => {
    const typeColors: Record<string, string> = {
      'non-objection': 'emerald', inquiry: 'blue', submission: 'amber', notification: 'rose',
    }
    const typeIcons: Record<string, string> = {
      'non-objection': 'lucide:user-check', inquiry: 'lucide:help-circle', submission: 'lucide:file-up', notification: 'lucide:alert-triangle',
    }
    if (selectedTemplate) {
      templateStore.update(selectedTemplate.id, templateData)
      showToast('Template updated successfully')
    } else {
      const resolvedType = templateData.type || 'non-objection'
      templateStore.create({
        name: templateData.name || 'Untitled Template',
        type: resolvedType,
        icon: typeIcons[resolvedType] ?? 'lucide:mail',
        color: typeColors[resolvedType] ?? 'slate',
        description: templateData.description || '',
        status: templateData.status || 'Draft',
        ...templateData,
      })
      showToast('Template created successfully')
    }
    setIsEditTemplateModalOpen(false)
    setSelectedTemplate(null)
  }

  const handleUseTemplate = (template: LetterTemplate) => {
    setCreateFromTemplate(template)
    setSelectedLetterType(template.type)
    setIsCreateModalOpen(true)
  }

  const handleViewLetter = (letter: SAMALetter) => {
    store.setSelected(letter)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Deep-link: auto-switch to detail view when ?id= is present
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    const letter = store.letters.find(l => l.id === id)
    if (letter) handleViewLetter(letter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, store.letters])

  const handleBackToDashboard = () => {
    setView('dashboard')
    store.setSelected(null)
  }

  const handleOpenCreateModal = (type: SAMALetterType = 'non-objection') => {
    setSelectedLetterType(type)
    setIsCreateModalOpen(true)
  }

  const handleDownloadPdf = useCallback(async () => {
    if (!letterContentRef.current || !selectedLetter) return
    const { default: html2canvas } = await import('html2canvas')
    const { default: jsPDF } = await import('jspdf')

    // Resolve oklch/lab/lch/color-p3 to plain rgb() via a 1×1 canvas.
    // Chrome 111+ serialises computed colors in their authored color space
    // (oklch), which html2canvas cannot parse. The canvas fillStyle API
    // accepts any valid CSS color and getImageData returns sRGB bytes.
    const toRgb = (color: string): string => {
      if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return color
      if (color.startsWith('rgb') || color.startsWith('#')) return color
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 1
        const ctx = c.getContext('2d')!
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        if (a === 0) return 'transparent'
        return a < 255 ? `rgba(${r},${g},${b},${(a / 255).toFixed(3)})` : `rgb(${r},${g},${b})`
      } catch { return color }
    }

    const COLOR_PROPS = [
      'color', 'backgroundColor',
      'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
      'outlineColor', 'textDecorationColor',
    ] as const

    // Pre-process original elements in the main document (correct layout context).
    // Stamping before clone means the clone inherits safe rgb() inline styles.
    const restore: Array<{ el: HTMLElement; prop: string; was: string }> = []
    letterContentRef.current.querySelectorAll<HTMLElement>('*').forEach(el => {
      const cs = window.getComputedStyle(el)
      for (const prop of COLOR_PROPS) {
        const rgb = toRgb(cs[prop as keyof typeof cs] as string)
        restore.push({ el, prop, was: (el.style as unknown as Record<string, string>)[prop] })
        ;(el.style as unknown as Record<string, string>)[prop] = rgb
      }
    })

    try {
      const canvas = await html2canvas(letterContentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (_clonedDoc) => {
          // CSS vars are no longer needed — inline rgb() styles carry all color info.
          _clonedDoc.querySelectorAll('style, link[rel="stylesheet"], [data-pdf-hide]').forEach(n => n.remove())
        },
      })
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, pdfH)
      pdf.save(`${selectedLetter.reference}-${language}.pdf`)
    } finally {
      // Always restore original inline styles so the live view is unchanged.
      restore.forEach(({ el, prop, was }) => {
        ;(el.style as unknown as Record<string, string>)[prop] = was
      })
    }

    // Bundle attachments into a zip alongside the PDF
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
        zip(fileEntries, (err, data) => {
          if (err) return
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
  }, [selectedLetter, language])

  // Pure mail helper — opens mailto and marks the letter sent. Safe to call without a PDF download
  // (e.g. from the summary table where the letter content DOM is not rendered).
  const openAuthorityMail = useCallback((letter: SAMALetter, lang: 'en' | 'ar') => {
    const toEmail = getDepartmentEmail(letter.authority, letter.samaDepartment) ?? ''
    const subjectText = getEmailSubjectFor(letter.type, lang)
    const letterSubj = lang === 'ar'
      ? (letter.subjectAr || letter.subject)
      : letter.subject
    const emailSubject = `${subjectText} — ${letter.reference}: ${letterSubj}`
    const emailBody = buildLetterEmailBody(letter.type, lang, letter.reference, letterSubj)
    const mailto = `mailto:${toEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    window.open(mailto, '_blank')
    store.send(letter.id)
    showToast(t('samaLetters.pdfDownloadedAttachToEmail'))
  }, [store, showToast, t])

  // Detail-view send: downloads PDF first, then opens mail using the letter's language toggle
  const handleSendToSama = useCallback(async () => {
    if (!selectedLetter) return
    await handleDownloadPdf()
    openAuthorityMail(selectedLetter, language)
  }, [selectedLetter, handleDownloadPdf, openAuthorityMail, language])

  // Auto-trigger send after navigating from table to detail view
  useEffect(() => {
    if (pendingSend && view === 'detail' && selectedLetter?.status === 'approved') {
      setPendingSend(false)
      handleSendToSama()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSend, view, selectedLetter?.id])

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return iso
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getTypeLabel = (type: SAMALetterType): string => {
    switch (type) {
      case 'non-objection': return t('samaLetters.nonObjection')
      case 'inquiry': return t('samaLetters.inquiry')
      case 'submission': return t('samaLetters.submission')
      case 'notification': return t('samaLetters.notification')
      default: {
        // Custom letter type — pull label from the editable type store.
        const item = letterTypeStore.types.find((tt) => tt.id === type)
        return item ? (isRTL && item.labelAr ? item.labelAr : item.label) : type
      }
    }
  }

  const getTypeBadgeColor = (type: SAMALetterType): string => {
    switch (type) {
      case 'non-objection': return 'bg-emerald-50 text-emerald-700'
      case 'inquiry': return 'bg-blue-50 text-blue-700'
      case 'submission': return 'bg-amber-50 text-amber-700'
      case 'notification': return 'bg-rose-50 text-rose-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const getStatusDisplay = (status: SAMALetter['status']) => {
    switch (status) {
      case 'sent': return { color: 'text-blue-600', dotColor: 'bg-blue-600' }
      case 'draft': return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'approved': return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'pending-approval': return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'response-received': return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'overdue': return { color: 'text-rose-600', dotColor: 'bg-rose-600' }
      default: return { color: 'text-slate-600', dotColor: 'bg-slate-600' }
    }
  }

  const getStatusLabel = (status: SAMALetter['status']): string => {
    switch (status) {
      case 'draft': return t('samaLetters.drafting')
      case 'pending-approval': return t('samaLetters.pendingApproval')
      case 'approved': return t('samaLetters.approvedForSending')
      case 'sent': return t('samaLetters.statusSentToAuthority')
      case 'response-received': return t('samaLetters.statusResponseReceived')
      case 'overdue': return t('samaLetters.statusOverdue')
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
            <h1 className="text-xl font-bold font-display text-slate-900">{t('samaLetters.pageTitleLetters')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('samaLetters.pageSubtitleLetters')}
            </p>
          </div>

          <div className="hidden lg:block h-8 w-px bg-slate-200 mx-2" />

          <div className="hidden lg:flex gap-2">
            <Link
              href="/correspondence/letters"
              className={`px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg transition-all border border-emerald-100 flex items-center gap-2`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('samaLetters.tabLetters')}
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

          <Gate perm="Approve SAMA Letters">
            <button
              onClick={() => handleOpenCreateModal()}
              className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
            >
              <Icon icon="lucide:plus" />
              {t('samaLetters.draftNewLetter')}
            </button>
          </Gate>
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
                  }}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <Icon icon={isRTL ? 'lucide:chevron-right' : 'lucide:chevron-left'} className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-display">{t('samaLetters.templateDatabank')}</h2>
                  <p className="text-sm text-slate-500">{t('samaLetters.manageOrganizeTemplates')}</p>
                </div>
              </div>
              <Gate perm="Manage Letter Templates">
                <button
                  onClick={handleCreateTemplate}
                  className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
                >
                  <Icon icon="lucide:plus" />
                  {t('samaLetters.createTemplate')}
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
                    placeholder={t('samaLetters.searchTemplates')}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none`}
                  />
                </div>

                {/* Type Filter — BUG-R3-05: bound to useSAMALetterTypeStore so
                    user-added types appear here. A synthetic "All" item is
                    prepended (isDefault so it can't be deleted/edited). */}
                <div className={`flex items-center gap-2`}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('common.type')}:</label>
                  <div className="min-w-[150px]">
                    <EditableSelect
                      value={templateTypeFilter}
                      onChange={(id) => setTemplateTypeFilter(id as SAMALetterType | 'All')}
                      items={[
                        { id: 'All', label: t('samaLetters.allTypes'), labelAr: t('samaLetters.allTypes'), isDefault: true },
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
                        { id: 'All', label: t('samaLetters.allStatus') },
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
                  <span className="font-bold text-slate-900">{filteredTemplates.length}</span> {t('samaLetters.templatesFound')}
                </div>
              </div>
            </div>

            {/* Templates Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                    <tr>
                      <th className={`px-6 py-4`}>{t('samaLetters.templateName')}</th>
                      <th className={`px-6 py-4`}>{t('common.type')}</th>
                      <th className={`px-6 py-4`}>{t('common.description')}</th>
                      <th className={`px-6 py-4`}>{t('common.status')}</th>
                      <th className={`px-6 py-4`}>{t('samaLetters.lastModified')}</th>
                      <th className="px-6 py-4 text-center">{t('samaLetters.usageCount')}</th>
                      <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTemplates.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                              <Icon icon="lucide:file-x" className="text-2xl text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500">{t('samaLetters.noTemplatesFound')}</p>
                            <button
                              onClick={() => {
                                setTemplateSearch('')
                                setTemplateTypeFilter('All')
                                setTemplateStatusFilter('All')
                              }}
                              className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                            >
                              {t('common.clearFilters')}
                            </button>
                          </div>
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
                              {template.type === 'non-objection' ? t('samaLetters.nonObjection') :
                               template.type === 'inquiry' ? t('samaLetters.inquiry') :
                               template.type === 'submission' ? t('samaLetters.submission') :
                               t('samaLetters.notification')}
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
                            <span className={`text-xs text-slate-400 ${isRTL ? 'mr-1' : 'ml-1'}`}>{t('samaLetters.uses')}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleUseTemplate(template)}
                                className="p-1.5 hover:bg-emerald-100 rounded text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                title={t('samaLetters.useTemplate')}
                              >
                                <Icon icon="lucide:arrow-right-circle" />
                              </button>
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
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="Duplicate"
                              >
                                <Icon icon="lucide:copy" />
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
        ) : view === 'dashboard' ? (
          <div>
            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <StatCard
                label={t('samaLetters.totalLettersYTD')}
                value={String(totalYTD)}
                subtext={t('samaLetters.fromPreviousYear')}
                subtextIcon="lucide:trending-up"
                subtextColor="emerald"
                borderColor="emerald"
                isRTL={isRTL}
              />
              <StatCard
                label={t('samaLetters.sentThisQuarter')}
                value={String(sentThisQ)}
                subtext={t('samaLetters.lastSent')}
                borderColor="blue"
                isRTL={isRTL}
              />
              <StatCard
                label={t('samaLetters.pendingDrafts')}
                value={String(pendingDrafts).padStart(2, '0')}
                subtext={t('samaLetters.dueThisWeek')}
                subtextIcon="lucide:clock"
                subtextColor="amber"
                borderColor="amber"
                isRTL={isRTL}
              />
              <StatCard
                label={t('samaLetters.overdueReplies')}
                value={String(overdueReplies).padStart(2, '0')}
                subtext={t('samaLetters.criticalEscalation')}
                subtextColor="rose"
                borderColor="rose"
                isRTL={isRTL}
              />
            </div>

            {/* Letter Templates */}
            <div className="mb-10">
              <div className={`flex items-baseline justify-between mb-6`}>
                <h2 className="text-lg font-bold font-display text-slate-900">{t('samaLetters.letterTemplates')}</h2>
                <Gate perm="Manage Letter Templates">
                  <button
                    onClick={() => setIsTemplateManagementOpen(true)}
                    className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                  >
                    {t('samaLetters.manageTemplates')} {isRTL ? '\u2190' : '\u2192'}
                  </button>
                </Gate>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {templateTypeCards.map((template) => {
                  const translatedDesc = template.type === 'non-objection' ? t('samaLetters.hiringKeyPositions') :
                                         template.type === 'inquiry' ? t('samaLetters.seekingClarification') :
                                         template.type === 'submission' ? t('samaLetters.filingPeriodicReports') :
                                         t('samaLetters.reportingOutages')
                  const translatedType = template.type === 'non-objection' ? t('samaLetters.nonObjection') :
                                         template.type === 'inquiry' ? t('samaLetters.inquiry') :
                                         template.type === 'submission' ? t('samaLetters.submission') :
                                         t('samaLetters.notification')
                  return (
                    <TemplateCard
                      key={template.type}
                      type={translatedType}
                      icon={template.icon}
                      color={template.color}
                      description={translatedDesc}
                      onClick={() => {
                        const defaultTemplate = templateStore.templates
                          .filter(tmpl => tmpl.type === template.type && tmpl.status === 'Active')
                          .sort((a, b) => b.usageCount - a.usageCount)[0]
                        if (defaultTemplate) {
                          handleUseTemplate(defaultTemplate)
                        } else {
                          handleOpenCreateModal(template.type)
                        }
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Recent Letters Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className={`px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/50`}>
                <h2 className="font-bold text-slate-900">{t('samaLetters.recentCorrespondence')}</h2>
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
                      placeholder={t('samaLetters.searchByNameRefAuthority')}
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
                      title={t('samaLetters.filtersTitle')}
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
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{t('samaLetters.filtersTitle')}</h3>
                          <button onClick={resetFilters} className="text-[10px] font-bold text-slate-400 hover:text-slate-700 cursor-pointer">
                            {t('samaLetters.filterReset')}
                          </button>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('samaLetters.filterByAuthority')}</p>
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
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('samaLetters.filterByDate')}</p>
                          <div className="space-y-1">
                            {([
                              ['any',  t('samaLetters.dateAnyTime')],
                              ['30d',  t('samaLetters.dateLast30Days')],
                              ['90d',  t('samaLetters.dateLast90Days')],
                              ['365d', t('samaLetters.dateLast365Days')],
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
              <div className="overflow-x-auto">
                <table className={`w-full`}>
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                    <tr>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('samaLetters.tableAuthority')} col="authority" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('samaLetters.reference')} col="reference" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('common.type')} col="type" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('samaLetters.subject')} col="subject" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('common.status')} col="status" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4`}><LetterSortHeader label={t('samaLetters.lastModified')} col="updatedAt" sort={sort} onSort={handleLetterSort} onClear={() => setSort(null)} /></th>
                      <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedLetters.map((letter) => {
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
                              className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(letter.type)}`}
                            >
                              {getTypeLabel(letter.type)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-600 font-medium truncate max-w-xs">
                              {letter.subject}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`flex items-center gap-1.5 text-xs font-bold ${statusDisplay.color}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dotColor}`} />
                              {getStatusLabel(letter.status)}
                            </span>
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
                  </tbody>
                </table>
              </div>
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
                {/* Print PDF — always available in detail view */}
                <button onClick={handleDownloadPdf} className={`px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer`}>
                  <Icon icon="lucide:printer" />
                  {t('samaLetters.printPdf')}
                </button>
                {/* Status-specific primary actions */}
                {selectedLetter?.status === 'draft' && (
                  <button
                    onClick={() => selectedLetter && store.submitForApproval(selectedLetter.id)}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
                  >
                    <Icon icon="lucide:send" />
                    {t('samaLetters.submitForApproval')}
                  </button>
                )}
                {selectedLetter?.status === 'approved' && (
                  <button
                    onClick={handleSendToSama}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
                  >
                    <Icon icon="lucide:send" />
                    {t('samaLetters.sendToSama')}
                  </button>
                )}
                {(selectedLetter?.status === 'sent' || selectedLetter?.status === 'overdue') && (
                  <button
                    onClick={() => selectedLetter && store.markResponseReceived(selectedLetter.id)}
                    className={`px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
                  >
                    <Icon icon="lucide:check-circle" />
                    {t('samaLetters.markResponseReceived')}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-8">
              {/* Letter Content */}
              <div className="col-span-12 lg:col-span-8">
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
                          <p className="text-slate-400 italic">{t('samaLetters.typeMessageHere')}</p>
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
                                  className="mt-3 h-10 max-w-[140px] object-contain opacity-60" />
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
                          <p className="text-slate-400 italic">{t('samaLetters.typeMessageHere')}</p>
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
                                  className="mt-3 h-10 max-w-[140px] object-contain opacity-60" />
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
                    {t('samaLetters.metadata')}
                  </h4>
                  <div className="space-y-4">
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('common.category')}</span>
                      <span className="text-xs font-bold text-slate-900">
                        {selectedLetter ? getTypeLabel(selectedLetter.type) : ''}
                      </span>
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('samaLetters.authorityField')}</span>
                      {selectedLetter && renderAuthorityBadge(selectedLetter.authority, { showFull: true })}
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('samaLetters.recipientDept')}</span>
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
                          className="text-xs font-bold text-slate-900 cursor-pointer hover:text-emerald-600 transition-colors group/dept flex items-center gap-1 truncate max-w-[180px]"
                          title="Click to edit"
                        >
                          {selectedLetter
                            ? (getDepartmentLabel(selectedLetter.authority, editDepartment, isRTL ? 'ar' : 'en') || t('departments.compliance'))
                            : ''}
                          <Icon icon="lucide:pencil" className="text-[9px] text-slate-300 group-hover/dept:text-emerald-400" />
                        </span>
                      )}
                    </div>
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500">{t('samaLetters.createdBy')}</span>
                      <div className={`flex items-center gap-2`}>
                        <img
                          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
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
                            items={teamMembers
                              .filter((m) => m.status === 'active')
                              .map((m) => ({
                                id: m.name,
                                label: `${m.name} — ${m.department}`,
                              }))}
                            value={editAssignedTo}
                            onChange={(id) => {
                              setEditAssignedTo(id)
                              saveField({ assignedTo: id })
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
                          {selectedLetter?.assignedTo || <span className="text-slate-300 font-normal italic">Unassigned</span>}
                          <Icon icon="lucide:pencil" className="text-[9px] text-slate-300 group-hover/name:text-emerald-400" />
                        </span>
                      )}
                    </div>
                  </div>
                </section>

                {/* Approval Chain */}
                {selectedLetter && selectedLetter.approvalChain.length > 0 && (
                  <section className={`glass-card p-6 rounded-2xl`}>
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                      {t('samaLetters.approvalChain')}
                    </h4>
                    <div className="space-y-4">
                      {(() => {
                        const hasRejection = selectedLetter.approvalChain.some(s => s.status === 'rejected')
                        return selectedLetter.approvalChain.map((step) => {
                          const roleLabel = step.role === 'Compliance Officer'
                            ? t('samaLetters.step1ComplianceOfficer')
                            : step.role === 'Department Head'
                            ? t('samaLetters.step2DepartmentHead')
                            : t('samaLetters.step3CEO')
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
                                    <p className="text-[10px] text-emerald-600">{t('samaLetters.stepApproved')} · {step.approvedAt}</p>
                                  )}
                                  {step.status === 'rejected' && (
                                    <p className="text-[10px] text-rose-600">{t('samaLetters.stepRejected')} · {step.rejectedAt}</p>
                                  )}
                                  {step.status === 'pending' && (
                                    <p className="text-[10px] text-slate-400">
                                      {isActive ? t('samaLetters.stepAwaitingApproval') : t('samaLetters.stepPending')}
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
                                ? t('samaLetters.placeholdersAllFilled')
                                : t('samaLetters.placeholdersPending').replace('{count}', String(completion.missing.length))}
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
                    {t('samaLetters.attachments')} ({selectedLetter?.attachments?.length || 0})
                  </h4>
                  <div className="space-y-3">
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
                          onClick={(e) => { e.stopPropagation(); store.update(selectedLetter!.id, { attachments: selectedLetter!.attachments.filter(a => a.id !== attachment.id) }) }}
                          className="text-slate-300 hover:text-rose-500 transition-colors cursor-pointer ml-auto"
                        >
                          <Icon icon="lucide:x" className="text-xs" />
                        </button>
                      </div>
                    ))}
                    <input ref={attachFileRef} type="file" multiple className="hidden" onChange={handleAttachFile} />
                    <button
                      onClick={() => attachFileRef.current?.click()}
                      className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer">
                      {t('samaLetters.addAttachment')}
                    </button>
                  </div>
                </section>

                {/* Activity Timeline */}
                <section className={`glass-card p-6 rounded-2xl`}>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
                    {t('samaLetters.activityTimeline')}
                  </h4>
                  <div className="space-y-6 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                    {selectedLetter?.timeline?.map((event) => (
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
                          {event.date}{event.user && ` \u2022 ${event.user}`}
                        </p>
                      </div>
                    ))}
                  </div>
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
          onSuccess={() => {
            setIsCreateModalOpen(false)
            setCreateFromTemplate(null)
            showToast(t('samaLetters.letterSubmittedForApproval'))
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
                    {selectedTemplate.type === 'non-objection' ? t('samaLetters.nonObjection') :
                     selectedTemplate.type === 'inquiry' ? t('samaLetters.inquiry') :
                     selectedTemplate.type === 'submission' ? t('samaLetters.submission') :
                     t('samaLetters.notification')}
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
                    {t('samaLetters.usageCount')}
                  </label>
                  <span className="text-sm font-bold text-slate-900">{selectedTemplate.usageCount} {t('samaLetters.timesUsed')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('samaLetters.createdDate')}
                  </label>
                  <span className="text-sm text-slate-600">{selectedTemplate.createdDate}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    {t('samaLetters.lastModified')}
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
                <button
                  onClick={() => {
                    setIsViewTemplateModalOpen(false)
                    handleUseTemplate(selectedTemplate)
                  }}
                  className={`px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 flex items-center gap-2 cursor-pointer`}
                >
                  <Icon icon="lucide:arrow-right-circle" />
                  {t('samaLetters.useTemplate')}
                </button>
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
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">{t('samaLetters.deleteTemplate')}</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {t('samaLetters.deleteTemplateConfirm')} <strong>{selectedTemplate?.name}</strong>? {t('samaLetters.actionCannotBeUndone')}
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
              className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors cursor-pointer"
            >
              {t('samaLetters.deleteTemplate')}
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
              <Icon icon="lucide:eye" className="text-slate-400" /> View
            </button>
            {letter.status === 'draft' && (
              <button onClick={() => { store.submitForApproval(letter.id); setOpenMenuId(null); setMenuPosition(null) }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                <Icon icon="lucide:send" className="text-slate-400" /> {t('samaLetters.submitForApproval')}
              </button>
            )}
            {letter.status === 'approved' && (
              <button onClick={(e) => { e.stopPropagation(); handleViewLetter(letter); setPendingSend(true); setOpenMenuId(null); setMenuPosition(null) }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                <Icon icon="lucide:send" className="text-emerald-500" /> {t('samaLetters.sendToSama')}
              </button>
            )}
            {(letter.status === 'sent' || letter.status === 'overdue') && (
              <button onClick={() => { store.markResponseReceived(letter.id); setOpenMenuId(null); setMenuPosition(null) }}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                <Icon icon="lucide:check-circle" className="text-emerald-500" /> {t('samaLetters.markResponseReceived')}
              </button>
            )}
            <div className="border-t border-slate-100 my-1" />
            <button onClick={(e) => {
              e.stopPropagation()
              const isViewing = selectedLetter?.id === letter.id
              store.delete(letter.id)
              setOpenMenuId(null)
              setMenuPosition(null)
              if (isViewing) handleBackToDashboard()
            }}
              className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer">
              <Icon icon="lucide:trash-2" /> Delete
            </button>
          </div>,
          document.body
        )
      })()}

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
