import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PolicyTemplate, PolicyCategory, PolicyApprovalTier, AuditFrequency, FrequencySchedule } from '@/types'

const seedTemplates: PolicyTemplate[] = [
  {
    id: 'pt-001',
    name: 'Data Protection Policy',
    category: 'it',
    approvalTier: 'management',
    frequency: 'annual',
    frequencySchedule: { monthOfYear: 1, dayOfMonth: 15 },
    defaultDescription: 'Comprehensive policy governing the collection, processing, storage, and disposal of personal and sensitive data in accordance with NDMO PDPL requirements.',
    defaultWorkflowSteps: [
      { step: 'IT Review', description: 'Technical review of data controls', actionType: 'send-for-review' },
      { step: 'Legal Review', description: 'Legal compliance verification', actionType: 'request-approval' },
      { step: 'Management Approval', description: 'Final management sign-off', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    framework: 'ndmo-pdpl',
    status: 'active',
    createdAt: '2025-01-20',
    updatedAt: '2026-02-15',
    usageCount: 12,
  },
  {
    id: 'pt-002',
    name: 'Access Control Policy',
    category: 'it',
    approvalTier: 'management',
    frequency: 'semi_annual',
    frequencySchedule: { monthOfYear: 1, dayOfMonth: 10 },
    defaultDescription: 'Policy defining access control requirements, authentication standards, and authorization procedures for all information systems and physical assets.',
    defaultWorkflowSteps: [
      { step: 'IT Security Review', description: 'Security controls assessment', actionType: 'send-for-review' },
      { step: 'Department Head Approval', description: 'Operational feasibility review', actionType: 'request-approval' },
      { step: 'Management Approval', description: 'Final management sign-off', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    framework: 'nca-ecc',
    status: 'active',
    createdAt: '2025-02-10',
    updatedAt: '2026-01-28',
    usageCount: 8,
  },
  {
    id: 'pt-003',
    name: 'Incident Response Policy',
    category: 'risk',
    approvalTier: 'board',
    frequency: 'annual',
    frequencySchedule: { monthOfYear: 3, dayOfMonth: 1 },
    defaultDescription: 'Policy establishing procedures for detecting, responding to, and recovering from cybersecurity incidents and data breaches.',
    defaultWorkflowSteps: [
      { step: 'Legal Review', description: 'Initial legal assessment', actionType: 'send-for-review' },
      { step: 'Risk Committee Review', description: 'Risk evaluation and mitigation review', actionType: 'request-approval' },
      { step: 'Executive Approval', description: 'C-suite sign-off', actionType: 'request-approval' },
      { step: 'Board Ratification', description: 'Board approval', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    framework: 'nca-ecc',
    status: 'active',
    createdAt: '2025-03-05',
    updatedAt: '2026-02-20',
    usageCount: 5,
  },
  {
    id: 'pt-004',
    name: 'Business Continuity Policy',
    category: 'operations',
    approvalTier: 'board',
    frequency: 'annual',
    frequencySchedule: { monthOfYear: 6, dayOfMonth: 1 },
    defaultDescription: 'Policy defining the business continuity management framework, disaster recovery procedures, and crisis communication protocols.',
    defaultWorkflowSteps: [
      { step: 'Operations Review', description: 'Operational feasibility assessment', actionType: 'send-for-review' },
      { step: 'Risk Committee Review', description: 'Risk impact evaluation', actionType: 'request-approval' },
      { step: 'Executive Approval', description: 'C-suite sign-off', actionType: 'request-approval' },
      { step: 'Board Ratification', description: 'Board approval', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    status: 'active',
    createdAt: '2025-04-12',
    updatedAt: '2026-01-10',
    usageCount: 3,
  },
  {
    id: 'pt-005',
    name: 'AML/CTF Policy',
    category: 'compliance',
    approvalTier: 'board',
    frequency: 'quarterly',
    frequencySchedule: { monthInQuarter: 1, dayOfMonth: 1 },
    defaultDescription: 'Anti-Money Laundering and Counter-Terrorism Financing policy establishing customer due diligence, transaction monitoring, and suspicious activity reporting procedures.',
    defaultWorkflowSteps: [
      { step: 'Compliance Review', description: 'AML compliance assessment', actionType: 'send-for-review' },
      { step: 'Legal Review', description: 'Legal and regulatory alignment check', actionType: 'request-approval' },
      { step: 'Executive Approval', description: 'C-suite sign-off', actionType: 'request-approval' },
      { step: 'Board Ratification', description: 'Board approval', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    framework: 'safiu',
    status: 'active',
    createdAt: '2025-05-20',
    updatedAt: '2026-02-05',
    usageCount: 6,
  },
  {
    id: 'pt-006',
    name: 'Information Security Policy',
    category: 'it',
    approvalTier: 'management',
    frequency: 'semi_annual',
    frequencySchedule: { monthOfYear: 1, dayOfMonth: 1 },
    defaultDescription: 'Overarching information security policy defining the security governance structure, risk management approach, and security controls baseline.',
    defaultWorkflowSteps: [
      { step: 'IT Security Review', description: 'Technical security controls review', actionType: 'send-for-review' },
      { step: 'Risk Assessment', description: 'Security risk evaluation', actionType: 'send-for-review' },
      { step: 'Management Approval', description: 'Final management sign-off', actionType: 'request-approval' },
    ],
    versionPattern: 'v{major}.{minor}',
    framework: 'nca-ecc',
    status: 'active',
    createdAt: '2025-06-15',
    updatedAt: '2026-02-18',
    usageCount: 10,
  },
]

interface PolicyTemplateState {
  templates: PolicyTemplate[]
  create: (data: Omit<PolicyTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => PolicyTemplate
  update: (id: string, data: Partial<PolicyTemplate>) => void
  delete: (id: string) => void
  incrementUsage: (id: string) => void
}

export const usePolicyTemplateStore = create<PolicyTemplateState>()(
  persist(
    (set) => ({
      templates: seedTemplates,

      create: (data) => {
        const now = new Date().toISOString().split('T')[0]
        const newTemplate: PolicyTemplate = {
          ...data,
          id: `pt-${Date.now()}`,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        }
        set((s) => ({ templates: [newTemplate, ...s.templates] }))
        return newTemplate
      },

      update: (id, data) => {
        const now = new Date().toISOString().split('T')[0]
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, ...data, updatedAt: now } : t
          ),
        }))
      },

      delete: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      incrementUsage: (id) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t
          ),
        })),
    }),
    {
      name: 'policy-templates-storage',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          const templates = (persisted.templates ?? seedTemplates).map((t: any) => ({
            ...t,
            frequency: t.frequency ?? 'annual',
            frequencySchedule: t.frequencySchedule ?? undefined,
          }))
          return { templates }
        }
        return persisted as any
      },
    }
  )
)
