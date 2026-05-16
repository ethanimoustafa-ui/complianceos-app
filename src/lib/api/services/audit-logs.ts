// Global audit-log reader service-layer helpers.
//
// Read-only against `audit_logs`. Writes are not exposed — the table is
// append-only at the DB role level and every app-side mutation goes through
// `writeAudit()` from `lib/api/audit.ts`.

export const AUDIT_LOG_COLUMNS =
  'id, timestamp, user_id, user_name, action, details_key, details_params, ip_address, device, location, status, target_type, target_id, metadata'
