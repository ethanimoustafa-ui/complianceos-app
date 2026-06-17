// Escalation scan — run once a day from /api/cron/daily.
//
// Reads every open checklist item with a near/overdue deadline (the
// get_escalation_candidates() SQL view), decides each item's rung in app code,
// resolves recipients, and writes deduped in-app notifications:
//   • pre-due (T-7 / T-3 / T-1) → the officer in charge (per-domain lead)
//   • ~3 days overdue           → officer in charge + every org-wide manager
// Each (recipient, item, rung) is written once — the notifications
// (user_id, dedupe_key) unique index makes re-runs idempotent.

import type { SupabaseClient } from '@supabase/supabase-js'
import { daysUntil, rungFor, normalizeSeverity, notifType, type Rung } from './rungs'
import { renderEscalationNotification, type EscalationSource } from './messages'

export interface Candidate {
  source: EscalationSource
  item_id: string
  parent_id: string
  title: string | null
  deadline: string
  assignee_id: string | null
  severity: string | null
  ref: string | null
}

interface NotifRow {
  user_id: string
  title: string
  message: string
  type: string
  source_type: string
  route: string
  entity_id: string
  dedupe_key: string
}

export interface EscalationScanResult {
  candidates: number
  recipients: number
  notifications: number
}

// Map our source → the bell's CalendarSourceType (icon/grouping).
const SOURCE_TYPE: Record<EscalationSource, string> = {
  observation: 'observation',
  risk: 'risk',
  audit: 'audit',
  circular: 'circular',
  article: 'circular',
  policy: 'policy',
}

/** Deep-link to the parent entity. Observations route by human reference. */
export function routeFor(c: Candidate): string {
  switch (c.source) {
    case 'observation':
      return `/correspondence/observations?id=${encodeURIComponent(c.ref ?? c.parent_id)}`
    case 'risk':
      return `/reports/risks?id=${c.parent_id}`
    case 'audit':
      return `/reports/${c.parent_id}`
    case 'circular':
    case 'article':
      return `/correspondence/regulatory-updates/rules?id=${c.parent_id}`
    case 'policy':
      return `/correspondence/regulatory-updates/policies?policyId=${c.parent_id}`
  }
}

export async function runEscalationScan(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<EscalationScanResult> {
  const { data, error } = await admin.rpc('get_escalation_candidates')
  if (error) throw error
  const candidates = (data ?? []) as Candidate[]

  // Org-wide managers = active profiles with role 'manager' (escalation target).
  const { data: mgrs } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .is('deleted_at', null)
  const managerIds = (mgrs ?? []).map((m) => (m as { id: string }).id)

  // Expand to (recipient, item, rung) tuples.
  interface Pending {
    userId: string
    rung: Rung
    daysOut: number
    cand: Candidate
  }
  const pending: Pending[] = []
  for (const c of candidates) {
    const daysOut = daysUntil(c.deadline, now)
    const rung = rungFor(daysOut)
    if (!rung) continue
    const recipients = new Set<string>()
    if (c.assignee_id) recipients.add(c.assignee_id)
    if (rung === 'overdue') for (const id of managerIds) recipients.add(id)
    for (const userId of recipients) pending.push({ userId, rung, daysOut, cand: c })
  }

  if (pending.length === 0) {
    return { candidates: candidates.length, recipients: 0, notifications: 0 }
  }

  // Batch-fetch recipient languages.
  const userIds = Array.from(new Set(pending.map((p) => p.userId)))
  const { data: profs } = await admin
    .from('profiles')
    .select('id, preferred_language')
    .in('id', userIds)
  const lang = new Map<string, 'en' | 'ar'>()
  for (const p of profs ?? []) {
    const row = p as { id: string; preferred_language: 'en' | 'ar' | null }
    lang.set(row.id, row.preferred_language === 'ar' ? 'ar' : 'en')
  }

  const rows: NotifRow[] = pending.map((p) => {
    const locale = lang.get(p.userId) ?? 'en'
    const severity = normalizeSeverity(p.cand.severity)
    const rendered = renderEscalationNotification(locale, p.cand.source, p.rung, {
      name: p.cand.title ?? '—',
      daysOut: p.daysOut,
    })
    return {
      user_id: p.userId,
      title: rendered.title,
      message: rendered.message,
      type: notifType(p.rung, severity),
      source_type: SOURCE_TYPE[p.cand.source],
      route: routeFor(p.cand),
      entity_id: p.cand.parent_id,
      dedupe_key: `esc:${p.cand.source}:${p.cand.item_id}:${p.rung}`,
    }
  })

  // Dedup explicitly. The (user_id, dedupe_key) unique index is PARTIAL
  // (where dedupe_key is not null), which PostgREST's ON CONFLICT doesn't
  // reliably match — the notifications POST route catches 23505 for the same
  // reason. So we read the already-sent keys and only insert the new ones.
  const dedupeKeys = Array.from(new Set(rows.map((r) => r.dedupe_key)))
  const { data: existing } = await admin
    .from('notifications')
    .select('user_id, dedupe_key')
    .in('dedupe_key', dedupeKeys)
  const seen = new Set(
    (existing ?? []).map((e) => {
      const r = e as { user_id: string; dedupe_key: string }
      return `${r.user_id}|${r.dedupe_key}`
    }),
  )
  const toInsert = rows.filter((r) => !seen.has(`${r.user_id}|${r.dedupe_key}`))

  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from('notifications').insert(toInsert)
    if (insErr) throw insErr
  }

  return {
    candidates: candidates.length,
    recipients: userIds.length,
    notifications: toInsert.length,
  }
}
