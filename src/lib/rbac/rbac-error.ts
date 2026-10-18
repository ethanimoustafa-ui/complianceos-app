// Round 4 Phase 6 — Typed error thrown by mutating store actions when the
// current user lacks the required permission. UI handlers (and the global
// `unhandledrejection` listener mounted from the dashboard layout) catch this
// to surface a localised toast.
export class RBACError extends Error {
  readonly permission: string
  constructor(permission: string, message?: string) {
    super(message ?? `${permission} required`)
    this.name = 'RBACError'
    this.permission = permission
  }
}
