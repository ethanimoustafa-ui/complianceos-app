import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LetterTemplate, SAMALetterType } from '@/types'

const typeColors: Record<SAMALetterType, string> = {
  'non-objection': 'emerald',
  inquiry: 'blue',
  submission: 'amber',
  notification: 'rose',
}

const typeIcons: Record<SAMALetterType, string> = {
  'non-objection': 'lucide:user-check',
  inquiry: 'lucide:help-circle',
  submission: 'lucide:file-up',
  notification: 'lucide:alert-triangle',
}

const seedTemplates: LetterTemplate[] = [
  {
    id: 'tmpl-001',
    name: 'Key Function Appointment',
    type: 'non-objection',
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
    status: 'Active',
    createdDate: 'Jan 15, 2024',
    lastModified: 'Oct 10, 2024',
    usageCount: 45,
  },
  {
    id: 'tmpl-002',
    name: 'Product Launch Request',
    type: 'non-objection',
    icon: 'lucide:package',
    color: 'emerald',
    description: 'Request approval for new financial product launches.',
    status: 'Active',
    createdDate: 'Feb 20, 2024',
    lastModified: 'Sep 15, 2024',
    usageCount: 23,
  },
  {
    id: 'tmpl-003',
    name: 'Circular Clarification',
    type: 'inquiry',
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
    status: 'Active',
    createdDate: 'Mar 05, 2024',
    lastModified: 'Aug 22, 2024',
    usageCount: 38,
  },
  {
    id: 'tmpl-004',
    name: 'Regulatory Interpretation',
    type: 'inquiry',
    icon: 'lucide:book-open',
    color: 'blue',
    description: 'Request interpretation of specific regulatory requirements.',
    status: 'Draft',
    createdDate: 'Sep 01, 2024',
    lastModified: 'Oct 18, 2024',
    usageCount: 0,
  },
  {
    id: 'tmpl-005',
    name: 'Quarterly AML Report',
    type: 'submission',
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
    status: 'Active',
    createdDate: 'Jan 01, 2024',
    lastModified: 'Oct 01, 2024',
    usageCount: 12,
  },
  {
    id: 'tmpl-006',
    name: 'Annual Compliance Report',
    type: 'submission',
    icon: 'lucide:file-text',
    color: 'amber',
    description: 'Submit annual compliance assessment to SAMA.',
    status: 'Active',
    createdDate: 'Jan 10, 2024',
    lastModified: 'Dec 15, 2024',
    usageCount: 4,
  },
  {
    id: 'tmpl-007',
    name: 'Incident Notification',
    type: 'notification',
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
    status: 'Active',
    createdDate: 'Apr 12, 2024',
    lastModified: 'Jul 30, 2024',
    usageCount: 8,
  },
  {
    id: 'tmpl-008',
    name: 'System Outage Report',
    type: 'notification',
    icon: 'lucide:server-crash',
    color: 'rose',
    description: 'Report critical system outages affecting banking services.',
    status: 'Active',
    createdDate: 'May 20, 2024',
    lastModified: 'Nov 05, 2024',
    usageCount: 3,
  },
]

interface SAMATemplateState {
  templates: LetterTemplate[]
  create: (data: Omit<LetterTemplate, 'id' | 'createdDate' | 'lastModified' | 'usageCount'>) => LetterTemplate
  update: (id: string, data: Partial<LetterTemplate>) => void
  delete: (id: string) => void
  incrementUsage: (id: string) => void
}

export const useSAMATemplateStore = create<SAMATemplateState>()(
  persist(
    (set) => ({
      templates: seedTemplates,

      create: (data) => {
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const newTemplate: LetterTemplate = {
          ...data,
          icon: data.icon || typeIcons[data.type],
          color: data.color || typeColors[data.type],
          id: `tmpl-${Date.now()}`,
          createdDate: now,
          lastModified: now,
          usageCount: 0,
        }
        set((s) => ({ templates: [newTemplate, ...s.templates] }))
        return newTemplate
      },

      update: (id, data) => {
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, ...data, lastModified: now } : t
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
    { name: 'sama-templates' }
  )
)
