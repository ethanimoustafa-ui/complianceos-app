export const DEMO_SEED_VERSION = '2026-04-20-demo-2'
const MARKER_KEY = 'complianceos-demo-seed-version'

export const STORE_STORAGE_KEYS = [
  'advisory-storage',
  'audit-log-storage',
  'audit-storage',
  'audit-task-storage',
  'audit-templates-storage',
  'auth-storage',
  'calendar-store',
  'circular-storage',
  'compliance-settings-storage',
  'correspondence-storage',
  'department-storage',
  'framework-config-storage',
  'help-storage',
  'language-storage',
  'message-storage',
  'notification-storage',
  'observation-storage',
  'policy-storage',
  'policy-templates-storage',
  'risk-storage',
  'sama-letter-store',
  'sidebar-storage',
  'team-storage',
  'training-storage',
  'user-log-storage',
  'user-preferences-storage',
]

export function needsDemoReset(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(MARKER_KEY) !== DEMO_SEED_VERSION
}

export function runDemoReset() {
  if (typeof window === 'undefined') return
  for (const key of STORE_STORAGE_KEYS) {
    window.localStorage.removeItem(key)
  }
  window.localStorage.setItem(MARKER_KEY, DEMO_SEED_VERSION)
}
