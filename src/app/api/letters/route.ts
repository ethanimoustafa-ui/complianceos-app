// /api/letters — list + create SAMA (and other-authority) letters.

import type { NextRequest } from 'next/server'
import { requirePerm, requireUser } from '@/lib/api/auth'
import { handle, NotFound } from '@/lib/api/errors'
import { ok, paginate } from '@/lib/api/response'
import { parseJson, parseQuery } from '@/lib/api/validate'
import { rangeFor } from '@/lib/api/pagination'
import { cacheTags, revalidateAll } from '@/lib/api/cache'
import { writeAudit } from '@/lib/api/audit'
import {
  CreateLetterSchema,
  ListLettersQuerySchema,
} from '@/lib/api/schemas/letters'
import {
  LETTER_LIST_COLUMNS,
  insertLetterTimeline,
  nextLetterReference,
} from '@/lib/api/services/letters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireUser()
    // parseQuery → ValidationFailed (HTTP 400) on malformed query strings.
    // Previously a raw `.parse(...)` would throw a ZodError which fell into
    // `handle()`'s generic-Error branch and surfaced as a 500.
    const q = parseQuery(req.nextUrl.searchParams, ListLettersQuerySchema)

    let query = supabase
      .from('letters')
      .select(LETTER_LIST_COLUMNS, { count: 'exact' })

    if (q.status) query = query.eq('status', q.status)
    const authority = q.authority ?? q.authority_id
    if (authority) query = query.eq('authority', authority)
    if (q.type) query = query.eq('type', q.type)
    if (q.sub_category) query = query.eq('sub_category', q.sub_category)
    if (q.sama_department) query = query.eq('sama_department', q.sama_department)
    if (q.sender_id) query = query.eq('created_by', q.sender_id)
    if (q.assigned_to) query = query.eq('assigned_to', q.assigned_to)
    if (q.q) query = query.ilike('subject', `%${q.q}%`)

    // The schema does not include an `archived` column on letters; archived
    // letters are modelled via `status` (e.g. response-received + manual
    // archive). We accept the filter for API parity but apply it as a no-op
    // unless a future column is added. Leaving as a no-op keeps the surface
    // forward-compatible.

    // has_attachments — derive via the letter_attachments parent set.
    let attachmentLetterIds: Set<string> | null = null
    if (q.has_attachments === 'true' || q.has_attachments === 'false') {
      const { data: ids } = await supabase.from('letter_attachments').select('letter_id')
      attachmentLetterIds = new Set(
        ((ids ?? []) as { letter_id: string }[]).map((r) => r.letter_id),
      )
      if (q.has_attachments === 'true') {
        if (attachmentLetterIds.size === 0) {
          return ok(paginate([], q.page, q.pageSize, 0), {
            cache: {
              sMaxAge: 60,
              staleWhileRevalidate: 300,
              tags: [cacheTags.letters()],
            },
          })
        }
        query = query.in('id', Array.from(attachmentLetterIds))
      } else if (attachmentLetterIds.size > 0) {
        query = query.not('id', 'in', `(${Array.from(attachmentLetterIds).join(',')})`)
      }
    }

    const [from, to] = rangeFor(q.page, q.pageSize)
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    // Decorate list rows with attachment_count (and has_pdf as a derived
    // boolean for card rendering). Single fan-out query gated to the page's
    // ids — keeps us inside the per-page request budget (≤20).
    const pageRows = (data ?? []) as Array<Record<string, unknown> & { id: string }>
    const attachmentCount = new Map<string, number>()
    if (pageRows.length > 0) {
      const pageIds = pageRows.map((r) => r.id)
      const { data: atts } = await supabase
        .from('letter_attachments')
        .select('letter_id, type')
        .in('letter_id', pageIds)
      for (const a of ((atts ?? []) as { letter_id: string; type: string | null }[])) {
        attachmentCount.set(a.letter_id, (attachmentCount.get(a.letter_id) ?? 0) + 1)
      }
    }
    const decorated = pageRows.map((r) => ({
      ...r,
      attachment_count: attachmentCount.get(r.id) ?? 0,
      has_pdf: (attachmentCount.get(r.id) ?? 0) > 0,
    }))

    return ok(paginate(decorated, q.page, q.pageSize, count ?? 0), {
      cache: { sMaxAge: 60, staleWhileRevalidate: 300, tags: [cacheTags.letters()] },
    })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user, profile } = await requirePerm('create')
    const input = await parseJson(req, CreateLetterSchema)

    // Reference generation with simple retry on unique-violation race.
    let inserted: Record<string, unknown> | null = null
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      const reference = await nextLetterReference(supabase, input.authority, input.type)
      const { data, error } = await supabase
        .from('letters')
        .insert({
          reference,
          authority: input.authority,
          type: input.type,
          sub_category: input.sub_category ?? null,
          sama_department: input.sama_department ?? null,
          subject: input.subject,
          subject_ar: input.subject_ar ?? null,
          body: input.body,
          body_ar: input.body_ar ?? null,
          priority: input.priority,
          status: 'draft',
          created_by: user.id,
          assigned_to: input.assigned_to ?? null,
          recipient_name: input.recipient_name ?? null,
          recipient_org: input.recipient_org ?? null,
          recipient_city: input.recipient_city ?? null,
          recipient_name_ar: input.recipient_name_ar ?? null,
          recipient_org_ar: input.recipient_org_ar ?? null,
          recipient_city_ar: input.recipient_city_ar ?? null,
          signer_name: input.signer_name ?? null,
          signer_title: input.signer_title ?? null,
          signer_name_ar: input.signer_name_ar ?? null,
          signer_title_ar: input.signer_title_ar ?? null,
          signature_image_url: input.signature_image_url ?? null,
          framework_ids: input.framework_ids,
          placeholder_defs: input.placeholder_defs,
          placeholder_values: input.placeholder_values,
        })
        .select(LETTER_LIST_COLUMNS)
        .single()
      if (!error && data) {
        inserted = data as Record<string, unknown>
        break
      }
      lastError = error
      // 23505 unique_violation → retry; anything else → break.
      if (error && (error as { code?: string }).code !== '23505') break
    }
    if (!inserted) throw lastError ?? NotFound('Insert returned no row')

    const created = inserted as { id: string; reference: string }

    // Bump template usage_count when a template was used.
    if (input.template_id) {
      const { data: tpl } = await supabase
        .from('letter_templates')
        .select('usage_count')
        .eq('id', input.template_id)
        .maybeSingle<{ usage_count: number }>()
      const next = (tpl?.usage_count ?? 0) + 1
      await supabase
        .from('letter_templates')
        .update({ usage_count: next })
        .eq('id', input.template_id)
    }

    await Promise.all([
      writeAudit({
        actor_id: user.id,
        actor_name: profile.name ?? profile.email ?? user.id,
        action: 'letter.create',
        entity_type: 'letter',
        entity_id: created.id,
        metadata: { reference: created.reference, type: input.type, authority: input.authority },
        supabase,
      }),
      insertLetterTimeline(
        supabase,
        created.id,
        'Letter created',
        profile.name ?? profile.email ?? user.id,
        'completed',
      ),
    ])

    revalidateAll([cacheTags.letters(), cacheTags.letters(created.id)])
    return ok(inserted, { status: 201 })
  } catch (e) {
    return handle(e)
  }
}
