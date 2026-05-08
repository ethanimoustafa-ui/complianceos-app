import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { useUserLogStore } from '@/stores/user-log-store'

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
  // RBAC-024: tracks the original logged-in identity (the "real" account
  // behind any Acting-As impersonation). Stays untouched by `switchUser` so
  // the demo banner + Reset can return to it. Cleared on `logout`.
  originalUserId?: string

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
      originalUserId: DEFAULT_USER.id,

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
            // RBAC-024: stamp the genuine logged-in identity. switchUser()
            // does not touch this; logout() clears it.
            originalUserId: matched.id,
          })
          // RBAC-025: audit log every successful login.
          useUserLogStore.getState().log({
            userId: matched.id,
            action: 'auth.login',
            target: 'sign-in',
          })
          return { ok: true }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed'
          set({ error: message, isLoading: false })
          return { ok: false, error: message }
        }
      },

      logout: () => {
        const previousUserId = get().user?.id
        // RBAC-025: log BEFORE clearing the user so the actor id is captured.
        if (previousUserId) {
          useUserLogStore.getState().log({
            userId: previousUserId,
            action: 'auth.logout',
            target: 'sign-out',
          })
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          originalUserId: undefined,
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

      // RBAC-010 / RBAC-024 / RBAC-025: switch the current user by id (used by
      // the demo Acting-As picker). Throws if `userId` is not in SEED_USERS.
      // Audit-logs an `auth.switch_user` entry with the actor id BEFORE the
      // swap so direct callers (not just the UI) get audited too. Does NOT
      // mutate `originalUserId` — that stays anchored to the genuine
      // logged-in identity for as long as the session is alive.
      switchUser: (userId) => {
        const matched = SEED_USERS.find((u) => u.id === userId)
        if (!matched) {
          throw new Error(`switchUser: unknown userId "${userId}"`)
        }
        const previousUserId = get().user?.id ?? 'anonymous'
        useUserLogStore.getState().log({
          userId: previousUserId,
          action: 'auth.switch_user',
          target: userId,
        })
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
      version: 5,
      migrate: (persistedState, fromVersion) => {
        // v3→v4 (RBAC-009): rewrite `id: 'current-user'` to `id: 'admin'` so
        // the user matches a stable seed id; preserve any other persisted user.
        // v4→v5 (RBAC-024): add `originalUserId` (defaults to current user's
        // id, or `'admin'` as fallback) so the demo banner / Reset can return
        // to the genuine logged-in identity.
        type PartialAuth = {
          user?: User | null
          token?: string | null
          isAuthenticated?: boolean
          originalUserId?: string
        }
        const state = (persistedState ?? {}) as PartialAuth
        let user: User | null = state.user ?? { ...DEFAULT_USER }
        if (fromVersion < 4 && user && user.id === 'current-user') {
          user = { ...user, id: 'admin' }
        }
        const originalUserId = state.originalUserId ?? user?.id ?? 'admin'
        return {
          user,
          token: state.token ?? 'demo-token',
          isAuthenticated: state.isAuthenticated ?? !!user,
          originalUserId,
        }
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        originalUserId: state.originalUserId,
      }),
    }
  )
)
