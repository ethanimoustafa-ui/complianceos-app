'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuthStore } from '@/stores/auth-store'

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
        {children}
      </main>
    </div>
  )
}
