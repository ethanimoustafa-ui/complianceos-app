import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Department } from '@/types'

const seedDepartments: Department[] = [
  { id: 'compliance', name: 'Compliance', nameAr: 'الامتثال', isDefault: true },
  { id: 'it-cybersecurity', name: 'IT & Cybersecurity', nameAr: 'تقنية المعلومات والأمن السيبراني', isDefault: true },
  { id: 'finance', name: 'Finance', nameAr: 'المالية', isDefault: true },
  { id: 'risk-management', name: 'Risk Management', nameAr: 'إدارة المخاطر', isDefault: true },
  { id: 'legal', name: 'Legal', nameAr: 'الشؤون القانونية', isDefault: true },
  { id: 'security-operations', name: 'Security & Operations', nameAr: 'الأمن والعمليات', isDefault: true },
  { id: 'hr', name: 'Human Resources', nameAr: 'الموارد البشرية', isDefault: true },
  { id: 'sharia-compliance', name: 'Sharia Compliance', nameAr: 'الامتثال الشرعي', isDefault: true },
  { id: 'aml-ctf', name: 'AML/CTF', nameAr: 'مكافحة غسل الأموال', isDefault: true },
  { id: 'business-dev', name: 'Business Development', nameAr: 'تطوير الأعمال', isDefault: true },
]

interface DepartmentState {
  departments: Department[]
  addDepartment: (name: string, nameAr: string) => Department
  removeDepartment: (id: string) => void
  updateDepartment: (id: string, data: Partial<Omit<Department, 'id' | 'isDefault'>>) => void
  getDepartments: () => Department[]
  getDepartmentById: (id: string) => Department | undefined
}

export const useDepartmentStore = create<DepartmentState>()(
  persist(
    (set, get) => ({
      departments: seedDepartments,

      addDepartment: (name, nameAr) => {
        // TODO: Replace with actual API call
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const dept: Department = { id, name, nameAr, isDefault: false }
        set((s) => ({ departments: [...s.departments, dept] }))
        return dept
      },

      removeDepartment: (id) => {
        // TODO: Replace with actual API call
        // Seeds are deletable — see SPRINT-FOLLOWUP-PLAN §2.3. Orphan-confirm
        // modal lives in ListsAndCategoriesSection; the `isDefault` flag is
        // retained for display-only "SEED" badging.
        set((s) => ({
          departments: s.departments.filter((d) => d.id !== id),
        }))
      },

      updateDepartment: (id, data) => {
        // TODO: Replace with actual API call
        set((s) => ({
          departments: s.departments.map((d) =>
            d.id === id ? { ...d, ...data } : d
          ),
        }))
      },

      getDepartments: () => get().departments,

      getDepartmentById: (id) => get().departments.find((d) => d.id === id),
    }),
    {
      name: 'department-storage',
      partialize: (state) => ({ departments: state.departments }),
    }
  )
)
