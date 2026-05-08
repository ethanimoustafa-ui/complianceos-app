import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Round 4 Phase 6 expands the action union with `auth.permission_denied`. The
// remaining `auth.*` and `team.*` events are reserved for Phase 7. The existing
// underscore-cased tokens stay for backwards compatibility with the seed logs.
export type UserLogAction =
  | 'sign_in'
  | 'sign_out'
  | 'session_timeout'
  | 'password_change'
  | 'profile_update'
  | 'permission_change'
  | 'mfa_enabled'
  | 'failed_login'
  | 'auth.permission_denied'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.switch_user'
  | 'team.permissions_changed'

export interface UserLog {
  id: number
  timestamp: string
  user: string
  action: UserLogAction
  detailsKey: string
  ipAddress: string
  device: string
  location: string
  status: 'success' | 'warning' | 'failed' | 'info'
  userId?: string
  // Optional free-form target for RBAC-denied entries. Phase 6 records this
  // as `${storeName}:${id}:${actionName}` so logs can be filtered later.
  target?: string
}

// Compact shape used by store-action gate failures (Phase 6 §8.1). The store
// `log()` action below normalises this into a full `UserLog` entry.
export interface RBACDeniedLogEntry {
  userId: string
  action: UserLogAction
  target?: string
}

interface UserLogState {
  logs: UserLog[]
  addLog: (log: Omit<UserLog, 'id'>) => void
  /**
   * Compact logger used by Phase 6 store-action gates. Fills in `timestamp`,
   * default `status`, and a generic `detailsKey` so call sites can stay
   * one-liners.
   */
  log: (entry: RBACDeniedLogEntry) => void
  getLogsByUserId: (userId: string) => UserLog[]
  clearLogs: () => void
}

const seedLogs: UserLog[] = [
  { id: 1, timestamp: '2024-01-15 14:32:18', user: 'Sarah Connor', action: 'sign_in', detailsKey: 'team.signedInViaSso', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success', userId: '1' },
  { id: 2, timestamp: '2024-01-15 14:28:45', user: 'Michael Scott', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'info', userId: '4' },
  { id: 3, timestamp: '2024-01-15 13:55:12', user: 'David Wallace', action: 'password_change', detailsKey: 'team.passwordUpdatedSuccessfully', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 4, timestamp: '2024-01-15 13:42:30', user: 'Kelly Kapoor', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 5, timestamp: '2024-01-15 12:18:09', user: 'John Smith', action: 'mfa_enabled', detailsKey: 'team.enabledTwoFactorAuth', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 6, timestamp: '2024-01-15 11:45:22', user: 'Jane Doe', action: 'profile_update', detailsKey: 'team.updatedProfilePictureBio', ipAddress: '192.168.1.55', device: 'Chrome on MacOS', location: 'Austin, TX', status: 'success' },
  { id: 7, timestamp: '2024-01-15 11:20:33', user: 'Sarah Connor', action: 'permission_change', detailsKey: 'team.grantedDocumentApprovalAccess', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success', userId: '1' },
  { id: 8, timestamp: '2024-01-15 10:55:47', user: 'Michael Scott', action: 'failed_login', detailsKey: 'team.invalidPasswordAttempt', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'warning', userId: '4' },
  { id: 9, timestamp: '2024-01-15 10:12:18', user: 'David Wallace', action: 'sign_in', detailsKey: 'team.signedInWithPassword', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 10, timestamp: '2024-01-15 09:38:55', user: 'Kelly Kapoor', action: 'sign_in', detailsKey: 'team.signedInViaGoogleOauth', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 11, timestamp: '2024-01-14 16:45:12', user: 'John Smith', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 12, timestamp: '2024-01-14 15:22:30', user: 'Jane Doe', action: 'failed_login', detailsKey: 'team.accountLockedFailedAttempts', ipAddress: '10.0.0.55', device: 'Unknown Browser', location: 'Unknown', status: 'failed' },
  { id: 13, timestamp: '2024-01-14 14:18:45', user: 'Sarah Connor', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'info', userId: '1' },
  { id: 14, timestamp: '2024-01-14 13:55:09', user: 'Michael Scott', action: 'profile_update', detailsKey: 'team.updatedEmailNotificationPreferences', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'success', userId: '4' },
  { id: 15, timestamp: '2024-01-14 12:42:33', user: 'David Wallace', action: 'permission_change', detailsKey: 'team.adminAccessRevoked', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'warning' },
]

export const useUserLogStore = create<UserLogState>()(
  persist(
    (set, get) => ({
      logs: seedLogs,

      addLog: (log) =>
        set((state) => ({
          logs: [{ ...log, id: Math.max(0, ...state.logs.map(l => l.id)) + 1 }, ...state.logs],
        })),

      log: (entry) =>
        set((state) => {
          const detailsKey =
            entry.action === 'auth.permission_denied'
              ? 'team.permissionDenied'
              : `team.${entry.action.replace(/\./g, '_')}`
          const status: UserLog['status'] =
            entry.action === 'auth.permission_denied' ? 'warning' : 'info'
          const next: UserLog = {
            id: Math.max(0, ...state.logs.map(l => l.id)) + 1,
            timestamp: new Date().toISOString(),
            user: entry.userId,
            action: entry.action,
            detailsKey,
            ipAddress: 'demo',
            device: 'demo',
            location: 'demo',
            status,
            userId: entry.userId,
            target: entry.target,
          }
          return { logs: [next, ...state.logs] }
        }),

      getLogsByUserId: (userId) => get().logs.filter((l) => l.userId === userId),

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'user-log-storage',
      version: 1,
      partialize: (state) => ({ logs: state.logs }),
    }
  )
)
