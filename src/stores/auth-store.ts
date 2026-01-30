import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Auto-login with mock user for development
      // TESTING: Change role to test different permissions
      // 'officer' = View only + full observation access
      // 'manager' = View + Create + Edit + Export
      // 'admin'   = Full access (including Delete, Settings, Team)
      user: {
        id: 'current-user', // Unique ID to avoid collision with team members
        name: 'Test User',
        email: 'test@example.com',
        role: 'admin', // <-- Change this to test: 'officer' | 'manager' | 'admin'
        department: 'Compliance',
        workload: 75,
      },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          console.log('Login attempt:', { email, password })
          await new Promise((resolve) => setTimeout(resolve, 1000))

          // Mock user for now
          // TESTING: Change role to test different permissions
          // 'officer' = View only
          // 'manager' = View + Create + Edit + Export
          // 'admin'   = Full access (including Delete, Settings, Team)
          const mockUser: User = {
            id: 'current-user', // Unique ID to avoid collision with team members
            name: 'Test User',
            email,
            role: 'admin', // <-- Change this to test: 'officer' | 'manager' | 'admin'
            department: 'Compliance',
            workload: 75,
          }

          set({
            user: mockUser,
            token: 'mock-token',
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          })
          throw error
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
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))
          set({ token: 'refreshed-mock-token' })
        } catch (error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: 'Session expired',
          })
        }
      },

      updateProfile: async (data: Partial<User>) => {
        const { user } = get()
        if (!user) return

        set({ isLoading: true, error: null })
        try {
          // TODO: Replace with actual API call
          await new Promise((resolve) => setTimeout(resolve, 500))
          set({
            user: { ...user, ...data },
            isLoading: false,
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Update failed',
            isLoading: false,
          })
          throw error
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
