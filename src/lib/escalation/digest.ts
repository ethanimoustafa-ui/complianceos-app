// Daily digest — run once a day from /api/cron/daily, AFTER the escalation scan.
//
// Reuses the escalation candidate view (open items due ≤7 days or overdue),
// groups each assignee's items, and enqueues ONE digest email per opted-in user
// who actually has items. This is the only email anyone receives — there are no
// per-notification or critical-immediate emails. Idempotent per user per day.

import type { SupabaseClient } from '@supabase/supabase-js'
import { daysUntil } from './rungs'
import { routeFor, type Candidate } from './scan'
import { renderDigestEmail, type DigestItem } from '@/lib/email/templates/digest'
import { enqueueEmail } from '@/lib/email/enqueue'

export interface DigestRunResult {
  recipients: number
  sent: number
}

export async function runDailyDigest(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<DigestRunResult> {
  const { data, error } = await admin.rpc('get_escalation_candidates')
  if (error) throw error
  const candidates = (data ?? []) as Candidate[]

  // Group each assignee's items (items without an assignee go to no digest).
  const byUser = new Map<string, DigestItem[]>()
  for (const c of candidates) {
    if (!c.assignee_id) continue
    const item: DigestItem = {
      title: c.title ?? '—',
      daysOut: daysUntil(c.deadline, now),
      route: routeFor(c),
    }
    const list = byUser.get(c.assignee_id)
    if (list) list.push(item)
    else byUser.set(c.assignee_id, [item])
  }

  const userIds = Array.from(byUser.keys())
  if (userIds.length === 0) return { recipients: 0, sent: 0 }

  // Recipient email + language + digest opt-in.
  const { data: profs } = await admin
    .from('profiles')
    .select('id, email, name, preferred_language, email_digest_enabled')
    .in('id', userIds)
    .is('deleted_at', null)

  const dateStr = now.toISOString().slice(0, 10)
  let sent = 0

  for (const p of profs ?? []) {
    const prof = p as {
      id: string
      email: string | null
      name: string | null
      preferred_language: 'en' | 'ar' | null
      email_digest_enabled: boolean | null
    }
    if (prof.email_digest_enabled === false || !prof.email) continue
    const items = byUser.get(prof.id) ?? []
    if (items.length === 0) continue

    const overdue = items.filter((i) => i.daysOut < 0).sort((a, b) => a.daysOut - b.daysOut)
    const upcoming = items.filter((i) => i.daysOut >= 0).sort((a, b) => a.daysOut - b.daysOut)

    const rendered = renderDigestEmail({
      locale: prof.preferred_language === 'ar' ? 'ar' : 'en',
      recipientName: prof.name ?? undefined,
      overdue,
      upcoming,
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

  return { recipients: userIds.length, sent }
}
