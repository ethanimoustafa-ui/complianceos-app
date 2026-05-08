'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { RBACToastHost } from '@/components/auth/rbac-toast'
import { useTranslation } from '@/i18n'

// RBAC-024 demo banner — shown when the current user is acting-as someone
// other than the genuine logged-in account. Click "Reset" to bounce back to
// the original identity tracked in `auth.originalUserId`.
function DemoBanner() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const originalUserId = useAuthStore((s) => s.originalUserId)
  const switchUser = useAuthStore((s) => s.switchUser)

  if (!user || !originalUserId || user.id === originalUserId) return null

  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 flex items-center justify-between gap-4 text-xs font-bold shrink-0">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:user-check" className="text-base" />
        <span>{t('rbac.demoBanner', { name: user.name })}</span>
      </div>
      <button
        type="button"
        onClick={() => switchUser(originalUserId)}
        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-full uppercase tracking-wider text-[10px] cursor-pointer transition-colors"
      >
        {t('rbac.resetActingAs')}
      </button>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  // RBAC-017: gate via mount-based hydration. Zustand persist hydrates
  // synchronously on the client after the first paint, so reading the store
  // during SSR / first render would read defaults and bounce a real session.
  // Wait until after mount before deciding to redirect.
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (hasMounted && !isAuthenticated) {
      router.replace('/sign-in')
    }
  }, [hasMounted, isAuthenticated, router])

  if (!hasMounted || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Icon icon="lucide:loader-2" className="text-3xl text-emerald-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden hide-scrollbar">
        <DemoBanner />
        {children}
      </main>
      <RBACToastHost />
    </div>
  )
}
