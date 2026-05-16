// /api/settings/compliance-settings — singleton GET / PATCH.
//
// Single row, identified by `singleton = true` (unique constraint). Created
// during migration 018 seeding; never created by this endpoint, only updated.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson } from '@/lib/api/validate'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import { PatchComplianceSettingsSchema } from '@/lib/api/schemas/settings'
import { COMPLIANCE_SETTINGS_COLUMNS } from '@/lib/api/services/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase } = await requireUser()
    const { data, error } = await supabase
      .from('compliance_settings')
      .select(COMPLIANCE_SETTINGS_COLUMNS)
      .eq('singleton', true)
      .maybeSingle()
    if (error) throw error
    if (!data) throw NotFound('compliance_settings singleton missing')
    return ok(data, {
      cache: {
        sMaxAge: 3600,
        staleWhileRevalidate: 7200,
        tags: [cacheTags.complianceSettings()],
      },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const patch = await parseJson(req, PatchComplianceSettingsSchema)

    // Merge weights JSONB shallowly so partial updates don't blow away other keys.
    let mergedWeights: Record<string, number> | undefined
    if (patch.weights) {
      const { data: existing } = await supabase
        .from('compliance_settings')
        .select('weights')
        .eq('singleton', true)
        .maybeSingle<{ weights: Record<string, number> }>()
      mergedWeights = { ...(existing?.weights ?? {}), ...patch.weights }
    }

    const update: Record<string, unknown> = {}
    if (mergedWeights) update.weights = mergedWeights
    if (patch.target_score !== undefined) update.target_score = patch.target_score
    if (patch.audit_retention_years !== undefined) {
      update.audit_retention_years = patch.audit_retention_years
    }

    const { data, error } = await supabase
      .from('compliance_settings')
      .update(update)
      .eq('singleton', true)
      .select(COMPLIANCE_SETTINGS_COLUMNS)
      .single()
    if (error || !data) throw error ?? NotFound('Update returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'compliance_settings.update',
      entity_type: 'compliance_settings',
      metadata: { fields: Object.keys(update) },
      supabase,
    })

    revalidateAll([cacheTags.complianceSettings(), cacheTags.compliance()])
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
