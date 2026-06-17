// Daily digest — run once a day from /api/cron/daily, AFTER the escalation scan.
//
// Reuses the escalation candidate view (open items due ≤7 days or overdue) and
// enqueues ONE digest email per opted-in recipient who actually has items.
// This is the only email anyone receives — there are no per-notification or
// critical-immediate emails. Idempotent per user per day.
//
// The digest is ROLE-AWARE:
//   • officer / auditor → their OWN due-soon + overdue items (personal worklist).
//   • manager           → DEPARTMENT-WIDE oversight: every overdue / at-risk
//                         item assigned to anyone sharing the manager's
//                         department_id (the compliance dept for the compliance
//                         manager). A manager with no department falls back to
//                         org-wide. Each item shows its owner.
//   • admin             → no digest.

import type { SupabaseClient } from '@supabase/supabase-js'
import { daysUntil } from './rungs'
import { routeFor, type Candidate } from './scan'
import { renderDigestEmail, type DigestItem } from '@/lib/email/templates/digest'
import { enqueueEmail } from '@/lib/email/enqueue'

export interface DigestRunResult {
  recipients: number
  sent: number
}

type Role = 'auditor' | 'officer' | 'manager' | 'admin'

interface RecipientProfile {
  id: string
  email: string | null
  name: string | null
  role: Role | null
  department_id: string | null
  preferred_language: 'en' | 'ar' | null
  email_digest_enabled: boolean | null
}

// One assigned candidate, pre-resolved to the fields the email needs.
interface AssignedItem {
  assigneeId: string
  item: DigestItem
}

export async function runDailyDigest(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<DigestRunResult> {
  const { data, error } = await admin.rpc('get_escalation_candidates')
  if (error) throw error
  const candidates = (data ?? []) as Candidate[]

  // Flatten candidates to assigned items (items without an assignee belong to
  // no personal worklist and no department, so they go to no digest). Keep the
  // per-assignee grouping for the officer path AND a flat list for the manager
  // path (which re-groups by the assignee's department).
  const assigned: AssignedItem[] = []
  const byAssignee = new Map<string, DigestItem[]>()
  for (const c of candidates) {
    if (!c.assignee_id) continue
    const item: DigestItem = {
      title: c.title ?? '—',
      daysOut: daysUntil(c.deadline, now),
      route: routeFor(c),
    }
    assigned.push({ assigneeId: c.assignee_id, item })
    const list = byAssignee.get(c.assignee_id)
    if (list) list.push(item)
    else byAssignee.set(c.assignee_id, [item])
  }

  if (assigned.length === 0) return { recipients: 0, sent: 0 }

  // ── Resolve people ────────────────────────────────────────────────────────
  // Recipients = every active non-admin profile (officers/auditors get their own
  // items; managers get their department's). Admins are excluded entirely.
  const { data: recRows } = await admin
    .from('profiles')
    .select('id, email, name, role, department_id, preferred_language, email_digest_enabled')
    .neq('role', 'admin')
    .is('deleted_at', null)
  const recipients = (recRows ?? []) as RecipientProfile[]

  // Assignee → department + display name. Assignees may be admins or even
  // deleted users, so resolve them explicitly (not just from `recipients`) — a
  // manager still oversees an item owned by someone now off the active roster,
  // as long as we can place it in a department.
  const assigneeIds = Array.from(new Set(assigned.map((a) => a.assigneeId)))
  const { data: assigneeRows } = await admin
    .from('profiles')
    .select('id, name, department_id')
    .in('id', assigneeIds)
  const assigneeDept = new Map<string, string | null>()
  const assigneeName = new Map<string, string>()
  for (const r of assigneeRows ?? []) {
    const row = r as { id: string; name: string | null; department_id: string | null }
    assigneeDept.set(row.id, row.department_id)
    if (row.name) assigneeName.set(row.id, row.name)
  }

  // Department display names (for the manager intro line), both locales.
  const deptIds = Array.from(
    new Set(recipients.filter((r) => r.role === 'manager' && r.department_id).map((r) => r.department_id as string)),
  )
  const deptNameEn = new Map<string, string>()
  const deptNameAr = new Map<string, string>()
  if (deptIds.length > 0) {
    const { data: deptRows } = await admin
      .from('departments')
      .select('id, name_en, name_ar')
      .in('id', deptIds)
    for (const d of deptRows ?? []) {
      const row = d as { id: string; name_en: string | null; name_ar: string | null }
      if (row.name_en) deptNameEn.set(row.id, row.name_en)
      if (row.name_ar) deptNameAr.set(row.id, row.name_ar)
    }
  }

  const dateStr = now.toISOString().slice(0, 10)
  let sent = 0
  let withItems = 0

  for (const prof of recipients) {
    if (prof.email_digest_enabled === false || !prof.email) continue

    const isManager = prof.role === 'manager'
    const locale = prof.preferred_language === 'ar' ? 'ar' : 'en'

    // Build this recipient's item set.
    let items: DigestItem[]
    if (isManager) {
      // Dept-wide: every assigned item whose owner is in the manager's
      // department. No department on the manager → org-wide (all assigned).
      const deptId = prof.department_id
      items = assigned
        .filter((a) => deptId == null || assigneeDept.get(a.assigneeId) === deptId)
        .map((a) => ({ ...a.item, owner: assigneeName.get(a.assigneeId) }))
    } else {
      // Officer / auditor: only their own items.
      items = byAssignee.get(prof.id) ?? []
    }

    if (items.length === 0) continue
    withItems++

    const overdue = items.filter((i) => i.daysOut < 0).sort((a, b) => a.daysOut - b.daysOut)
    const upcoming = items.filter((i) => i.daysOut >= 0).sort((a, b) => a.daysOut - b.daysOut)

    const departmentName = isManager && prof.department_id
      ? (locale === 'ar' ? deptNameAr : deptNameEn).get(prof.department_id)
      : undefined

    const rendered = renderDigestEmail({
      locale,
      recipientName: prof.name ?? undefined,
      overdue,
      upcoming,
      scope: isManager ? 'department' : 'self',
      departmentName,
    })

    // Idempotent per user per day — the same digest can't be enqueued twice.
    await enqueueEmail(admin, {
      to: prof.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `digest:${prof.id}:${dateStr}`,
    })
    sent++
  }

  return { recipients: withItems, sent }
}
