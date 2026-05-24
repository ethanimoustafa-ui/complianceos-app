// /api/settings/enum-values — generic enum-value-definitions surface.
//
// Wave-19.7. First consumer: `domain='policy.approval_tier'` — the Policy
// Create/Edit modal dropdown.
//
//   GET  ?domain=<domain>  → list (open to any authenticated user)
//   POST                   → create (settings:edit)
//
// The PATCH/DELETE half lives in `./[id]/route.ts` (per-row).

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { Conflict, handle, NotFound, ValidationFailed } from '@/lib/api/errors'
import { ok } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateEnumValueSchema,
  ListEnumValuesQuerySchema,
} from '@/lib/api/schemas/enum-values'
import { ENUM_VALUE_COLUMNS } from '@/lib/api/services/enum-values'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    const sp = new URL(req.url).searchParams
    const { domain } = parseQuery(sp, ListEnumValuesQuerySchema)

    const { data, error } = await supabase
      .from('enum_value_definitions')
      .select(ENUM_VALUE_COLUMNS)
      .eq('domain', domain)
      .order('sort_order', { ascending: true })
      .order('name_en', { ascending: true })
    if (error) throw error

    // `cache: 'no-store'` per the project's entity-GET convention
    // (MEMORY.md — sMaxAge + revalidateTag is unreliable for live lists).
    return ok(data ?? [], { cache: 'no-store' })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('settings:edit')
    const input = await parseJson(req, CreateEnumValueSchema)

    // Unique (domain, key) — check first so we can return a friendly 400 code
    // instead of a generic Postgres unique-violation 500.
    const { data: existing, error: exErr } = await supabase
      .from('enum_value_definitions')
      .select('id')
      .eq('domain', input.domain)
      .eq('key', input.key)
      .maybeSingle<{ id: string }>()
    if (exErr) throw exErr
    if (existing) throw ValidationFailed([{ path: ['key'], message: 'key_already_exists' }], 'key_already_exists')

    // If the caller didn't supply sort_order, append at end of the domain.
    let sort_order = input.sort_order
    if (sort_order == null) {
      const { data: maxRow, error: maxErr } = await supabase
        .from('enum_value_definitions')
        .select('sort_order')
        .eq('domain', input.domain)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle<{ sort_order: number }>()
      if (maxErr) throw maxErr
      sort_order = (maxRow?.sort_order ?? 0) + 1
    }

    const { data, error } = await supabase
      .from('enum_value_definitions')
      .insert({
        domain: input.domain,
        key: input.key,
        name_en: input.name_en,
        name_ar: input.name_ar,
        sort_order,
        is_default: false,
      })
      .select(ENUM_VALUE_COLUMNS)
      .single()
    if (error) {
      // Postgres unique violation fallback (race between the pre-check and insert).
      if ((error as { code?: string }).code === '23505') {
        throw Conflict('key_already_exists')
      }
      throw error
    }
    if (!data) throw NotFound('Insert returned no row')

    await writeAudit({
      actor_id: user.id,
      actor_name: profile.name ?? profile.email ?? user.id,
      action: 'enum_value.create',
      entity_type: 'enum_value_definition',
      entity_id: (data as { id: string }).id,
      metadata: { domain: input.domain, key: input.key },
      supabase,
    })

    return ok(data, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
