// Jobs service-layer helpers.
//
// Phase 9 owns the worker tick / cron endpoint. Phase 4's job endpoints are
// limited to client-facing polling — read the job status for a known job id.

export const JOB_COLUMNS =
  'id, kind, status, attempts, max_attempts, scheduled_for, run_at, claimed_at, started_at, completed_at, error, payload, idempotency_key, created_at, updated_at'
