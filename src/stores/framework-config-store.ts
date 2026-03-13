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
      version: 2,
      partialize: (state) => ({ frameworks: state.frameworks, pinnedIds: state.pinnedIds }),
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          const frameworks = (persisted.frameworks ?? seedFrameworks).map((f: any) => {
            const { syncFrequency, ...rest } = f
            return {
              ...rest,
              weights: rest.weights ?? getDefaultWeights(rest.id),
            }
          })
          return { frameworks, pinnedIds: persisted.pinnedIds ?? ['sama', 'nca-ecc', 'sharia-board'] }
        }
        return persisted as any
      },
    }
  )
)
