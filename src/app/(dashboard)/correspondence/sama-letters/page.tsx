'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useAuthStore } from '@/stores/auth-store'
import type { SAMALetter, SAMALetterType, SAMALetterStatus, SAMALetterApprovalStep, Attachment, LetterTemplate, TemplateStatus, CircularAuthority } from '@/types'
import { useSAMATemplateStore } from '@/stores/sama-template-store'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { resolveAuthorityCode, resolveAuthorityLabel } from '@/lib/authority-display'
import {
  LETTER_AUTHORITIES,
  getAuthorityFullName,
  getAuthorityColors,
  getAuthorityDepartments,
  getAuthorityRecipientDefaults,
  getDepartmentLabel,
  getDepartmentEmail,
  getDefaultDepartmentId,
} from '@/lib/letter-authority'

// Sort types
type LetterSortCol = 'authority' | 'reference' | 'type' | 'subject' | 'status' | 'updatedAt'
type LetterSortState = { col: LetterSortCol; dir: 'asc' | 'desc' } | null

// Email subject templates per letter type and language (authority-agnostic)
const LETTER_EMAIL_SUBJECTS: Record<SAMALetterType, { en: string; ar: string }> = {
  'non-objection': { en: 'Non-Objection Request',    ar: 'طلب عدم ممانعة' },
  'inquiry':       { en: 'Regulatory Inquiry',        ar: 'استفسار تنظيمي' },
  'submission':    { en: 'Regulatory Submission',     ar: 'تقديم تنظيمي' },
  'notification':  { en: 'Regulatory Notification',  ar: 'إخطار تنظيمي' },
}

// Authority <select> that lists every enabled correspondence-based framework
// plus any hardcoded LETTER_AUTHORITIES the user's data already references.
// Used by both the draft-letter modal and the template editor.
function DynamicAuthoritySelect({
  value,
  onChange,
  isRTL,
}: {
  value: CircularAuthority
  onChange: (v: CircularAuthority) => void
  isRTL: boolean
}) {
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const options = useMemo(() => {
    const seedOpts = frameworks
      .filter((f) => f.enabled && f.correspondenceBased)
      .map((f) => ({
        value: f.id as CircularAuthority,
        label: `${f.name} — ${isRTL ? f.nameAr : f.name}`,
      }))
    // Ensure the current value is selectable even if its framework was
    // later disabled or still uses a legacy uppercase id.
    if (value && !seedOpts.some((o) => o.value === value)) {
      const match = frameworks.find((f) => f.id.toLowerCase() === String(value).toLowerCase())
      seedOpts.push({
        value,
        label: match ? (isRTL ? match.nameAr : match.name) : String(value),
      })
    }
    return seedOpts
  }, [frameworks, value, isRTL])

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CircularAuthority)}
      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

function buildLetterEmailBody(type: SAMALetterType, lang: 'en' | 'ar', reference: string, subject: string): string {
  if (lang === 'ar') {
    const intros: Record<SAMALetterType, string> = {
      'non-objection': `السادة الكرام،\n\nأتقدم بموجب هذا الخطاب بطلب عدم ممانعة بالرجوع إلى المرجع ${reference} بشأن: ${subject}. نرفق طيه الوثائق الداعمة للدراسة والاعتماد. ونبقى رهن الإشارة لتزويدكم بأي معلومات إضافية.`,
      'inquiry':       `السادة الكرام،\n\nيسعدنا التواصل معكم بخصوص استفسارنا التنظيمي تحت مرجع ${reference} المتعلق بـ: ${subject}. نأمل تزويدنا بتوضيحاتكم في هذا الشأن. شاكرين تعاونكم المعتاد.`,
      'submission':    `السادة الكرام،\n\nنتشرف بتقديم المستندات المطلوبة وفق المرجع ${reference} المتعلقة بـ: ${subject}. تجدون مرفقاً الملف المعدّ وفق المتطلبات التنظيمية المعمول بها. نحن بانتظار تأكيد استلامكم.`,
      'notification':  `السادة الكرام،\n\nنودّ إحاطتكم بموجب هذا الإخطار تحت مرجع ${reference} بشأن: ${subject}. نتيح لكم كافة التفاصيل والوثائق الداعمة لاتخاذ الإجراءات اللازمة. نحن في انتظار توجيهاتكم.`,
    }
    return intros[type]
  }
  const intros: Record<SAMALetterType, string> = {
    'non-objection': `Dear Sir/Madam,\n\nWe are writing to formally request a non-objection under reference ${reference} regarding: ${subject}. Please find attached the supporting documentation for your review and approval. We remain at your disposal for any further information required.`,
    'inquiry':       `Dear Sir/Madam,\n\nWe respectfully submit our regulatory inquiry under reference ${reference} concerning: ${subject}. We kindly request your guidance and clarification on this matter. Thank you for your continued support.`,
    'submission':    `Dear Sir/Madam,\n\nPlease find enclosed our regulatory submission under reference ${reference} pertaining to: ${subject}. All required documentation has been prepared in accordance with applicable regulatory requirements. We look forward to your confirmation of receipt.`,
    'notification':  `Dear Sir/Madam,\n\nWe are providing formal notification under reference ${reference} regarding: ${subject}. Full details and supporting documentation are attached for your records. Please advise if any further action is required on our part.`,
  }
  return intros[type]
}

// Recipient defaults derived from authority + department (see src/lib/letter-authority.ts).
function getRecipientDefaults(
  authority: CircularAuthority,
  deptId: string,
): { en: { name: string; org: string; city: string }; ar: { name: string; org: string; city: string } } {
  const auth = getAuthorityRecipientDefaults(authority) ?? {
    en: { org: authority ?? '', city: '' },
    ar: { org: authority ?? '', city: '' },
  }
  return {
    en: { name: getDepartmentLabel(authority, deptId, 'en'), org: auth.en.org, city: auth.en.city },
    ar: { name: getDepartmentLabel(authority, deptId, 'ar'), org: auth.ar.org, city: auth.ar.city },
  }
}

// Helper to get display templates for the dashboard cards
const templateTypeCards = [
  {
    type: 'non-objection' as SAMALetterType,
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
  },
  {
    type: 'inquiry' as SAMALetterType,
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
  },
  {
    type: 'submission' as SAMALetterType,
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
  },
  {
    type: 'notification' as SAMALetterType,
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
  },
]

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] animate-toast">
      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0">
        <Icon icon="lucide:check" />
      </div>
      <span className="font-bold text-sm">{message}</span>
    </div>
  )
}

function LetterSortHeader({ label, col, sort, onSort, onClear }: {
  label: string; col: LetterSortCol
  sort: LetterSortState; onSort: (c: LetterSortCol) => void; onClear: () => void
}) {
  const active = sort?.col === col
  const icon = active ? (sort!.dir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down') : 'lucide:chevrons-up-down'
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onSort(col)}
        className={`flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer ${active ? 'text-emerald-600' : ''}`}>
        {label}<Icon icon={icon} className="text-sm" />
      </button>
      {active && (
        <button onClick={onClear} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Clear sort">
          <Icon icon="lucide:x" className="text-xs" />
        </button>
      )}
    </div>
  )
}

function translateTimelineTitle(
  title: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const EXACT: Record<string, string> = {
    'Draft Created':          t('samaLetters.letterCreatedDraft'),
    'Submitted for Approval': t('samaLetters.letterSubmittedApproval'),
    'Compliance Approved':    t('samaLetters.complianceApproved'),
    'All Steps Approved':     t('samaLetters.allStepsApproved'),
    // Legacy literals (pre-authority): keep mapping so old persisted timelines still translate
    'Sent to SAMA':           t('samaLetters.letterSentToSama'),
    'Pending SAMA Reply':     t('samaLetters.pendingSamaReply'),
    'Pending SAMA reply':     t('samaLetters.pendingSamaReply'),
    'Response Received':      t('samaLetters.letterResponseReceived'),
  }
  if (EXACT[title]) return EXACT[title]

  // Dynamic authority forms: 'Sent to <AUTHORITY>' / 'Pending <AUTHORITY> reply'
  const sentMatch = title.match(/^Sent to ([A-Z]+)$/)
  if (sentMatch) return t('samaLetters.letterSentToAuthority', { authority: sentMatch[1] })
  const pendingMatch = title.match(/^Pending ([A-Z]+) (?:Reply|reply)$/)
  if (pendingMatch) return t('samaLetters.pendingAuthorityReply', { authority: pendingMatch[1] })

  // Translate legacy "Field updated" events from the removed editLetter feature
  const FIELD_UPDATED: Record<string, string> = {
    'Subject updated':               t('samaLetters.subjectUpdated'),
    'Arabic Subject updated':        t('samaLetters.subjectArUpdated'),
    'Body updated':                  t('samaLetters.bodyUpdated'),
    'Arabic Body updated':           t('samaLetters.bodyArUpdated'),
    'Priority updated':              t('samaLetters.priorityUpdated'),
    'SAMA Department updated':       t('samaLetters.departmentUpdated'),
    'Letter Type updated':           t('samaLetters.letterTypeUpdated'),
    'Sub-Category updated':          t('samaLetters.subCategoryUpdated'),
    'Signer Name updated':           t('samaLetters.signerNameUpdated'),
    'Signer Title updated':          t('samaLetters.signerTitleUpdated'),
    'Recipient Name updated':        t('samaLetters.recipientNameUpdated'),
    'Recipient Organization updated':t('samaLetters.recipientOrgUpdated'),
  }
  if (FIELD_UPDATED[title]) return FIELD_UPDATED[title]

  if (title.startsWith('Approved by '))
    return `${t('samaLetters.approvedBy')} ${title.slice('Approved by '.length)}`

  if (title.startsWith('Rejected by ')) {
    // Translate legacy "No reason provided" suffix stored in older events
    const rest = title.slice('Rejected by '.length)
      .replace('No reason provided', t('samaLetters.noReasonProvided'))
    return `${t('samaLetters.rejectedBy')} ${rest}`
  }

  return title
}

export default function SAMALettersPage() {
  const { t, isRTL } = useTranslation()
  const searchParams = useSearchParams()
  const store = useSAMALetterStore()
  const templateStore = useSAMATemplateStore()
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
    const typeColors: Record<SAMALetterType, string> = {
      'non-objection': 'emerald', inquiry: 'blue', submission: 'amber', notification: 'rose',
    }
    const typeIcons: Record<SAMALetterType, string> = {
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
        icon: typeIcons[resolvedType],
        color: typeColors[resolvedType],
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
    const subjectText = LETTER_EMAIL_SUBJECTS[letter.type][lang]
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
    }
  }

  const getTypeBadgeColor = (type: SAMALetterType) => {
    switch (type) {
      case 'non-objection': return 'bg-emerald-50 text-emerald-700'
      case 'inquiry': return 'bg-blue-50 text-blue-700'
      case 'submission': return 'bg-amber-50 text-amber-700'
      case 'notification': return 'bg-rose-50 text-rose-700'
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
              href="/correspondence/sama-letters"
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

          <button
            onClick={() => handleOpenCreateModal()}
            className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
          >
            <Icon icon="lucide:plus" />
            {t('samaLetters.draftNewLetter')}
          </button>
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
              <button
                onClick={handleCreateTemplate}
                className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
              >
                <Icon icon="lucide:plus" />
                {t('samaLetters.createTemplate')}
              </button>
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

                {/* Type Filter */}
                <div className={`flex items-center gap-2`}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('common.type')}:</label>
                  <select
                    value={templateTypeFilter}
                    onChange={(e) => setTemplateTypeFilter(e.target.value as SAMALetterType | 'All')}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none min-w-[150px]"
                  >
                    <option value="All">{t('samaLetters.allTypes')}</option>
                    <option value="non-objection">{t('samaLetters.nonObjection')}</option>
                    <option value="inquiry">{t('samaLetters.inquiry')}</option>
                    <option value="submission">{t('samaLetters.submission')}</option>
                    <option value="notification">{t('samaLetters.notification')}</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className={`flex items-center gap-2`}>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t('common.status')}:</label>
                  <select
                    value={templateStatusFilter}
                    onChange={(e) => setTemplateStatusFilter(e.target.value as TemplateStatus | 'All')}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none min-w-[130px]"
                  >
                    <option value="All">{t('samaLetters.allStatus')}</option>
                    <option value="Active">{t('common.active')}</option>
                    <option value="Draft">{t('common.draft')}</option>
                  </select>
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
                              <RoleGuard editOnly hidden>
                                <button
                                  onClick={() => handleEditTemplate(template)}
                                  className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                  title="Edit"
                                >
                                  <Icon icon="lucide:pencil" />
                                </button>
                              </RoleGuard>
                              <button
                                onClick={() => handleDuplicateTemplate(template)}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="Duplicate"
                              >
                                <Icon icon="lucide:copy" />
                              </button>
                              <RoleGuard deleteOnly hidden>
                                <button
                                  onClick={() => handleDeleteTemplate(template)}
                                  className="p-1.5 hover:bg-rose-100 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Icon icon="lucide:trash-2" />
                                </button>
                              </RoleGuard>
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
                <RoleGuard editOnly hidden>
                  <button
                    onClick={() => setIsTemplateManagementOpen(true)}
                    className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                  >
                    {t('samaLetters.manageTemplates')} {isRTL ? '\u2190' : '\u2192'}
                  </button>
                </RoleGuard>
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
                      onClick={() => handleOpenCreateModal(template.type)}
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
                          <input
                            value={editSubject}
                            onChange={e => setEditSubject(e.target.value)}
                            onBlur={() => saveField({ subject: editSubject })}
                            className="font-black text-lg text-slate-900 bg-transparent w-full border-0 border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none py-1"
                            placeholder="Enter subject…"
                          />
                        ) : (
                          <h4 className="font-black text-lg text-slate-900">Subject: {selectedLetter?.subject}</h4>
                        )}
                      </div>

                      <div className="text-slate-700 text-sm leading-relaxed space-y-4">
                        <p>Dear Sir/Madam,</p>
                        {isDraft ? (
                          <textarea
                            value={editBody}
                            onChange={e => setEditBody(e.target.value)}
                            onBlur={() => saveField({ body: editBody })}
                            rows={10}
                            className="w-full text-sm text-slate-700 leading-relaxed bg-transparent border border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none resize-none p-2 rounded"
                            placeholder="Type your message here…"
                          />
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
                          <input
                            value={editSubjectAr}
                            onChange={e => setEditSubjectAr(e.target.value)}
                            onBlur={() => saveField({ subjectAr: editSubjectAr })}
                            className="font-bold text-2xl text-slate-900 bg-transparent w-full border-0 border-b border-dashed border-slate-300 focus:border-emerald-400 focus:outline-none py-1"
                            placeholder="أدخل الموضوع…"
                          />
                        ) : (
                          <h4 className="font-bold text-2xl text-slate-900">
                            الموضوع: {selectedLetter?.subjectAr || selectedLetter?.subject}
                          </h4>
                        )}
                      </div>

                      <div className="text-slate-700 text-lg leading-relaxed space-y-4">
                        <p>السادة الكرام،</p>
                        {isDraft ? (
                          <textarea
                            value={editBodyAr}
                            onChange={e => setEditBodyAr(e.target.value)}
                            onBlur={() => saveField({ bodyAr: editBodyAr })}
                            rows={10}
                            className="w-full text-lg text-slate-700 leading-relaxed bg-transparent border border-dashed border-slate-200 focus:border-emerald-300 focus:outline-none resize-none p-2 rounded"
                            placeholder="اكتب رسالتك هنا…"
                          />
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
                        <select
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          value={editDepartment}
                          onChange={e => {
                            setEditDepartment(e.target.value)
                            saveField({ samaDepartment: e.target.value as import('@/types').SAMADepartment })
                            setEditingMeta(null)
                          }}
                          onBlur={() => setEditingMeta(null)}
                          className="text-xs font-bold text-slate-900 bg-transparent border-b border-dashed border-slate-400 focus:outline-none cursor-pointer"
                        >
                          {getAuthorityDepartments(selectedLetter.authority).map((d) => (
                            <option key={d.id} value={d.id}>
                              {isRTL ? d.ar : d.en}
                            </option>
                          ))}
                        </select>
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
                        <select
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
                          value={editAssignedTo}
                          onChange={e => { setEditAssignedTo(e.target.value); saveField({ assignedTo: e.target.value }); setEditingMeta(null) }}
                          onBlur={() => { saveField({ assignedTo: editAssignedTo }); setEditingMeta(null) }}
                          className="text-xs font-bold text-emerald-600 bg-transparent border-b border-dashed border-emerald-300 focus:outline-none cursor-pointer"
                        >
                          <option value="">{t('common.select')}</option>
                          {teamMembers.filter(m => m.status === 'active').map(m => (
                            <option key={m.id} value={m.name}>{m.name} — {m.department}</option>
                          ))}
                        </select>
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

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  subtextIcon,
  subtextColor,
  borderColor,
  isRTL = false,
}: {
  label: string
  value: string
  subtext: string
  subtextIcon?: string
  subtextColor?: 'emerald' | 'amber' | 'rose' | 'blue'
  borderColor: 'emerald' | 'amber' | 'rose' | 'blue'
  isRTL?: boolean
}) {
  const borderColorValues = {
    emerald: '#22c55e',  // emerald-500
    amber: '#f59e0b',    // amber-500
    rose: '#f43f5e',     // rose-500
    blue: '#3b82f6',     // blue-500
  }

  const textColors = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    blue: 'text-blue-600',
  }

  return (
    <div
      className={`glass-card p-6 rounded-2xl stat-card-hover`}
      style={{
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: borderColorValues[borderColor],
        [isRTL ? 'borderRightWidth' : 'borderLeftWidth']: '6px',
      }}
    >
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
      <h2 className="text-3xl font-black text-slate-900 font-display">{value}</h2>
      <p
        className={`text-xs mt-2 ${
          subtextIcon
            ? `font-bold flex items-center gap-1 ${subtextColor ? textColors[subtextColor] : 'text-slate-400'}`
            : subtextColor
              ? `font-bold ${textColors[subtextColor]}`
              : 'font-medium text-slate-400'
        }`}
      >
        {subtextIcon && <Icon icon={subtextIcon} />}
        {subtext}
      </p>
    </div>
  )
}

// Template Card Component
function TemplateCard({
  type,
  icon,
  color,
  description,
  onClick,
}: {
  type: string
  icon: string
  color: string
  description: string
  onClick: () => void
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }

  return (
    <button
      onClick={onClick}
      className="bg-white p-5 rounded-2xl text-left border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all cursor-pointer"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colorClasses[color]}`}>
        <Icon icon={icon} className="text-xl" />
      </div>
      <h3 className="font-bold text-slate-900 text-sm mb-1">{type}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  )
}

// Create Letter Form Component (Bilingual)
function CreateLetterForm({
  selectedType,
  onTypeChange,
  onClose,
  onSuccess,
  template,
}: {
  selectedType: SAMALetterType
  onTypeChange: (type: SAMALetterType) => void
  onClose: () => void
  onSuccess: () => void
  template?: LetterTemplate
}) {
  const { t, isRTL } = useTranslation()
  const store = useSAMALetterStore()
  const templateStore = useSAMATemplateStore()
  const { user } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priority, setPriority] = useState<'standard' | 'urgent'>('standard')
  const [subjectEn, setSubjectEn] = useState('')
  const [subjectAr, setSubjectAr] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [bodyAr, setBodyAr] = useState('')
  const [subCategory, setSubCategory] = useState<string>('key-function')
  const [authority, setAuthority] = useState<CircularAuthority>(template?.defaultAuthority ?? 'sama')
  const [samaDepartment, setSamaDepartment] = useState<string>(
    template?.defaultSamaDepartment || getDefaultDepartmentId(template?.defaultAuthority ?? 'sama'),
  )
  const createAttachFileRef = useRef<HTMLInputElement>(null)
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])

  // When authority changes, reset department to that authority's first option
  useEffect(() => {
    const validIds = getAuthorityDepartments(authority).map((d) => d.id)
    if (!validIds.includes(samaDepartment)) {
      setSamaDepartment(getDefaultDepartmentId(authority))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority])

  // Pre-populate from template defaults
  useEffect(() => {
    if (!template) return
    if (template.defaultSubjectEn)  setSubjectEn(template.defaultSubjectEn)
    if (template.defaultSubjectAr)  setSubjectAr(template.defaultSubjectAr)
    if (template.defaultBodyEn)     setBodyEn(template.defaultBodyEn)
    if (template.defaultBodyAr)     setBodyAr(template.defaultBodyAr)
    if (template.defaultAuthority)  setAuthority(template.defaultAuthority)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  const reference = store.getNextReference(selectedType)
  const createdBy = user?.name || 'Current User'

  const handleDraftAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newAtts: Attachment[] = Array.from(files).map(f => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || 'application/octet-stream',
      size: f.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user?.name || 'Unknown',
    }))
    setDraftAttachments(prev => [...prev, ...newAtts])
    e.target.value = ''
  }

  const buildTimelineEvent = (title: string) => ({
    id: crypto.randomUUID(),
    title,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    user: createdBy,
    status: 'completed' as const,
  })

  const letterBaseData = () => {
    // Recipient defaults derived from currently selected authority + department, falling back
    // to template explicit overrides when set.
    const recipientDefaults = getRecipientDefaults(authority, samaDepartment)
    return {
      reference,
      authority,
      type: selectedType,
      subCategory: subCategory as import('@/types').SAMASubCategory,
      samaDepartment: samaDepartment as import('@/types').SAMADepartment,
      subject: subjectEn || `(Draft ${reference})`,
      subjectAr: subjectAr || undefined,
      body: bodyEn,
      bodyAr: bodyAr || undefined,
      status: 'draft' as const,
      priority,
      createdBy,
      signerName:           template?.defaultSignerName || undefined,
      signerTitle:          template?.defaultSignerTitle || undefined,
      signerNameAr:         template?.defaultSignerNameAr || undefined,
      signerTitleAr:        template?.defaultSignerTitleAr || undefined,
      signatureImageUrl:    template?.defaultSignatureImageUrl || undefined,
      recipientName:        template?.defaultRecipientName || recipientDefaults.en.name,
      recipientOrg:         template?.defaultRecipientOrg  || recipientDefaults.en.org,
      recipientCity:        template?.defaultRecipientCity || recipientDefaults.en.city,
      recipientNameAr:      template?.defaultRecipientNameAr || recipientDefaults.ar.name,
      recipientOrgAr:       template?.defaultRecipientOrgAr  || recipientDefaults.ar.org,
      recipientCityAr:      template?.defaultRecipientCityAr || recipientDefaults.ar.city,
      approvalChain: [] as import('@/types').SAMALetterApprovalStep[],
      timeline: [buildTimelineEvent(t('samaLetters.letterCreatedDraft'))],
      attachments: draftAttachments,
      relatedObservations: [] as string[],
    }
  }

  const handleSaveDraft = () => {
    store.create(letterBaseData())
    if (template?.id) templateStore.incrementUsage(template.id)
    onSuccess()
  }

  const handleSubmit = () => {
    setIsSubmitting(true)
    const newLetter = store.create(letterBaseData())
    store.submitForApproval(newLetter.id)
    if (template?.id) templateStore.incrementUsage(template.id)
    setIsSubmitting(false)
    onSuccess()
  }

  return (
    <div className="p-8">
      <div className={`flex justify-between items-start mb-8`}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            {t('samaLetters.draftOfficialCorrespondence')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t('samaLetters.referenceAssigned')}:{' '}
            <span className="font-mono font-bold text-emerald-600">{reference}</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      {/* Authority spans full width at the top so both columns below stay balanced (2 rows each) */}
      <div className="mb-6">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
          {t('samaLetters.authorityField')}
        </label>
        <DynamicAuthoritySelect
          value={authority}
          onChange={(v) => setAuthority(v as CircularAuthority)}
          isRTL={isRTL}
        />
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('samaLetters.letterType')}
            </label>
            <select
              value={selectedType}
              onChange={(e) => onTypeChange(e.target.value as SAMALetterType)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="non-objection">{t('samaLetters.nonObjection')}</option>
              <option value="inquiry">{t('samaLetters.inquiry')}</option>
              <option value="submission">{t('samaLetters.submission')}</option>
              <option value="notification">{t('samaLetters.notification')}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('samaLetters.subCategory')}
            </label>
            <select
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="key-function">{t('samaLetters.keyFunctionAppointment')}</option>
              <option value="product-launch">{t('samaLetters.productLaunch')}</option>
              <option value="equity-participation">{t('samaLetters.equityParticipation')}</option>
              <option value="circular-clarification">{t('samaLetters.templateCircularClarification')}</option>
              <option value="regulatory-interpretation">{t('samaLetters.templateRegulatoryInterpretation')}</option>
              <option value="quarterly-aml">{t('samaLetters.templateQuarterlyAmlReport')}</option>
              <option value="annual-compliance">{t('samaLetters.templateAnnualComplianceReport')}</option>
              <option value="incident-notification">{t('samaLetters.templateIncidentNotification')}</option>
              <option value="system-outage">{t('samaLetters.templateSystemOutageReport')}</option>
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('samaLetters.targetDepartment')}
            </label>
            <select
              value={samaDepartment}
              onChange={(e) => setSamaDepartment(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {getAuthorityDepartments(authority).map((d) => (
                <option key={d.id} value={d.id}>
                  {isRTL ? d.ar : d.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('calendar.priority')}
            </label>
            <div className={`flex gap-2`}>
              <button
                type="button"
                onClick={() => setPriority('standard')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'standard'
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t('calendar.standard')}
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'urgent'
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t('calendar.urgent')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bilingual Editors */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* English Side */}
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            {t('samaLetters.subjectEnglish')}
          </label>
          <input
            type="text"
            value={subjectEn}
            onChange={(e) => setSubjectEn(e.target.value)}
            placeholder={t('samaLetters.enterEnglishSubject')}
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
          />
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            {t('samaLetters.contentEnglish')}
          </label>
          <div className="min-h-[200px] w-full bg-slate-50 border border-slate-100 rounded-xl p-4">
            <div className="flex gap-2 border-b border-slate-200 pb-2 mb-3">
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:bold" />
              </button>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:italic" />
              </button>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:list" />
              </button>
            </div>
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              placeholder={t('samaLetters.typeMessageHere')}
              className="w-full h-32 bg-transparent resize-none text-sm text-slate-700 focus:outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Arabic Side */}
        <div dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {t('samaLetters.subjectArabic')}
          </label>
          <input
            type="text"
            value={subjectAr}
            onChange={(e) => setSubjectAr(e.target.value)}
            placeholder={t('samaLetters.enterArabicSubject')}
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-lg font-medium focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
          />
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {t('samaLetters.contentArabic')}
          </label>
          <div className="min-h-[200px] w-full bg-slate-50 border border-slate-100 rounded-xl p-4">
            <div className="flex gap-2 border-b border-slate-200 pb-2 mb-3">
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:bold" />
              </button>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:italic" />
              </button>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
                <Icon icon="lucide:list" />
              </button>
            </div>
            <textarea
              value={bodyAr}
              onChange={(e) => setBodyAr(e.target.value)}
              placeholder={t('samaLetters.typeMessageHere')}
              className="w-full h-32 bg-transparent resize-none text-lg text-slate-700 focus:outline-none placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      <div className={`flex justify-between items-center`}>
        <input ref={createAttachFileRef} type="file" multiple className="hidden" onChange={handleDraftAttach} />
        <button onClick={() => createAttachFileRef.current?.click()} className={`flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer`}>
          <Icon icon="lucide:paperclip" />
          {t('samaLetters.manageAttachments')} ({draftAttachments.length})
        </button>
        <div className={`flex gap-3`}>
          <button
            onClick={handleSaveDraft}
            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {t('samaLetters.saveAsDraft')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`px-8 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer`}
          >
            {isSubmitting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('samaLetters.processing')}
              </>
            ) : (
              t('samaLetters.sendForApproval')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Approval Step Actions Component
function ApprovalStepActions({
  letterId,
  step,
  approverName,
}: {
  letterId: string
  step: 1 | 2 | 3
  approverName: string
}) {
  const { t, isRTL } = useTranslation()
  const store = useSAMALetterStore()
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)

  const handleApprove = () => {
    store.approveStep(letterId, step, approverName, notes || undefined)
    setNotes('')
    setShowNotes(false)
  }

  const handleReject = () => {
    store.rejectStep(letterId, step, approverName, notes)
    setNotes('')
    setShowNotes(false)
  }

  return (
    <div className={`ml-9 space-y-2 ${isRTL ? 'mr-9 ml-0' : ''}`}>
      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('samaLetters.addNotes')}
          rows={2}
          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
        />
      )}
      <div className={`flex gap-2`}>
        <button
          onClick={handleApprove}
          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
        >
          {t('samaLetters.approveStep')}
        </button>
        <button
          onClick={handleReject}
          className="flex-1 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition-colors cursor-pointer"
        >
          {t('samaLetters.rejectStep')}
        </button>
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs hover:bg-slate-200 transition-colors cursor-pointer"
          title={t('samaLetters.addNotes')}
        >
          <Icon icon="lucide:message-square" />
        </button>
      </div>
    </div>
  )
}

// Template Edit Form Component
function TemplateEditForm({
  template,
  onClose,
  onSave,
}: {
  template: LetterTemplate | null
  onClose: () => void
  onSave: (data: Partial<LetterTemplate>) => void
}) {
  const { t, isRTL } = useTranslation()
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'signer' | 'recipient'>('basic')
  const [name, setName] = useState(template?.name || '')
  const [type, setType] = useState<SAMALetterType>(template?.type || 'non-objection')
  const [description, setDescription] = useState(template?.description || '')
  const [status, setStatus] = useState<TemplateStatus>(template?.status || 'Draft')
  const [defaultSubjectEn, setDefaultSubjectEn] = useState(template?.defaultSubjectEn || '')
  const [defaultSubjectAr, setDefaultSubjectAr] = useState(template?.defaultSubjectAr || '')
  const [defaultBodyEn, setDefaultBodyEn]       = useState(template?.defaultBodyEn || '')
  const [defaultBodyAr, setDefaultBodyAr]       = useState(template?.defaultBodyAr || '')
  const [defaultSignerName, setDefaultSignerName]       = useState(template?.defaultSignerName || '')
  const [defaultSignerTitle, setDefaultSignerTitle]     = useState(template?.defaultSignerTitle || '')
  const [defaultSignerNameAr, setDefaultSignerNameAr]   = useState(template?.defaultSignerNameAr || '')
  const [defaultSignerTitleAr, setDefaultSignerTitleAr] = useState(template?.defaultSignerTitleAr || '')
  const [defaultSignatureImageUrl, setDefaultSignatureImageUrl] = useState(template?.defaultSignatureImageUrl || '')
  const [defaultAuthority, setDefaultAuthority] = useState<CircularAuthority>(template?.defaultAuthority || 'sama')
  const [defaultSamaDepartment, setDefaultSamaDepartment] = useState<string>(
    template?.defaultSamaDepartment || getDefaultDepartmentId(template?.defaultAuthority || 'sama'),
  )
  const [defaultRecipientName, setDefaultRecipientName]     = useState(template?.defaultRecipientName || '')
  const [defaultRecipientOrg, setDefaultRecipientOrg]       = useState(template?.defaultRecipientOrg || '')
  const [defaultRecipientCity, setDefaultRecipientCity]     = useState(template?.defaultRecipientCity || '')
  const [defaultRecipientNameAr, setDefaultRecipientNameAr] = useState(template?.defaultRecipientNameAr || '')
  const [defaultRecipientOrgAr, setDefaultRecipientOrgAr]   = useState(template?.defaultRecipientOrgAr || '')
  const [defaultRecipientCityAr, setDefaultRecipientCityAr] = useState(template?.defaultRecipientCityAr || '')
  const sigImgRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isCreateMode = template === null

  const handleDeptChange = (dept: string) => {
    setDefaultSamaDepartment(dept)
    const defaults = getRecipientDefaults(defaultAuthority, dept)
    setDefaultRecipientName(defaults.en.name)
    setDefaultRecipientOrg(defaults.en.org)
    setDefaultRecipientCity(defaults.en.city)
    setDefaultRecipientNameAr(defaults.ar.name)
    setDefaultRecipientOrgAr(defaults.ar.org)
    setDefaultRecipientCityAr(defaults.ar.city)
  }

  const handleAuthorityChange = (next: CircularAuthority) => {
    setDefaultAuthority(next)
    // Reset department to that authority's first option and re-derive defaults
    const nextDept = getDefaultDepartmentId(next)
    setDefaultSamaDepartment(nextDept)
    const defaults = getRecipientDefaults(next, nextDept)
    setDefaultRecipientName(defaults.en.name)
    setDefaultRecipientOrg(defaults.en.org)
    setDefaultRecipientCity(defaults.en.city)
    setDefaultRecipientNameAr(defaults.ar.name)
    setDefaultRecipientOrgAr(defaults.ar.org)
    setDefaultRecipientCityAr(defaults.ar.city)
  }

  useEffect(() => {
    if (!template?.defaultRecipientName) {
      handleDeptChange(defaultSamaDepartment)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setDefaultSignatureImageUrl(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = () => {
    setIsSaving(true)
    setTimeout(() => {
      onSave({
        name,
        type,
        description,
        status,
        defaultSubjectEn: defaultSubjectEn || undefined,
        defaultSubjectAr: defaultSubjectAr || undefined,
        defaultBodyEn:    defaultBodyEn || undefined,
        defaultBodyAr:    defaultBodyAr || undefined,
        defaultSignerName:     defaultSignerName || undefined,
        defaultSignerTitle:    defaultSignerTitle || undefined,
        defaultSignerNameAr:   defaultSignerNameAr || undefined,
        defaultSignerTitleAr:  defaultSignerTitleAr || undefined,
        defaultSignatureImageUrl: defaultSignatureImageUrl || undefined,
        defaultAuthority,
        defaultSamaDepartment: defaultSamaDepartment as import('@/types').SAMADepartment,
        defaultRecipientName:  defaultRecipientName || undefined,
        defaultRecipientOrg:   defaultRecipientOrg || undefined,
        defaultRecipientCity:  defaultRecipientCity || undefined,
        defaultRecipientNameAr: defaultRecipientNameAr || undefined,
        defaultRecipientOrgAr:  defaultRecipientOrgAr || undefined,
        defaultRecipientCityAr: defaultRecipientCityAr || undefined,
      })
      setIsSaving(false)
    }, 500)
  }

  const tabs = [
    { id: 'basic' as const,     label: t('samaLetters.templateTabBasic') },
    { id: 'content' as const,   label: t('samaLetters.templateTabContent') },
    { id: 'signer' as const,    label: t('samaLetters.templateTabSigner') },
    { id: 'recipient' as const, label: t('samaLetters.templateTabRecipient') },
  ]

  return (
    <div className={`p-8 ${isRTL ? 'rtl' : ''}`}>
      <div className={`flex justify-between items-start mb-6`}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            {isCreateMode ? t('samaLetters.createNewTemplate') : t('samaLetters.editTemplate')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isCreateMode ? t('samaLetters.addNewTemplateToDatabank') : `${t('samaLetters.editing')}: ${template?.name}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      {/* Tab Bar */}
      <div className={`flex gap-1 bg-slate-100 p-1 rounded-xl mb-6`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white shadow-sm text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Basic */}
      {activeTab === 'basic' && (
        <div className="space-y-6">
          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('samaLetters.templateName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('samaLetters.enterTemplateName')}
              className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none`}
            />
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('samaLetters.letterType')}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SAMALetterType)}
              className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none`}
            >
              <option value="non-objection">{t('samaLetters.nonObjection')}</option>
              <option value="inquiry">{t('samaLetters.inquiry')}</option>
              <option value="submission">{t('samaLetters.submission')}</option>
              <option value="notification">{t('samaLetters.notification')}</option>
            </select>
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('common.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('samaLetters.describeTemplatePurpose')}
              rows={3}
              className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none`}
            />
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('common.status')}
            </label>
            <div className={`flex gap-3`}>
              <button
                type="button"
                onClick={() => setStatus('Active')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  status === 'Active'
                    ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {t('common.active')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('Draft')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  status === 'Draft'
                    ? 'bg-amber-50 border-2 border-amber-500 text-amber-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'Draft' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                {t('common.draft')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Default Content */}
      {activeTab === 'content' && (
        <div className="grid grid-cols-2 gap-6">
          {/* English column */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">English</h3>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateDefaultSubjectEn')}
              </label>
              <input
                type="text"
                value={defaultSubjectEn}
                onChange={(e) => setDefaultSubjectEn(e.target.value)}
                placeholder="Enter default English subject…"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateDefaultBodyEn')}
              </label>
              <textarea
                value={defaultBodyEn}
                onChange={(e) => setDefaultBodyEn(e.target.value)}
                placeholder="Enter default English body…"
                rows={8}
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              />
            </div>
          </div>
          {/* Arabic column */}
          <div className="space-y-4" dir="rtl">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>العربية</h3>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {t('samaLetters.templateDefaultSubjectAr')}
              </label>
              <input
                type="text"
                value={defaultSubjectAr}
                onChange={(e) => setDefaultSubjectAr(e.target.value)}
                placeholder="أدخل الموضوع الافتراضي…"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {t('samaLetters.templateDefaultBodyAr')}
              </label>
              <textarea
                value={defaultBodyAr}
                onChange={(e) => setDefaultBodyAr(e.target.value)}
                placeholder="أدخل النص الافتراضي…"
                rows={8}
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Signer & Signature */}
      {activeTab === 'signer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateSignerNameEn')}
              </label>
              <input
                type="text"
                value={defaultSignerName}
                onChange={(e) => setDefaultSignerName(e.target.value)}
                placeholder="e.g. Felix Henderson"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateSignerTitleEn')}
              </label>
              <input
                type="text"
                value={defaultSignerTitle}
                onChange={(e) => setDefaultSignerTitle(e.target.value)}
                placeholder="e.g. Head of Compliance"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateSignerNameAr')}
              </label>
              <input
                type="text"
                value={defaultSignerNameAr}
                onChange={(e) => setDefaultSignerNameAr(e.target.value)}
                placeholder="مثال: فيليكس هندرسون"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                dir="rtl"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('samaLetters.templateSignerTitleAr')}
              </label>
              <input
                type="text"
                value={defaultSignerTitleAr}
                onChange={(e) => setDefaultSignerTitleAr(e.target.value)}
                placeholder="مثال: رئيس إدارة الالتزام"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                dir="rtl"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
          </div>

          {/* Signature Image */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-3">
              {t('samaLetters.uploadSignatureImage')}
            </label>
            <input
              ref={sigImgRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSignatureUpload}
            />
            {defaultSignatureImageUrl ? (
              <div className="flex items-center gap-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <img
                    src={defaultSignatureImageUrl}
                    alt="signature preview"
                    className="h-16 max-w-[180px] object-contain"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => sigImgRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Icon icon="lucide:image" />
                    {t('samaLetters.changeSignatureImage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultSignatureImageUrl('')}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Icon icon="lucide:x" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => sigImgRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer gap-2"
              >
                <Icon icon="lucide:image-plus" className="text-2xl" />
                <span className="text-xs font-bold">{t('samaLetters.uploadSignatureImage')}</span>
                <span className="text-[10px]">{t('samaLetters.signatureImageHint')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Recipient */}
      {activeTab === 'recipient' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                {t('samaLetters.authorityField')}
              </label>
              <DynamicAuthoritySelect
                value={defaultAuthority}
                onChange={(v) => handleAuthorityChange(v as CircularAuthority)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                {t('samaLetters.targetDepartment')}
              </label>
              <select
                value={defaultSamaDepartment}
                onChange={(e) => handleDeptChange(e.target.value)}
                className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none`}
              >
                {getAuthorityDepartments(defaultAuthority).map((d) => (
                  <option key={d.id} value={d.id}>
                    {isRTL ? d.ar : d.en}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">English</h3>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('samaLetters.templateRecipientNameEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientName}
                  onChange={(e) => setDefaultRecipientName(e.target.value)}
                  placeholder="e.g. Banking Supervision Department"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('samaLetters.templateRecipientOrgEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientOrg}
                  onChange={(e) => setDefaultRecipientOrg(e.target.value)}
                  placeholder="e.g. Saudi Central Bank (SAMA)"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('samaLetters.templateRecipientCityEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientCity}
                  onChange={(e) => setDefaultRecipientCity(e.target.value)}
                  placeholder="e.g. Riyadh, Saudi Arabia"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="space-y-4" dir="rtl">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>العربية</h3>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('samaLetters.templateRecipientNameAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientNameAr}
                  onChange={(e) => setDefaultRecipientNameAr(e.target.value)}
                  placeholder="مثال: إدارة الرقابة المصرفية"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('samaLetters.templateRecipientOrgAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientOrgAr}
                  onChange={(e) => setDefaultRecipientOrgAr(e.target.value)}
                  placeholder="مثال: البنك المركزي السعودي (ساما)"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('samaLetters.templateRecipientCityAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientCityAr}
                  onChange={(e) => setDefaultRecipientCityAr(e.target.value)}
                  placeholder="مثال: الرياض، المملكة العربية السعودية"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || !name.trim()}
          className={`px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer`}
        >
          {isSaving ? (
            <>
              <Icon icon="lucide:loader-2" className="animate-spin" />
              {t('samaLetters.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" />
              {isCreateMode ? t('samaLetters.createTemplate') : t('common.saveChanges')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
