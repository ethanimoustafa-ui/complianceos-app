import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FrameworkConfig, RegulatoryBodyId, ComplianceThreshold, FrameworkWeights } from '@/types'

const DEFAULT_WEIGHTS_SAMA: FrameworkWeights = { audits: 25, observations: 20, letters: 20, policies: 15, circulars: 10, riskPosture: 5, training: 5 }
const DEFAULT_WEIGHTS_NCA: FrameworkWeights = { audits: 20, observations: 25, letters: 10, policies: 20, circulars: 15, riskPosture: 5, training: 5 }
const DEFAULT_WEIGHTS_BALANCED: FrameworkWeights = { audits: 20, observations: 15, letters: 10, policies: 20, circulars: 10, riskPosture: 15, training: 10 }

export function getDefaultWeights(id: RegulatoryBodyId): FrameworkWeights {
  if (id === 'sama') return { ...DEFAULT_WEIGHTS_SAMA }
  if (id === 'nca-ecc') return { ...DEFAULT_WEIGHTS_NCA }
  return { ...DEFAULT_WEIGHTS_BALANCED }
}

const seedFrameworks: FrameworkConfig[] = [
  {
    id: 'sama',
    name: 'SAMA CSF',
    nameAr: 'إطار الأمن السيبراني للبنك المركزي',
    description: 'Saudi Central Bank Cyber Security Framework for financial entities.',
    descriptionAr: 'إطار الأمن السيبراني للبنك المركزي السعودي للمؤسسات المالية.',
    icon: 'lucide:landmark',
    iconColor: 'indigo',
    enabled: true,
    departments: ['Compliance', 'IT Security', 'Risk Management'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_SAMA },
  },
  {
    id: 'nca-ecc',
    name: 'NCA ECC-1:2018',
    nameAr: 'الضوابط الأساسية للأمن السيبراني',
    description: 'Essential Cybersecurity Controls by the National Cybersecurity Authority.',
    descriptionAr: 'الضوابط الأساسية للأمن السيبراني الصادرة عن الهيئة الوطنية للأمن السيبراني.',
    icon: 'lucide:shield-check',
    iconColor: 'blue',
    enabled: true,
    departments: ['IT Security', 'Compliance'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_NCA },
  },
  {
    id: 'ndmo-pdpl',
    name: 'NDMO PDPL',
    nameAr: 'نظام حماية البيانات الشخصية',
    description: 'Personal Data Protection Law by the National Data Management Office.',
    descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن المكتب الوطني لإدارة البيانات.',
    icon: 'lucide:user-check',
    iconColor: 'amber',
    enabled: false,
    departments: ['Legal', 'IT', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'nca-cscc',
    name: 'NCA CSCC',
    nameAr: 'ضوابط الأمن السيبراني للحوسبة السحابية',
    description: 'Cloud Security Cybersecurity Controls by NCA.',
    descriptionAr: 'ضوابط الأمن السيبراني للحوسبة السحابية الصادرة عن الهيئة الوطنية.',
    icon: 'lucide:cloud-cog',
    iconColor: 'sky',
    enabled: false,
    departments: ['IT', 'Cloud Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'citc',
    name: 'CITC',
    nameAr: 'هيئة الاتصالات وتقنية المعلومات',
    description: 'Communications, Space & Technology Commission regulations.',
    descriptionAr: 'تنظيمات هيئة الاتصالات والفضاء والتقنية.',
    icon: 'lucide:radio-tower',
    iconColor: 'violet',
    enabled: false,
    departments: ['IT', 'Telecom'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'nca-ccc',
    name: 'NCA CCC',
    nameAr: 'ضوابط الأمن السيبراني للبيانات',
    description: 'Critical Systems Cybersecurity Controls by NCA.',
    descriptionAr: 'ضوابط الأمن السيبراني للأنظمة الحساسة الصادرة عن الهيئة الوطنية.',
    icon: 'lucide:server',
    iconColor: 'rose',
    enabled: false,
    departments: ['IT Security', 'Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'cma',
    name: 'CMA',
    nameAr: 'هيئة السوق المالية',
    description: 'Capital Market Authority regulatory framework for capital markets.',
    descriptionAr: 'الإطار التنظيمي لهيئة السوق المالية لأسواق رأس المال.',
    icon: 'lucide:trending-up',
    iconColor: 'emerald',
    enabled: false,
    departments: ['Finance', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'zatca',
    name: 'ZATCA',
    nameAr: 'هيئة الزكاة والضريبة والجمارك',
    description: 'Zakat, Tax and Customs Authority compliance requirements.',
    descriptionAr: 'متطلبات الامتثال لهيئة الزكاة والضريبة والجمارك.',
    icon: 'lucide:receipt',
    iconColor: 'teal',
    enabled: false,
    departments: ['Finance', 'Accounting'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'misa',
    name: 'MISA',
    nameAr: 'وزارة الاستثمار',
    description: 'Ministry of Investment regulations and licensing requirements.',
    descriptionAr: 'أنظمة ومتطلبات الترخيص الصادرة عن وزارة الاستثمار.',
    icon: 'lucide:building-2',
    iconColor: 'orange',
    enabled: false,
    departments: ['Legal', 'Business Development'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'safiu',
    name: 'SAFIU',
    nameAr: 'الوحدة السعودية للتحريات المالية',
    description: 'Saudi Arabia Financial Intelligence Unit AML/CTF regulations.',
    descriptionAr: 'أنظمة مكافحة غسل الأموال وتمويل الإرهاب الصادرة عن الوحدة السعودية.',
    icon: 'lucide:search',
    iconColor: 'slate',
    enabled: false,
    departments: ['Compliance', 'AML'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'ia',
    name: 'IA',
    nameAr: 'هيئة التأمين',
    description: 'Insurance Authority regulatory framework for the KSA insurance sector.',
    descriptionAr: 'الإطار التنظيمي لهيئة التأمين لقطاع التأمين في المملكة.',
    icon: 'lucide:shield',
    iconColor: 'violet',
    enabled: false,
    departments: ['Compliance', 'Underwriting', 'Claims'],
    threshold: 'standard',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'sdaia-pdpl',
    name: 'SDAIA PDPL',
    nameAr: 'نظام حماية البيانات الشخصية (سدايا)',
    description: 'Personal Data Protection Law administered by SDAIA (2023 revision).',
    descriptionAr: 'نظام حماية البيانات الشخصية الصادر عن الهيئة السعودية للبيانات والذكاء الاصطناعي (تحديث 2023).',
    icon: 'lucide:user-check',
    iconColor: 'fuchsia',
    enabled: false,
    departments: ['Legal', 'IT', 'Compliance', 'Data Governance'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'iso-27001',
    name: 'ISO/IEC 27001',
    nameAr: 'أيزو 27001',
    description: 'Information Security Management System standard (ISO/IEC 27001:2022).',
    descriptionAr: 'معيار نظام إدارة أمن المعلومات (أيزو/آي إي سي 27001:2022).',
    icon: 'lucide:lock',
    iconColor: 'blue',
    enabled: false,
    departments: ['IT Security', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'iso-22301',
    name: 'ISO 22301',
    nameAr: 'أيزو 22301',
    description: 'Business Continuity Management System standard (ISO 22301:2019).',
    descriptionAr: 'معيار نظام إدارة استمرارية الأعمال (أيزو 22301:2019).',
    icon: 'lucide:activity',
    iconColor: 'teal',
    enabled: false,
    departments: ['Business Continuity', 'Operations', 'Risk Management'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'iso-31000',
    name: 'ISO 31000',
    nameAr: 'أيزو 31000',
    description: 'Enterprise Risk Management guidelines (ISO 31000:2018).',
    descriptionAr: 'إرشادات إدارة المخاطر المؤسسية (أيزو 31000:2018).',
    icon: 'lucide:gauge',
    iconColor: 'cyan',
    enabled: false,
    departments: ['Risk Management', 'Compliance', 'Internal Audit'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'coso-ic',
    name: 'COSO IC',
    nameAr: 'إطار الرقابة الداخلية (COSO)',
    description: 'COSO Internal Control — Integrated Framework.',
    descriptionAr: 'إطار الرقابة الداخلية المتكامل الصادر عن COSO.',
    icon: 'lucide:layers',
    iconColor: 'emerald',
    enabled: false,
    departments: ['Internal Audit', 'Finance', 'Compliance'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'coso-erm',
    name: 'COSO ERM',
    nameAr: 'إطار إدارة مخاطر المؤسسة (COSO)',
    description: 'COSO Enterprise Risk Management — Integrating with Strategy and Performance.',
    descriptionAr: 'إطار إدارة مخاطر المؤسسة الصادر عن COSO — التكامل مع الاستراتيجية والأداء.',
    icon: 'lucide:target',
    iconColor: 'lime',
    enabled: false,
    departments: ['Risk Management', 'Strategy', 'Internal Audit'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'saso',
    name: 'SASO',
    nameAr: 'الهيئة السعودية للمواصفات والمقاييس والجودة',
    description: 'Saudi Standards, Metrology and Quality Organization technical regulations.',
    descriptionAr: 'اللوائح الفنية الصادرة عن الهيئة السعودية للمواصفات والمقاييس والجودة.',
    icon: 'lucide:badge-check',
    iconColor: 'yellow',
    enabled: false,
    departments: ['Quality Assurance', 'Operations'],
    threshold: 'standard',
    alertOnNonCompliance: false,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
  {
    id: 'sharia-board',
    name: 'Sharia Board',
    nameAr: 'الهيئة الشرعية',
    description: 'Sharia compliance governance for Islamic banking operations.',
    descriptionAr: 'حوكمة الامتثال الشرعي لعمليات الصيرفة الإسلامية.',
    icon: 'lucide:moon',
    iconColor: 'amber',
    enabled: true,
    departments: ['Sharia Compliance', 'Legal'],
    threshold: 'strict',
    alertOnNonCompliance: true,
    weights: { ...DEFAULT_WEIGHTS_BALANCED },
  },
]

interface FrameworkConfigState {
  frameworks: FrameworkConfig[]
  pinnedIds: RegulatoryBodyId[]
  toggleEnabled: (id: RegulatoryBodyId) => void
  updateConfig: (id: RegulatoryBodyId, data: Partial<FrameworkConfig>) => void
  resetToDefaults: () => void
  getEnabled: () => FrameworkConfig[]
  getById: (id: RegulatoryBodyId) => FrameworkConfig | undefined
  pinFramework: (id: RegulatoryBodyId) => void
  unpinFramework: (id: RegulatoryBodyId) => void
  replacePinned: (oldId: RegulatoryBodyId, newId: RegulatoryBodyId) => void
}

export const useFrameworkConfigStore = create<FrameworkConfigState>()(
  persist(
    (set, get) => ({
      frameworks: seedFrameworks,
      pinnedIds: ['sama', 'nca-ecc', 'sharia-board'] as RegulatoryBodyId[],

      toggleEnabled: (id) =>
        set((s) => ({
          frameworks: s.frameworks.map((f) =>
            f.id === id ? { ...f, enabled: !f.enabled } : f
          ),
        })),

      updateConfig: (id, data) =>
        set((s) => ({
          frameworks: s.frameworks.map((f) =>
            f.id === id ? { ...f, ...data } : f
          ),
        })),

      resetToDefaults: () => set({ frameworks: seedFrameworks, pinnedIds: ['sama', 'nca-ecc', 'sharia-board'] }),

      getEnabled: () => get().frameworks.filter((f) => f.enabled),

      getById: (id) => get().frameworks.find((f) => f.id === id),

      pinFramework: (id) =>
        set((s) => {
          if (s.pinnedIds.length >= 3 || s.pinnedIds.includes(id)) return s
          return { pinnedIds: [...s.pinnedIds, id] }
        }),

      unpinFramework: (id) =>
        set((s) => ({ pinnedIds: s.pinnedIds.filter((p) => p !== id) })),

      replacePinned: (oldId, newId) =>
        set((s) => ({
          pinnedIds: s.pinnedIds.map((p) => (p === oldId ? newId : p)),
        })),
    }),
    {
      name: 'framework-config-storage',
      version: 3,
      partialize: (state) => ({ frameworks: state.frameworks, pinnedIds: state.pinnedIds }),
      migrate: (persisted: unknown, version: number) => {
        type PersistShape = { frameworks?: (FrameworkConfig & { syncFrequency?: unknown })[]; pinnedIds?: RegulatoryBodyId[] }
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
          // v3: merge in any new preset frameworks that aren't already in the user's persisted list.
          // Preserves user edits (enabled flag, weights, thresholds) on existing entries.
          const existing = state.frameworks ?? seedFrameworks
          const existingIds = new Set(existing.map((f) => f.id))
          const missing = seedFrameworks.filter((f) => !existingIds.has(f.id))
          state = { ...state, frameworks: [...existing, ...missing] }
        }

        return state as unknown as FrameworkConfigState
      },
    }
  )
)
