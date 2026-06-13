// Letter template store — Phase 5 server-state migration.
//
// Read `.planning/09-store-pattern.md` before editing.
// Endpoints: GET/POST /api/letter-templates,
//            PATCH/DELETE /api/letter-templates/[templateId]
//
// Templates seed compose-time defaults for new letters. Usage tracking is
// now server-side: `POST /api/letters` increments `letter_templates.usage_count`
// when the `template_id` field is provided in the body. The legacy
// `incrementUsage()` action is preserved as a refetch shim so call-sites that
// fired it after `createLetter()` keep their UI in sync with the server.
//
// SKELETON-LOADING NOTE: render a skeleton when
// `isLoading && templates.length === 0` (first fetch).

import { create } from 'zustand'
import type { LetterTemplate, LetterType } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

const typeColors: Record<string, string> = {
  'non-objection': 'emerald',
  inquiry: 'blue',
  submission: 'amber',
  notification: 'rose',
}

const typeIcons: Record<string, string> = {
  'non-objection': 'lucide:user-check',
  inquiry: 'lucide:help-circle',
  submission: 'lucide:file-up',
  notification: 'lucide:alert-triangle',
}

// Date formatter for the legacy `createdDate` / `lastModified` strings.
const dateFmt = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

// API row shape from /api/letter-templates.
interface LetterTemplateApiRow {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  description: string | null
  status: 'active' | 'archived'
  default_subject_en: string | null
  default_subject_ar: string | null
  default_body_en: string | null
  default_body_ar: string | null
  default_signer_name: string | null
  default_signer_title: string | null
  default_signer_name_ar: string | null
  default_signer_title_ar: string | null
  default_signature_image_url: string | null
  default_sama_department: string | null
  default_recipient_name: string | null
  default_recipient_org: string | null
  default_recipient_city: string | null
  default_recipient_name_ar: string | null
  default_recipient_org_ar: string | null
  default_recipient_city_ar: string | null
  placeholder_defs: LetterTemplate['placeholderDefs']
  // W41: quick-strip pinning + per-template sub-category default.
  pinned?: boolean
  default_sub_category?: string | null
  usage_count: number
  created_at: string
  updated_at: string
}

function mapRow(row: LetterTemplateApiRow): LetterTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type as LetterType,
    icon: row.icon ?? typeIcons[row.type] ?? 'lucide:file-text',
    color: row.color ?? typeColors[row.type] ?? 'slate',
    description: row.description ?? '',
    status: row.status === 'active' ? 'Active' : 'Draft',
    createdDate: dateFmt(row.created_at),
    lastModified: dateFmt(row.updated_at),
    usageCount: row.usage_count,
    defaultSubjectEn: row.default_subject_en ?? undefined,
    defaultSubjectAr: row.default_subject_ar ?? undefined,
    defaultBodyEn: row.default_body_en ?? undefined,
    defaultBodyAr: row.default_body_ar ?? undefined,
    defaultSignerName: row.default_signer_name ?? undefined,
    defaultSignerTitle: row.default_signer_title ?? undefined,
    defaultSignerNameAr: row.default_signer_name_ar ?? undefined,
    defaultSignerTitleAr: row.default_signer_title_ar ?? undefined,
    defaultSignatureImageUrl: row.default_signature_image_url ?? undefined,
    defaultSamaDepartment: row.default_sama_department ?? undefined,
    defaultRecipientName: row.default_recipient_name ?? undefined,
    defaultRecipientOrg: row.default_recipient_org ?? undefined,
    defaultRecipientCity: row.default_recipient_city ?? undefined,
    defaultRecipientNameAr: row.default_recipient_name_ar ?? undefined,
    defaultRecipientOrgAr: row.default_recipient_org_ar ?? undefined,
    defaultRecipientCityAr: row.default_recipient_city_ar ?? undefined,
    placeholderDefs: row.placeholder_defs ?? undefined,
    pinned: row.pinned ?? false,
    defaultSubCategory: row.default_sub_category ?? undefined,
  }
}

function toCreatePayload(
  data: Omit<LetterTemplate, 'id' | 'createdDate' | 'lastModified' | 'usageCount'>,
): Record<string, unknown> {
  return {
    name: data.name,
    type: data.type,
    icon: data.icon || typeIcons[data.type],
    color: data.color || typeColors[data.type],
    description: data.description ?? undefined,
    // L7d: 'Draft' means "user's working draft, still visible in pickers" — map
    // it to 'active' so templates don't vanish from the template picker.
    // 'Archived' (if we ever add it) would map to 'archived'.
    status: data.status?.toLowerCase() === 'archived' ? 'archived' : 'active',
    default_subject_en: data.defaultSubjectEn ?? undefined,
    default_subject_ar: data.defaultSubjectAr ?? undefined,
    default_body_en: data.defaultBodyEn ?? undefined,
    default_body_ar: data.defaultBodyAr ?? undefined,
    default_signer_name: data.defaultSignerName ?? undefined,
    default_signer_title: data.defaultSignerTitle ?? undefined,
    default_signer_name_ar: data.defaultSignerNameAr ?? undefined,
    default_signer_title_ar: data.defaultSignerTitleAr ?? undefined,
    default_signature_image_url: data.defaultSignatureImageUrl ?? undefined,
    default_sama_department: data.defaultSamaDepartment ?? undefined,
    default_recipient_name: data.defaultRecipientName ?? undefined,
    default_recipient_org: data.defaultRecipientOrg ?? undefined,
    default_recipient_city: data.defaultRecipientCity ?? undefined,
    default_recipient_name_ar: data.defaultRecipientNameAr ?? undefined,
    default_recipient_org_ar: data.defaultRecipientOrgAr ?? undefined,
    default_recipient_city_ar: data.defaultRecipientCityAr ?? undefined,
    placeholder_defs: data.placeholderDefs ?? [],
    pinned: data.pinned ?? undefined,
    default_sub_category: data.defaultSubCategory ?? undefined,
  }
}

function toUpdatePayload(patch: Partial<LetterTemplate>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.name !== undefined) out.name = patch.name
  if (patch.type !== undefined) out.type = patch.type
  if (patch.icon !== undefined) out.icon = patch.icon
  if (patch.color !== undefined) out.color = patch.color
  if (patch.description !== undefined) out.description = patch.description
  if (patch.status !== undefined) {
    // L7d: same mapping as toCreatePayload — 'Draft' stays 'active'.
    out.status = patch.status.toLowerCase() === 'archived' ? 'archived' : 'active'
  }
  if (patch.defaultSubjectEn !== undefined) out.default_subject_en = patch.defaultSubjectEn
  if (patch.defaultSubjectAr !== undefined) out.default_subject_ar = patch.defaultSubjectAr
  if (patch.defaultBodyEn !== undefined) out.default_body_en = patch.defaultBodyEn
  if (patch.defaultBodyAr !== undefined) out.default_body_ar = patch.defaultBodyAr
  if (patch.defaultSignerName !== undefined) out.default_signer_name = patch.defaultSignerName
  if (patch.defaultSignerTitle !== undefined) out.default_signer_title = patch.defaultSignerTitle
  if (patch.defaultSignerNameAr !== undefined) out.default_signer_name_ar = patch.defaultSignerNameAr
  if (patch.defaultSignerTitleAr !== undefined) out.default_signer_title_ar = patch.defaultSignerTitleAr
  if (patch.defaultSignatureImageUrl !== undefined) out.default_signature_image_url = patch.defaultSignatureImageUrl
  if (patch.defaultSamaDepartment !== undefined) out.default_sama_department = patch.defaultSamaDepartment
  if (patch.defaultRecipientName !== undefined) out.default_recipient_name = patch.defaultRecipientName
  if (patch.defaultRecipientOrg !== undefined) out.default_recipient_org = patch.defaultRecipientOrg
  if (patch.defaultRecipientCity !== undefined) out.default_recipient_city = patch.defaultRecipientCity
  if (patch.defaultRecipientNameAr !== undefined) out.default_recipient_name_ar = patch.defaultRecipientNameAr
  if (patch.defaultRecipientOrgAr !== undefined) out.default_recipient_org_ar = patch.defaultRecipientOrgAr
  if (patch.defaultRecipientCityAr !== undefined) out.default_recipient_city_ar = patch.defaultRecipientCityAr
  if (patch.placeholderDefs !== undefined) out.placeholder_defs = patch.placeholderDefs
  if (patch.pinned !== undefined) out.pinned = patch.pinned
  if (patch.defaultSubCategory !== undefined) out.default_sub_category = patch.defaultSubCategory ?? null
  return out
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

interface LetterTemplateState {
  templates: LetterTemplate[]
  byId: Record<string, LetterTemplate>

  // First-fetch detector: `isLoading && templates.length === 0`.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetchAll: () => Promise<void>
  create: (
    data: Omit<LetterTemplate, 'id' | 'createdDate' | 'lastModified' | 'usageCount'>,
  ) => Promise<LetterTemplate>
  update: (id: string, data: Partial<LetterTemplate>) => Promise<void>
  delete: (id: string) => Promise<void>
  /**
   * Refetch the single template so its server-incremented `usage_count`
   * (bumped by POST /api/letters when `template_id` is passed) is mirrored
   * locally. The legacy store mutated `usageCount` directly; we now refetch
   * the row so any other usage from a different tab is also visible.
   */
  incrementUsage: (id: string) => Promise<void>
  clearError: () => void
}

export const useLetterTemplateStore = create<LetterTemplateState>()((set, get) => ({
  templates: [],
  byId: {},
  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    try {
      // `status=active` is the default on the API; pass `all` if drafts ever
      // need to surface. Settings UI can call PATCH to flip status.
      const rows = await api.get<LetterTemplateApiRow[]>('/letter-templates', {
        status: 'active',
      })
      const templates = rows.map(mapRow)
      const byId: Record<string, LetterTemplate> = {}
      for (const t of templates) byId[t.id] = t
      set({ templates, byId, isLoading: false, lastFetched: Date.now() })
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to fetch letter templates'),
        isLoading: false,
      })
    }
  },

  create: async (data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.post<LetterTemplateApiRow>(
        '/letter-templates',
        toCreatePayload(data),
      )
      const created = mapRow(row)
      set((s) => ({
        templates: [created, ...s.templates],
        byId: { ...s.byId, [created.id]: created },
        isMutating: false,
      }))
      return created
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to create template'),
        isMutating: false,
      })
      throw e
    }
  },

  update: async (id, data) => {
    set({ isMutating: true, error: null })
    try {
      const row = await api.patch<LetterTemplateApiRow>(
        `/letter-templates/${id}`,
        toUpdatePayload(data),
      )
      const updated = mapRow(row)
      set((s) => ({
        templates: s.templates.map((t) => (t.id === id ? updated : t)),
        byId: { ...s.byId, [id]: updated },
        isMutating: false,
      }))
    } catch (e) {
      set({
        error: errorMessage(e, 'Failed to update template'),
        isMutating: false,
      })
      throw e
    }
  },

  // Optimistic delete — drop the row immediately, restore on failure.
  delete: async (id) => {
    const { templates } = get()
    const idx = templates.findIndex((t) => t.id === id)
    if (idx === -1) return
    const removed = templates[idx]
    set((s) => {
      const { [id]: _drop, ...rest } = s.byId
      return { templates: s.templates.filter((t) => t.id !== id), byId: rest, isMutating: true, error: null }
    })
    try {
      await api.delete(`/letter-templates/${id}`)
      set({ isMutating: false })
    } catch (e) {
      set((s) => {
        const next = [...s.templates]
        next.splice(Math.min(idx, next.length), 0, removed)
        return {
          templates: next,
          byId: { ...s.byId, [id]: removed },
          error: errorMessage(e, 'Failed to delete template'),
          isMutating: false,
        }
      })
      throw e
    }
  },

  incrementUsage: async (id) => {
    // Server-side: POST /api/letters bumps usage_count when `template_id` is
    // present in the create body. The local store mirrors that bump by
    // refetching the full template list (cheap; templates table is small).
    // Call sites that previously fired this after creating a letter still
    // resolve their UI without changing call-sites.
    try {
      await get().fetchAll()
    } catch {
      // Swallow refetch failures — this is a UI freshness sync, not a
      // critical mutation.
    }
  },

  clearError: () => set({ error: null }),
}))
