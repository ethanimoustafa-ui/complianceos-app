import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ActionType = 'opened' | 'closed' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated' | 'reviewed'
type LogStatus = 'completed' | 'pending' | 'info' | 'failed'

export interface AuditLog {
  id: string
  timestamp: string
  user: { name: string; avatar: string }
  action: ActionType
  audit: string
  auditId: string
  description: string
  descriptionKey?: string
  descriptionParams?: Record<string, string>
  status: LogStatus
  duration?: string
  context?: string
}

interface AuditLogState {
  logs: AuditLog[]
  addLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => void
  getLogsByAuditId: (auditId: string) => AuditLog[]
  clearLogs: () => void
}

const seedLogs: AuditLog[] = [
  {
    id: 'log-001',
    timestamp: '2026-04-18T08:15:00.000Z',
    user: { name: 'Michael Scott', avatar: 'Michael' },
    action: 'uploaded',
    audit: 'SAMA Cybersecurity Framework — Annual Self-Assessment',
    auditId: 'audit-001',
    description: 'Uploaded Asset-Inventory-2026.xlsx to evidence folder',
    status: 'completed',
    duration: '2m',
    context: 'Evidence collection',
  },
  {
    id: 'log-002',
    timestamp: '2026-04-17T14:30:00.000Z',
    user: { name: 'Sarah Connor', avatar: 'Sarah' },
    action: 'commented',
    audit: 'SAMA Cybersecurity Framework — Annual Self-Assessment',
    auditId: 'audit-001',
    description: 'Added review note on control ID-AM-02 gap finding',
    status: 'info',
    context: 'Review',
  },
  {
    id: 'log-003',
    timestamp: '2026-04-17T10:05:00.000Z',
    user: { name: 'Ahmed Khan', avatar: 'Ahmed' },
    action: 'reviewed',
    audit: 'Q1 Internal Controls Walkthrough — Finance',
    auditId: 'audit-006',
    description: 'Completed control walkthrough testing for P2P cycle',
    status: 'completed',
    duration: '45m',
    context: 'Control testing',
  },
  {
    id: 'log-004',
    timestamp: '2026-04-16T16:40:00.000Z',
    user: { name: 'Lisa Martinez', avatar: 'Lisa' },
    action: 'updated',
    audit: 'PDPL Data Mapping & Subject Rights Readiness',
    auditId: 'audit-004',
    description: 'Updated RoPA register with 3 new processing activities',
    status: 'completed',
    context: 'Documentation',
  },
  {
    id: 'log-005',
    timestamp: '2026-04-16T11:20:00.000Z',
    user: { name: 'Lisa Martinez', avatar: 'Lisa' },
    action: 'updated',
    audit: 'PDPL Data Mapping & Subject Rights Readiness',
    auditId: 'audit-004',
    description: 'Flagged DSR response SLA overdue (audit past due date)',
    status: 'failed',
    context: 'SLA breach',
  },
  {
    id: 'log-006',
    timestamp: '2026-04-15T09:10:00.000Z',
    user: { name: 'Michael Scott', avatar: 'Michael' },
    action: 'opened',
    audit: 'NCA ECC-1:2018 — Control Effectiveness Review',
    auditId: 'audit-002',
    description: 'Opened Q1 ECC review cycle across 114 controls',
    status: 'info',
    context: 'Cycle kickoff',
  },
  {
    id: 'log-007',
    timestamp: '2026-04-12T15:50:00.000Z',
    user: { name: 'Michael Scott', avatar: 'Michael' },
    action: 'assigned',
    audit: 'NCA ECC-1:2018 — Control Effectiveness Review',
    auditId: 'audit-002',
    description: 'Assigned control owners across 8 domains',
    status: 'completed',
    context: 'Ownership',
  },
  {
    id: 'log-008',
    timestamp: '2026-04-10T10:00:00.000Z',
    user: { name: 'Ahmed Khan', avatar: 'Ahmed' },
    action: 'uploaded',
    audit: 'ZATCA E-invoicing Phase-2 Integration Audit',
    auditId: 'audit-007',
    description: 'Uploaded XML schema validation results for Subsidiary A',
    status: 'completed',
    duration: '5m',
    context: 'Evidence collection',
  },
  {
    id: 'log-009',
    timestamp: '2026-04-08T13:25:00.000Z',
    user: { name: 'Sarah Connor', avatar: 'Sarah' },
    action: 'created',
    audit: 'AML / CTF Program Independent Review',
    auditId: 'audit-003',
    description: 'Created audit engagement and scoping memo',
    status: 'completed',
    context: 'Engagement setup',
  },
  {
    id: 'log-010',
    timestamp: '2026-04-05T17:15:00.000Z',
    user: { name: 'Michael Scott', avatar: 'Michael' },
    action: 'updated',
    audit: 'SAMA Cybersecurity Framework — Annual Self-Assessment',
    auditId: 'audit-001',
    description: 'Progress updated to 55% after completing Identity domain review',
    status: 'completed',
    context: 'Progress update',
  },
  {
    id: 'log-011',
    timestamp: '2026-04-02T09:45:00.000Z',
    user: { name: 'Dr. Hassan Ali', avatar: 'Hassan' },
    action: 'reviewed',
    audit: 'AML / CTF Program Independent Review',
    auditId: 'audit-003',
    description: 'Subject matter review of sanctions screening coverage',
    status: 'pending',
    context: 'Expert review',
  },
  {
    id: 'log-012',
    timestamp: '2026-03-28T14:00:00.000Z',
    user: { name: 'Dr. Hassan Ali', avatar: 'Hassan' },
    action: 'closed',
    audit: 'Sharia Governance Framework Review',
    auditId: 'audit-005',
    description: 'Audit completed and report issued to Sharia Board',
    status: 'completed',
    duration: '2h',
    context: 'Closure',
  },
  {
    id: 'log-013',
    timestamp: '2026-03-14T16:00:00.000Z',
    user: { name: 'Ahmed Khan', avatar: 'Ahmed' },
    action: 'closed',
    audit: 'Q1 Internal Controls Walkthrough — Finance',
    auditId: 'audit-006',
    description: 'Walkthrough closed with 2 minor observations raised',
    status: 'completed',
    duration: '1h',
    context: 'Closure',
  },
  {
    id: 'log-014',
    timestamp: '2026-03-10T11:30:00.000Z',
    user: { name: 'Sarah Connor', avatar: 'Sarah' },
    action: 'commented',
    audit: 'Sharia Governance Framework Review',
    auditId: 'audit-005',
    description: 'Added cross-reference to AML policy section 4.3',
    status: 'info',
    context: 'Review',
  },
  {
    id: 'log-015',
    timestamp: '2026-03-05T08:00:00.000Z',
    user: { name: 'Michael Scott', avatar: 'Michael' },
    action: 'created',
    audit: 'NCA ECC-1:2018 — Control Effectiveness Review',
    auditId: 'audit-002',
    description: 'Created Q1 2026 NCA ECC audit engagement',
    status: 'completed',
    context: 'Engagement setup',
  },
]

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set, get) => ({
      logs: seedLogs,
      addLog: (logData) => {
        const newLog: AuditLog = {
          ...logData,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          logs: [newLog, ...state.logs],
        }))
      },
      getLogsByAuditId: (auditId) => {
        return get().logs.filter((log) => log.auditId === auditId)
      },
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'audit-log-storage',
    }
  )
)
