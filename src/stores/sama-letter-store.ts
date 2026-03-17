import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  SAMALetter,
  SAMALetterType,
  SAMALetterApprovalStep,
  SAMALetterTimelineEvent,
  PaginationState,
  SortState,
} from '@/types'

interface SAMALetterFilters {
  type?: SAMALetterType[]
  status?: SAMALetter['status'][]
  dateRange?: { from: string; to: string }
  search?: string
}

const defaultApprovalChain = (): SAMALetterApprovalStep[] => [
  { step: 1, role: 'Compliance Officer', status: 'pending' },
  { step: 2, role: 'Department Head', status: 'pending' },
  { step: 3, role: 'CEO', status: 'pending' },
]

const RESPONSE_DAYS: Record<string, number> = {
  'non-objection': 30,
  'inquiry': 21,
  'submission': 45,
  'notification': 10,
}

const seedLetters: SAMALetter[] = [
  {
    id: 'sama-001',
    reference: 'NOB-2024-082',
    type: 'non-objection',
    subCategory: 'key-function',
    samaDepartment: 'banking-supervision',
    subject: 'Appointment of Head of Risk - Management Approval',
    subjectAr: 'تعيين رئيس إدارة المخاطر - موافقة الإدارة',
    body: `In accordance with SAMA circular 22/34 regarding the Governance requirements for Financial Institutions, we are writing to formally request a non-objection regarding the appointment of Mr. Ahmad Al-Zahrani as the Chief Risk Officer of ComplianceOS Bank.

Mr. Al-Zahrani possesses over 15 years of experience in regional banking risk management and has previously served as the Head of Operational Risk at a major local bank. We have attached his full professional credentials, FIT test results, and our Board Nomination Committee's recommendation for your review.

We remain at your disposal for any further information or clarification required to process this request.`,
    bodyAr: `إشارة إلى تعميم البنك المركزي السعودي رقم 22/34 بشأن متطلبات الحوكمة للمؤسسات المالية، نود التقدم بطلب رسمي للحصول على عدم ممانعة بشأن تعيين الأستاذ أحمد الزهراني في منصب رئيس إدارة المخاطر ببنك ComplianceOS.

يمتلك الأستاذ الزهراني خبرة تزيد عن 15 عاماً في إدارة المخاطر المصرفية الإقليمية، وقد شغل سابقاً منصب رئيس المخاطر التشغيلية في أحد البنوك المحلية الكبرى. نرفق لكم سيرته الذاتية الكاملة، ونتائج اختبار الملاءمة، وتوصية لجنة الترشيحات بمجلس الإدارة لمراجعتكم.

ونحن على أتم الاستعداد لتزويدكم بأي معلومات إضافية أو إيضاحات مطلوبة لمعالجة هذا الطلب.`,
    status: 'sent',
    priority: 'standard',
    createdBy: 'Felix H.',
    assignedTo: 'Board Secretary',
    approvalChain: [
      { step: 1, role: 'Compliance Officer', status: 'approved', assignedTo: 'Sarah C.', approvedAt: 'Oct 11, 2024' },
      { step: 2, role: 'Department Head', status: 'approved', assignedTo: 'Ahmed K.', approvedAt: 'Oct 11, 2024' },
      { step: 3, role: 'CEO', status: 'approved', assignedTo: 'CEO Office', approvedAt: 'Oct 12, 2024' },
    ],
    timeline: [
      { id: 't1', title: 'Draft Created', date: 'Oct 10, 2024', user: 'Felix H.', status: 'completed' },
      { id: 't2', title: 'Compliance Approved', date: 'Oct 11, 2024', user: 'Sarah C.', status: 'completed' },
      { id: 't3', title: 'Sent to SAMA', date: 'Oct 12, 2024', user: 'Automated System', status: 'active' },
      { id: 't4', title: 'Pending SAMA Reply', date: 'Expected: Nov 12, 2024', status: 'pending' },
    ],
    sentDate: '2024-10-12T00:00:00.000Z',
    attachments: [
      { id: 'att1', name: 'Resume_AlZahrani.pdf', url: '#', type: 'pdf', size: 1258291, uploadedAt: '2024-10-10T00:00:00.000Z', uploadedBy: 'Felix H.' },
      { id: 'att2', name: 'FIT_Results_Final.pdf', url: '#', type: 'pdf', size: 455680, uploadedAt: '2024-10-10T00:00:00.000Z', uploadedBy: 'Felix H.' },
    ],
    relatedObservations: [],
    createdAt: '2024-10-10T00:00:00.000Z',
    updatedAt: '2024-10-12T00:00:00.000Z',
  },
  {
    id: 'sama-002',
    reference: 'SUB-2024-114',
    type: 'submission',
    subCategory: 'quarterly-aml',
    samaDepartment: 'compliance-aml',
    subject: 'Quarterly AML Compliance Self-Assessment Report',
    subjectAr: 'تقرير التقييم الذاتي للامتثال لمكافحة غسل الأموال ربع السنوي',
    body: 'Please find enclosed our quarterly AML compliance self-assessment report as required under SAMA Anti-Money Laundering guidelines. The report covers the assessment period Q3 2024 (July – September) and details our compliance status across all required dimensions.',
    bodyAr: 'نرفق طيه تقرير التقييم الذاتي الربع سنوي لمكافحة غسل الأموال وفق متطلبات المنظومة المتكاملة للامتثال الصادرة عن البنك المركزي السعودي. يغطي التقرير فترة التقييم للربع الثالث 2024 ويستعرض وضع الامتثال عبر جميع المحاور المطلوبة.',
    status: 'sent',
    priority: 'standard',
    createdBy: 'Sarah L.',
    assignedTo: 'Compliance Team',
    approvalChain: [
      { step: 1, role: 'Compliance Officer', status: 'approved', assignedTo: 'Sarah C.', approvedAt: 'Oct 22, 2024' },
      { step: 2, role: 'Department Head', status: 'approved', assignedTo: 'Ahmed K.', approvedAt: 'Oct 23, 2024' },
      { step: 3, role: 'CEO', status: 'approved', assignedTo: 'CEO Office', approvedAt: 'Oct 23, 2024' },
    ],
    timeline: [
      { id: 't1', title: 'Draft Created', date: 'Oct 20, 2024', user: 'Sarah L.', status: 'completed' },
      { id: 't2', title: 'Submitted for Approval', date: 'Oct 21, 2024', user: 'Sarah L.', status: 'completed' },
      { id: 't3', title: 'All Steps Approved', date: 'Oct 23, 2024', user: 'CEO Office', status: 'completed' },
      { id: 't4', title: 'Sent to SAMA', date: 'Oct 24, 2024', user: 'Automated System', status: 'active' },
      { id: 't5', title: 'Pending SAMA Reply', date: 'Expected: Dec 8, 2024', status: 'pending' },
    ],
    sentDate: '2024-10-24T00:00:00.000Z',
    responseDeadline: '2024-12-08T00:00:00.000Z',
    attachments: [],
    relatedObservations: [],
    createdAt: '2024-10-20T00:00:00.000Z',
    updatedAt: '2024-10-24T00:00:00.000Z',
  },
  {
    id: 'sama-003',
    reference: 'INQ-2024-005',
    type: 'inquiry',
    subCategory: 'circular-clarification',
    samaDepartment: 'banking-supervision',
    subject: 'Clarification Request - Circular 44321/2024 (Art. 4)',
    body: 'We respectfully request clarification on the application of Article 4 of Circular 44321/2024 as it pertains to our current compliance framework.',
    bodyAr: 'نود الاستفسار باحترام عن تطبيق المادة الرابعة من التعميم رقم 44321/2024 فيما يتعلق بإطار الامتثال الحالي لدى المؤسسة.',
    status: 'approved',
    priority: 'standard',
    createdBy: 'Ahmed K.',
    assignedTo: 'Legal Team',
    approvalChain: [
      { step: 1, role: 'Compliance Officer', status: 'approved', assignedTo: 'Sarah C.', approvedAt: 'Oct 4, 2024' },
      { step: 2, role: 'Department Head', status: 'approved', assignedTo: 'Ahmed K.', approvedAt: 'Oct 5, 2024' },
      { step: 3, role: 'CEO', status: 'approved', assignedTo: 'CEO Office', approvedAt: 'Oct 5, 2024' },
    ],
    timeline: [
      { id: 't1', title: 'Draft Created', date: 'Oct 01, 2024', user: 'Ahmed K.', status: 'completed' },
      { id: 't2', title: 'Submitted for Approval', date: 'Oct 02, 2024', user: 'Ahmed K.', status: 'completed' },
      { id: 't3', title: 'All Steps Approved', date: 'Oct 05, 2024', user: 'CEO Office', status: 'active' },
    ],
    attachments: [],
    relatedObservations: [],
    createdAt: '2024-10-01T00:00:00.000Z',
    updatedAt: '2024-10-05T00:00:00.000Z',
  },
]

interface SAMALetterState {
  letters: SAMALetter[]
  selectedLetter: SAMALetter | null
  filters: SAMALetterFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => void
  fetchById: (id: string) => SAMALetter | null
  getNextReference: (type: SAMALetterType) => string
  create: (data: Omit<SAMALetter, 'id' | 'createdAt' | 'updatedAt'>) => SAMALetter
  update: (id: string, data: Partial<SAMALetter>) => void
  delete: (id: string) => void
  submitForApproval: (id: string) => void
  approveStep: (id: string, step: 1 | 2 | 3, approverName: string, notes?: string) => void
  rejectStep: (id: string, step: 1 | 2 | 3, approverName: string, notes: string) => void
  send: (id: string) => void
  markResponseReceived: (id: string) => void
  setFilters: (filters: SAMALetterFilters) => void
  clearFilters: () => void
  setSelected: (letter: SAMALetter | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
}

export const useSAMALetterStore = create<SAMALetterState>()(
  persist(
    (set, get) => ({
      letters: seedLetters,
      selectedLetter: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: seedLetters.length,
        totalPages: 1,
      },
      sort: {
        field: 'createdAt',
        direction: 'desc',
      },
      isLoading: false,
      error: null,

      fetchAll: () => {
        // TODO: Replace with actual API call
      },

      fetchById: (id) => {
        // TODO: Replace with actual API call
        return get().letters.find(l => l.id === id) ?? null
      },

      getNextReference: (type) => {
        const prefix = { 'non-objection': 'NOB', inquiry: 'INQ', submission: 'SUB', notification: 'NOT' }[type]
        const year = new Date().getFullYear()
        const yearPrefix = `${prefix}-${year}-`
        const existing = get()
          .letters.filter((l) => l.reference.startsWith(yearPrefix))
          .map((l) => parseInt(l.reference.slice(yearPrefix.length), 10))
          .filter((n) => !isNaN(n))
        const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
        return `${yearPrefix}${String(next).padStart(3, '0')}`
      },

      create: (data) => {
        // TODO: Replace with actual API call
        const now = new Date().toISOString()
        const newLetter: SAMALetter = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ letters: [newLetter, ...state.letters] }))
        return newLetter
      },

      update: (id, data) => {
        // TODO: Replace with actual API call
        set((state) => ({
          letters: state.letters.map((l) =>
            l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l
          ),
          selectedLetter:
            state.selectedLetter?.id === id
              ? { ...state.selectedLetter, ...data, updatedAt: new Date().toISOString() }
              : state.selectedLetter,
        }))
      },

      delete: (id) => {
        // TODO: Replace with actual API call
        set((state) => ({
          letters: state.letters.filter((l) => l.id !== id),
          selectedLetter: state.selectedLetter?.id === id ? null : state.selectedLetter,
        }))
      },

      submitForApproval: (id) => {
        // TODO: Replace with actual API call
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const newEvent: SAMALetterTimelineEvent = {
          id: crypto.randomUUID(),
          title: 'Submitted for Approval',
          date: now,
          status: 'active',
        }
        set((state) => {
          const updater = (l: SAMALetter): SAMALetter => {
            if (l.id !== id) return l
            return {
              ...l,
              status: 'pending-approval',
              approvalChain: defaultApprovalChain(),
              timeline: [...l.timeline, newEvent],
              updatedAt: new Date().toISOString(),
            }
          }
          return {
            letters: state.letters.map(updater),
            selectedLetter: state.selectedLetter?.id === id ? updater(state.selectedLetter) : state.selectedLetter,
          }
        })
      },

      approveStep: (id, step, approverName, notes) => {
        // TODO: Replace with actual API call
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((state) => {
          const updater = (l: SAMALetter): SAMALetter => {
            if (l.id !== id) return l
            const updatedChain = l.approvalChain.map((s) =>
              s.step === step ? { ...s, status: 'approved' as const, approvedAt: now, notes } : s
            )
            const allApproved = updatedChain.every((s) => s.status === 'approved')
            const newStatus = allApproved ? ('approved' as const) : ('pending-approval' as const)
            const eventTitle = notes ? `Approved by ${approverName} — ${notes}` : `Approved by ${approverName}`
            const newEvent: SAMALetterTimelineEvent = {
              id: crypto.randomUUID(),
              title: eventTitle,
              date: now,
              user: approverName,
              status: allApproved ? 'completed' : 'active',
            }
            return {
              ...l,
              approvalChain: updatedChain,
              status: newStatus,
              timeline: [
                ...l.timeline.map((t) => ({ ...t, status: 'completed' as const })),
                newEvent,
              ],
              updatedAt: new Date().toISOString(),
            }
          }
          return {
            letters: state.letters.map(updater),
            selectedLetter: state.selectedLetter?.id === id ? updater(state.selectedLetter) : state.selectedLetter,
          }
        })
      },

      rejectStep: (id, step, approverName, notes) => {
        // TODO: Replace with actual API call
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((state) => {
          const updater = (l: SAMALetter): SAMALetter => {
            if (l.id !== id) return l
            const updatedChain = l.approvalChain.map((s) =>
              s.step === step ? { ...s, status: 'rejected' as const, rejectedAt: now, notes } : s
            )
            const eventTitle = notes ? `Rejected by ${approverName} — ${notes}` : `Rejected by ${approverName}`
            const newEvent: SAMALetterTimelineEvent = {
              id: crypto.randomUUID(),
              title: eventTitle,
              date: now,
              user: approverName,
              status: 'completed',
            }
            return {
              ...l,
              approvalChain: updatedChain,
              status: 'draft',
              timeline: [
                ...l.timeline.map((t) => ({ ...t, status: 'completed' as const })),
                newEvent,
              ],
              updatedAt: new Date().toISOString(),
            }
          }
          return {
            letters: state.letters.map(updater),
            selectedLetter: state.selectedLetter?.id === id ? updater(state.selectedLetter) : state.selectedLetter,
          }
        })
      },

      send: (id) => {
        // TODO: Replace with actual API call
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((state) => {
          const updater = (l: SAMALetter): SAMALetter => {
            if (l.id !== id) return l
            const sentAt = new Date()
            const deadlineDays = RESPONSE_DAYS[l.type] ?? 30
            const deadlineDate = new Date(sentAt)
            deadlineDate.setDate(deadlineDate.getDate() + deadlineDays)
            const deadlineFormatted = deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return {
              ...l,
              status: 'sent',
              sentDate: sentAt.toISOString(),
              responseDeadline: deadlineDate.toISOString(),
              timeline: [
                ...l.timeline.map((t) => ({ ...t, status: 'completed' as const })),
                { id: crypto.randomUUID(), title: 'Sent to SAMA', date: now, user: 'System', status: 'active' as const },
                { id: crypto.randomUUID(), title: 'Pending SAMA Reply', date: `Expected: ${deadlineFormatted}`, status: 'pending' as const },
              ],
              updatedAt: new Date().toISOString(),
            }
          }
          return {
            letters: state.letters.map(updater),
            selectedLetter: state.selectedLetter?.id === id ? updater(state.selectedLetter) : state.selectedLetter,
          }
        })
      },

      markResponseReceived: (id) => {
        // TODO: Replace with actual API call
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((state) => {
          const updater = (l: SAMALetter): SAMALetter => {
            if (l.id !== id) return l
            return {
              ...l,
              status: 'response-received',
              responseReceivedDate: new Date().toISOString(),
              timeline: [
                ...l.timeline.map((t) => ({ ...t, status: 'completed' as const })),
                { id: crypto.randomUUID(), title: 'Response Received', date: now, user: 'System', status: 'completed' as const },
              ],
              updatedAt: new Date().toISOString(),
            }
          }
          return {
            letters: state.letters.map(updater),
            selectedLetter: state.selectedLetter?.id === id ? updater(state.selectedLetter) : state.selectedLetter,
          }
        })
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (letter) => set({ selectedLetter: letter }),
      setSort: (sort) => set({ sort }),
      setPage: (page) => set((state) => ({ pagination: { ...state.pagination, page } })),
      setPageSize: (pageSize) =>
        set((state) => ({
          pagination: {
            ...state.pagination,
            pageSize,
            totalPages: Math.ceil(state.pagination.total / pageSize),
          },
        })),
    }),
    {
      name: 'sama-letter-store',
      version: 3,
      partialize: (state) => ({ letters: state.letters }),
    }
  )
)
