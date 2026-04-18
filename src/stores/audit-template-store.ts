import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuditTemplate, AuditTemplateCategory, AuditPriority, AuditFrequency, FrequencySchedule } from '@/types'

const seedTemplates: AuditTemplate[] = [
  {
    id: 'at-001',
    name: 'NCA ECC Self-Assessment',
    nameAr: 'التقييم الذاتي لضوابط NCA ECC',
    auditType: 'internal',
    category: 'security-compliance',
    priority: 'high',
    frequency: 'quarterly',
    frequencySchedule: { monthInQuarter: 1, dayOfMonth: 15 },
    defaultTitle: 'NCA ECC Quarterly Self-Assessment',
    defaultTitleAr: 'التقييم الذاتي الربع سنوي لضوابط NCA ECC',
    defaultDescription: 'Comprehensive self-assessment against NCA Essential Cybersecurity Controls to evaluate organizational cybersecurity posture.',
    defaultDescriptionAr: 'تقييم ذاتي شامل مقابل ضوابط الأمن السيبراني الأساسية لهيئة NCA لتقييم الوضع الأمني السيبراني للمنظمة.',
    defaultChecklistItems: [
      'Review access control policies',
      'Verify network security configurations',
      'Assess incident response readiness',
      'Validate data protection measures',
      'Check security awareness training completion',
    ],
    defaultTeamRoles: ['Lead Auditor', 'IT Security Specialist', 'Compliance Officer'],
    framework: 'nca-ecc',
    status: 'active',
    createdAt: '2025-01-15',
    updatedAt: '2026-02-10',
    usageCount: 75,
  },
  {
    id: 'at-002',
    name: 'SAMA Quarterly Compliance Review',
    nameAr: 'مراجعة امتثال إطار SAMA CSF',
    auditType: 'sama',
    category: 'financial-compliance',
    priority: 'high',
    frequency: 'quarterly',
    frequencySchedule: { monthInQuarter: 1, dayOfMonth: 1 },
    defaultTitle: 'SAMA Quarterly Compliance Review',
    defaultTitleAr: 'مراجعة الامتثال الربع سنوية لإطار SAMA CSF',
    defaultDescription: 'Quarterly review of compliance with SAMA Cyber Security Framework requirements for banking operations.',
    defaultDescriptionAr: 'مراجعة ربع سنوية للامتثال لمتطلبات إطار الأمن السيبراني لمؤسسة النقد العربي السعودي للعمليات المصرفية.',
    defaultChecklistItems: [
      'Review transaction monitoring controls',
      'Assess AML/CTF procedures',
      'Verify regulatory reporting accuracy',
      'Check customer due diligence processes',
    ],
    defaultTeamRoles: ['Compliance Manager', 'Financial Auditor', 'Risk Analyst'],
    framework: 'sama',
    status: 'active',
    createdAt: '2025-02-01',
    updatedAt: '2026-01-15',
    usageCount: 88,
  },
  {
    id: 'at-003',
    name: 'PDPL Data Mapping Audit',
    nameAr: 'تقييم تأثير الخصوصية PDPL',
    auditType: 'internal',
    category: 'data-privacy',
    priority: 'medium',
    frequency: 'semi_annual',
    frequencySchedule: { monthOfYear: 1, dayOfMonth: 10 },
    defaultTitle: 'PDPL Data Mapping & Privacy Audit',
    defaultTitleAr: 'تدقيق تعيين البيانات والخصوصية PDPL',
    defaultDescription: 'Semi-annual audit to map personal data flows and verify compliance with NDMO Personal Data Protection Law.',
    defaultDescriptionAr: 'تدقيق نصف سنوي لتعيين تدفقات البيانات الشخصية والتحقق من الامتثال لنظام حماية البيانات الشخصية PDPL.',
    defaultChecklistItems: [
      'Update data processing inventory',
      'Review consent management procedures',
      'Assess cross-border data transfers',
      'Verify data subject rights processes',
      'Check data breach notification readiness',
    ],
    defaultTeamRoles: ['Privacy Officer', 'Data Analyst'],
    framework: 'ndmo-pdpl',
    status: 'active',
    createdAt: '2025-03-10',
    updatedAt: '2026-01-20',
    usageCount: 22,
  },
  {
    id: 'at-004',
    name: 'Internal Controls Review',
    nameAr: 'فعالية الضوابط الداخلية',
    auditType: 'internal',
    category: 'internal-controls',
    priority: 'medium',
    frequency: 'annual',
    frequencySchedule: { monthOfYear: 3, dayOfMonth: 1 },
    defaultTitle: 'Annual Internal Controls Review',
    defaultTitleAr: 'المراجعة السنوية للضوابط الداخلية',
    defaultDescription: 'Annual comprehensive review of internal control frameworks, segregation of duties, and control effectiveness.',
    defaultDescriptionAr: 'مراجعة سنوية شاملة لأطر الرقابة الداخلية وفصل المهام وفعالية الضوابط.',
    defaultChecklistItems: [
      'Evaluate control environment',
      'Test key controls effectiveness',
      'Review segregation of duties',
      'Assess change management controls',
    ],
    defaultTeamRoles: ['Internal Auditor', 'Controls Specialist'],
    status: 'active',
    createdAt: '2025-04-01',
    updatedAt: '2025-12-15',
    usageCount: 15,
  },
  {
    id: 'at-005',
    name: 'Sharia Compliance Check',
    nameAr: 'تدقيق الامتثال الشرعي',
    auditType: 'sharia-board',
    category: 'sharia-compliance',
    priority: 'high',
    frequency: 'quarterly',
    frequencySchedule: { monthInQuarter: 1, dayOfMonth: 5 },
    defaultTitle: 'Quarterly Sharia Compliance Assessment',
    defaultTitleAr: 'تقييم الامتثال الشرعي الربع سنوي',
    defaultDescription: 'Quarterly assessment ensuring all banking products and operations comply with Sharia principles and board directives.',
    defaultDescriptionAr: 'تقييم ربع سنوي لضمان امتثال جميع المنتجات والعمليات المصرفية لمبادئ الشريعة الإسلامية وتوجيهات الهيئة الشرعية.',
    defaultChecklistItems: [
      'Review product structures for Sharia compliance',
      'Verify profit distribution calculations',
      'Assess contract documentation',
      'Check Sharia board resolution implementation',
      'Review purification calculations',
    ],
    defaultTeamRoles: ['Sharia Auditor', 'Islamic Banking Specialist', 'Compliance Officer'],
    framework: 'sharia-board',
    status: 'active',
    createdAt: '2025-05-01',
    updatedAt: '2026-02-01',
    usageCount: 34,
  },
  {
    id: 'at-006',
    name: 'Business Continuity Assessment',
    nameAr: 'مراجعة خطة استمرارية الأعمال',
    auditType: 'internal',
    category: 'operational-compliance',
    priority: 'critical',
    frequency: 'annual',
    frequencySchedule: { monthOfYear: 6, dayOfMonth: 1 },
    defaultTitle: 'Annual Business Continuity Assessment',
    defaultTitleAr: 'تقييم استمرارية الأعمال السنوي',
    defaultDescription: 'Annual assessment of business continuity plans, disaster recovery capabilities, and operational resilience.',
    defaultDescriptionAr: 'تقييم سنوي لخطط استمرارية الأعمال وقدرات التعافي من الكوارث والمرونة التشغيلية.',
    defaultChecklistItems: [
      'Review BCP documentation currency',
      'Test disaster recovery procedures',
      'Assess communication protocols',
      'Validate backup and recovery SLAs',
    ],
    defaultTeamRoles: ['BCM Manager', 'IT Operations Lead', 'Risk Manager'],
    status: 'active',
    createdAt: '2025-06-01',
    updatedAt: '2026-01-30',
    usageCount: 8,
  },
]

interface AuditTemplateState {
  templates: AuditTemplate[]
  create: (data: Omit<AuditTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => AuditTemplate
  update: (id: string, data: Partial<AuditTemplate>) => void
  delete: (id: string) => void
  incrementUsage: (id: string) => void
}

export const useAuditTemplateStore = create<AuditTemplateState>()(
  persist(
    (set) => ({
      templates: seedTemplates,

      create: (data) => {
        const now = new Date().toISOString().split('T')[0]
        const newTemplate: AuditTemplate = {
          ...data,
          id: `at-${Date.now()}`,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
        }
        set((s) => ({ templates: [newTemplate, ...s.templates] }))
        return newTemplate
      },

      update: (id, data) => {
        const now = new Date().toISOString().split('T')[0]
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, ...data, updatedAt: now } : t
          ),
        }))
      },

      delete: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      incrementUsage: (id) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t
          ),
        })),
    }),
    {
      name: 'audit-templates-storage',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return { templates: seedTemplates }
        }
        return persisted as any
      },
    }
  )
)
