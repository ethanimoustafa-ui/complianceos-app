// POST /api/email/test
//
// Admin/manager-only. Enqueues a bilingual test email (template 'test') to
// verify the provider + sending domain are configured. Defaults the recipient
// to the caller's own address and the locale to their preferred language.
//
// On localhost the job is processed inline (see enqueueEmail), so the response
// reflects the real outcome. With no provider configured the message is logged
// to the server console and `provider_configured` is false.

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { Forbidden, handle, ValidationFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { enqueueEmail } from '@/lib/email/enqueue'
import { isEmailConfigured } from '@/lib/email/send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
  to: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requireUser()
    if (profile.role !== 'admin' && profile.role !== 'manager') {
      throw Forbidden('Only admins and managers can send a test email')
    }

    const body = await parseJson(req, BodySchema).catch(() => ({} as z.infer<typeof BodySchema>))
    const to = body.to ?? user.email ?? undefined
    if (!to) throw ValidationFailed(undefined, 'No recipient: pass `to` or set an account email')
    const locale = body.locale ?? profile.preferred_language ?? 'en'

    const { jobId, deduped } = await enqueueEmail(supabase, {
      to,
      template: 'test',
      locale,
      data: { recipientName: profile.name ?? undefined },
      requested_by: user.id,
    })

    return ok({
      jobId,
      deduped,
      to,
      locale,
      provider_configured: isEmailConfigured(),
    })
  } catch (e) {
    return handle(e)
  }
}
