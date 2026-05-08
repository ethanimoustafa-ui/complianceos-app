import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

// ── Seed users (RBAC-009) ────────────────────────────────────────────────────
// Mirror the team-store seeds so impersonation (Phase 4 RBAC-024) can switch
// between any of them. The admin user's id is `'admin'` to keep it stable
// across the v3→v4 migration; the other seed ids ('1'..'5') match team-store
// member ids exactly so `getEffectivePermissions` finds the matching record.
const SEED_USERS: User[] = [
  {
    id: 'admin',
    name: 'Test Admin',
    email: 'admin@example.com',
    role: 'admin',
    department: 'Compliance',
    phone: '+966 50 123 4567',
    avatarSeed: 'Felix',
    workload: 75,
  },
  // Mirrors team-store seed members (id 1..5):
  { id: '1', name: 'Sarah Connor', email: 'sarah@company.com', role: 'manager', department: 'Compliance', avatarSeed: 'Sarah', workload: 65 },
  { id: '2', name: 'Ahmed Khan', email: 'ahmed@company.com', role: 'manager', department: 'Risk Management', avatarSeed: 'Ahmed', workload: 45 },
  { id: '3', name: 'Lisa Martinez', email: 'lisa@company.com', role: 'officer', department: 'Legal', avatarSeed: 'Lisa', workload: 80 },
  { id: '4', name: 'Michael Scott', email: 'michael@company.com', role: 'admin', department: 'IT & Cybersecurity', avatarSeed: 'Michael', workload: 55 },
  { id: '5', name: 'Dr. Hassan Ali', email: 'hassan@company.com', role: 'manager', department: 'Compliance', avatarSeed: 'Hassan', workload: 70 },
]

const DEFAULT_USER = SEED_USERS[0]

export { SEED_USERS, DEFAULT_USER }

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  refreshToken: () => Promise<void>
  updateProfile: (data: Partial<User>) => void
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  switchUser: (userId: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Default current user — admin so existing demo flows keep working.
      // Phase 3 (RBAC-011) wires the real sign-in form to this store; Phase 4
      // (RBAC-024) adds an Acting-As switcher.
      user: { ...DEFAULT_USER },
      token: 'demo-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,

      // Mock login — matches `email` against SEED_USERS, ignores password.
      // Returns `{ ok, error? }` so callers can branch without try/catch.
      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          // Pretend network round-trip so the spinner is visible.
          await new Promise((resolve) => setTimeout(resolve, 400))

          const normalised = email.trim().toLowerCase()
          const matched = SEED_USERS.find((u) => u.email.toLowerCase() === normalised)
          // password ignored on purpose — this is a demo. See plan §11.1.
          void password

          if (!matched) {
            const error = 'Invalid credentials'
            set({ isLoading: false, error })
            return { ok: false, error }
          }

          set({
            user: { ...matched },
            token: 'demo-token',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed'
          set({ error: message, isLoading: false })
          return { ok: false, error: message }
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        })
      },

      refreshToken: async () => {
        const { token } = get()
        if (!token) return

        try {
          await new Promise((resolve) => setTimeout(resolve, 500))
          set({ token: 'demo-token-refreshed' })
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: 'Session expired',
          })
        }
      },

      updateProfile: (data) => {
        const { user } = get()
        if (!user) return
        set({ user: { ...user, ...data } })
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),

      // RBAC-010: switch the current user by id (used by the demo Acting-As
      // picker added in Phase 4). Throws if `userId` is not in SEED_USERS.
      // Phase 7 will layer `auth.switch_user` audit logging on top of this.
      switchUser: (userId) => {
        const matched = SEED_USERS.find((u) => u.id === userId)
        if (!matched) {
          throw new Error(`switchUser: unknown userId "${userId}"`)
        }
        set({
          user: { ...matched },
          token: 'demo-token',
          isAuthenticated: true,
          error: null,
        })
      },
    }),
    {
      name: 'auth-storage',
      version: 4,
      migrate: (persistedState, fromVersion) => {
        // v3→v4 (RBAC-009): rewrite `id: 'current-user'` to `id: 'admin'` so
        // the user matches a stable seed id; preserve any other persisted user.
        type PartialAuth = { user?: User | null; token?: string | null; isAuthenticated?: boolean }
        const state = (persistedState ?? {}) as PartialAuth
        if (fromVersion < 4) {
          if (!state.user) {
            return {
              user: { ...DEFAULT_USER },
              token: 'demo-token',
              isAuthenticated: true,
            }
          }
          if (state.user.id === 'current-user') {
            return {
              user: { ...state.user, id: 'admin' },
              token: state.token ?? 'demo-token',
              isAuthenticated: state.isAuthenticated ?? true,
            }
          }
        }
        return {
          user: state.user ?? { ...DEFAULT_USER },
          token: state.token ?? 'demo-token',
          isAuthenticated: state.isAuthenticated ?? true,
        }
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
