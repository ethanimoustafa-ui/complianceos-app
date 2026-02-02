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

export const useAuditLogStore = create<AuditLogState>()(
  persist(
    (set, get) => ({
      logs: [],
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
