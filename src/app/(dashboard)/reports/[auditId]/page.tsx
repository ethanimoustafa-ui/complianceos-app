'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { useTranslation } from '@/i18n'
import { formatRelativeTime, formatLocalizedDateShort, calculateNextOccurrence, formatFutureCountdown } from '@/lib/time-utils'
import { formatTimelineDate } from '@/lib/format-date'
import { useAuditStore } from '@/stores/audit-store'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { useAuditLogStore, type AuditLog } from '@/stores/audit-log-store'
import { useAuditTaskStore, type AuditTask } from '@/stores/audit-task-store'
import { useTeamStore } from '@/stores/team-store'
import { useAuthStore } from '@/stores/auth-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import type { RegulatoryBodyId } from '@/types'
import { EditAuditModal } from '@/components/reports/audits/edit-audit-modal'
import { AddAuditModal } from '@/components/reports/audits/add-audit-modal'
import { EditableSelect } from '@/components/ui/editable-select'
import type { Audit, AuditComment } from '@/types'
import { canEditComment, canDeleteComment } from '@/lib/permissions'
import { dicebearAvatar } from '@/lib/avatar'

// Types
interface TimelineItem {
  id: number
  user: string
  avatar: string
  action: string
  detail?: string
  timestamp: Date
  type: 'completed' | 'upload' | 'comment'
}

// Status config for display
const auditStatusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { label: 'Pending', variant: 'neutral' },
  in_progress: { label: 'In Progress', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'danger' },
}

// Audit type display names - defined inside component to use translations
// Task category options by audit type - defined inside component to use translations

export default function AuditDetailPage() {
  const { t, isRTL } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const auditId = params.auditId as string

  // Audit type label resolver — handles 'internal' (fixed) plus any
  // RegulatoryBodyId looked up dynamically from the framework store.
  const getFrameworkById = useFrameworkConfigStore((s) => s.getById)
  const auditTypeLabel = (type: string): string => {
    if (type === 'internal') return t('auditDetail.internalAuditType')
    const fw = getFrameworkById(type as RegulatoryBodyId)
    return fw ? (isRTL ? fw.nameAr : fw.name) : type
  }

  const auditCategoryLabels: Record<string, string> = {
    security_compliance: t('auditDetail.categorySecurityCompliance'),
    financial_compliance: t('auditDetail.categoryFinancialCompliance'),
    regulatory_compliance: t('auditDetail.categoryRegulatoryCompliance'),
    operational_compliance: t('auditDetail.categoryOperationalCompliance'),
    hr_compliance: t('auditDetail.categoryHrCompliance'),
    sharia_compliance: t('auditDetail.categoryShariahCompliance'),
  }
  // W45: user-added categories (useAuditCategoryStore) resolve to their own
  // labels; previously anything non-canonical rendered blank/fallback.
  const customCategories = useAuditCategoryStore((s) => s.categories)
  const categoryLabel = (id: string | undefined): string => {
    if (!id) return '-'
    if (auditCategoryLabels[id]) return auditCategoryLabels[id]
    const custom = customCategories.find((c) => c.id === id)
    return custom ? (isRTL ? custom.labelAr || custom.label : custom.label) : id
  }

  const auditFrequencyLabels: Record<string, string> = {
    annual: t('auditDetail.frequencyAnnual'),
    semi_annual: t('auditDetail.frequencySemiAnnual'),
    quarterly: t('auditDetail.frequencyQuarterly'),
    monthly: t('auditDetail.frequencyMonthly'),
    ad_hoc: t('auditDetail.frequencyAdHoc'),
  }

  const auditPriorityLabels: Record<string, string> = {
    critical: t('auditDetail.priorityCritical'),
    high: t('auditDetail.priorityHigh'),
    medium: t('auditDetail.priorityMedium'),
    low: t('auditDetail.priorityLow'),
  }

  // Stores
  const auditStore = useAuditStore()
  const {
    audits,
    fetchById,
    update,
    addDocument,
    removeDocument,
    addTeamMember,
    removeTeamMember,
    addComment,
    editComment,
    deleteComment,
    updateStatus,
    delete: deleteAudit,
    isLoading,
    isMutating,
  } = auditStore
  // `isDetailLoaded` is exposed by Agent AUDITS-STORE; guard the read so we
  // never explode if the predicate is missing (returns `false` → skeletons render).
  const detailLoadedFn = (auditStore as unknown as { isDetailLoaded?: (id: string) => boolean })
    .isDetailLoaded
  const detailLoaded: boolean = typeof detailLoadedFn === 'function'
    ? detailLoadedFn(auditId)
    : Boolean(audits.find((a) => a.id === auditId)?.team)
  const { getLogsByAuditId } = useAuditLogStore()
  const auditTaskStore = useAuditTaskStore()
  const { members: teamMembers } = useTeamStore()
  const currentUser = useAuthStore((state) => state.user)

  // Find audit from store
  const audit = useMemo(() => audits.find(a => a.id === auditId), [audits, auditId])

  // Get tasks for this audit
  const tasks = useMemo(() => auditTaskStore.getTasksByAuditId(auditId), [auditTaskStore, auditId])

  // Calculate progress from tasks
  const calculatedProgress = useMemo(() => {
    if (tasks.length === 0) return audit?.progress || 0
    const completed = tasks.filter(t => t.completed).length
    return Math.round((completed / tasks.length) * 100)
  }, [tasks, audit?.progress])

  // Overdue detection
  const isOverdue = useMemo(() => {
    if (!audit?.dueDate || audit.status === 'completed') return false
    const dueDate = new Date(audit.dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today
  }, [audit?.dueDate, audit?.status])

  // Next occurrence for recurring audits
  const nextOccurrence = useMemo(() => {
    if (!audit?.dueDate) return null
    return calculateNextOccurrence(audit.dueDate, audit.frequency)
  }, [audit?.dueDate, audit?.frequency])

  // Pre-fill values for scheduling next audit
  const scheduleNextInitialValues = useMemo(() => {
    if (!audit || !nextOccurrence) return undefined
    return {
      type: audit.type,
      category: audit.category,
      frequency: audit.frequency,
      priority: audit.priority,
      dueDate: nextOccurrence.toISOString().split('T')[0],
      assigneeId: audit.assignee?.id || '',
      title: '',
      description: audit.description || '',
      status: 'pending' as const,
    }
  }, [audit, nextOccurrence])

  // Get documents from audit
  const documents = audit?.documents || []

  // Get team from audit
  const auditTeam = useMemo(() => {
    // Start with assignee as owner if no team exists
    if (!audit?.team || audit.team.length === 0) {
      if (audit?.assignee) {
        return [{
          id: audit.assignee.id,
          name: audit.assignee.name,
          avatar: audit.assignee.name.split(' ')[0] || 'User',
          role: audit.assignee.role || 'Lead Author',
          isOwner: true,
          addedAt: audit.createdAt,
        }]
      }
      return []
    }
    return audit.team
  }, [audit])

  // Get dynamic categories based on audit type with translations
  const taskCategories = useMemo(() => {
    const taskCategoriesByType: Record<string, Array<{ value: string; label: string; color: 'blue' | 'amber' | 'purple' }>> = {
      internal: [
        { value: 'info-security-policies', label: t('auditDetail.categoryInfoSecurityPolicies'), color: 'blue' },
        { value: 'asset-management', label: t('auditDetail.categoryAssetManagement'), color: 'amber' },
        { value: 'access-control', label: t('auditDetail.categoryAccessControl'), color: 'purple' },
        { value: 'cryptography', label: t('auditDetail.categoryCryptography'), color: 'blue' },
        { value: 'physical-security', label: t('auditDetail.categoryPhysicalSecurity'), color: 'amber' },
        { value: 'operations-security', label: t('auditDetail.categoryOperationsSecurity'), color: 'purple' },
        { value: 'communications-security', label: t('auditDetail.categoryCommunicationsSecurity'), color: 'blue' },
        { value: 'system-acquisition', label: t('auditDetail.categorySystemAcquisition'), color: 'amber' },
      ],
      sama: [
        { value: 'cybersecurity-governance', label: t('auditDetail.categoryCybersecurityGovernance'), color: 'blue' },
        { value: 'cybersecurity-risk', label: t('auditDetail.categoryCybersecurityRisk'), color: 'amber' },
        { value: 'cybersecurity-operations', label: t('auditDetail.categoryCybersecurityOperations'), color: 'purple' },
        { value: 'third-party-security', label: t('auditDetail.categoryThirdPartySecurity'), color: 'blue' },
        { value: 'cybersecurity-resilience', label: t('auditDetail.categoryCybersecurityResilience'), color: 'amber' },
        { value: 'identity-access', label: t('auditDetail.categoryIdentityAccess'), color: 'purple' },
        { value: 'app-security', label: t('auditDetail.categoryAppSecurity'), color: 'blue' },
        { value: 'data-protection', label: t('auditDetail.categoryDataProtection'), color: 'amber' },
      ],
      sharia: [
        { value: 'governance-structure', label: t('auditDetail.categoryGovernanceStructure'), color: 'blue' },
        { value: 'product-compliance', label: t('auditDetail.categoryProductCompliance'), color: 'amber' },
        { value: 'contract-review', label: t('auditDetail.categoryContractReview'), color: 'purple' },
        { value: 'profit-distribution', label: t('auditDetail.categoryProfitDistribution'), color: 'blue' },
        { value: 'zakat-calculation', label: t('auditDetail.categoryZakatCalculation'), color: 'amber' },
        { value: 'investment-screening', label: t('auditDetail.categoryInvestmentScreening'), color: 'purple' },
        { value: 'purification-process', label: t('auditDetail.categoryPurificationProcess'), color: 'blue' },
        { value: 'ssb-reporting', label: t('auditDetail.categorySsbReporting'), color: 'amber' },
      ],
    }
    const auditType = audit?.type || 'internal'
    return taskCategoriesByType[auditType] || taskCategoriesByType.internal
  }, [audit?.type, t])

  // Fetch audit on mount — W45: also hydrate the detail children (team /
  // comments / documents) and the server-backed checklist; without these the
  // sections skeletoned forever (nothing ever fetched them).
  useEffect(() => {
    if (auditId) {
      fetchById(auditId)
      void useAuditStore.getState().fetchDetailChildren(auditId)
      void useAuditTaskStore.getState().fetchByAudit(auditId)
    }
  }, [auditId, fetchById])

  // Debounced progress update - prevents flicker on task changes
  const progressUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedProgressRef = useRef<number | null>(null)

  useEffect(() => {
    // Skip if no audit or progress hasn't meaningfully changed
    if (!audit || calculatedProgress === lastSyncedProgressRef.current) {
      return
    }

    // Clear any pending update
    if (progressUpdateTimeoutRef.current) {
      clearTimeout(progressUpdateTimeoutRef.current)
    }

    // Debounce the progress update by 500ms
    progressUpdateTimeoutRef.current = setTimeout(() => {
      if (audit && calculatedProgress !== audit.progress) {
        lastSyncedProgressRef.current = calculatedProgress
        update(audit.id, { progress: calculatedProgress })
      }
    }, 500)

    return () => {
      if (progressUpdateTimeoutRef.current) {
        clearTimeout(progressUpdateTimeoutRef.current)
      }
    }
  }, [calculatedProgress, audit, update])

  // Status key mapping for translations
  const statusTranslationKeys: Record<string, 'auditDetail.pending' | 'auditDetail.inProgress' | 'auditDetail.completed' | 'auditDetail.overdue'> = {
    pending: 'auditDetail.pending',
    in_progress: 'auditDetail.inProgress',
    completed: 'auditDetail.completed',
    overdue: 'auditDetail.overdue',
  }

  // Helper to translate log description
  const translateLogDescription = (log: AuditLog): string => {
    if (log.descriptionKey && log.descriptionParams) {
      // Translate status values if present in params
      const translatedParams = { ...log.descriptionParams }
      if (translatedParams.from && statusTranslationKeys[translatedParams.from]) {
        translatedParams.from = t(statusTranslationKeys[translatedParams.from])
      }
      if (translatedParams.to && statusTranslationKeys[translatedParams.to]) {
        translatedParams.to = t(statusTranslationKeys[translatedParams.to])
      }
      // Get translated string using key as TranslationKey
      const key = log.descriptionKey as Parameters<typeof t>[0]
      let translated = t(key)
      // Replace {{param}} with values
      Object.entries(translatedParams).forEach(([paramKey, value]) => {
        translated = translated.replace(`{{${paramKey}}}`, value)
      })
      return translated
    }
    return log.description
  }

  // Get timeline items from audit log store
  const timelineItems: TimelineItem[] = useMemo(() => {
    const auditLogs = getLogsByAuditId(auditId)
    // Map action types to translation keys
    const actionTranslations: Record<string, string> = {
      created: t('auditDetail.actionCreatedAudit'),
      updated: t('auditDetail.actionUpdated'),
      closed: t('auditDetail.actionClosed'),
      uploaded: t('auditDetail.actionUploaded'),
      commented: t('auditDetail.actionCommented'),
    }
    const items: TimelineItem[] = auditLogs.map((log, index) => ({
      id: index + 1,
      user: log.user.name,
      avatar: log.user.name.split(' ')[0] || 'User',
      action: actionTranslations[log.action] || log.action,
      detail: translateLogDescription(log),
      timestamp: new Date(log.timestamp),
      type: log.action === 'created' || log.action === 'updated' || log.action === 'closed' ? 'completed' as const :
            log.action === 'uploaded' ? 'upload' as const : 'comment' as const,
    }))
    // Sort newest-first by timestamp (mirrors the regulatory/policy timeline).
    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return items
  }, [getLogsByAuditId, auditId, t])

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [taskOptionsId, setTaskOptionsId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<AuditTask | null>(null)
  const [showEditTaskModal, setShowEditTaskModal] = useState(false)

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [showManageTeamModal, setShowManageTeamModal] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showTimelineModal, setShowTimelineModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showScheduleNextModal, setShowScheduleNextModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineItem | null>(null)

  // Add Task form state - category defaults to first option for current audit type
  const defaultCategory = taskCategories[0]?.value || 'access-control'
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    category: defaultCategory,
    assigneeId: '',
    dueDate: '',
    notes: '',
  })

  // Reset category when audit type changes
  useEffect(() => {
    if (taskCategories.length > 0) {
      setNewTaskForm(prev => ({ ...prev, category: taskCategories[0].value }))
    }
  }, [audit?.type])

  // Add Member form state
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberRole, setMemberRole] = useState('Auditor')

  // File upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Edit task form state
  const [editTaskForm, setEditTaskForm] = useState({
    title: '',
    category: '',
    assigneeId: '',
    dueDate: '',
    notes: '',
  })

  // Update edit task form when editing task changes
  useEffect(() => {
    if (editingTask) {
      // Find the category value from the label (task stores label, form needs value)
      const matchedCategory = taskCategories.find(c => c.label === editingTask.category)
      setEditTaskForm({
        title: editingTask.title,
        category: matchedCategory?.value || taskCategories[0]?.value || '',
        assigneeId: editingTask.assignee.id,
        dueDate: editingTask.dueDate,
        notes: editingTask.notes || '',
      })
    }
  }, [editingTask, taskCategories])

  // Close task options dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (taskOptionsId) {
        setTaskOptionsId(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [taskOptionsId])

  // Comment state
  const [newCommentContent, setNewCommentContent] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentContent, setEditingCommentContent] = useState('')

  // Get comments from audit
  const comments = useMemo(() => audit?.comments || [], [audit])

  // Toast state
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })

  const showToast = (message: string) => {
    setToast({ message, visible: true })
    setTimeout(() => setToast({ message: '', visible: false }), 3000)
  }

  // Task handlers
  const handleAddTask = () => {
    if (!newTaskForm.title || !newTaskForm.assigneeId || !newTaskForm.dueDate) {
      showToast(t('auditDetail.pleaseFillRequiredFields'))
      return
    }

    // Find assignee from audit team or current user
    const selectedAssignee = auditTeam.find(m => m.id === newTaskForm.assigneeId) ||
      (currentUser && currentUser.id === newTaskForm.assigneeId ? currentUser : null)
    const category = taskCategories.find(c => c.value === newTaskForm.category)

    auditTaskStore.addTask({
      auditId,
      title: newTaskForm.title,
      description: newTaskForm.notes,
      category: category?.value || newTaskForm.category, // Store value/key, not label
      categoryColor: category?.color || 'blue',
      assignee: {
        id: selectedAssignee?.id || newTaskForm.assigneeId,
        name: selectedAssignee?.name || 'Unknown',
        avatar: selectedAssignee?.name?.split(' ')[0] || 'User',
      },
      dueDate: newTaskForm.dueDate,
      notes: newTaskForm.notes,
    }, audit?.title)

    setNewTaskForm({ title: '', category: taskCategories[0]?.value || 'access-control', assigneeId: '', dueDate: '', notes: '' })
    setShowAddTaskModal(false)
    showToast(t('auditDetail.newControlTaskCreated'))
  }

  const toggleTaskCompletion = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      const newCompleted = !task.completed
      auditTaskStore.toggleTaskCompletion(taskId, newCompleted, { name: currentUser?.name || 'User' }, audit?.title)
      showToast(newCompleted ? t('auditDetail.taskCompleted') : t('auditDetail.taskIncomplete'))
    }
  }

  const handleEditTask = () => {
    if (!editingTask || !editTaskForm.title || !editTaskForm.assigneeId || !editTaskForm.dueDate) {
      showToast(t('auditDetail.pleaseFillRequiredFields'))
      return
    }

    // Find assignee from audit team or current user
    const selectedAssignee = auditTeam.find(m => m.id === editTaskForm.assigneeId) ||
      (currentUser && currentUser.id === editTaskForm.assigneeId ? currentUser : null)
    const category = taskCategories.find(c => c.value === editTaskForm.category)

    auditTaskStore.updateTask(editingTask.id, {
      title: editTaskForm.title,
      description: editTaskForm.notes,
      category: category?.value || editTaskForm.category, // Store value/key, not label
      categoryColor: category?.color || editingTask.categoryColor,
      assignee: {
        id: selectedAssignee?.id || editTaskForm.assigneeId,
        name: selectedAssignee?.name || editingTask.assignee.name,
        avatar: selectedAssignee?.name?.split(' ')[0] || editingTask.assignee.avatar,
      },
      dueDate: editTaskForm.dueDate,
      notes: editTaskForm.notes,
    }, audit?.title)

    setShowEditTaskModal(false)
    setEditingTask(null)
    showToast(t('auditDetail.taskUpdated'))
  }

  // Document handlers
  const handleFileUpload = () => {
    if (!uploadFile) {
      showToast(t('auditDetail.pleaseSelectFile'))
      return
    }

    const fileType = uploadFile.type.includes('pdf') ? 'pdf' :
                     uploadFile.type.includes('image') ? 'image' : 'doc'

    addDocument(auditId, {
      name: uploadFile.name,
      type: fileType,
    }, { name: currentUser?.name || 'User' })

    setUploadFile(null)
    setShowUploadModal(false)
    showToast(t('auditDetail.documentUploaded'))
  }

  const handleRemoveDocument = (docId: string) => {
    removeDocument(auditId, docId)
    showToast(t('auditDetail.documentRemoved'))
  }

  // Team handlers
  const handleAddTeamMember = () => {
    if (!selectedMemberId) {
      showToast(t('auditDetail.pleaseSelectTeamMember'))
      return
    }

    const selectedMember = teamMembers.find(m => m.id === selectedMemberId)
    if (!selectedMember) return

    addTeamMember(auditId, {
      id: selectedMember.id,
      name: selectedMember.name,
      avatar: selectedMember.avatar || selectedMember.name.split(' ')[0],
      role: memberRole,
      isOwner: false,
    })

    setSelectedMemberId('')
    setMemberRole('Auditor')
    setShowAddMemberModal(false)
    showToast(t('auditDetail.teamMemberAdded'))
  }

  const handleRemoveTeamMember = (memberId: string) => {
    removeTeamMember(auditId, memberId)
    showToast(t('auditDetail.teamMemberRemoved'))
  }

  const handleTimelineClick = (item: TimelineItem) => {
    setSelectedTimeline(item)
    setShowTimelineModal(true)
  }

  // Comment handlers
  const handleAddComment = () => {
    if (!newCommentContent.trim()) return

    addComment(auditId, newCommentContent, {
      id: currentUser?.id || '',
      name: currentUser?.name || 'Anonymous',
      avatar: currentUser?.avatar || currentUser?.name?.split(' ')[0] || 'User',
    })

    setNewCommentContent('')
    showToast(t('auditDetail.commentAdded'))
  }

  const handleEditComment = (commentId: string) => {
    if (!editingCommentContent.trim()) return

    editComment(auditId, commentId, editingCommentContent, { name: currentUser?.name || 'User' })
    setEditingCommentId(null)
    setEditingCommentContent('')
    showToast(t('auditDetail.commentUpdated'))
  }

  const handleDeleteComment = (commentId: string) => {
    deleteComment(auditId, commentId, { name: currentUser?.name || 'User' })
    showToast(t('auditDetail.commentDeleted'))
  }

  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddComment()
    }
  }

  const startEditingComment = (comment: AuditComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentContent(comment.content)
  }

  // Status flow handlers
  const statusLabels: Record<Audit['status'], string> = {
    pending: t('auditDetail.pending'),
    in_progress: t('auditDetail.inProgress'),
    completed: t('auditDetail.completed'),
    overdue: t('auditDetail.overdue'),
  }

  const handleStatusChange = async (newStatus: Audit['status']) => {
    await updateStatus(auditId, newStatus, { name: currentUser?.name || 'User' })
    showToast(t('auditDetail.statusChangedTo').replace('{{status}}', statusLabels[newStatus]))
  }

  const categoryColors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  const timelineStyles = {
    completed: { bg: 'bg-emerald-500', icon: 'lucide:check-circle-2' },
    upload: { bg: 'bg-blue-500', icon: 'lucide:file-plus-2' },
    comment: { bg: 'bg-slate-200 text-slate-500', icon: 'lucide:message-square' },
  }

  // Get active team members for dropdown (filter out already added)
  const availableTeamMembers = useMemo(() => {
    const addedIds = auditTeam.map(m => m.id)
    return teamMembers.filter(m => m.status === 'active' && !addedIds.includes(m.id))
  }, [teamMembers, auditTeam])

  // First-load: the audit hasn't landed from either the list fetch or the
  // detail fetch yet. Show a centered spinner only in that case; otherwise we
  // render the header immediately and per-section skeletons cover deferred
  // child collections (team/comments/documents/activity).
  if (!audit && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Icon icon="lucide:loader-2" className="text-4xl text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">{t('common.loading')}...</p>
        </div>
      </div>
    )
  }

  // 404 state
  if (!audit && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon icon="lucide:file-x" className="text-4xl text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t('auditDetail.notFound')}</h2>
          <p className="text-sm text-slate-500 mb-6">{t('auditDetail.notFoundDescription')}</p>
          <Link href="/reports/audits">
            <Button variant="primary">
              <Icon icon="lucide:arrow-left" />
              {t('auditDetail.backToAudits')}
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Get status config
  const statusConfig = auditStatusConfig[audit?.status || 'pending']

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={`flex items-center gap-3 ${isRTL ? 'text-right' : ''}`}>
          {/* W45: explicit back button (letters parity) + the crumb now lands
              on the AUDITS tab, not the default compliance-review tab. */}
          <Link
            href="/reports/audits"
            className="w-9 h-9 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors shrink-0"
            aria-label={t('auditDetail.backToAudits')}
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
          </Link>
          <div>
            <div className={`flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5`}>
              <Link href="/reports/audits" className="hover:text-emerald-600 transition-colors cursor-pointer">{t('auditDetail.audits')}</Link>
              <Icon icon={isRTL ? "lucide:chevron-left" : "lucide:chevron-right"} />
              <span className="text-emerald-600">{t('auditDetail.details')}</span>
            </div>
            <h1 className="text-xl font-bold font-display text-slate-900">{audit?.title || ''}</h1>
          </div>
        </div>

        <div className={`flex items-center gap-4`}>
          <div className="relative hidden md:block">
            <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input
              type="text"
              placeholder={t('auditDetail.searchTask')}
              className={`py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
            />
          </div>
          <Button variant="outline" onClick={() => setShowEditModal(true)}>
            <Icon icon="lucide:edit-3" />
            {t('auditDetail.editAudit')}
          </Button>
          <Button
            variant="outline"
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Icon icon="lucide:trash-2" />
            {t('common.delete')}
          </Button>
          <Button variant="primary" className="shadow-lg shadow-emerald-100" onClick={() => setShowShareModal(true)}>
            <Icon icon="lucide:share-2" />
            {t('auditDetail.shareProgress')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-8">
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Main Details & Tasks */}
            <div className="lg:col-span-2 space-y-8">
              {/* Audit Title & Description Card */}
              <Card className="p-8">
                <div className={`flex items-start justify-between mb-4`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-2xl font-bold font-display text-slate-900 mb-3">{audit?.title || ''}</h2>
                    <p className="text-slate-600 leading-relaxed max-w-2xl">
                      {audit?.description || (audit?.type ? `${auditTypeLabel(audit.type)} - Progress: ${calculatedProgress}%` : '')}
                    </p>
                  </div>
                  <Badge variant={statusConfig.variant} className="shrink-0 border border-emerald-100">{statusConfig.label}</Badge>
                </div>
                <div className={`flex flex-wrap gap-6 mt-6 pt-6 border-t border-slate-100`}>
                  <div className={`flex items-center gap-2 text-slate-500`}>
                    <Icon icon="lucide:calendar" className="text-lg text-emerald-500" />
                    <span className="text-sm font-medium">{t('auditDetail.started')}: {audit?.createdAt ? formatLocalizedDateShort(audit.createdAt, isRTL) : '-'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-slate-500`}>
                    <Icon icon="lucide:tag" className="text-lg text-blue-500" />
                    <span className="text-sm font-medium">{t('auditDetail.type')}: {audit?.type ? auditTypeLabel(audit.type) : '-'}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-slate-500`}>
                    <Icon icon="lucide:clock" className="text-lg text-purple-500" />
                    <span className="text-sm font-medium">{t('auditDetail.dueDate')}: {audit?.dueDate ? formatLocalizedDateShort(audit.dueDate, isRTL) : '-'}</span>
                  </div>
                </div>
              </Card>

              {/* Task Checklist */}
              <Card>
                <div className={`p-6 border-b border-slate-100 flex items-center justify-between`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.controlChecklist')}</h3>
                  <div className={`flex gap-2`}>
                    <button className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer" title={t('auditDetail.filterTasks')}>
                      <Icon icon="lucide:filter" />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                      title={t('auditDetail.addNewControlTask')}
                      onClick={() => setShowAddTaskModal(true)}
                    >
                      <Icon icon="lucide:plus-circle" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {!detailLoaded && tasks.length === 0 ? (
                    <div className="p-6 space-y-3" data-testid="tasks-skeleton" aria-busy="true">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-4">
                          <Skeleton className="w-5 h-5 rounded shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3.5 w-1/2" />
                            <Skeleton className="h-3 w-3/4" />
                          </div>
                          <Skeleton className="w-6 h-6 shrink-0 !rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icon icon="lucide:clipboard-list" className="text-2xl text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-900 mb-1">{t('auditDetail.noTasksYet')}</p>
                      <p className="text-xs text-slate-500 mb-4">{t('auditDetail.addTasksToTrack')}</p>
                      <Button variant="outline" size="sm" onClick={() => setShowAddTaskModal(true)}>
                        <Icon icon="lucide:plus" />
                        {t('auditDetail.addTask')}
                      </Button>
                    </div>
                  ) : tasks.map((task) => (
                    <div key={task.id} className="checklist-item-wrapper">
                      <div
                        className="p-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors group cursor-pointer"
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      >
                        <div className="mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTaskCompletion(task.id)
                            }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                              task.completed
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-300 hover:border-emerald-500'
                            }`}
                          >
                            {task.completed && <Icon icon="lucide:check" className="text-sm" />}
                          </button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-bold ${task.completed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</span>
                            <span className={`px-2 py-0.5 ${categoryColors[task.categoryColor]} text-[10px] font-bold rounded uppercase`}>
                              {taskCategories.find(c => c.value === task.category)?.label || task.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{task.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <img
                            src={dicebearAvatar(task.assignee.avatar)}
                            className="w-6 h-6 rounded-full"
                            alt={task.assignee.name}
                          />
                          <div className="relative">
                            <button
                              className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-600 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTaskOptionsId(taskOptionsId === task.id ? null : task.id)
                              }}
                            >
                              <Icon icon="lucide:more-vertical" />
                            </button>
                            {taskOptionsId === task.id && (
                              <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50`}>
                                <button
                                  className="w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingTask(task)
                                    setShowEditTaskModal(true)
                                    setTaskOptionsId(null)
                                  }}
                                >
                                  <Icon icon="lucide:pencil" className="text-slate-400" />
                                  {t('common.edit')}
                                </button>
                                <button
                                  className="w-full px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    auditTaskStore.deleteTask(task.id, task.title, audit?.title)
                                    setTaskOptionsId(null)
                                    showToast(t('auditDetail.taskDeleted'))
                                  }}
                                >
                                  <Icon icon="lucide:trash-2" className="text-rose-400" />
                                  {t('common.delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {expandedTaskId === task.id && (
                        <div className={`bg-slate-50 px-4 pb-4`}>
                          <div className="border-t border-slate-200 pt-3 space-y-2">
                            <p className="text-xs text-slate-600"><span className="font-bold">{t('auditDetail.assignee')}:</span> {task.assignee.name}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold">{t('auditDetail.dueDate')}:</span> {formatLocalizedDateShort(task.dueDate, isRTL)}</p>
                            {task.notes && <p className="text-xs text-slate-600"><span className="font-bold">{t('common.notes')}:</span> {task.notes}</p>}
                            {task.completed && task.completedAt && (
                              <p className="text-xs text-emerald-600"><span className="font-bold">{t('auditDetail.completedLabel')}:</span> {formatLocalizedDateShort(task.completedAt, isRTL)}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {tasks.length > 5 && (
                  <div className="p-4 bg-slate-50/50 flex justify-center">
                    <button className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer">{t('auditDetail.viewMoreTasks').replace('{count}', String(tasks.length - 5))}</button>
                  </div>
                )}
              </Card>

              {/* Activity Timeline */}
              <Card className="p-6">
                <h3 className={`text-sm font-bold text-slate-900 mb-8`}>{t('auditDetail.auditActivityTimeline')}</h3>
                {!detailLoaded ? (
                  <div className="space-y-6" data-testid="activity-skeleton" aria-busy="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-4">
                        <Skeleton className="w-6 h-6 shrink-0 !rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-2/3" />
                          <Skeleton className="h-2.5 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : timelineItems.length === 0 ? (
                  <div className="py-8 text-center">
                    <Icon icon="lucide:activity" className="text-3xl text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">{t('auditDetail.noActivityYet')}</p>
                  </div>
                ) : (
                  <div className="space-y-8 relative">
                    {timelineItems.map((item, index) => (
                      <div
                        key={item.id}
                        className={`flex gap-4 relative cursor-pointer hover:bg-slate-50/50 -mx-4 px-4 py-2 rounded-xl transition-colors`}
                        onClick={() => handleTimelineClick(item)}
                      >
                        {/* Timeline line */}
                        {index < timelineItems.length - 1 && (
                          <div className={`absolute ${isRTL ? 'right-[11px]' : 'left-[11px]'} top-[24px] bottom-0 w-0.5 bg-slate-200 ml-4`}></div>
                        )}
                        <div className={`relative z-10 w-6 h-6 rounded-full ${item.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[item.type].bg + ' text-white'} flex items-center justify-center ring-4 ring-white shrink-0`}>
                          <Icon icon={timelineStyles[item.type].icon} className="text-sm" />
                        </div>
                        <div className={`flex-1 pb-2`}>
                          <p className="text-sm text-slate-900">
                            <span className="font-bold">{item.user}</span>{' '}
                            {item.action}{' '}
                            {item.type !== 'comment' && <span className="font-medium">{item.detail}</span>}
                          </p>
                          {item.type === 'comment' && item.detail && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg mt-2 italic">{item.detail}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">{formatTimelineDate(item.timestamp, isRTL)}{item.type === 'completed' && ` - ${t('auditDetail.automatedEvidenceCaptured')}`}{item.type === 'upload' && ` - ${t('auditDetail.artifactStorage')}`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Right: Info & Team */}
            <div className="space-y-8">
              {/* Audit Metadata */}
              <Card className="overflow-hidden">
                <div className={`p-6 bg-slate-50/50 border-b border-slate-100`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditOverview')}</h3>
                </div>
                <div className="p-6 space-y-6">
                  {/* Status Flow */}
                  <div>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block mb-4">
                      {t('auditDetail.statusFlow')}
                    </span>

                    {/* Overdue Warning Banner - shown at top when overdue and not completed */}
                    {isOverdue && audit?.status !== 'completed' && (
                      <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                        <Icon icon="lucide:alert-triangle" className="text-rose-500 shrink-0" />
                        <span className="text-sm font-medium text-rose-700">
                          {t('auditDetail.overdueWarning')}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      {/* Pending / Overdue */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                          isOverdue && audit?.status !== 'completed'
                            ? 'border-rose-500 bg-rose-50'
                            : audit?.status === 'pending' || audit?.status === 'overdue'
                              ? 'border-amber-500 bg-amber-50'
                              : audit?.status === 'in_progress' || audit?.status === 'completed'
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 bg-slate-50'
                        }`}>
                          {audit?.status === 'in_progress' || audit?.status === 'completed' ? (
                            <Icon icon="lucide:check" className="text-emerald-500" />
                          ) : isOverdue ? (
                            <Icon icon="lucide:alert-triangle" className="text-rose-500 text-sm" />
                          ) : (
                            <div className={`w-3 h-3 rounded-full ${audit?.status === 'pending' || audit?.status === 'overdue' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                          )}
                        </div>
                        <span className={`text-[10px] font-bold mt-1 ${isOverdue && audit?.status !== 'completed' ? 'text-rose-600' : 'text-slate-600'}`}>
                          {isOverdue && audit?.status !== 'completed'
                            ? t('auditDetail.overdue')
                            : t('auditDetail.pending')}
                        </span>
                      </div>

                      {/* Connector line */}
                      <div className={`flex-1 h-0.5 mx-2 ${
                        audit?.status === 'in_progress' || audit?.status === 'completed'
                          ? 'bg-emerald-500'
                          : isOverdue
                            ? 'bg-rose-300'
                            : 'bg-slate-200'
                      }`} />

                      {/* In Progress */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                          isOverdue && audit?.status === 'in_progress'
                            ? 'border-rose-500 bg-rose-50'
                            : audit?.status === 'in_progress'
                              ? 'border-blue-500 bg-blue-50'
                              : audit?.status === 'completed'
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 bg-slate-50'
                        }`}>
                          {audit?.status === 'completed' ? (
                            <Icon icon="lucide:check" className="text-emerald-500" />
                          ) : audit?.status === 'in_progress' ? (
                            isOverdue ? (
                              <Icon icon="lucide:alert-triangle" className="text-rose-500 text-sm" />
                            ) : (
                              <div className="w-3 h-3 rounded-full bg-blue-500" />
                            )
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-slate-300" />
                          )}
                        </div>
                        <span className={`text-[10px] font-bold mt-1 ${isOverdue && audit?.status === 'in_progress' ? 'text-rose-600' : 'text-slate-600'}`}>
                          {t('auditDetail.inProgress')}
                        </span>
                      </div>

                      {/* Connector line */}
                      <div className={`flex-1 h-0.5 mx-2 ${
                        audit?.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-200'
                      }`} />

                      {/* Completed */}
                      <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                          audit?.status === 'completed'
                            ? audit?.closedOverdue
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}>
                          {audit?.status === 'completed' ? (
                            audit?.closedOverdue ? (
                              <Icon icon="lucide:alert-circle" className="text-amber-500" />
                            ) : (
                              <Icon icon="lucide:check" className="text-emerald-500" />
                            )
                          ) : (
                            <div className="w-3 h-3 rounded-full bg-slate-300" />
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 mt-1">{t('auditDetail.completed')}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {(audit?.status === 'pending' || audit?.status === 'overdue') && (
                        <LoadingButton
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          loading={isMutating}
                          onClick={() => handleStatusChange('in_progress')}
                        >
                          <Icon icon="lucide:play" />
                          {t('auditDetail.startAudit')}
                        </LoadingButton>
                      )}
                      {audit?.status === 'in_progress' && (
                        <LoadingButton
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          loading={isMutating}
                          onClick={() => handleStatusChange('completed')}
                        >
                          <Icon icon="lucide:check-circle" />
                          {isOverdue
                            ? t('auditDetail.closeOverdue')
                            : t('auditDetail.markComplete')}
                        </LoadingButton>
                      )}
                      {audit?.status === 'completed' && (
                        <div className={`flex-1 py-2 px-3 rounded-lg text-center ${
                          audit?.closedOverdue
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-emerald-50 border border-emerald-200'
                        }`}>
                          <span className={`text-sm font-medium flex items-center justify-center gap-1 ${audit?.closedOverdue ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {audit?.closedOverdue ? (
                              <>
                                <Icon icon="lucide:alert-circle" />
                                {t('auditDetail.closedOverdue')}
                              </>
                            ) : (
                              <>
                                <Icon icon="lucide:check-circle-2" />
                                {t('auditDetail.auditCompleted')}
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {audit?.status === 'completed' && audit?.frequency && audit.frequency !== 'ad_hoc' && nextOccurrence && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setShowScheduleNextModal(true)}
                      >
                        <Icon icon="lucide:calendar-plus" />
                        {t('auditDetail.scheduleNextAudit')}
                      </Button>
                    )}
                  </div>

                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.progress')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${calculatedProgress}%` }} />
                      </div>
                      <span className="text-sm font-bold text-slate-900">{calculatedProgress}%</span>
                    </div>
                  </div>
                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.dueDate')}</span>
                    <span className="text-sm font-bold text-slate-900">{audit?.dueDate ? formatLocalizedDateShort(audit.dueDate, isRTL) : '-'}</span>
                  </div>
                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.type')}</span>
                    <span className="text-sm font-bold text-slate-900">{audit?.type ? auditTypeLabel(audit.type) : '-'}</span>
                  </div>
                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.categoryLabel')}</span>
                    <span className="text-sm font-bold text-slate-900">{categoryLabel(audit?.category)}</span>
                  </div>
                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.frequencyLabel')}</span>
                    <span className="text-sm font-bold text-slate-900">{audit?.frequency ? auditFrequencyLabels[audit.frequency] : '-'}</span>
                  </div>
                  <div className={`flex justify-between items-center`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.priority')}</span>
                    <span className="text-sm font-bold text-slate-900">{audit?.priority ? auditPriorityLabels[audit.priority] : '-'}</span>
                  </div>
                  {nextOccurrence && (
                    <div className={`flex justify-between items-center`}>
                      <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                        {t('auditDetail.nextOccurrenceLabel')}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {formatLocalizedDateShort(nextOccurrence, isRTL)}{' '}
                        <span className="text-xs font-medium text-slate-500">
                          ({formatFutureCountdown(nextOccurrence, t)})
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Team Members */}
              <Card>
                <div className={`p-6 border-b border-slate-100 flex items-center justify-between`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditTeam')}</h3>
                  <button
                    className="text-emerald-600 text-xs font-bold hover:underline cursor-pointer"
                    onClick={() => setShowManageTeamModal(true)}
                  >
                    {t('auditDetail.manage')}
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {!detailLoaded ? (
                    <div className="space-y-3" data-testid="team-skeleton" aria-busy="true">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="w-9 h-9 shrink-0 !rounded-full" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-1/2" />
                            <Skeleton className="h-2.5 w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : auditTeam.length === 0 ? (
                    <div className="py-4 text-center">
                      <Icon icon="lucide:users" className="text-2xl text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">{t('auditDetail.noTeamMembers')}</p>
                    </div>
                  ) : auditTeam.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => showToast(t('auditDetail.viewingMemberDetails'))}
                    >
                      <img
                        src={dicebearAvatar(member.avatar)}
                        className="w-9 h-9 rounded-full bg-slate-100 shrink-0"
                        alt={member.name}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{member.name}</p>
                        <p className="text-[11px] text-slate-400 uppercase font-bold tracking-tighter">{member.role}</p>
                      </div>
                      {member.isOwner && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Owner</span>
                      )}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title={t('auditDetail.message')} onClick={(e) => { e.stopPropagation(); showToast(t('auditDetail.messageActionTriggered')) }}>
                          <Icon icon="lucide:message-circle" className="text-sm" />
                        </button>
                        {!member.isOwner && (
                          <button className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" title={t('auditDetail.remove')} onClick={(e) => { e.stopPropagation(); handleRemoveTeamMember(member.id) }}>
                            <Icon icon="lucide:user-x" className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className={`w-full mt-4 py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2 cursor-pointer`}
                    onClick={() => setShowAddMemberModal(true)}
                  >
                    <Icon icon="lucide:user-plus" />
                    {t('auditDetail.addMember')}
                  </button>
                </div>
              </Card>

              {/* Comments Section */}
              <Card>
                <div className={`p-6 border-b border-slate-100 flex items-center justify-between`}>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('auditDetail.comments')} ({comments.length})
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  {/* Comments list */}
                  {!detailLoaded ? (
                    <div className="space-y-4" data-testid="comments-skeleton" aria-busy="true">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <Skeleton className="w-8 h-8 shrink-0 !rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-1/3" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-2/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="py-4 text-center">
                      <Icon icon="lucide:message-square" className="text-2xl text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">{t('auditDetail.noComments')}</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[300px] overflow-y-auto hide-scrollbar">
                      {[...comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((comment) => (
                        <div key={comment.id} className="group">
                          <div className="flex items-start gap-3">
                            <img
                              src={dicebearAvatar(comment.author.avatar)}
                              className="w-8 h-8 rounded-full bg-slate-100 shrink-0"
                              alt={comment.author.name}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{comment.author.name}</span>
                                <span className="text-xs text-slate-400">
                                  {formatTimelineDate(comment.createdAt, isRTL)}
                                </span>
                                {comment.isEdited && (
                                  <span className="text-xs text-slate-400 italic">({t('common.edited')})</span>
                                )}
                              </div>
                              {editingCommentId === comment.id ? (
                                <div className="mt-2">
                                  <textarea
                                    value={editingCommentContent}
                                    onChange={(e) => setEditingCommentContent(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                                    rows={2}
                                  />
                                  <div className="flex gap-2 mt-2">
                                    <LoadingButton variant="primary" size="sm" loading={isMutating} onClick={() => handleEditComment(comment.id)}>
                                      {t('common.save')}
                                    </LoadingButton>
                                    <Button variant="outline" size="sm" onClick={() => { setEditingCommentId(null); setEditingCommentContent('') }}>
                                      {t('common.cancel')}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-slate-600 mt-1 break-words">{comment.content}</p>
                              )}
                            </div>
                            {editingCommentId !== comment.id && (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                {canEditComment(currentUser, comment.author.id) && (
                                  <button
                                    className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                    title={t('common.edit')}
                                    onClick={() => startEditingComment(comment)}
                                  >
                                    <Icon icon="lucide:edit-2" className="text-sm" />
                                  </button>
                                )}
                                {canDeleteComment(currentUser, comment.author.id) && (
                                  <button
                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                    title={t('common.delete')}
                                    onClick={() => handleDeleteComment(comment.id)}
                                  >
                                    <Icon icon="lucide:trash-2" className="text-sm" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add comment form */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex gap-3">
                      <img
                        src={dicebearAvatar(currentUser?.avatar || currentUser?.name?.split(' ')[0] || 'User')}
                        className="w-8 h-8 rounded-full bg-slate-100 shrink-0"
                        alt={currentUser?.name || 'User'}
                      />
                      <div className="flex-1">
                        <textarea
                          value={newCommentContent}
                          onChange={(e) => setNewCommentContent(e.target.value)}
                          onKeyDown={handleCommentKeyDown}
                          placeholder={t('auditDetail.addCommentPlaceholder')}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                          rows={2}
                        />
                        <div className="flex justify-end mt-2">
                          <LoadingButton
                            variant="primary"
                            size="sm"
                            onClick={handleAddComment}
                            disabled={!newCommentContent.trim()}
                            loading={isMutating}
                          >
                            <Icon icon="lucide:send" />
                            {t('auditDetail.submit')}
                          </LoadingButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Related Documents / Quick Access Artifacts */}
              <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                <h3 className={`text-sm font-bold mb-4 flex items-center gap-2`}>
                  <Icon icon="lucide:folder" className="text-emerald-400" />
                  {t('auditDetail.quickAccessArtifacts')}
                </h3>
                <div className="space-y-3">
                  {!detailLoaded ? (
                    <div className="space-y-2" data-testid="documents-skeleton" aria-busy="true">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-700/40" />
                      ))}
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">{t('auditDetail.noDocumentsYet')}</p>
                  ) : documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors group"
                    >
                      <Icon
                        icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
                        className="text-slate-500 group-hover:text-emerald-400"
                      />
                      <span className="text-xs font-medium text-slate-300 flex-1">{doc.name}</span>
                      <button
                        onClick={() => handleRemoveDocument(doc.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Icon icon="lucide:x" className="text-sm" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:border-emerald-500 hover:text-emerald-400 transition-all cursor-pointer"
                  >
                    <Icon icon="lucide:upload" />
                    <span className="text-xs font-bold">{t('auditDetail.uploadDocumentButton')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Audit Modal */}
      <EditAuditModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        audit={audit || null}
        calculatedProgress={calculatedProgress}
        onSuccess={() => showToast(t('auditDetail.auditDetailsUpdated'))}
      />

      <AddAuditModal
        isOpen={showScheduleNextModal}
        onClose={() => setShowScheduleNextModal(false)}
        initialValues={scheduleNextInitialValues}
      />

      {/* Share Progress Modal */}
      <Modal isOpen={showShareModal} onClose={() => setShowShareModal(false)} title={t('auditDetail.shareAuditProgress')} size="md">
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.shareWithTeamMembers')}</label>
            <div className={`flex flex-wrap gap-2 mb-3`}>
              <span className={`px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2`}>
                Felix H.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
              <span className={`px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2`}>
                Sarah C.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
            </div>
            <input type="text" placeholder={t('common.email')} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all`} />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.shareableLink')}</label>
            <div className={`flex gap-2`}>
              <input type="text" value="https://app.complianceos.com/audit/iso27001-review" readOnly className={`flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm`} />
              <Button variant="secondary" onClick={() => showToast(t('auditDetail.linkCopied'))}>
                <Icon icon="lucide:copy" />
                {t('auditDetail.copy')}
              </Button>
            </div>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.includeInReport')}</label>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.taskCompletionStatus')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.activityTimeline')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer`}>
                <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.teamMemberDetails')}</span>
              </label>
            </div>
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => setShowShareModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => { setShowShareModal(false); showToast(t('auditDetail.progressReportSent')) }}>
            <Icon icon="lucide:send" />
            {t('auditDetail.sendReport')}
          </Button>
        </div>
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={showAddTaskModal} onClose={() => setShowAddTaskModal(false)} title={t('auditDetail.addNewControlTaskTitle')} size="md">
        <div className="space-y-5">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.taskName')}</label>
            <input
              type="text"
              placeholder={t('auditDetail.taskNamePlaceholder')}
              value={newTaskForm.title}
              onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('common.category')}</label>
            <EditableSelect
              locked
              value={newTaskForm.category}
              onChange={(id) => setNewTaskForm(prev => ({ ...prev, category: id }))}
              items={taskCategories.map((cat) => ({ id: cat.value, label: cat.label }))}
              isRTL={isRTL}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.assignee')}</label>
              <EditableSelect
                locked
                value={newTaskForm.assigneeId || null}
                onChange={(id) => setNewTaskForm(prev => ({ ...prev, assigneeId: id }))}
                items={[
                  ...(currentUser && !auditTeam.some(m => m.id === currentUser.id)
                    ? [{ id: currentUser.id, label: `${currentUser.name} ${t('auditDetail.youSuffix')}` }]
                    : []),
                  ...auditTeam.map((member) => ({
                    id: member.id,
                    label: `${member.name}${member.id === currentUser?.id ? ` ${t('auditDetail.youSuffix')}` : ''}`,
                  })),
                ]}
                placeholder={t('auditDetail.selectAssignee')}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.dueDate')}</label>
              <input
                type="date"
                value={newTaskForm.dueDate}
                onChange={(e) => setNewTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
              />
            </div>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('common.notes')}</label>
            <textarea
              rows={2}
              placeholder={t('auditDetail.optionalNotes')}
              value={newTaskForm.notes}
              onChange={(e) => setNewTaskForm(prev => ({ ...prev, notes: e.target.value }))}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none`}
            />
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => setShowAddTaskModal(false)}>{t('common.cancel')}</Button>
          <LoadingButton variant="primary" loading={isMutating} onClick={handleAddTask}>{t('auditDetail.createTask')}</LoadingButton>
        </div>
      </Modal>

      {/* Edit Task Modal */}
      <Modal isOpen={showEditTaskModal} onClose={() => { setShowEditTaskModal(false); setEditingTask(null); }} title={t('auditDetail.editTaskTitle')} size="md">
        <div className="space-y-5">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.taskName')}</label>
            <input
              type="text"
              placeholder={t('auditDetail.taskNamePlaceholder')}
              value={editTaskForm.title}
              onChange={(e) => setEditTaskForm(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('common.category')}</label>
            <EditableSelect
              locked
              value={editTaskForm.category}
              onChange={(id) => setEditTaskForm(prev => ({ ...prev, category: id }))}
              items={taskCategories.map((cat) => ({ id: cat.value, label: cat.label }))}
              isRTL={isRTL}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.assignee')}</label>
              <EditableSelect
                locked
                value={editTaskForm.assigneeId || null}
                onChange={(id) => setEditTaskForm(prev => ({ ...prev, assigneeId: id }))}
                items={[
                  ...(currentUser && !auditTeam.some(m => m.id === currentUser.id)
                    ? [{ id: currentUser.id, label: `${currentUser.name} ${t('auditDetail.youSuffix')}` }]
                    : []),
                  ...auditTeam.map((member) => ({
                    id: member.id,
                    label: `${member.name}${member.id === currentUser?.id ? ` ${t('auditDetail.youSuffix')}` : ''}`,
                  })),
                ]}
                placeholder={t('auditDetail.selectAssignee')}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.dueDate')}</label>
              <input
                type="date"
                value={editTaskForm.dueDate}
                onChange={(e) => setEditTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`}
              />
            </div>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('common.notes')}</label>
            <textarea
              rows={2}
              placeholder={t('auditDetail.optionalNotes')}
              value={editTaskForm.notes}
              onChange={(e) => setEditTaskForm(prev => ({ ...prev, notes: e.target.value }))}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none`}
            />
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => { setShowEditTaskModal(false); setEditingTask(null); }}>{t('common.cancel')}</Button>
          <LoadingButton variant="primary" loading={isMutating} onClick={handleEditTask}>{t('auditDetail.updateTask')}</LoadingButton>
        </div>
      </Modal>

      {/* Manage Team Modal */}
      <Modal isOpen={showManageTeamModal} onClose={() => setShowManageTeamModal(false)} title={t('auditDetail.manageAuditTeam')} size="md">
        <div className="space-y-4 max-h-[400px] overflow-y-auto hide-scrollbar">
          {auditTeam.map((member) => (
            <div key={member.id} className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50`}>
              <div className={`flex items-center gap-3`}>
                <img src={dicebearAvatar(member.avatar)} className="w-10 h-10 rounded-full" alt={member.name} />
                <div>
                  <p className="text-sm font-bold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
              </div>
              {member.isOwner ? (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">{t('auditDetail.owner')}</span>
              ) : (
                <button
                  className="text-rose-500 hover:text-rose-700 cursor-pointer"
                  onClick={() => handleRemoveTeamMember(member.id)}
                >
                  <Icon icon="lucide:trash-2" />
                </button>
              )}
            </div>
          ))}
          <button
            className={`w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2 cursor-pointer`}
            onClick={() => { setShowManageTeamModal(false); setShowAddMemberModal(true) }}
          >
            <Icon icon="lucide:user-plus" />
            {t('auditDetail.addNewMember')}
          </button>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100">
          <Button variant="dark" className="w-full" onClick={() => setShowManageTeamModal(false)}>{t('auditDetail.done')}</Button>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal isOpen={showAddMemberModal} onClose={() => setShowAddMemberModal(false)} title={t('auditDetail.addTeamMember')} size="md">
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>Select Team Member</label>
            <EditableSelect
              locked
              value={selectedMemberId || null}
              onChange={(id) => setSelectedMemberId(id)}
              items={availableTeamMembers.map((member) => ({
                id: member.id,
                label: `${member.name} - ${member.department}`,
              }))}
              placeholder={t('auditDetail.selectTeamMember')}
              isRTL={isRTL}
            />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2`}>{t('auditDetail.role')}</label>
            <EditableSelect
              locked
              value={memberRole}
              onChange={(id) => setMemberRole(id)}
              items={[
                { id: 'Auditor', label: t('auditDetail.auditor') },
                { id: 'Security Officer', label: t('auditDetail.securityOfficer') },
                { id: 'Compliance Analyst', label: t('auditDetail.complianceAnalyst') },
                { id: 'Reviewer', label: t('auditDetail.reviewer') },
              ]}
              isRTL={isRTL}
            />
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => setShowAddMemberModal(false)} disabled={isMutating}>{t('common.cancel')}</Button>
          <LoadingButton variant="primary" loading={isMutating} onClick={handleAddTeamMember}>
            <Icon icon="lucide:user-plus" />
            {t('auditDetail.addMember')}
          </LoadingButton>
        </div>
      </Modal>

      {/* File Upload Modal */}
      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title={t('auditDetail.uploadDocument')} size="md">
        <div className="space-y-6">
          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-emerald-300 transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
            <Icon icon="lucide:upload-cloud" className="text-4xl text-slate-400 mx-auto mb-3" />
            {uploadFile ? (
              <p className="text-sm font-medium text-slate-900">{uploadFile.name}</p>
            ) : (
              <>
                <p className="text-sm font-bold text-slate-700 mb-1">{t('auditDetail.clickToUpload')}</p>
                <p className="text-xs text-slate-500">{t('auditDetail.fileTypesAllowed')}</p>
              </>
            )}
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => { setUploadFile(null); setShowUploadModal(false) }} disabled={isMutating}>{t('common.cancel')}</Button>
          <LoadingButton variant="primary" loading={isMutating} onClick={handleFileUpload} disabled={!uploadFile}>
            <Icon icon="lucide:upload" />
            {t('auditDetail.upload')}
          </LoadingButton>
        </div>
      </Modal>

      {/* Timeline Detail Modal */}
      <Modal isOpen={showTimelineModal} onClose={() => setShowTimelineModal(false)} title={t('auditDetail.activityDetails')} size="md">
        {selectedTimeline && (
          <div className="space-y-4">
            <div className={`flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${selectedTimeline.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[selectedTimeline.type].bg}`}>
                <Icon icon={timelineStyles[selectedTimeline.type].icon} className="text-xl" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{selectedTimeline.user}</p>
                <p className="text-sm text-slate-600">{selectedTimeline.action}</p>
                <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(selectedTimeline.timestamp, t)}</p>
              </div>
            </div>
            {selectedTimeline.detail && (
              <p className={`text-sm text-slate-600 leading-relaxed italic border-l-4 border-slate-100 pl-4`}>
                {selectedTimeline.detail}
              </p>
            )}
            <div className={`bg-slate-50 p-4 rounded-xl`}>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('auditDetail.evidenceHash')}</h4>
              <code className="text-[10px] text-slate-500 break-all bg-white p-2 block border border-slate-200 rounded">sha256:8f2a3194...e71c9b2f</code>
            </div>
          </div>
        )}
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3`}>
          <Button variant="outline" onClick={() => setShowTimelineModal(false)}>{t('common.close')}</Button>
          <Button variant="dark">
            <Icon icon="lucide:download" />
            {t('auditDetail.downloadLogs')}
          </Button>
        </div>
      </Modal>

      {/* Delete Audit Confirmation */}
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          await deleteAudit(auditId)
          router.push('/reports/audits')
        }}
        itemType={t('reports.audit')}
        itemName={audit?.title || ''}
        description={`This will permanently delete the audit and all its team assignments, comments, documents, findings, and activity. This cannot be undone.`}
        requireConfirmation
      />

      {/* Toast Notification */}
      <div
        className={`fixed bottom-8 left-1/2 z-[200] px-6 py-3 bg-slate-900 text-white text-sm font-medium rounded-full shadow-2xl transition-all duration-300 flex items-center gap-2  ${
          toast.visible ? `-translate-x-1/2 -translate-y-8 opacity-100` : `-translate-x-1/2 translate-y-0 opacity-0 pointer-events-none`
        }`}
      >
        <Icon icon="lucide:check-circle" className="text-emerald-400" />
        <span>{toast.message}</span>
      </div>
    </div>
  )
}
