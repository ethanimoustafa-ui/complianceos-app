// /api/settings/frameworks — list seeded frameworks (read-only).
//
// Frameworks are seeded via migration 018 (11 rows). Configuration lives in
// `framework_config` and `framework_pins`; this endpoint exposes the static
// `frameworks` rows themselves so the UI can render names, descriptions, and
// theming hints.

import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/api/auth'
import { handle } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { cacheTags } from '@/lib/api/cache'
import { localizeMany, resolveLocale } from '@/lib/api/i18n'
import { FRAMEWORK_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('frameworks')
      .select(FRAMEWORK_COLUMNS)
      .order('id', { ascending: true })
    if (error) throw error
    return ok(localizeMany(data ?? [], resolveLocale(req)), {
      cache: { sMaxAge: 3600, staleWhileRevalidate: 7200, tags: [cacheTags.frameworks()] },
    })
  } catch (e) {
    return handle(e)
  }
}
