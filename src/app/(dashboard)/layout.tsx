'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { RBACToastHost } from '@/components/auth/rbac-toast'
import { ToastHost } from '@/components/ui/toast-host'
import { LookupHydrator } from '@/components/layout/lookup-hydrator'

// Auth gating is enforced by the root `middleware.ts` against the Supabase
// session cookie — unauthenticated requests are redirected to /sign-in before
// React ever renders. The client-side spinner / redirect dance that lived
// here (mock-auth era) is no longer needed.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      <LookupHydrator />
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden hide-scrollbar">
        {children}
      </main>
      {/* App-wide notification surfaces. ToastHost is mounted ONCE here (not
          per-page) so any component — including global ones like the message
          panel in the sidebar — can `pushToast(...)` and have it render. */}
      <ToastHost />
      <RBACToastHost />
    </div>
  )
}
