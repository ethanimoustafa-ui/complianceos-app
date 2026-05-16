// Framework config store — Phase 5 server-state migration.
//
// Backed by `/api/settings/framework-config` (GET returns
// `{ config: FrameworkConfigRow[], pins: FrameworkPinRow[] }`), per-framework
// PATCH at `/api/settings/framework-config/[frameworkId]`, and pin/unpin
// actions at `/api/settings/framework-config/pin` and
// `/api/settings/framework-config/unpin/[frameworkId]`.
//
// The frameworks themselves (id, name, description, icon, correspondenceBased)
// come from the static `frameworks` reference table seeded at migration time.
// We KEEP the static seed list in this store as the canonical source for the
// display attributes (icon, color, name, description, departments default,
// correspondenceBased flag) and OVERLAY the `framework_config` row from the
// API onto each entry (enabled, threshold, weights). This avoids needing a
// separate frameworks-list fetch for static metadata.

import { create } from 'zustand'
import type { FrameworkConfig, RegulatoryBodyId, FrameworkWeights } from '@/types'
import { api, ApiClientError } from '@/lib/api-client'

const DEFAULT_WEIGHTS_SAMA: FrameworkWeights = { audits: 35, observations: 30, letters: 20, circulars: 15 }
const DEFAULT_WEIGHTS_NCA: FrameworkWeights = { audits: 30, observations: 35, letters: 15, circulars: 20 }
const DEFAULT_WEIGHTS_BALANCED: FrameworkWeights = { audits: 30, observations: 25, letters: 20, circulars: 25 }

const CORRESPONDENCE_BASED_IDS = new Set<RegulatoryBodyId>([
  'sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'citc', 'sharia-board',
])

export function isCorrespondenceBasedId(id: RegulatoryBodyId): boolean {
  return CORRESPONDENCE_BASED_IDS.has(id)
}

export function frameworkIconTextClass(iconColor: string): string {
  const map: Record<string, string> = {
    blue: 'text-blue-500',
    indigo: 'text-indigo-500',
    amber: 'text-amber-500',
    sky: 'text-sky-500',
    violet: 'text-violet-500',
    rose: 'text-rose-500',
    emerald: 'text-emerald-500',
    teal: 'text-teal-500',
    orange: 'text-orange-500',
    slate: 'text-slate-500',
    cyan: 'text-cyan-500',
    fuchsia: 'text-fuchsia-500',
    lime: 'text-lime-500',
    yellow: 'text-yellow-500',
  }
  return map[iconColor] ?? 'text-slate-600'
}

export function getDefaultWeights(id: RegulatoryBodyId): FrameworkWeights {
  if (id === 'sama') return { ...DEFAULT_WEIGHTS_SAMA }
  if (id === 'nca-ecc') return { ...DEFAULT_WEIGHTS_NCA }
  return { ...DEFAULT_WEIGHTS_BALANCED }
}

// Static metadata table — display attributes of every framework the app knows.
// Server-side `framework_config` rows overlay the mutable fields (enabled,
// threshold, weights) onto these defaults at runtime.
const FRAMEWORK_DEFAULTS: FrameworkConfig[] = [
  { id: 'sama', name: 'SAMA', nameAr: 'البنك المركزي السعودي', description: 'Saudi Central Bank — regulator for banking, insurance, and payments. Correspondence authority for audits, inspections, and circulars.', descriptionAr: 'البنك المركزي السعودي — الجهة المنظمة للقطاع المصرفي والتأمين والمدفوعات. جهة مراسلات للتدقيقات والتفتيش والتعاميم.', icon: 'lucide:landmark', iconColor: 'indigo', enabled: true, departments: ['Compliance', 'IT Security', 'Risk Management'], threshold: 'strict', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_SAMA }, correspondenceBased: true },
  { id: 'nca-ecc', name: 'NCA ECC-1:2018', nameAr: 'الضوابط الأساسية للأمن السيبراني', description: 'Essential Cybersecurity Controls by the National Cybersecurity Authority. Self-assessment framework — tracked via SAMA/NCA correspondence.', descriptionAr: 'الضوابط الأساسية للأمن السيبراني الصادرة عن الهيئة الوطنية للأمن السيبراني. إطار تقييم ذاتي — يُتتبع عبر مراسلات الجهات التنظيمية.', icon: 'lucide:shield-check', iconColor: 'blue', enabled: true, departments: ['IT Security', 'Compliance'], threshold: 'strict', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_NCA }, correspondenceBased: false },
  { id: 'ndmo-pdpl', name: 'NDMO PDPL', nameAr: 'نظام حماية البيانات الشخصية', description: 'Personal Data Protection Law by the National Data Management Office (legacy). Self-assessment framework.', descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن المكتب الوطني لإدارة البيانات (قديم). إطار تقييم ذاتي.', icon: 'lucide:user-check', iconColor: 'amber', enabled: false, departments: ['Legal', 'IT', 'Compliance'], threshold: 'standard', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'nca-cscc', name: 'NCA CSCC', nameAr: 'ضوابط الأمن السيبراني للحوسبة السحابية', description: 'Cloud Security Cybersecurity Controls by NCA. Self-assessment framework.', descriptionAr: 'ضوابط الأمن السيبراني للحوسبة السحابية الصادرة عن الهيئة الوطنية. إطار تقييم ذاتي.', icon: 'lucide:cloud-cog', iconColor: 'sky', enabled: false, departments: ['IT', 'Cloud Operations'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'citc', name: 'CITC', nameAr: 'هيئة الاتصالات وتقنية المعلومات', description: 'Communications, Space & Technology Commission. Correspondence authority for telecom licensing and regulations.', descriptionAr: 'هيئة الاتصالات والفضاء والتقنية. جهة مراسلات لتراخيص وتنظيمات الاتصالات.', icon: 'lucide:radio-tower', iconColor: 'violet', enabled: false, departments: ['IT', 'Telecom'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'nca-ccc', name: 'NCA CCC', nameAr: 'ضوابط الأمن السيبراني للبيانات', description: 'Critical Systems Cybersecurity Controls by NCA. Self-assessment framework.', descriptionAr: 'ضوابط الأمن السيبراني للأنظمة الحساسة الصادرة عن الهيئة الوطنية. إطار تقييم ذاتي.', icon: 'lucide:server', iconColor: 'rose', enabled: false, departments: ['IT Security', 'Operations'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'cma', name: 'CMA', nameAr: 'هيئة السوق المالية', description: 'Capital Market Authority. Correspondence authority for capital markets licensing, inspections, and disclosures.', descriptionAr: 'هيئة السوق المالية. جهة مراسلات لتراخيص وتفتيشات وإفصاحات أسواق رأس المال.', icon: 'lucide:trending-up', iconColor: 'emerald', enabled: false, departments: ['Finance', 'Compliance'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'zatca', name: 'ZATCA', nameAr: 'هيئة الزكاة والضريبة والجمارك', description: 'Zakat, Tax and Customs Authority. Correspondence authority for tax filings, e-invoicing, and customs.', descriptionAr: 'هيئة الزكاة والضريبة والجمارك. جهة مراسلات للإقرارات الضريبية والفوترة الإلكترونية والجمارك.', icon: 'lucide:receipt', iconColor: 'teal', enabled: false, departments: ['Finance', 'Accounting'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'misa', name: 'MISA', nameAr: 'وزارة الاستثمار', description: 'Ministry of Investment. Correspondence authority for investment licensing and compliance.', descriptionAr: 'وزارة الاستثمار. جهة مراسلات لتراخيص الاستثمار والامتثال.', icon: 'lucide:building-2', iconColor: 'orange', enabled: false, departments: ['Legal', 'Business Development'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'safiu', name: 'SAFIU', nameAr: 'الوحدة السعودية للتحريات المالية', description: 'Saudi Arabia Financial Intelligence Unit. Correspondence authority for AML/CTF reporting and inspections.', descriptionAr: 'الوحدة السعودية للتحريات المالية. جهة مراسلات لتقارير وتفتيشات مكافحة غسل الأموال وتمويل الإرهاب.', icon: 'lucide:search', iconColor: 'slate', enabled: false, departments: ['Compliance', 'AML'], threshold: 'strict', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'ia', name: 'IA', nameAr: 'هيئة التأمين', description: 'Insurance Authority. Correspondence authority for the KSA insurance sector.', descriptionAr: 'هيئة التأمين. جهة مراسلات لقطاع التأمين في المملكة.', icon: 'lucide:shield', iconColor: 'violet', enabled: false, departments: ['Compliance', 'Underwriting', 'Claims'], threshold: 'standard', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
  { id: 'sdaia-pdpl', name: 'SDAIA PDPL', nameAr: 'نظام حماية البيانات الشخصية (سدايا)', description: 'Personal Data Protection Law administered by SDAIA (2023 revision). Self-assessment framework.', descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (تحديث 2023). إطار تقييم ذاتي.', icon: 'lucide:user-check', iconColor: 'fuchsia', enabled: false, departments: ['Legal', 'IT', 'Compliance', 'Data Governance'], threshold: 'strict', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'iso-27001', name: 'ISO/IEC 27001', nameAr: 'أيزو 27001', description: 'Information Security Management System standard (ISO/IEC 27001:2022). Self-assessment framework.', descriptionAr: 'معيار نظام إدارة أمن المعلومات (أيزو/آي إي سي 27001:2022). إطار تقييم ذاتي.', icon: 'lucide:lock', iconColor: 'blue', enabled: false, departments: ['IT Security', 'Compliance'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'iso-22301', name: 'ISO 22301', nameAr: 'أيزو 22301', description: 'Business Continuity Management System standard (ISO 22301:2019). Self-assessment framework.', descriptionAr: 'معيار نظام إدارة استمرارية الأعمال (أيزو 22301:2019). إطار تقييم ذاتي.', icon: 'lucide:activity', iconColor: 'teal', enabled: false, departments: ['Business Continuity', 'Operations', 'Risk Management'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'iso-31000', name: 'ISO 31000', nameAr: 'أيزو 31000', description: 'Enterprise Risk Management guidelines (ISO 31000:2018). Self-assessment framework.', descriptionAr: 'إرشادات إدارة المخاطر المؤسسية (أيزو 31000:2018). إطار تقييم ذاتي.', icon: 'lucide:gauge', iconColor: 'cyan', enabled: false, departments: ['Risk Management', 'Compliance', 'Internal Audit'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'coso-ic', name: 'COSO IC', nameAr: 'إطار الرقابة الداخلية (COSO)', description: 'COSO Internal Control — Integrated Framework. Self-assessment framework.', descriptionAr: 'إطار الرقابة الداخلية المتكامل الصادر عن COSO. إطار تقييم ذاتي.', icon: 'lucide:layers', iconColor: 'emerald', enabled: false, departments: ['Internal Audit', 'Finance', 'Compliance'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'coso-erm', name: 'COSO ERM', nameAr: 'إطار إدارة مخاطر المؤسسة (COSO)', description: 'COSO Enterprise Risk Management — Integrating with Strategy and Performance. Self-assessment framework.', descriptionAr: 'إطار إدارة مخاطر المؤسسة الصادر عن COSO — التكامل مع الاستراتيجية والأداء. إطار تقييم ذاتي.', icon: 'lucide:target', iconColor: 'lime', enabled: false, departments: ['Risk Management', 'Strategy', 'Internal Audit'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'saso', name: 'SASO', nameAr: 'الهيئة السعودية للمواصفات والمقاييس والجودة', description: 'Saudi Standards, Metrology and Quality Organization technical regulations. Self-assessment framework.', descriptionAr: 'اللوائح الفنية الصادرة عن الهيئة السعودية للمواصفات والمقاييس والجودة. إطار تقييم ذاتي.', icon: 'lucide:badge-check', iconColor: 'yellow', enabled: false, departments: ['Quality Assurance', 'Operations'], threshold: 'standard', alertOnNonCompliance: false, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: false },
  { id: 'sharia-board', name: 'Sharia Board', nameAr: 'الهيئة الشرعية', description: 'Sharia Board. Correspondence authority for Islamic banking Sharia compliance audits and fatwas.', descriptionAr: 'الهيئة الشرعية. جهة مراسلات لتدقيقات الامتثال الشرعي والفتاوى في الصيرفة الإسلامية.', icon: 'lucide:moon', iconColor: 'amber', enabled: true, departments: ['Sharia Compliance', 'Legal'], threshold: 'strict', alertOnNonCompliance: true, weights: { ...DEFAULT_WEIGHTS_BALANCED }, correspondenceBased: true },
]

const DEFAULT_PINNED: RegulatoryBodyId[] = ['sama', 'cma', 'sharia-board']

interface FrameworkConfigRow {
  framework_id: string
  enabled: boolean | null
  pinned: boolean | null
  weight: number | null // legacy single-weight scalar (unused in 4-key model)
  threshold: string | null
  department_id: string | null
  created_at: string
  updated_at: string
}

interface FrameworkPinRow {
  framework_id: string
  position: number
}

interface FrameworkConfigGetResponse {
  config: FrameworkConfigRow[]
  pins: FrameworkPinRow[]
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) return e.message
  if (e instanceof Error) return e.message
  return fallback
}

export type NewFrameworkInput = Omit<FrameworkConfig, 'weights'> & { weights?: FrameworkWeights }

interface FrameworkConfigState {
  frameworks: FrameworkConfig[]
  pinnedIds: RegulatoryBodyId[]

  // First-fetch rule: `isLoading && lastFetched === null` → render skeleton.
  isLoading: boolean
  isMutating: boolean
  error: string | null
  lastFetched: number | null

  fetch(): Promise<void>

  toggleEnabled(id: RegulatoryBodyId): Promise<void>
  updateConfig(id: RegulatoryBodyId, data: Partial<FrameworkConfig>): Promise<void>
  addFramework(framework: NewFrameworkInput): FrameworkConfig | null
  resetToDefaults(): void

  getEnabled(): FrameworkConfig[]
  getEnabledCorrespondence(): FrameworkConfig[]
  getById(id: RegulatoryBodyId): FrameworkConfig | undefined

  pinFramework(id: RegulatoryBodyId): Promise<void>
  unpinFramework(id: RegulatoryBodyId): Promise<void>
  replacePinned(oldId: RegulatoryBodyId, newId: RegulatoryBodyId): Promise<void>

  clearError(): void
}

export const useFrameworkConfigStore = create<FrameworkConfigState>()((set, get) => ({
  frameworks: FRAMEWORK_DEFAULTS.map((f) => ({ ...f, weights: { ...f.weights } })),
  pinnedIds: [...DEFAULT_PINNED],

  isLoading: false,
  isMutating: false,
  error: null,
  lastFetched: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.get<FrameworkConfigGetResponse>('/settings/framework-config')
      const configById = new Map(result.config.map((c) => [c.framework_id, c]))
      const frameworks = FRAMEWORK_DEFAULTS.map((def) => {
        const row = configById.get(def.id)
        if (!row) return { ...def, weights: { ...def.weights } }
        return {
          ...def,
          enabled: row.enabled ?? def.enabled,
          threshold: (row.threshold as FrameworkConfig['threshold']) ?? def.threshold,
          weights: { ...def.weights },
        }
      })
      const pinnedIds = result.pins
        .sort((a, b) => a.position - b.position)
        .map((p) => p.framework_id as RegulatoryBodyId)
      set({
        frameworks,
        pinnedIds: pinnedIds.length > 0 ? pinnedIds : get().pinnedIds,
        isLoading: false,
        lastFetched: Date.now(),
      })
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to fetch framework config'), isLoading: false })
    }
  },

  toggleEnabled: async (id) => {
    const fw = get().frameworks.find((f) => f.id === id)
    if (!fw) return
    const next = !fw.enabled
    // Optimistic — boolean toggles are safe to flip immediately.
    set((s) => ({
      frameworks: s.frameworks.map((f) => (f.id === id ? { ...f, enabled: next } : f)),
    }))
    set({ isMutating: true, error: null })
    try {
      await api.patch(`/settings/framework-config/${id}`, { enabled: next })
      set({ isMutating: false })
    } catch (e) {
      // Rollback.
      set((s) => ({
        frameworks: s.frameworks.map((f) => (f.id === id ? { ...f, enabled: !next } : f)),
        error: errorMessage(e, 'Failed to toggle framework'),
        isMutating: false,
      }))
      throw e
    }
  },

  updateConfig: async (id, data) => {
    const previous = get().frameworks.find((f) => f.id === id)
    if (!previous) return
    // Patch local state immediately; reconcile on response.
    set((s) => ({
      frameworks: s.frameworks.map((f) => (f.id === id ? { ...f, ...data } : f)),
    }))
    set({ isMutating: true, error: null })

    const payload: Record<string, unknown> = {}
    if (data.enabled !== undefined) payload.enabled = data.enabled
    if (data.threshold !== undefined) payload.threshold = data.threshold
    if (data.customThresholdValue !== undefined) payload.custom_threshold_value = data.customThresholdValue
    // Per-framework weights/departments/alertOnNonCompliance live in
    // `frameworks` table not `framework_config` — see API map §4.21. For
    // now PATCH framework_config carries the scoring-related scalars; the
    // other fields stay client-only until a follow-up phase wires them.
    try {
      if (Object.keys(payload).length > 0) {
        await api.patch(`/settings/framework-config/${id}`, payload)
      }
      set({ isMutating: false })
    } catch (e) {
      // Rollback.
      set((s) => ({
        frameworks: s.frameworks.map((f) => (f.id === id ? previous : f)),
        error: errorMessage(e, 'Failed to update framework config'),
        isMutating: false,
      }))
      throw e
    }
  },

  addFramework: (framework) => {
    // Frameworks are a fixed reference table — adding a brand-new id requires
    // a migration. Local-only here so existing settings UI keeps working; the
    // API does not currently accept new framework registrations.
    const existing = get().frameworks.find((f) => f.id === framework.id)
    if (existing) return null
    const complete: FrameworkConfig = {
      ...framework,
      weights: framework.weights ?? getDefaultWeights(framework.id),
    }
    set((s) => ({ frameworks: [...s.frameworks, complete] }))
    return complete
  },

  resetToDefaults: () => {
    // Local-only convenience; does not call the API. Pages that need a
    // persistent reset should iterate and PATCH each framework.
    set({
      frameworks: FRAMEWORK_DEFAULTS.map((f) => ({ ...f, weights: { ...f.weights } })),
      pinnedIds: [...DEFAULT_PINNED],
    })
  },

  getEnabled: () => get().frameworks.filter((f) => f.enabled),

  getEnabledCorrespondence: () =>
    get().frameworks.filter((f) => f.enabled && f.correspondenceBased),

  getById: (id) => get().frameworks.find((f) => f.id === id),

  pinFramework: async (id) => {
    const fw = get().frameworks.find((f) => f.id === id)
    if (!fw?.correspondenceBased) return
    const pinnedIds = get().pinnedIds
    if (pinnedIds.length >= 3 || pinnedIds.includes(id)) return
    const pinIndex = pinnedIds.length + 1
    set({ isMutating: true, error: null })
    try {
      await api.post('/settings/framework-config/pin', { framework_id: id, pin_index: pinIndex })
      set((s) => ({ pinnedIds: [...s.pinnedIds, id], isMutating: false }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to pin framework'), isMutating: false })
      throw e
    }
  },

  unpinFramework: async (id) => {
    set({ isMutating: true, error: null })
    try {
      await api.delete(`/settings/framework-config/unpin/${id}`)
      set((s) => ({ pinnedIds: s.pinnedIds.filter((p) => p !== id), isMutating: false }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to unpin framework'), isMutating: false })
      throw e
    }
  },

  replacePinned: async (oldId, newId) => {
    const fw = get().frameworks.find((f) => f.id === newId)
    if (!fw?.correspondenceBased) return
    const idx = get().pinnedIds.indexOf(oldId)
    if (idx === -1) return
    const pinIndex = idx + 1
    set({ isMutating: true, error: null })
    try {
      await api.post('/settings/framework-config/pin', { framework_id: newId, pin_index: pinIndex })
      set((s) => ({
        pinnedIds: s.pinnedIds.map((p) => (p === oldId ? newId : p)),
        isMutating: false,
      }))
    } catch (e) {
      set({ error: errorMessage(e, 'Failed to replace pinned framework'), isMutating: false })
      throw e
    }
  },

  clearError: () => set({ error: null }),
}))
