import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Policy, PolicyFilters, PolicyStatus } from '@/types'

interface PolicyState {
  policies: Policy[]
  selectedPolicy: Policy | null
  filters: PolicyFilters

  // Actions
  getNextId: () => string
  create: (data: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>) => Policy
  update: (id: string, data: Partial<Policy>) => void
  delete: (id: string) => void
  setSelected: (policy: Policy | null) => void
  setFilters: (filters: PolicyFilters) => void
  clearFilters: () => void

  // Status transitions
  submitForReview: (id: string) => void
  approve: (id: string) => void
  initiateReview: (id: string) => void

  // Review alerts: policies with nextReviewDate ≤ 90 days from now OR status 'expired'
  reviewAlerts: () => Policy[]
}

const seedPolicies: Policy[] = [
  {
    id: 'POL-001',
    name: 'AML Policy',
    description: 'Anti-Money Laundering policy covering customer due diligence, suspicious activity reporting, and regulatory compliance requirements.',
    status: 'approved',
    category: 'compliance',
    version: 'v2.3',
    approvalTier: 'management-sharia',
    owner: { name: 'Sarah Connor', avatar: 'Sarah', department: 'Compliance' },
    lastReviewDate: '2025-08-15',
    nextReviewDate: '2026-08-15',  // ~170 days from Mar 2026
    reviewCycleDays: 365,
    approvedDate: '2025-08-20',
    versionHistory: [
      { version: 'v2.3', date: '2025-08-20', author: 'Sarah Connor', changes: 'Updated suspicious activity thresholds' },
      { version: 'v2.2', date: '2025-02-10', author: 'Michael Scott', changes: 'Added PEP screening requirements' },
      { version: 'v2.1', date: '2024-09-05', author: 'Sarah Connor', changes: 'Revised CDD procedures' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2025-07-01', user: 'Sarah Connor', status: 'completed' },
      { step: 'Legal Review', date: '2025-07-15', user: 'David Wallace', status: 'completed' },
      { step: 'Compliance Review', date: '2025-08-01', user: 'Ahmed Al-Rashid', status: 'completed' },
      { step: 'Final Approval', date: '2025-08-20', user: 'Executive Committee', status: 'completed' },
    ],
    createdAt: '2025-07-01T00:00:00.000Z',
    updatedAt: '2025-08-20T00:00:00.000Z',
  },
  {
    id: 'POL-002',
    name: 'Information Security Policy',
    description: 'Enterprise-wide information security policy covering data protection, access controls, and incident response procedures.',
    status: 'under-review',
    category: 'it',
    version: 'v1.8',
    approvalTier: 'board',
    owner: { name: 'Felix Henderson', avatar: 'Felix', department: 'IT Security' },
    lastReviewDate: '2025-01-10',
    nextReviewDate: '2026-01-10',  // overdue in Mar 2026
    reviewCycleDays: 365,
    versionHistory: [
      { version: 'v1.8', date: '2025-10-01', author: 'Felix Henderson', changes: 'Added cloud security controls' },
      { version: 'v1.7', date: '2025-01-10', author: 'Felix Henderson', changes: 'Updated incident response procedures' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2025-09-15', user: 'Felix Henderson', status: 'completed' },
      { step: 'Technical Review', date: '2025-09-25', user: 'IT Team', status: 'completed' },
      { step: 'Compliance Review', date: '2025-10-05', user: 'Sarah Connor', status: 'current' },
      { step: 'Final Approval', date: '', user: 'Board', status: 'pending' },
    ],
    createdAt: '2025-09-15T00:00:00.000Z',
    updatedAt: '2025-10-05T00:00:00.000Z',
  },
  {
    id: 'POL-003',
    name: 'Data Privacy Policy',
    description: 'Comprehensive data privacy policy aligned with PDPL requirements covering personal data processing, consent management, and data subject rights.',
    status: 'approved',
    category: 'compliance',
    version: 'v3.0',
    approvalTier: 'board',
    owner: { name: 'Michael Scott', avatar: 'Michael', department: 'Legal' },
    lastReviewDate: '2025-06-20',
    nextReviewDate: '2026-06-20',  // ~110 days from Mar 2026
    reviewCycleDays: 365,
    approvedDate: '2025-06-25',
    versionHistory: [
      { version: 'v3.0', date: '2025-06-25', author: 'Michael Scott', changes: 'Major revision for PDPL compliance' },
      { version: 'v2.5', date: '2024-12-01', author: 'Michael Scott', changes: 'Updated consent requirements' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2025-05-01', user: 'Michael Scott', status: 'completed' },
      { step: 'Legal Review', date: '2025-05-20', user: 'David Wallace', status: 'completed' },
      { step: 'DPO Review', date: '2025-06-10', user: 'Privacy Officer', status: 'completed' },
      { step: 'Final Approval', date: '2025-06-25', user: 'Board', status: 'completed' },
    ],
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-06-25T00:00:00.000Z',
  },
  {
    id: 'POL-004',
    name: 'Business Continuity Plan',
    description: 'Business continuity and disaster recovery plan outlining procedures for maintaining operations during disruptions.',
    status: 'draft',
    category: 'operations',
    version: 'v1.0',
    approvalTier: 'agm',
    owner: { name: 'Kelly Kapoor', avatar: 'Kelly', department: 'Operations' },
    lastReviewDate: '',
    nextReviewDate: '2026-05-01',  // ~60 days from Mar 2026 - triggers alert
    reviewCycleDays: 365,
    versionHistory: [
      { version: 'v1.0', date: '2025-10-15', author: 'Kelly Kapoor', changes: 'Initial draft' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2025-10-15', user: 'Kelly Kapoor', status: 'current' },
      { step: 'Technical Review', date: '', user: 'IT Team', status: 'pending' },
      { step: 'Management Review', date: '', user: 'Operations Head', status: 'pending' },
      { step: 'Final Approval', date: '', user: 'AGM', status: 'pending' },
    ],
    createdAt: '2025-10-15T00:00:00.000Z',
    updatedAt: '2025-10-15T00:00:00.000Z',
  },
  {
    id: 'POL-005',
    name: 'Vendor Management Policy',
    description: 'Third-party vendor management policy covering due diligence, contract requirements, and ongoing monitoring.',
    status: 'expired',
    category: 'risk',
    version: 'v2.1',
    approvalTier: 'management-sharia',
    owner: { name: 'David Wallace', avatar: 'David', department: 'Risk Management' },
    lastReviewDate: '2024-06-15',
    nextReviewDate: '2025-06-15',  // expired
    reviewCycleDays: 365,
    approvedDate: '2024-06-20',
    versionHistory: [
      { version: 'v2.1', date: '2024-06-20', author: 'David Wallace', changes: 'Added cloud vendor requirements' },
      { version: 'v2.0', date: '2023-06-10', author: 'David Wallace', changes: 'Major revision' },
    ],
    workflowTimeline: [
      { step: 'Draft Created', date: '2024-05-01', user: 'David Wallace', status: 'completed' },
      { step: 'Risk Review', date: '2024-05-20', user: 'Risk Team', status: 'completed' },
      { step: 'Legal Review', date: '2024-06-05', user: 'Legal Team', status: 'completed' },
      { step: 'Final Approval', date: '2024-06-20', user: 'Executive Committee', status: 'completed' },
    ],
    createdAt: '2024-05-01T00:00:00.000Z',
    updatedAt: '2024-06-20T00:00:00.000Z',
  },
]

export const usePolicyStore = create<PolicyState>()(
  persist(
    (set, get) => ({
      policies: seedPolicies,
      selectedPolicy: null,
      filters: {},

      getNextId: (): string => {
        const existing = get().policies
          .map((p) => {
            const match = p.id.match(/^POL-(\d+)$/)
            return match ? parseInt(match[1], 10) : 0
          })
        const maxNum = existing.length > 0 ? Math.max(...existing) : 0
        return `POL-${String(maxNum + 1).padStart(3, '0')}`
      },

      create: (data) => {
        const now = new Date().toISOString()
        const id = get().getNextId()
        const newPolicy: Policy = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ policies: [newPolicy, ...state.policies] }))
        return newPolicy
      },

      update: (id, data) => {
        const now = new Date().toISOString()
        set((state) => ({
          policies: state.policies.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: now } : p
          ),
          selectedPolicy:
            state.selectedPolicy?.id === id
              ? { ...state.selectedPolicy, ...data, updatedAt: now }
              : state.selectedPolicy,
        }))
      },

      delete: (id) => {
        set((state) => ({
          policies: state.policies.filter((p) => p.id !== id),
          selectedPolicy: state.selectedPolicy?.id === id ? null : state.selectedPolicy,
        }))
      },

      setSelected: (policy) => set({ selectedPolicy: policy }),
      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),

      submitForReview: (id) => {
        get().update(id, { status: 'under-review' as PolicyStatus })
      },

      approve: (id) => {
        const now = new Date().toISOString().split('T')[0]
        get().update(id, { status: 'approved' as PolicyStatus, approvedDate: now })
      },

      initiateReview: (id) => {
        get().update(id, { status: 'draft' as PolicyStatus })
      },

      reviewAlerts: (): Policy[] => {
        const now = new Date()
        const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
        return get().policies.filter((p) => {
          if (p.status === 'expired') return true
          if (p.nextReviewDate) {
            const reviewDate = new Date(p.nextReviewDate)
            return reviewDate <= ninetyDays
          }
          return false
        })
      },
    }),
    {
      name: 'policy-storage',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Inject seed data for users with empty localStorage from v0
          const state = persistedState as { policies?: Policy[] }
          if (!state.policies || state.policies.length === 0) {
            return { ...state, policies: seedPolicies }
          }
        }
        return persistedState as PolicyState
      },
      partialize: (state) => ({ policies: state.policies }),
    }
  )
)
