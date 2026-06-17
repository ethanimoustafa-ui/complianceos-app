// /api/cron/daily — once-a-day maintenance tick (Vercel Cron, 03:00 per vercel.json).
//
// Authenticates the same way as /api/cron/jobs-run (Bearer CRON_SECRET) and runs
// each daily task in its own try/catch so one failure doesn't abort the rest.
// Currently: notification retention prune. Extended in later slices with the
// escalation scan and the daily-digest enqueue.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdminClient, hasServiceRole } from '@/lib/api/admin'
import { runEscalationScan } from '@/lib/escalation/scan'
import { runDailyDigest } from '@/lib/escalation/digest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('[cron/daily] CRON_SECRET is not set — refusing to run.')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  if (header === `Bearer ${expected}`) return true
  const xCron = req.headers.get('x-cron-secret')
  return !!xCron && xCron === expected
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'invalid cron secret' } }, { status: 403 })
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: { code: 'service_unavailable', message: 'SUPABASE_SERVICE_ROLE_KEY not configured' } },
      { status: 503 },
    )
  }

  const admin = getAdminClient()
  const results: Record<string, unknown> = {}

  // ── Deadline escalation scan (pre-due reminders + overdue escalation) ──
  try {
    results.escalation = await runEscalationScan(admin)
  } catch (e) {
    results.escalation_error = e instanceof Error ? e.message : 'failed'
  }

  // ── Daily digest email (one per opted-in user who has items) ──
  try {
    results.digest = await runDailyDigest(admin)
  } catch (e) {
    results.digest_error = e instanceof Error ? e.message : 'failed'
  }

  // ── Notification retention prune (>30 days OR >100 per user) ──
  // Runs AFTER the scan so today's fresh notifications are never pruned.
  try {
    const { data, error } = await admin.rpc('prune_notifications')
    if (error) throw error
    results.notifications_pruned = data ?? 0
  } catch (e) {
    results.notifications_pruned_error = e instanceof Error ? e.message : 'failed'
  }

  return NextResponse.json({ data: results })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
