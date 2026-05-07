import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AUTHORITY_DEPARTMENTS, type DeptDescriptor } from '@/lib/letter-authority'

export interface AuthorityDept extends DeptDescriptor {
  isSeed?: boolean
}

// Per-authority list of departments. Seeded from the static
// AUTHORITY_DEPARTMENTS map but mutable thereafter.
type ByAuthority = Record<string, AuthorityDept[]>

interface AuthorityDeptState {
  byAuthority: ByAuthority

  getDepartments: (authority: string) => AuthorityDept[]
  addDepartment: (authority: string, en: string, ar: string, email?: string) => AuthorityDept
  updateDepartment: (authority: string, deptId: string, patch: Partial<Omit<AuthorityDept, 'id'>>) => void
  removeDepartment: (authority: string, deptId: string) => void
  setDepartmentEmail: (authority: string, deptId: string, email: string) => void
}

const seedFromStatic = (): ByAuthority => {
  const out: ByAuthority = {}
  for (const [auth, depts] of Object.entries(AUTHORITY_DEPARTMENTS)) {
    out[auth] = depts.map((d) => ({ ...d, isSeed: true }))
  }
  return out
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const key = (authority: string) => {
  if (!authority) return ''
  const lower = authority.toLowerCase()
  return lower === 'sharia' ? 'sharia-board' : lower
}

export const useAuthorityDeptStore = create<AuthorityDeptState>()(
  persist(
    (set, get) => ({
      byAuthority: seedFromStatic(),

      getDepartments: (authority) => get().byAuthority[key(authority)] ?? [],

      addDepartment: (authority, en, ar, email) => {
        const k = key(authority)
        const id = `${k}-${slug(en) || Date.now()}`
        const dept: AuthorityDept = { id, en, ar: ar || en, email, isSeed: false }
        set((s) => {
          const list = s.byAuthority[k] ?? []
          return { byAuthority: { ...s.byAuthority, [k]: [...list, dept] } }
        })
        return dept
      },

      updateDepartment: (authority, deptId, patch) => {
        const k = key(authority)
        set((s) => {
          const list = s.byAuthority[k] ?? []
          return {
            byAuthority: {
              ...s.byAuthority,
              [k]: list.map((d) => (d.id === deptId ? { ...d, ...patch } : d)),
            },
          }
        })
      },

      removeDepartment: (authority, deptId) => {
        const k = key(authority)
        set((s) => {
          const list = s.byAuthority[k] ?? []
          return {
            byAuthority: {
              ...s.byAuthority,
              // Seed entries can be removed too — the user is in control.
              [k]: list.filter((d) => d.id !== deptId),
            },
          }
        })
      },

      setDepartmentEmail: (authority, deptId, email) => {
        get().updateDepartment(authority, deptId, { email })
      },
    }),
    {
      name: 'authority-department-storage',
      version: 1,
      // Re-seed any missing authority lists when reading from disk so users that
      // persisted before a new authority was added still see its defaults.
      migrate: (persisted: unknown) => {
        const state = (persisted as { byAuthority?: ByAuthority }) ?? {}
        const seeded = seedFromStatic()
        const merged: ByAuthority = { ...seeded, ...(state.byAuthority ?? {}) }
        return { byAuthority: merged }
      },
    },
  ),
)
