import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FrameworkConfig, RegulatoryBodyId, FrameworkWeights } from '@/types'
import { requirePermission } from '@/lib/rbac-store-gate'

// Per-framework weights must sum to 100. Kept in the 4-surface shape
// (audits / observations / letters / circulars) aligned with FrameworkWeights.
const DEFAULT_WEIGHTS_SAMA: FrameworkWeights = { audits: 35, observations: 30, letters: 20, circulars: 15 }
const DEFAULT_WEIGHTS_NCA: FrameworkWeights = { audits: 30, observations: 35, letters: 15, circulars: 20 }
const DEFAULT_WEIGHTS_BALANCED: FrameworkWeights = { audits: 30, observations: 25, letters: 20, circulars: 25 }

// Correspondence-based authorities raise letters, audits, and observations.
// These are the only IDs that participate in per-framework compliance scoring.
const CORRESPONDENCE_BASED_IDS = new Set<RegulatoryBodyId>([
  'sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'citc', 'sharia-board',
])

export function isCorrespondenceBasedId(id: RegulatoryBodyId): boolean {
  return CORRESPONDENCE_BASED_IDS.has(id)
}

// Maps the `iconColor` palette slug stored on each framework to a Tailwind
// text color class. Used by picker/card components across audit, observation,
// and circular modals so framework-colored icons stay consistent.
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

const seedFrameworks: FrameworkConfig[] = [
  {
    id: 'sama',
    name: 'SAMA',
    nameAr: 'البنك المركزي السعودي',
    description: 'Saudi Central Bank — regulator for banking, insurance, and payments. Correspondence authority for audits, inspections, and circulars.',
    descriptionAr: 'البنك المركزي السعودي — الجهة المنظمة للقطاع المصرفي والتأمين والمدفوعات. جهة مراسلات للتدقيقات والتفتيش والتعاميم.',
    icon: 'lucide:landmark',
    iconColor: 'indigo',
    enabled: true,
    departments: ['Compliance', 'IT Security', 'Risk Management'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_SAMA },
    correspondenceBased: true,
  },
  {
    id: 'nca-ecc',
    name: 'NCA ECC-1:2018',
    nameAr: 'الضوابط الأساسية للأمن السيبراني',
    description: 'Essential Cybersecurity Controls by the National Cybersecurity Authority. Self-assessment framework — tracked via SAMA/NCA correspondence.',
    descriptionAr: 'الضوابط الأساسية للأمن السيبراني الصادرة عن الهيئة الوطنية للأمن السيبراني. إطار تقييم ذاتي — يُتتبع عبر مراسلات الجهات التنظيمية.',
    icon: 'lucide:shield-check',
    iconColor: 'blue',
    enabled: true,
    departments: ['IT Security', 'Compliance'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_NCA },
    correspondenceBased: false,
  },
  {
    id: 'ndmo-pdpl',
    name: 'NDMO PDPL',
    nameAr: 'نظام حماية البيانات الشخصية',
    description: 'Personal Data Protection Law by the National Data Management Office (legacy). Self-assessment framework.',
    descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن المكتب الوطني لإدارة البيانات (قديم). إطار تقييم ذاتي.',
    icon: 'lucide:user-check',
    iconColor: 'amber',
    enabled: false,
    departments: ['Legal', 'IT', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'nca-cscc',
    name: 'NCA CSCC',
    nameAr: 'ضوابط الأمن السيبراني للحوسبة السحابية',
    description: 'Cloud Security Cybersecurity Controls by NCA. Self-assessment framework.',
    descriptionAr: 'ضوابط الأمن السيبراني للحوسبة السحابية الصادرة عن الهيئة الوطنية. إطار تقييم ذاتي.',
    icon: 'lucide:cloud-cog',
    iconColor: 'sky',
    enabled: false,
    departments: ['IT', 'Cloud Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'citc',
    name: 'CITC',
    nameAr: 'هيئة الاتصالات وتقنية المعلومات',
    description: 'Communications, Space & Technology Commission. Correspondence authority for telecom licensing and regulations.',
    descriptionAr: 'هيئة الاتصالات والفضاء والتقنية. جهة مراسلات لتراخيص وتنظيمات الاتصالات.',
    icon: 'lucide:radio-tower',
    iconColor: 'violet',
    enabled: false,
    departments: ['IT', 'Telecom'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'nca-ccc',
    name: 'NCA CCC',
    nameAr: 'ضوابط الأمن السيبراني للبيانات',
    description: 'Critical Systems Cybersecurity Controls by NCA. Self-assessment framework.',
    descriptionAr: 'ضوابط الأمن السيبراني للأنظمة الحساسة الصادرة عن الهيئة الوطنية. إطار تقييم ذاتي.',
    icon: 'lucide:server',
    iconColor: 'rose',
    enabled: false,
    departments: ['IT Security', 'Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'cma',
    name: 'CMA',
    nameAr: 'هيئة السوق المالية',
    description: 'Capital Market Authority. Correspondence authority for capital markets licensing, inspections, and disclosures.',
    descriptionAr: 'هيئة السوق المالية. جهة مراسلات لتراخيص وتفتيشات وإفصاحات أسواق رأس المال.',
    icon: 'lucide:trending-up',
    iconColor: 'emerald',
    enabled: false,
    departments: ['Finance', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'zatca',
    name: 'ZATCA',
    nameAr: 'هيئة الزكاة والضريبة والجمارك',
    description: 'Zakat, Tax and Customs Authority. Correspondence authority for tax filings, e-invoicing, and customs.',
    descriptionAr: 'هيئة الزكاة والضريبة والجمارك. جهة مراسلات للإقرارات الضريبية والفوترة الإلكترونية والجمارك.',
    icon: 'lucide:receipt',
    iconColor: 'teal',
    enabled: false,
    departments: ['Finance', 'Accounting'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'misa',
    name: 'MISA',
    nameAr: 'وزارة الاستثمار',
    description: 'Ministry of Investment. Correspondence authority for investment licensing and compliance.',
    descriptionAr: 'وزارة الاستثمار. جهة مراسلات لتراخيص الاستثمار والامتثال.',
    icon: 'lucide:building-2',
    iconColor: 'orange',
    enabled: false,
    departments: ['Legal', 'Business Development'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'safiu',
    name: 'SAFIU',
    nameAr: 'الوحدة السعودية للتحريات المالية',
    description: 'Saudi Arabia Financial Intelligence Unit. Correspondence authority for AML/CTF reporting and inspections.',
    descriptionAr: 'الوحدة السعودية للتحريات المالية. جهة مراسلات لتقارير وتفتيشات مكافحة غسل الأموال وتمويل الإرهاب.',
    icon: 'lucide:search',
    iconColor: 'slate',
    enabled: false,
    departments: ['Compliance', 'AML'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'ia',
    name: 'IA',
    nameAr: 'هيئة التأمين',
    description: 'Insurance Authority. Correspondence authority for the KSA insurance sector.',
    descriptionAr: 'هيئة التأمين. جهة مراسلات لقطاع التأمين في المملكة.',
    icon: 'lucide:shield',
    iconColor: 'violet',
    enabled: false,
    departments: ['Compliance', 'Underwriting', 'Claims'],
    threshold: 'standard',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
  {
    id: 'sdaia-pdpl',
    name: 'SDAIA PDPL',
    nameAr: 'نظام حماية البيانات الشخصية (سدايا)',
    description: 'Personal Data Protection Law administered by SDAIA (2023 revision). Self-assessment framework.',
    descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (تحديث 2023). إطار تقييم ذاتي.',
    icon: 'lucide:user-check',
    iconColor: 'fuchsia',
    enabled: false,
    departments: ['Legal', 'IT', 'Compliance', 'Data Governance'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'iso-27001',
    name: 'ISO/IEC 27001',
    nameAr: 'أيزو 27001',
    description: 'Information Security Management System standard (ISO/IEC 27001:2022). Self-assessment framework.',
    descriptionAr: 'معيار نظام إدارة أمن المعلومات (أيزو/آي إي سي 27001:2022). إطار تقييم ذاتي.',
    icon: 'lucide:lock',
    iconColor: 'blue',
    enabled: false,
    departments: ['IT Security', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'iso-22301',
    name: 'ISO 22301',
    nameAr: 'أيزو 22301',
    description: 'Business Continuity Management System standard (ISO 22301:2019). Self-assessment framework.',
    descriptionAr: 'معيار نظام إدارة استمرارية الأعمال (أيزو 22301:2019). إطار تقييم ذاتي.',
    icon: 'lucide:activity',
    iconColor: 'teal',
    enabled: false,
    departments: ['Business Continuity', 'Operations', 'Risk Management'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'iso-31000',
    name: 'ISO 31000',
    nameAr: 'أيزو 31000',
    description: 'Enterprise Risk Management guidelines (ISO 31000:2018). Self-assessment framework.',
    descriptionAr: 'إرشادات إدارة المخاطر المؤسسية (أيزو 31000:2018). إطار تقييم ذاتي.',
    icon: 'lucide:gauge',
    iconColor: 'cyan',
    enabled: false,
    departments: ['Risk Management', 'Compliance', 'Internal Audit'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'coso-ic',
    name: 'COSO IC',
    nameAr: 'إطار الرقابة الداخلية (COSO)',
    description: 'COSO Internal Control — Integrated Framework. Self-assessment framework.',
    descriptionAr: 'إطار الرقابة الداخلية المتكامل الصادر عن COSO. إطار تقييم ذاتي.',
    icon: 'lucide:layers',
    iconColor: 'emerald',
    enabled: false,
    departments: ['Internal Audit', 'Finance', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'coso-erm',
    name: 'COSO ERM',
    nameAr: 'إطار إدارة مخاطر المؤسسة (COSO)',
    description: 'COSO Enterprise Risk Management — Integrating with Strategy and Performance. Self-assessment framework.',
    descriptionAr: 'إطار إدارة مخاطر المؤسسة الصادر عن COSO — التكامل مع الاستراتيجية والأداء. إطار تقييم ذاتي.',
    icon: 'lucide:target',
    iconColor: 'lime',
    enabled: false,
    departments: ['Risk Management', 'Strategy', 'Internal Audit'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'saso',
    name: 'SASO',
    nameAr: 'الهيئة السعودية للمواصفات والمقاييس والجودة',
    description: 'Saudi Standards, Metrology and Quality Organization technical regulations. Self-assessment framework.',
    descriptionAr: 'اللوائح الفنية الصادرة عن الهيئة السعودية للمواصفات والمقاييس والجودة. إطار تقييم ذاتي.',
    icon: 'lucide:badge-check',
    iconColor: 'yellow',
    enabled: false,
    departments: ['Quality Assurance', 'Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: false,
  },
  {
    id: 'sharia-board',
    name: 'Sharia Board',
    nameAr: 'الهيئة الشرعية',
    description: 'Sharia Board. Correspondence authority for Islamic banking Sharia compliance audits and fatwas.',
    descriptionAr: 'الهيئة الشرعية. جهة مراسلات لتدقيقات الامتثال الشرعي والفتاوى في الصيرفة الإسلامية.',
    icon: 'lucide:moon',
    iconColor: 'amber',
    enabled: true,
    departments: ['Sharia Compliance', 'Legal'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
    correspondenceBased: true,
  },
]

// Draft shape for addFramework. An `id` is always required so consumers can
// generate a stable slug (e.g. `custom-auth-${slug(name)}`) before persisting.
export type NewFrameworkInput = Omit<FrameworkConfig, 'weights'> & { weights?: FrameworkWeights }

interface FrameworkConfigState {
  frameworks: FrameworkConfig[]
  pinnedIds: RegulatoryBodyId[]
  toggleEnabled: (id: RegulatoryBodyId) => void
  updateConfig: (id: RegulatoryBodyId, data: Partial<FrameworkConfig>) => void
  addFramework: (framework: NewFrameworkInput) => FrameworkConfig | null
  resetToDefaults: () => void
  getEnabled: () => FrameworkConfig[]
  getEnabledCorrespondence: () => FrameworkConfig[]
  getById: (id: RegulatoryBodyId) => FrameworkConfig | undefined
  pinFramework: (id: RegulatoryBodyId) => void
  unpinFramework: (id: RegulatoryBodyId) => void
  replacePinned: (oldId: RegulatoryBodyId, newId: RegulatoryBodyId) => void
}

// Only correspondence-based frameworks can be pinned — pinning drives the
// Frameworks dashboard, which only renders correspondence-based score cards.
const DEFAULT_PINNED: RegulatoryBodyId[] = ['sama', 'cma', 'sharia-board']

export const useFrameworkConfigStore = create<FrameworkConfigState>()(
  persist(
    (set, get) => ({
      frameworks: seedFrameworks,
      pinnedIds: [...DEFAULT_PINNED],

      toggleEnabled: (id) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'toggleEnabled', id })
        set((s) => ({
          frameworks: s.frameworks.map((f) =>
            f.id === id ? { ...f, enabled: !f.enabled } : f
          ),
        }))
      },

      updateConfig: (id, data) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'updateConfig', id })
        set((s) => ({
          frameworks: s.frameworks.map((f) =>
            f.id === id ? { ...f, ...data } : f
          ),
        }))
      },

      addFramework: (framework) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'addFramework', id: framework.id })
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
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'resetToDefaults' })
        set({ frameworks: seedFrameworks, pinnedIds: [...DEFAULT_PINNED] })
      },

      getEnabled: () => get().frameworks.filter((f) => f.enabled),

      getEnabledCorrespondence: () =>
        get().frameworks.filter((f) => f.enabled && f.correspondenceBased),

      getById: (id) => get().frameworks.find((f) => f.id === id),

      pinFramework: (id) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'pinFramework', id })
        set((s) => {
          // Self-assessment frameworks cannot be pinned — pinning drives the
          // scored Frameworks dashboard, which is correspondence-only.
          const fw = s.frameworks.find((f) => f.id === id)
          if (!fw?.correspondenceBased) return s
          if (s.pinnedIds.length >= 3 || s.pinnedIds.includes(id)) return s
          return { pinnedIds: [...s.pinnedIds, id] }
        })
      },

      unpinFramework: (id) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: 'unpinFramework', id })
        set((s) => ({ pinnedIds: s.pinnedIds.filter((p) => p !== id) }))
      },

      replacePinned: (oldId, newId) => {
        requirePermission('Configure Frameworks', { storeName: 'frameworkConfig', actionName: `replacePinned:${oldId}:${newId}` })
        set((s) => {
          const fw = s.frameworks.find((f) => f.id === newId)
          if (!fw?.correspondenceBased) return s
          return {
            pinnedIds: s.pinnedIds.map((p) => (p === oldId ? newId : p)),
          }
        })
      },
    }),
    {
      name: 'framework-config-storage',
      version: 6,
      partialize: (state) => ({ frameworks: state.frameworks, pinnedIds: state.pinnedIds }),
      migrate: (persisted: unknown, version: number) => {
        type PersistShape = { frameworks?: (FrameworkConfig & { syncFrequency?: unknown; correspondenceBased?: boolean })[]; pinnedIds?: RegulatoryBodyId[] }
        let state: PersistShape = (persisted as PersistShape) ?? {}

        if (version < 2) {
          const frameworks = (state.frameworks ?? seedFrameworks).map((f) => {
            const { syncFrequency: _drop, ...rest } = f as FrameworkConfig & { syncFrequency?: unknown }
            void _drop
            return {
              ...rest,
              weights: rest.weights ?? getDefaultWeights(rest.id),
            }
          })
          state = { frameworks, pinnedIds: state.pinnedIds ?? ['sama', 'nca-ecc', 'sharia-board'] }
        }

        if (version < 3) {
          const existing = state.frameworks ?? seedFrameworks
          const existingIds = new Set(existing.map((f) => f.id))
          const missing = seedFrameworks.filter((f) => !existingIds.has(f.id))
          state = { ...state, frameworks: [...existing, ...missing] }
        }

        if (version < 4) {
          // v4: tag each framework with correspondenceBased. Use seed value as source of truth.
          // Also update SAMA display name/description from "SAMA CSF" → "SAMA" (authority).
          const seedById = new Map(seedFrameworks.map((s) => [s.id, s]))
          const frameworks = (state.frameworks ?? seedFrameworks).map((f) => {
            const seed = seedById.get(f.id)
            const correspondenceBased = seed?.correspondenceBased ?? CORRESPONDENCE_BASED_IDS.has(f.id)
            if (f.id === 'sama' && seed) {
              return {
                ...f,
                name: seed.name,
                nameAr: seed.nameAr,
                description: seed.description,
                descriptionAr: seed.descriptionAr,
                correspondenceBased,
              }
            }
            return { ...f, correspondenceBased }
          })
          state = { ...state, frameworks }
        }

        if (version < 5) {
          // v5: pinning is correspondence-only. Drop any persisted self-assessment
          // pins and backfill from DEFAULT_PINNED if the user's list is now empty.
          const frameworks = state.frameworks ?? seedFrameworks
          const correspondenceById = new Map(frameworks.map((f) => [f.id, !!f.correspondenceBased]))
          const cleanedPins = (state.pinnedIds ?? []).filter((id) => correspondenceById.get(id) === true)
          state = {
            ...state,
            pinnedIds: cleanedPins.length > 0 ? cleanedPins : [...DEFAULT_PINNED],
          }
        }

        if (version < 6) {
          // v6: FrameworkWeights shrinks from 7 keys to 4 (audits/observations/letters/circulars).
          // Drop deprecated keys on persisted frameworks and re-seed from defaults when
          // the remaining total ends up at 0.
          type LegacyWeights = Partial<FrameworkWeights & { policies?: number; riskPosture?: number; training?: number }>
          const frameworks = (state.frameworks ?? seedFrameworks).map((f) => {
            const w = (f.weights ?? {}) as LegacyWeights
            const next: FrameworkWeights = {
              audits: w.audits ?? 0,
              observations: w.observations ?? 0,
              letters: w.letters ?? 0,
              circulars: w.circulars ?? 0,
            }
            const total = next.audits + next.observations + next.letters + next.circulars
            return { ...f, weights: total > 0 ? next : getDefaultWeights(f.id) }
          })
          state = { ...state, frameworks }
        }

        return state as unknown as FrameworkConfigState
      },
    }
  )
)
