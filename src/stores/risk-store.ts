import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Risk,
  RiskFilters,
  PaginationState,
  SortState,
  MonitoringFrequency,
  MitigationChecklistItem,
  RiskMitigationWorkflowStatus,
  DepartmentProposedPlan,
} from '@/types'
import { computeNextReview } from '@/lib/review-schedule'

function computeNextReviewDate(from: string, frequency: MonitoringFrequency): string {
  const d = new Date(from)
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'semi_annual': d.setMonth(d.getMonth() + 6); break
    case 'annual': d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString()
}

function computeMitigationProgress(checklist?: Array<{ completed: boolean }>): number {
  if (!checklist || checklist.length === 0) return 0
  return Math.round(checklist.filter(i => i.completed).length / checklist.length * 100)
}

const owner = (id: string, name: string, department: string, avatar: string, role: 'officer' | 'manager' | 'admin' = 'manager') => ({
  id, name, email: `${name.split(' ')[0].toLowerCase()}@company.com`, role, department, avatar, workload: 60,
})

const seedRisks: Risk[] = [
  {
    id: 'risk-001',
    title: 'Inadequate customer due diligence for high-risk accounts',
    description: 'KYC refresh cycles for PEP and high-risk customer segments are lagging the SAMA AML expectations, creating heightened exposure to sanctions and AML findings.',
    category: 'compliance',
    likelihood: 4,
    impact: 5,
    riskScore: 20,
    status: 'mitigating',
    owner: owner('1', 'Sarah Connor', 'Compliance', 'Sarah'),
    mitigationPlan: 'Implement automated KYC refresh triggers, reallocate two analysts to backlog clearance, and introduce monthly PEP screening reports.',
    mitigationChecklist: [
      { id: 'c1', text: 'Configure automated PEP screening triggers', completed: true },
      { id: 'c2', text: 'Clear 300-case KYC refresh backlog', completed: true },
      { id: 'c3', text: 'Roll out monthly management dashboard', completed: false },
      { id: 'c4', text: 'Independent QA sampling of 5% of refreshed files', completed: false },
    ],
    mitigationProgress: 50,
    monitoringFrequency: 'monthly',
    lastReviewDate: '2026-03-20T09:00:00.000Z',
    nextReviewDate: '2026-04-20T09:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2026-01-10T09:00:00.000Z', user: 'Sarah Connor', action: 'created' },
      { id: 'h2', timestamp: '2026-02-15T12:00:00.000Z', user: 'Sarah Connor', action: 'status_changed', previousValue: 'identified', newValue: 'mitigating' },
      { id: 'h3', timestamp: '2026-03-20T09:00:00.000Z', user: 'Sarah Connor', action: 'reviewed' },
    ],
    frameworkIds: ['sama'],
    createdAt: '2026-01-10T09:00:00.000Z',
    updatedAt: '2026-03-20T09:00:00.000Z',
  },
  {
    id: 'risk-002',
    title: 'Third-party cloud vendor concentration risk',
    description: 'Critical workloads are concentrated with a single cloud provider, exposing the bank to availability and data residency risk under NCA ECC and SAMA Cybersecurity Framework.',
    category: 'operational',
    likelihood: 3,
    impact: 5,
    riskScore: 15,
    status: 'identified',
    owner: owner('4', 'Michael Scott', 'IT & Cybersecurity', 'Michael', 'admin'),
    mitigationPlan: 'Develop multi-region failover strategy and evaluate secondary provider for tier-1 workloads.',
    mitigationChecklist: [
      { id: 'c1', text: 'Complete vendor concentration assessment', completed: true },
      { id: 'c2', text: 'Define tier-1 workload RPO/RTO targets', completed: false },
      { id: 'c3', text: 'Shortlist secondary provider', completed: false },
    ],
    mitigationProgress: 33,
    monitoringFrequency: 'quarterly',
    lastReviewDate: '2026-02-01T10:00:00.000Z',
    nextReviewDate: '2026-05-01T10:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2025-12-05T10:00:00.000Z', user: 'Michael Scott', action: 'created' },
      { id: 'h2', timestamp: '2026-02-01T10:00:00.000Z', user: 'Michael Scott', action: 'reviewed' },
    ],
    frameworkIds: ['sama', 'nca-ecc'],
    createdAt: '2025-12-05T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  {
    id: 'risk-003',
    title: 'PDPL data subject rights response delays',
    description: 'Current DSR handling process does not consistently meet the 30-day response window under PDPL, driven by manual case routing and fragmented data sources.',
    category: 'compliance',
    likelihood: 4,
    impact: 4,
    riskScore: 16,
    status: 'mitigating',
    owner: owner('3', 'Lisa Martinez', 'Legal', 'Lisa', 'officer'),
    mitigationPlan: 'Stand up a centralized DSR intake workflow with SLA tracking and integrate with CRM/ERP data sources.',
    mitigationChecklist: [
      { id: 'c1', text: 'Map PII systems of record', completed: true },
      { id: 'c2', text: 'Deploy DSR intake portal', completed: true },
      { id: 'c3', text: 'Integrate CRM and ERP extraction', completed: false },
      { id: 'c4', text: 'Train 8 case handlers', completed: false },
    ],
    mitigationProgress: 50,
    monitoringFrequency: 'monthly',
    lastReviewDate: '2026-03-15T11:00:00.000Z',
    nextReviewDate: '2026-04-15T11:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2026-01-20T11:00:00.000Z', user: 'Lisa Martinez', action: 'created' },
      { id: 'h2', timestamp: '2026-03-15T11:00:00.000Z', user: 'Lisa Martinez', action: 'reviewed' },
    ],
    frameworkIds: ['sdaia-pdpl'],
    createdAt: '2026-01-20T11:00:00.000Z',
    updatedAt: '2026-03-15T11:00:00.000Z',
  },
  {
    id: 'risk-004',
    title: 'Insider fraud in expense reimbursement workflow',
    description: 'Absence of maker-checker controls on low-value expense claims has created an opportunity for duplicate or fabricated claims to bypass detection.',
    category: 'financial',
    likelihood: 3,
    impact: 3,
    riskScore: 9,
    status: 'identified',
    owner: owner('2', 'Ahmed Khan', 'Risk Management', 'Ahmed'),
    mitigationPlan: 'Introduce dual-approval threshold and run retrospective analytics on 12 months of claims.',
    mitigationChecklist: [
      { id: 'c1', text: 'Define threshold for dual approval', completed: false },
      { id: 'c2', text: 'Run 12-month forensic analytics', completed: false },
    ],
    mitigationProgress: 0,
    monitoringFrequency: 'quarterly',
    nextReviewDate: '2026-05-10T09:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2026-02-10T09:00:00.000Z', user: 'Ahmed Khan', action: 'created' },
    ],
    frameworkIds: ['sama'],
    createdAt: '2026-02-10T09:00:00.000Z',
    updatedAt: '2026-02-10T09:00:00.000Z',
  },
  {
    id: 'risk-005',
    title: 'Sharia non-compliance in new product launches',
    description: 'Product team has historically sought Sharia Board approval late in the development cycle, creating rework risk and potential reputational exposure.',
    category: 'reputational',
    likelihood: 2,
    impact: 4,
    riskScore: 8,
    status: 'mitigating',
    owner: owner('5', 'Dr. Hassan Ali', 'Sharia Compliance', 'Hassan'),
    mitigationPlan: 'Embed Sharia review gate in product lifecycle and require pre-read pack two weeks before board sitting.',
    mitigationChecklist: [
      { id: 'c1', text: 'Update product lifecycle RACI', completed: true },
      { id: 'c2', text: 'Create Sharia pre-read template', completed: true },
      { id: 'c3', text: 'Pilot new gate on 2 upcoming products', completed: false },
    ],
    mitigationProgress: 67,
    monitoringFrequency: 'quarterly',
    lastReviewDate: '2026-03-01T08:00:00.000Z',
    nextReviewDate: '2026-06-01T08:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2025-11-12T08:00:00.000Z', user: 'Dr. Hassan Ali', action: 'created' },
      { id: 'h2', timestamp: '2026-03-01T08:00:00.000Z', user: 'Dr. Hassan Ali', action: 'reviewed' },
    ],
    frameworkIds: ['sharia-board'],
    createdAt: '2025-11-12T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'risk-006',
    title: 'ZATCA e-invoicing integration lag for new subsidiaries',
    description: 'Recently acquired subsidiaries are not fully onboarded to the integrated e-invoicing platform, delaying phase-2 compliance.',
    category: 'compliance',
    likelihood: 3,
    impact: 4,
    riskScore: 12,
    status: 'mitigating',
    owner: owner('2', 'Ahmed Khan', 'Finance', 'Ahmed'),
    mitigationPlan: 'Accelerate ERP connector deployment and assign dedicated integration lead per subsidiary.',
    mitigationChecklist: [
      { id: 'c1', text: 'Confirm ERP stack per subsidiary', completed: true },
      { id: 'c2', text: 'Deploy connector to Subsidiary A', completed: true },
      { id: 'c3', text: 'Deploy connector to Subsidiary B', completed: false },
      { id: 'c4', text: 'Complete ZATCA pairing & certification', completed: false },
    ],
    mitigationProgress: 50,
    monitoringFrequency: 'monthly',
    lastReviewDate: '2026-04-01T10:00:00.000Z',
    nextReviewDate: '2026-05-01T10:00:00.000Z',
    history: [
      { id: 'h1', timestamp: '2026-01-15T10:00:00.000Z', user: 'Ahmed Khan', action: 'created' },
    ],
    frameworkIds: ['zatca'],
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
  },
]

interface RiskState {
  risks: Risk[]
  selectedRisk: Risk | null
  filters: RiskFilters
  pagination: PaginationState
  sort: SortState
  isLoading: boolean
  error: string | null

  // Actions
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<Risk | null>
  create: (data: Omit<Risk, 'id' | 'riskScore' | 'createdAt' | 'updatedAt' | 'history'>) => Promise<Risk>
  update: (id: string, data: Partial<Risk>) => Promise<Risk>
  delete: (id: string) => Promise<void>
  updateStatus: (id: string, newStatus: Risk['status']) => void
  addMitigationItem: (riskId: string, text: string) => void
  editMitigationItem: (riskId: string, itemId: string, newText: string) => void
  toggleMitigationItem: (riskId: string, itemId: string) => void
  removeMitigationItem: (riskId: string, itemId: string) => void
  markReviewed: (riskId: string) => void
  setFilters: (filters: RiskFilters) => void
  clearFilters: () => void
  setSelected: (risk: Risk | null) => void
  setSort: (sort: SortState) => void
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void

  // Mitigation workflow (officer-driven)
  assignDepartment: (riskId: string, departmentId: string) => void
  setMitigationDeadline: (riskId: string, deadline: string | undefined) => void
  sendToDepartment: (riskId: string, actingUser: string) => void
  submitDepartmentPlan: (
    riskId: string,
    plan: string,
    checklist: Array<{ text: string; deadline?: string }>,
    submittedBy: string,
  ) => void
  acceptDepartmentPlan: (riskId: string, actingUser: string) => void
  toggleDepartmentPlanItem: (riskId: string, itemId: string, actingUser: string) => void
}

export const useRiskStore = create<RiskState>()(
  persist(
    (set, get) => ({
      risks: seedRisks,
      selectedRisk: null,
      filters: {},
      pagination: {
        page: 1,
        pageSize: 10,
        total: seedRisks.length,
        totalPages: Math.ceil(seedRisks.length / 10),
      },
      sort: {
        field: 'riskScore',
        direction: 'desc',
      },
      isLoading: false,
      error: null,

      fetchAll: async () => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          // Preserve existing risks from persistence
          const existingRisks = get().risks

          set({
            pagination: {
              ...get().pagination,
              total: existingRisks.length,
              totalPages: Math.ceil(existingRisks.length / get().pagination.pageSize),
            },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch risks',
            isLoading: false,
          })
        }
      },

      fetchById: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 300))

          const risk = get().risks.find((r) => r.id === id) || null
          set({ selectedRisk: risk, isLoading: false })
          return risk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to fetch risk',
            isLoading: false,
          })
          return null
        }
      },

      create: async (data) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          const now = new Date().toISOString()
          // Generate sequential ID like RSK-001, RSK-002, ...
          const existingIds = get().risks
            .map(r => r.id.match(/^RSK-(\d+)$/))
            .filter(Boolean)
            .map(m => parseInt(m![1], 10))
          const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1
          const cadenceToMonitoringFrequency: Record<string, MonitoringFrequency> = {
            monthly: 'monthly', quarterly: 'quarterly', 'semi-annual': 'semi_annual', yearly: 'annual', adhoc: 'monthly',
          }
          const monitoringFrequency = data.reviewSchedule
            ? cadenceToMonitoringFrequency[data.reviewSchedule.cadence] ?? data.monitoringFrequency
            : data.monitoringFrequency
          const nextReviewDate = data.reviewSchedule
            ? computeNextReview(data.reviewSchedule)
            : computeNextReviewDate(now, data.monitoringFrequency)
          const newRisk: Risk = {
            ...data,
            id: `RSK-${String(nextNum).padStart(3, '0')}`,
            riskScore: data.likelihood * data.impact,
            mitigationChecklist: data.mitigationChecklist ?? [],
            mitigationProgress: data.mitigationProgress ?? 0,
            monitoringFrequency,
            lastReviewDate: now,
            nextReviewDate,
            history: [{
              id: crypto.randomUUID(),
              timestamp: now,
              user: data.owner.name,
              action: 'created',
              notes: 'Risk created',
            }],
            createdAt: now,
            updatedAt: now,
          }

          set((state) => ({
            risks: [newRisk, ...state.risks],
            isLoading: false,
          }))

          return newRisk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create risk',
            isLoading: false,
          })
          throw error
        }
      },

      update: async (id: string, data: Partial<Risk>) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          let updatedRisk: Risk | null = null

          set((state) => ({
            risks: state.risks.map((r) => {
              if (r.id === id) {
                // Recompute riskScore if likelihood or impact changed
                const likelihood = data.likelihood ?? r.likelihood
                const impact = data.impact ?? r.impact
                updatedRisk = {
                  ...r,
                  ...data,
                  riskScore: likelihood * impact,
                  updatedAt: new Date().toISOString(),
                }
                return updatedRisk
              }
              return r
            }),
            selectedRisk:
              state.selectedRisk?.id === id
                ? { ...state.selectedRisk, ...data, updatedAt: new Date().toISOString() }
                : state.selectedRisk,
            isLoading: false,
          }))

          if (!updatedRisk) {
            throw new Error('Risk not found')
          }

          return updatedRisk
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to update risk',
            isLoading: false,
          })
          throw error
        }
      },

      delete: async (id: string) => {
        set({ isLoading: true, error: null })
        try {
          await new Promise((resolve) => setTimeout(resolve, 500))

          set((state) => ({
            risks: state.risks.filter((r) => r.id !== id),
            selectedRisk: state.selectedRisk?.id === id ? null : state.selectedRisk,
            isLoading: false,
          }))
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to delete risk',
            isLoading: false,
          })
          throw error
        }
      },

      updateStatus: (id: string, newStatus: Risk['status']) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id === id) {
              const now = new Date().toISOString()
              return {
                ...r,
                status: newStatus,
                updatedAt: now,
                history: [
                  ...r.history,
                  {
                    id: crypto.randomUUID(),
                    timestamp: now,
                    user: r.owner.name,
                    action: 'status_changed' as const,
                    previousValue: r.status,
                    newValue: newStatus,
                  },
                ],
              }
            }
            return r
          }),
          selectedRisk:
            state.selectedRisk?.id === id
              ? { ...state.selectedRisk, status: newStatus, updatedAt: new Date().toISOString() }
              : state.selectedRisk,
        }))
      },

      addMitigationItem: (riskId: string, text: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const newItem = { id: crypto.randomUUID(), text, completed: false }
            const checklist = [...(r.mitigationChecklist || []), newItem]
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_added' as const, newValue: text,
              }],
            }
          }),
        }))
      },

      editMitigationItem: (riskId: string, itemId: string, newText: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const checklist = (r.mitigationChecklist || []).map(i =>
              i.id === itemId ? { ...i, text: newText } : i
            )
            return {
              ...r,
              mitigationChecklist: checklist,
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_edited' as const, newValue: newText,
              }],
            }
          }),
        }))
      },

      toggleMitigationItem: (riskId: string, itemId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const checklist = (r.mitigationChecklist || []).map(i =>
              i.id === itemId ? { ...i, completed: !i.completed } : i
            )
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_toggled' as const,
                newValue: checklist.find(i => i.id === itemId)?.text,
              }],
            }
          }),
        }))
      },

      removeMitigationItem: (riskId: string, itemId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const removed = (r.mitigationChecklist || []).find(i => i.id === itemId)
            const checklist = (r.mitigationChecklist || []).filter(i => i.id !== itemId)
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: computeMitigationProgress(checklist),
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'checklist_removed' as const, newValue: removed?.text,
              }],
            }
          }),
        }))
      },

      markReviewed: (riskId: string) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const nextReviewDate = r.reviewSchedule
              ? computeNextReview(r.reviewSchedule, new Date())
              : computeNextReviewDate(now, r.monitoringFrequency)
            return {
              ...r,
              lastReviewDate: now,
              nextReviewDate,
              updatedAt: now,
              history: [...r.history, {
                id: crypto.randomUUID(), timestamp: now, user: r.owner.name,
                action: 'reviewed' as const, notes: 'Risk marked as reviewed',
              }],
            }
          }),
        }))
      },

      assignDepartment: (riskId, departmentId) => {
        set((state) => ({
          risks: state.risks.map((r) =>
            r.id === riskId
              ? {
                  ...r,
                  intendedDepartmentId: departmentId,
                  mitigationWorkflowStatus: r.mitigationWorkflowStatus ?? 'pending-assignment',
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        }))
      },

      setMitigationDeadline: (riskId, deadline) => {
        set((state) => ({
          risks: state.risks.map((r) =>
            r.id === riskId
              ? { ...r, mitigationDeadline: deadline, updatedAt: new Date().toISOString() }
              : r,
          ),
        }))
      },

      sendToDepartment: (riskId, actingUser) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            return {
              ...r,
              mitigationWorkflowStatus: 'sent-to-department' as RiskMitigationWorkflowStatus,
              sentToDepartmentAt: now,
              updatedAt: now,
              history: [
                ...r.history,
                {
                  id: crypto.randomUUID(), timestamp: now, user: actingUser,
                  action: 'note_added' as const,
                  notes: 'Risk sent to intended department for mitigation plan',
                },
              ],
            }
          }),
        }))
      },

      submitDepartmentPlan: (riskId, plan, checklist, submittedBy) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const proposedPlan: DepartmentProposedPlan = {
              id: crypto.randomUUID(),
              plan,
              checklist: checklist.map((c) => ({
                id: crypto.randomUUID(),
                text: c.text,
                deadline: c.deadline,
                completed: false,
              })),
              submittedAt: now,
              submittedBy,
            }
            return {
              ...r,
              departmentProposedPlan: proposedPlan,
              mitigationWorkflowStatus: 'plan-proposed' as RiskMitigationWorkflowStatus,
              updatedAt: now,
              history: [
                ...r.history,
                {
                  id: crypto.randomUUID(), timestamp: now, user: submittedBy,
                  action: 'mitigation_updated' as const,
                  notes: 'Department proposed mitigation plan',
                },
              ],
            }
          }),
        }))
      },

      acceptDepartmentPlan: (riskId, actingUser) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId || !r.departmentProposedPlan) return r
            const now = new Date().toISOString()
            return {
              ...r,
              // Promote department-proposed checklist into the canonical mitigationChecklist
              mitigationChecklist: r.departmentProposedPlan.checklist,
              mitigationPlan: r.departmentProposedPlan.plan,
              mitigationProgress: computeMitigationProgress(r.departmentProposedPlan.checklist),
              mitigationWorkflowStatus: 'in-progress' as RiskMitigationWorkflowStatus,
              status: 'mitigating',
              updatedAt: now,
              history: [
                ...r.history,
                {
                  id: crypto.randomUUID(), timestamp: now, user: actingUser,
                  action: 'mitigation_updated' as const,
                  notes: 'Officer accepted department-proposed plan',
                },
              ],
            }
          }),
        }))
      },

      toggleDepartmentPlanItem: (riskId, itemId, actingUser) => {
        set((state) => ({
          risks: state.risks.map((r) => {
            if (r.id !== riskId) return r
            const now = new Date().toISOString()
            const checklist: MitigationChecklistItem[] = (r.mitigationChecklist ?? []).map((i) =>
              i.id === itemId ? { ...i, completed: !i.completed } : i,
            )
            const progress = computeMitigationProgress(checklist)
            const allDone = checklist.length > 0 && checklist.every((i) => i.completed)
            return {
              ...r,
              mitigationChecklist: checklist,
              mitigationProgress: progress,
              mitigationWorkflowStatus: allDone
                ? 'mitigated'
                : (r.mitigationWorkflowStatus ?? 'in-progress'),
              status: allDone ? 'resolved' : r.status,
              updatedAt: now,
              history: [
                ...r.history,
                {
                  id: crypto.randomUUID(), timestamp: now, user: actingUser,
                  action: 'checklist_toggled' as const,
                  newValue: checklist.find((i) => i.id === itemId)?.text,
                },
              ],
            }
          }),
        }))
      },

      setFilters: (filters) => set({ filters }),
      clearFilters: () => set({ filters: {} }),
      setSelected: (risk) => set({ selectedRisk: risk }),
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
      name: 'risk-storage',
      version: 1,
      partialize: (state) => ({
        risks: state.risks,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { risks?: any[] }
        if (version < 1) {
          return {
            ...state,
            risks: (state.risks ?? []).map((r: any) => ({
              ...r,
              frameworkIds: r.frameworkIds ?? [],
            })),
          }
        }
        return persistedState
      },
    }
  )
)
