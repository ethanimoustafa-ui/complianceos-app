import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type {
  Circular,
  CircularArticle,
  CircularAuthority,
  CircularFilters,
  CircularWorkflowStep,
  CircularTimelineEvent,
  CircularVersionEntry,
  Attachment,
  ChecklistItem,
  ArticleVersionEntry,
  ArticleTimelineEvent,
  CircularPendingEdit,
} from '@/types'

interface CircularState {
  circulars: Circular[]
  selectedCircular: Circular | null
  filters: CircularFilters

  // Actions
  getNextReference: (authority: CircularAuthority) => string
  create: (data: Omit<Circular, 'id' | 'reference' | 'createdAt' | 'updatedAt'> & {
    capDeadline?: string
    remediationDeadline?: string
    referenceUrl?: string
  }) => Circular
  update: (id: string, data: Partial<Circular>) => void
  delete: (id: string) => void
  setSelected: (circular: Circular | null) => void
  setFilters: (filters: CircularFilters) => void
  clearFilters: () => void
  assignBusinessOwner: (id: string, dept: string) => void
  setPdfUrl: (circularId: string, dataUrl: string) => void
  clearPdfUrl: (circularId: string) => void

  // Article actions
  addArticle: (circularId: string, article: Omit<CircularArticle, 'id'>) => void
  updateArticle: (circularId: string, articleId: string, data: Partial<CircularArticle>) => void
  deleteArticle: (circularId: string, articleId: string) => void
  toggleChecklistItem: (circularId: string, articleId: string, itemId: string) => void
  addChecklistItem: (circularId: string, articleId: string, title: string) => void
  deleteChecklistItem: (circularId: string, articleId: string, itemId: string) => void

  // Article timeline
  addArticleTimelineEvent: (circularId: string, articleId: string, event: Omit<ArticleTimelineEvent, 'id'>) => void

  // Workflow actions
  advanceWorkflowStep: (circularId: string, stepId: string, notes?: string) => void

  // Circular edit approval workflow
  requestCircularEdit: (circularId: string, editData: Partial<Circular>) => void
  approveCircularEditStep: (circularId: string, approvalId: string, notes: string) => void
  rejectCircularEditStep: (circularId: string, approvalId: string, notes: string) => void

  // Attachment actions
  addCAPAttachment: (circularId: string, file: { name: string; size?: number; dataUrl?: string; type?: string }) => void
  addRemediationAttachment: (circularId: string, file: { name: string; size?: number; dataUrl?: string; type?: string }) => void
  removeCAPAttachment: (circularId: string, attachmentId: string) => void
  removeRemediationAttachment: (circularId: string, attachmentId: string) => void

  // Timeline
  addTimelineEvent: (circularId: string, event: Omit<CircularTimelineEvent, 'id'>) => void
}

// ── Workflow step definitions ─────────────────────────────────────────────────

export function buildInitialWorkflowSteps(): CircularWorkflowStep[] {
  return [
    // Phase 0
    { id: 'cap-review', phase: 0, label: 'CAP Review', labelAr: 'مراجعة خطة التقييم', status: 'current', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'cap-approved', phase: 0, label: 'CAP Approval', labelAr: 'اعتماد خطة التقييم', status: 'pending', actionLabel: 'Approve', actionLabelAr: 'اعتماد', requiresNotes: true, actionType: 'approve' },
    // Phase 1
    { id: 'notify-bo', phase: 1, label: 'Notify Business Owner', labelAr: 'إشعار المالك التنفيذي', status: 'pending', actionLabel: 'Notify', actionLabelAr: 'إشعار', requiresNotes: false, actionType: 'notify-bo' },
    { id: 'cap-received', phase: 1, label: 'Corrective Action Plan Received', labelAr: 'استلام خطة العمل التصحيحي', status: 'pending', actionLabel: 'Acknowledge Receipt', actionLabelAr: 'تأكيد الاستلام', requiresNotes: false, actionType: 'acknowledge' },
    { id: 'cap-under-review', phase: 1, label: 'Corrective Action Plan Under Review', labelAr: 'مراجعة خطة العمل التصحيحي', status: 'pending', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'cap-final-approved', phase: 1, label: 'Corrective Action Plan Approved — Notify Authority', labelAr: 'اعتماد نهائي — إشعار الجهة', status: 'pending', actionLabel: 'Notify Authority', actionLabelAr: 'إشعار الجهة', requiresNotes: true, actionType: 'notify-authority' },
    // Phase 2
    { id: 'remediation-in-progress', phase: 2, label: 'Remediation In Progress', labelAr: 'التنفيذ جارٍ', status: 'pending', actionLabel: 'Start Remediation', actionLabelAr: 'بدء التنفيذ', requiresNotes: false, actionType: 'start' },
    { id: 'remediation-submitted', phase: 2, label: 'Evidence Submitted', labelAr: 'تقديم الأدلة', status: 'pending', actionLabel: 'Submit Evidence', actionLabelAr: 'تقديم الأدلة', requiresNotes: false, actionType: 'submit' },
    { id: 'remediation-under-review', phase: 2, label: 'Remediation Under Review', labelAr: 'مراجعة التنفيذ', status: 'pending', actionLabel: 'Start Review', actionLabelAr: 'بدء المراجعة', requiresNotes: false, actionType: 'review' },
    { id: 'remediation-approved', phase: 2, label: 'Completed — Authority Notified', labelAr: 'مكتمل — تم إشعار الجهة', status: 'pending', actionLabel: 'Complete', actionLabelAr: 'إتمام', requiresNotes: true, actionType: 'complete' },
  ]
}

// Build steps with first N completed, step N+1 as current
function buildStepsWithProgress(completedIds: string[]): CircularWorkflowStep[] {
  const steps = buildInitialWorkflowSteps()
  let foundCurrent = false
  for (let i = 0; i < steps.length; i++) {
    if (completedIds.includes(steps[i].id)) {
      steps[i].status = 'completed'
      steps[i].date = '2026-01-15'
      steps[i].user = 'System'
    } else if (!foundCurrent) {
      steps[i].status = 'current'
      foundCurrent = true
    } else {
      steps[i].status = 'pending'
    }
  }
  return steps
}

// Progress from checklist items + workflow steps
function recalcProgress(c: Circular): number {
  const allChecklist = c.articles.flatMap(a => a.checklist ?? [])
  const totalItems = allChecklist.length
  const doneItems = allChecklist.filter(i => i.completed).length
  const steps = c.workflowSteps ?? buildInitialWorkflowSteps()
  const totalSteps = steps.length
  const doneSteps = steps.filter(s => s.status === 'completed').length
  const checklistPct = totalItems > 0 ? doneItems / totalItems : 0
  const phasePct = totalSteps > 0 ? doneSteps / totalSteps : 0
  return Math.round((checklistPct * 0.6 + phasePct * 0.4) * 100)
}

// Helper: sync selectedCircular when circulars array changes
function syncSelected(
  selectedCircular: Circular | null,
  circulars: Circular[],
  targetId: string
): Circular | null {
  if (selectedCircular?.id !== targetId) return selectedCircular
  return circulars.find((c) => c.id === targetId) ?? selectedCircular
}

// ── Seed data ─────────────────────────────────────────────────────────────────

const seedCirculars: Circular[] = [
  {
    id: 'circ-001',
    reference: 'SAMA-2026-001',
    authority: 'SAMA',
    title: 'ESG Disclosure & Reporting Framework',
    priority: 'critical',
    status: 'in-progress',
    applicability: 'applicable',
    departments: ['Finance', 'Risk'],
    businessOwnerDepartment: 'Finance',
    progress: 45,
    issuanceDate: '2026-01-15',
    dueDate: '2026-06-30',
    capStatus: 'in-progress',
    capDueDate: '2026-05-31',
    capDeadline: '2026-05-31',
    remediationDeadline: '2026-06-15',
    referenceUrl: 'https://www.sama.gov.sa/circulars/esg-disclosure-2026',
    articles: [
      {
        id: 'a1',
        articleNumber: 'Art. 1',
        title: 'Disclosure Requirements',
        description: 'ESG impact disclosure for investment portfolios',
        riskLevel: 'critical',
        responsibleDepartment: 'Finance',
        complianceStatus: 'in-progress',
        assignedTo: 'Sarah Connor',
        checklist: [
          { id: 'cl1', title: 'Review SAMA ESG guidelines', completed: true, order: 1 },
          { id: 'cl2', title: 'Map current disclosures to requirements', completed: true, order: 2 },
          { id: 'cl3', title: 'Draft disclosure policy', completed: false, order: 3 },
          { id: 'cl4', title: 'Internal review and sign-off', completed: false, order: 4 },
        ],
        attachments: [],
        versions: [{ version: 1, date: '2026-01-15', author: 'System', summary: 'Article created', fieldChanges: {}, approved: true }],
        timeline: [{ id: 't-a1-1', title: 'Article Created', titleAr: 'تم إنشاء المادة', date: '2026-01-15', user: 'System', status: 'completed' }],
      },
      {
        id: 'a2',
        articleNumber: 'Art. 2',
        title: 'Reporting Standards',
        description: 'Alignment with GRI standards',
        riskLevel: 'high',
        responsibleDepartment: 'Compliance',
        complianceStatus: 'not-started',
        checklist: [],
        attachments: [],
        versions: [{ version: 1, date: '2026-01-15', author: 'System', summary: 'Article created', fieldChanges: {}, approved: true }],
        timeline: [{ id: 't-a2-1', title: 'Article Created', titleAr: 'تم إنشاء المادة', date: '2026-01-15', user: 'System', status: 'completed' }],
      },
    ],
    description: 'SAMA circular mandating ESG disclosure and reporting standards for financial institutions.',
    workflowSteps: buildStepsWithProgress(['cap-review', 'cap-approved']),
    timeline: [
      { id: 't1', title: 'Circular Registered', titleAr: 'تم تسجيل التعميم', date: '2026-01-15', user: 'System', status: 'completed' },
      { id: 't2', title: 'CAP Review completed', titleAr: 'اكتملت مراجعة خطة التقييم', date: '2026-01-20', user: 'Ahmed Al-Rashidi', status: 'completed' },
      { id: 't3', title: 'CAP Approved — entering Phase 1', titleAr: 'تمت الموافقة على الخطة — بدء المرحلة 1', date: '2026-01-25', user: 'Fatima Al-Zahrani', status: 'completed' },
      { id: 't4', title: 'Awaiting CAP from Business Owner', titleAr: 'في انتظار خطة العمل من المالك التنفيذي', date: '2026-01-25', status: 'active' },
    ],
    versions: [
      { version: 1, date: '2026-01-15', author: 'System', changes: 'Initial registration', approved: true },
    ],
    capAttachments: [],
    remediationAttachments: [],
    createdAt: '2026-01-15T00:00:00.000Z',
    frameworkIds: ['sama'],
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'circ-002',
    reference: 'SAMA-2026-002',
    authority: 'SAMA',
    title: 'Open Banking API Security Standards V2',
    priority: 'high',
    status: 'in-progress',
    applicability: 'applicable',
    departments: ['IT', 'Security'],
    businessOwnerDepartment: 'IT',
    progress: 62,
    issuanceDate: '2026-02-01',
    dueDate: '2026-08-31',
    capStatus: 'drafting',
    capDueDate: '2026-07-31',
    capDeadline: '2026-07-31',
    remediationDeadline: '2026-08-15',
    referenceUrl: 'https://www.sama.gov.sa/circulars/open-banking-api-v2',
    articles: [],
    description: 'Updated security standards for Open Banking API implementations.',
    workflowSteps: buildStepsWithProgress(['cap-review']),
    timeline: [
      { id: 't1', title: 'Circular Registered', titleAr: 'تم تسجيل التعميم', date: '2026-02-01', user: 'System', status: 'completed' },
      { id: 't2', title: 'CAP Review in progress', titleAr: 'مراجعة خطة التقييم جارية', date: '2026-02-05', status: 'active' },
    ],
    versions: [
      { version: 1, date: '2026-02-01', author: 'System', changes: 'Initial registration', approved: true },
    ],
    capAttachments: [],
    remediationAttachments: [],
    frameworkIds: ['sama'],
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'circ-003',
    reference: 'SAMA-2025-047',
    authority: 'SAMA',
    title: 'Anti-Money Laundering Guidelines Update',
    priority: 'critical',
    status: 'overdue',
    applicability: 'applicable',
    departments: ['Compliance', 'Legal'],
    businessOwnerDepartment: 'Compliance',
    progress: 30,
    issuanceDate: '2025-09-01',
    dueDate: '2025-12-31',
    capStatus: 'submitted',
    capDueDate: '2025-11-30',
    capDeadline: '2025-11-30',
    remediationDeadline: '2025-12-15',
    referenceUrl: 'https://www.sama.gov.sa/circulars/aml-guidelines-2025',
    articles: [],
    description: 'Updated AML guidelines incorporating FATF recommendations for 2025.',
    workflowSteps: buildStepsWithProgress(['cap-review', 'cap-approved', 'notify-bo']),
    timeline: [
      { id: 't1', title: 'Circular Registered', titleAr: 'تم تسجيل التعميم', date: '2025-09-01', user: 'System', status: 'completed' },
      { id: 't2', title: 'CAP Assessment completed', titleAr: 'اكتمل تقييم خطة العمل', date: '2025-09-15', user: 'Omar Khalid', status: 'completed' },
      { id: 't3', title: 'CAP submitted to authority', titleAr: 'تم تقديم الخطة للجهة', date: '2025-11-25', user: 'Omar Khalid', status: 'completed' },
      { id: 't4', title: 'Overdue — awaiting CAP review', titleAr: 'متأخر — في انتظار مراجعة الخطة', date: '2026-01-01', status: 'active' },
    ],
    versions: [
      { version: 1, date: '2025-09-01', author: 'System', changes: 'Initial registration', approved: true },
      { version: 2, date: '2025-11-15', author: 'Omar Khalid', changes: 'Updated CAP details and department assignments', approved: true },
    ],
    capAttachments: [
      { id: 'att1', name: 'AML-CAP-v1.pdf', url: '', type: 'pdf', size: 0, uploadedAt: '2025-11-25', uploadedBy: 'Omar Khalid' },
    ],
    remediationAttachments: [],
    frameworkIds: ['sama'],
    createdAt: '2025-09-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
  },
  {
    id: 'circ-004',
    reference: 'CMA-2026-001',
    authority: 'CMA',
    title: 'Capital Market Conduct Rules Revision',
    priority: 'high',
    status: 'pending',
    applicability: 'pending',
    departments: ['Finance', 'Legal'],
    progress: 0,
    issuanceDate: '2026-01-20',
    dueDate: '2026-09-30',
    capStatus: 'not-started',
    capDeadline: '2026-08-31',
    remediationDeadline: '2026-09-15',
    referenceUrl: 'https://www.cma.org.sa/en/Market/Docs/conduct-rules-2026',
    articles: [],
    description: 'Revised conduct rules for capital market participants.',
    workflowSteps: buildInitialWorkflowSteps(),
    timeline: [
      { id: 't1', title: 'Circular Registered', titleAr: 'تم تسجيل التعميم', date: '2026-01-20', user: 'System', status: 'completed' },
      { id: 't2', title: 'CAP Review pending', titleAr: 'مراجعة خطة التقييم معلقة', date: '2026-01-20', status: 'active' },
    ],
    versions: [
      { version: 1, date: '2026-01-20', author: 'System', changes: 'Initial registration', approved: true },
    ],
    capAttachments: [],
    remediationAttachments: [],
    frameworkIds: ['cma'],
    createdAt: '2026-01-20T00:00:00.000Z',
    updatedAt: '2026-01-20T00:00:00.000Z',
  },
  {
    id: 'circ-005',
    reference: 'SAMA-2025-031',
    authority: 'SAMA',
    title: 'Consumer Protection Rulebook V2.1',
    priority: 'low',
    status: 'completed',
    applicability: 'applicable',
    departments: ['Compliance'],
    businessOwnerDepartment: 'Compliance',
    progress: 100,
    issuanceDate: '2025-06-01',
    dueDate: '2025-12-01',
    capStatus: 'completed',
    capDeadline: '2025-10-31',
    remediationDeadline: '2025-11-15',
    referenceUrl: 'https://www.sama.gov.sa/circulars/consumer-protection-v2-1',
    articles: [],
    description: 'Updated consumer protection rulebook with enhanced disclosure requirements.',
    workflowSteps: buildStepsWithProgress([
      'cap-review', 'cap-approved', 'notify-bo',
      'cap-received', 'cap-under-review', 'cap-final-approved',
      'remediation-in-progress', 'remediation-submitted',
      'remediation-under-review', 'remediation-approved',
    ]),
    timeline: [
      { id: 't1', title: 'Circular Registered', titleAr: 'تم تسجيل التعميم', date: '2025-06-01', user: 'System', status: 'completed' },
      { id: 't2', title: 'CAP Approved', titleAr: 'تمت الموافقة على خطة العمل', date: '2025-07-10', user: 'Nora Al-Ghamdi', status: 'completed' },
      { id: 't3', title: 'CAP submitted to authority', titleAr: 'تم تقديم الخطة للجهة', date: '2025-09-01', user: 'Nora Al-Ghamdi', status: 'completed' },
      { id: 't4', title: 'Remediation evidence submitted', titleAr: 'تم تقديم أدلة المعالجة', date: '2025-11-15', user: 'Nora Al-Ghamdi', status: 'completed' },
      { id: 't5', title: 'Completed — Authority Notified', titleAr: 'مكتمل — تم إشعار الجهة', date: '2025-12-01', user: 'Nora Al-Ghamdi', status: 'completed' },
    ],
    versions: [
      { version: 1, date: '2025-06-01', author: 'System', changes: 'Initial registration', approved: true },
      { version: 2, date: '2025-10-01', author: 'Nora Al-Ghamdi', changes: 'Updated remediation plan and evidence package', approved: true },
    ],
    capAttachments: [
      { id: 'att1', name: 'Consumer-CAP-final.pdf', url: '', type: 'pdf', size: 0, uploadedAt: '2025-09-01', uploadedBy: 'Nora Al-Ghamdi' },
    ],
    remediationAttachments: [
      { id: 'att2', name: 'Remediation-Evidence-Pack.pdf', url: '', type: 'pdf', size: 0, uploadedAt: '2025-11-15', uploadedBy: 'Nora Al-Ghamdi' },
    ],
    frameworkIds: ['sama'],
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
  },
]

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCircularStore = create<CircularState>()(
  persist(
    (set, get) => ({
      circulars: seedCirculars,
      selectedCircular: null,
      filters: {},

      getNextReference: (authority: CircularAuthority): string => {
        const year = new Date().getFullYear()
        const prefix = `${authority}-${year}-`
        const existing = get().circulars
          .filter((c) => c.reference.startsWith(prefix))
          .map((c) => {
            const parts = c.reference.split('-')
            return parseInt(parts[parts.length - 1], 10) || 0
          })
        const maxNum = existing.length > 0 ? Math.max(...existing) : 0
        const next = maxNum + 1
        return `${prefix}${String(next).padStart(3, '0')}`
      },

      create: (data) => {
        const now = new Date().toISOString()
        const reference = get().getNextReference(data.authority)
        const newCircular: Circular = {
          ...data,
          id: crypto.randomUUID(),
          reference,
          capDeadline: data.capDeadline,
          remediationDeadline: data.remediationDeadline,
          referenceUrl: data.referenceUrl,
          workflowSteps: data.workflowSteps ?? buildInitialWorkflowSteps(),
          timeline: data.timeline ?? [
            {
              id: crypto.randomUUID(),
              title: 'Circular Registered',
              titleAr: 'تم تسجيل التعميم',
              date: now.slice(0, 10),
              user: 'System',
              status: 'completed',
            },
          ],
          versions: data.versions ?? [
            { version: 1, date: now.slice(0, 10), author: 'System', changes: 'Initial registration', approved: true },
          ],
          capAttachments: data.capAttachments ?? [],
          remediationAttachments: data.remediationAttachments ?? [],
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ circulars: [newCircular, ...state.circulars] }))
        return newCircular
      },

      update: (id, data) => {
        const now = new Date().toISOString()
        set((state) => ({
          circulars: state.circulars.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: now } : c
          ),
          selectedCircular:
            state.selectedCircular?.id === id
              ? { ...state.selectedCircular, ...data, updatedAt: now }
              : state.selectedCircular,
        }))
      },

      delete: (id) => {
        set((state) => ({
          circulars: state.circulars.filter((c) => c.id !== id),
          selectedCircular: state.selectedCircular?.id === id ? null : state.selectedCircular,
        }))
      },

      setSelected: (circular) => set({ selectedCircular: circular }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),

      assignBusinessOwner: (id, dept) => {
        const now = new Date().toISOString()
        set((state) => ({
          circulars: state.circulars.map((c) =>
            c.id === id ? { ...c, businessOwnerDepartment: dept, updatedAt: now } : c
          ),
          selectedCircular:
            state.selectedCircular?.id === id
              ? { ...state.selectedCircular, businessOwnerDepartment: dept, updatedAt: now }
              : state.selectedCircular,
        }))
      },

      setPdfUrl: (circularId, dataUrl) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        const newEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: 'PDF Uploaded',
          titleAr: 'تم رفع ملف PDF',
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, pdfUrl: dataUrl, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      clearPdfUrl: (circularId) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        const newEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: 'PDF Removed',
          titleAr: 'تم حذف ملف PDF',
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, pdfUrl: undefined, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Article actions ────────────────────────────────────────────────────

      addArticle: (circularId, article) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        const newArticle: CircularArticle = {
          ...article,
          id: crypto.randomUUID(),
          versions: [
            {
              version: 1,
              date: today,
              author: 'Current User',
              summary: 'Article created',
              fieldChanges: {},
              approved: true,
            },
          ],
          timeline: [
            {
              id: nanoid(),
              title: 'Article Created',
              titleAr: 'تم إنشاء المادة',
              date: today,
              user: 'Current User',
              status: 'completed' as const,
            },
          ],
        }
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            const updated = { ...c, articles: [...c.articles, newArticle], updatedAt: now }
            return { ...updated, progress: recalcProgress(updated) }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      updateArticle: (circularId, articleId, updates) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)

        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c

            const articles = c.articles.map((a) => {
              if (a.id !== articleId) return a

              // Compute field diffs
              const trackedFields = [
                'title', 'articleNumber', 'description', 'riskLevel',
                'complianceStatus', 'responsibleDepartment', 'assignedTo',
              ] as const
              const fieldChanges: Record<string, { from: string; to: string }> = {}
              for (const field of trackedFields) {
                const oldVal = String(a[field] ?? '')
                const newVal = String((updates as Record<string, unknown>)[field] ?? a[field] ?? '')
                if (oldVal !== newVal) {
                  fieldChanges[field] = { from: oldVal, to: newVal }
                }
              }

              const nextVer = (a.versions?.length ?? 0) + 1
              const newVersion: ArticleVersionEntry = {
                version: nextVer,
                date: today,
                author: 'Current User',
                summary: 'Article updated',
                fieldChanges,
                approved: true,
              }
              const newTimelineEvent: ArticleTimelineEvent = {
                id: nanoid(),
                title: 'Article Updated',
                titleAr: 'تم تحديث المادة',
                date: today,
                user: 'Current User',
                status: 'completed',
              }

              return {
                ...a,
                ...updates,
                versions: [...(a.versions ?? []), newVersion],
                timeline: [...(a.timeline ?? []), newTimelineEvent],
              }
            })

            const updated = { ...c, articles, updatedAt: now }
            return { ...updated, progress: recalcProgress(updated) }
          })

          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      deleteArticle: (circularId, articleId) => {
        const now = new Date().toISOString()
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            const updated = {
              ...c,
              articles: c.articles.filter((a) => a.id !== articleId),
              updatedAt: now,
            }
            return { ...updated, progress: recalcProgress(updated) }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      toggleChecklistItem: (circularId, articleId, itemId) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            const updated = {
              ...c,
              articles: c.articles.map((a) => {
                if (a.id !== articleId) return a
                const item = a.checklist.find((i) => i.id === itemId)
                const newCompleted = item ? !item.completed : false
                const newEvent: ArticleTimelineEvent = {
                  id: nanoid(),
                  title: `Checklist item ${newCompleted ? 'completed' : 'unchecked'}: ${item?.title ?? itemId}`,
                  titleAr: `عنصر القائمة ${newCompleted ? 'مكتمل' : 'غير مكتمل'}: ${item?.title ?? itemId}`,
                  date: today,
                  user: 'Current User',
                  status: 'completed',
                }
                return {
                  ...a,
                  checklist: a.checklist.map((i) =>
                    i.id === itemId ? { ...i, completed: !i.completed } : i
                  ),
                  timeline: [...(a.timeline ?? []), newEvent],
                }
              }),
              updatedAt: now,
            }
            return { ...updated, progress: recalcProgress(updated) }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      addChecklistItem: (circularId, articleId, title) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        const newItem: ChecklistItem = {
          id: crypto.randomUUID(),
          title,
          completed: false,
          order: Date.now(),
        }
        const newEvent: ArticleTimelineEvent = {
          id: nanoid(),
          title: `Checklist item added: ${title}`,
          titleAr: `تمت إضافة عنصر للقائمة: ${title}`,
          date: today,
          user: 'Current User',
          status: 'completed',
        }
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            return {
              ...c,
              articles: c.articles.map((a) => {
                if (a.id !== articleId) return a
                return { ...a, checklist: [...a.checklist, newItem], timeline: [...(a.timeline ?? []), newEvent] }
              }),
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      deleteChecklistItem: (circularId, articleId, itemId) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            const updated = {
              ...c,
              articles: c.articles.map((a) => {
                if (a.id !== articleId) return a
                const item = a.checklist.find((i) => i.id === itemId)
                const newEvent: ArticleTimelineEvent = {
                  id: nanoid(),
                  title: `Checklist item deleted: ${item?.title ?? itemId}`,
                  titleAr: `تم حذف عنصر من القائمة: ${item?.title ?? itemId}`,
                  date: today,
                  user: 'Current User',
                  status: 'completed',
                }
                return {
                  ...a,
                  checklist: a.checklist.filter((i) => i.id !== itemId),
                  timeline: [...(a.timeline ?? []), newEvent],
                }
              }),
              updatedAt: now,
            }
            return { ...updated, progress: recalcProgress(updated) }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Article timeline ───────────────────────────────────────────────────

      addArticleTimelineEvent: (circularId, articleId, event) => {
        const now = new Date().toISOString()
        const newEvent: ArticleTimelineEvent = { id: nanoid(), ...event }
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            return {
              ...c,
              articles: c.articles.map((a) => {
                if (a.id !== articleId) return a
                return { ...a, timeline: [...(a.timeline ?? []), newEvent] }
              }),
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Workflow ───────────────────────────────────────────────────────────

      advanceWorkflowStep: (circularId, stepId, notes) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)
        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c

            const steps = (c.workflowSteps ?? buildInitialWorkflowSteps()).map((s) => {
              if (s.id === stepId) {
                return { ...s, status: 'completed' as const, date: today, user: 'Current User', notes }
              }
              return s
            })

            // Find the next pending step and make it current
            const updatedSteps: CircularWorkflowStep[] = []
            let setNextCurrent = false
            for (const s of steps) {
              if (s.status === 'completed') {
                updatedSteps.push(s)
              } else if (!setNextCurrent) {
                updatedSteps.push({ ...s, status: 'current' })
                setNextCurrent = true
              } else {
                updatedSteps.push({ ...s, status: 'pending' })
              }
            }

            const advancedStep = (c.workflowSteps ?? []).find((s) => s.id === stepId)
            const newEvent: CircularTimelineEvent = {
              id: nanoid(),
              title: `Step advanced: ${advancedStep?.label ?? stepId}`,
              titleAr: `تم تقديم الخطوة: ${advancedStep?.labelAr ?? stepId}`,
              date: today,
              user: 'Current User',
              status: 'completed',
            }

            return {
              ...c,
              workflowSteps: updatedSteps,
              timeline: [...(c.timeline ?? []), newEvent],
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Circular edit approval workflow ────────────────────────────────────

      requestCircularEdit: (circularId, editData) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)

        // Compute field-level diff
        const currentCircular = get().circulars.find((c) => c.id === circularId)
        const fieldChanges: Record<string, { from: string; to: string }> = {}
        if (currentCircular) {
          const scalarFields = ['title', 'authority', 'priority', 'issuanceDate', 'dueDate', 'capDeadline', 'description', 'businessOwnerDepartment', 'referenceUrl'] as const
          for (const field of scalarFields) {
            const from = String(currentCircular[field] ?? '')
            const to = String((editData as Record<string, unknown>)[field] ?? currentCircular[field] ?? '')
            if (from !== to) fieldChanges[field] = { from, to }
          }
          const fromDepts = (currentCircular.departments ?? []).join(', ')
          const toDepts = (editData.departments ?? currentCircular.departments ?? []).join(', ')
          if (fromDepts !== toDepts) fieldChanges['departments'] = { from: fromDepts, to: toDepts }
        }

        const pendingEdit: CircularPendingEdit = {
          data: editData,
          requestedBy: 'Current User',
          requestedAt: now,
          status: 'pending',
          fieldChanges: Object.keys(fieldChanges).length > 0 ? fieldChanges : undefined,
          approvals: [
            { id: nanoid(), role: 'Compliance Officer', roleAr: 'مسؤول الامتثال', status: 'pending' },
            { id: nanoid(), role: 'Compliance Manager', roleAr: 'مدير الامتثال', status: 'pending' },
          ],
        }

        const newEvent: CircularTimelineEvent = {
          id: nanoid(),
          title: 'Edit Submitted for Approval',
          titleAr: 'طلب تعديل للاعتماد',
          date: today,
          user: 'Current User',
          status: 'active',
        }

        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            return {
              ...c,
              pendingEdit,
              timeline: [...(c.timeline ?? []), newEvent],
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      approveCircularEditStep: (circularId, approvalId, notes) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)

        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            if (!c.pendingEdit) return c

            const updatedApprovals = c.pendingEdit.approvals.map((ap) =>
              ap.id === approvalId
                ? { ...ap, status: 'approved' as const, date: today, user: 'Current User', notes }
                : ap
            )

            const allApproved = updatedApprovals.every((ap) => ap.status === 'approved')

            if (allApproved) {
              // Apply pending edit data to circular, bump version
              const nextVersion = (c.versions?.length ?? 0) + 1
              const newVersion: CircularVersionEntry = {
                version: nextVersion,
                date: today,
                author: 'Current User',
                changes: 'Edit approved and applied',
                fieldChanges: c.pendingEdit?.fieldChanges,
                approved: true,
              }
              const approvedEvent: CircularTimelineEvent = {
                id: nanoid(),
                title: 'Edit Approved',
                titleAr: 'تمت الموافقة على التعديل',
                date: today,
                user: 'Current User',
                status: 'completed',
              }
              return {
                ...c,
                ...c.pendingEdit.data,
                pendingEdit: undefined,
                versions: [...(c.versions ?? []), newVersion],
                timeline: [...(c.timeline ?? []), approvedEvent],
                updatedAt: now,
              }
            }

            const approvedEvent: CircularTimelineEvent = {
              id: nanoid(),
              title: 'Edit Approved',
              titleAr: 'تمت الموافقة على التعديل',
              date: today,
              user: 'Current User',
              status: 'completed',
            }

            return {
              ...c,
              pendingEdit: {
                ...c.pendingEdit,
                approvals: updatedApprovals,
              },
              timeline: [...(c.timeline ?? []), approvedEvent],
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      rejectCircularEditStep: (circularId, approvalId, notes) => {
        const now = new Date().toISOString()
        const today = now.slice(0, 10)

        set((state) => {
          const circulars = state.circulars.map((c) => {
            if (c.id !== circularId) return c
            if (!c.pendingEdit) return c

            const updatedApprovals = c.pendingEdit.approvals.map((ap) =>
              ap.id === approvalId
                ? { ...ap, status: 'rejected' as const, date: today, user: 'Current User', notes }
                : ap
            )

            const rejectedEvent: CircularTimelineEvent = {
              id: nanoid(),
              title: 'Edit Rejected',
              titleAr: 'تم رفض التعديل',
              date: today,
              user: 'Current User',
              status: 'completed',
            }

            return {
              ...c,
              pendingEdit: {
                ...c.pendingEdit,
                status: 'rejected' as const,
                approvals: updatedApprovals,
              },
              timeline: [...(c.timeline ?? []), rejectedEvent],
              updatedAt: now,
            }
          })
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Attachments ────────────────────────────────────────────────────────

      addCAPAttachment: (circularId, file) => {
        const now = new Date().toISOString()
        const attachment: Attachment = {
          id: nanoid(),
          name: file.name,
          url: file.dataUrl ?? '',
          dataUrl: file.dataUrl,
          type: file.type ?? 'application/pdf',
          size: file.size ?? 0,
          uploadedAt: now,
          uploadedBy: 'Current User',
        }
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, capAttachments: [...(c.capAttachments ?? []), attachment], updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      addRemediationAttachment: (circularId, file) => {
        const now = new Date().toISOString()
        const attachment: Attachment = {
          id: nanoid(),
          name: file.name,
          url: file.dataUrl ?? '',
          dataUrl: file.dataUrl,
          type: file.type ?? 'application/pdf',
          size: file.size ?? 0,
          uploadedAt: now,
          uploadedBy: 'Current User',
        }
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, remediationAttachments: [...(c.remediationAttachments ?? []), attachment], updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      removeCAPAttachment: (circularId, attachmentId) => {
        const now = new Date().toISOString()
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, capAttachments: (c.capAttachments ?? []).filter((a) => a.id !== attachmentId), updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      removeRemediationAttachment: (circularId, attachmentId) => {
        const now = new Date().toISOString()
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, remediationAttachments: (c.remediationAttachments ?? []).filter((a) => a.id !== attachmentId), updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },

      // ── Timeline ───────────────────────────────────────────────────────────

      addTimelineEvent: (circularId, event) => {
        const newEvent: CircularTimelineEvent = { ...event, id: nanoid() }
        const now = new Date().toISOString()
        set((state) => {
          const circulars = state.circulars.map((c) =>
            c.id === circularId
              ? { ...c, timeline: [...(c.timeline ?? []), newEvent], updatedAt: now }
              : c
          )
          return {
            circulars,
            selectedCircular: syncSelected(state.selectedCircular, circulars, circularId),
          }
        })
      },
    }),
    {
      name: 'circular-storage',
      version: 7,
      partialize: (state) => ({ circulars: state.circulars }),
      migrate: (persisted: unknown, ver: number) => {
        if (ver < 4) return { circulars: seedCirculars }
        // v4/v5 → v6: rebuild workflowSteps from capStatus for circulars with no real progress
        // "no real progress" = workflowSteps missing, empty, or only cap-review as 'current'
        // with nothing completed (i.e. still at factory-fresh state regardless of capStatus)
        const capStatusSteps: Record<string, string[]> = {
          'not-started': [],
          'drafting':    ['cap-review'],
          'submitted':   ['cap-review', 'cap-approved', 'notify-bo', 'cap-received', 'cap-under-review'],
          'approved':    ['cap-review', 'cap-approved', 'notify-bo', 'cap-received', 'cap-under-review', 'cap-final-approved'],
          'in-progress': ['cap-review', 'cap-approved', 'notify-bo', 'cap-received', 'cap-under-review', 'cap-final-approved', 'remediation-in-progress'],
          'completed':   ['cap-review', 'cap-approved', 'notify-bo', 'cap-received', 'cap-under-review', 'cap-final-approved', 'remediation-in-progress', 'remediation-submitted', 'remediation-under-review', 'remediation-approved'],
        }
        const data = persisted as { circulars: Circular[] }
        let circulars = data.circulars.map((c) => {
          const steps = c.workflowSteps ?? []
          const completedCount = steps.filter(s => s.status === 'completed').length
          const currentStep = steps.find(s => s.status === 'current')
          const hasRealProgress = completedCount > 0 || (currentStep?.phase ?? 0) > 0
          if (!hasRealProgress) {
            const ids = capStatusSteps[c.capStatus] ?? []
            return { ...c, workflowSteps: buildStepsWithProgress(ids) }
          }
          return c
        })
        // v6 → v7: add frameworkIds derived from authority
        if (ver < 7) {
          const AUTH_TO_FW: Record<string, string[]> = {
            SAMA: ['sama'],
            CMA: ['cma'],
            ZATCA: ['zatca'],
            MISA: ['misa'],
            SAFIU: ['safiu'],
            IA: [],
          }
          circulars = circulars.map((c: any) => ({
            ...c,
            frameworkIds: c.frameworkIds ?? (AUTH_TO_FW[c.authority] ?? []),
          }))
        }
        return { circulars }
      },
    }
  )
)
