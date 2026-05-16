'use client'

// Top-level auth listener — subscribes to Supabase `onAuthStateChange` and
// syncs the zustand store. Mount once at the root layout (after providers).
//
// Also performs a one-shot session refresh on mount so the store reflects the
// current cookie-backed session even on hard reload.

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'

export function AuthListener() {
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const setSessionUser = useAuthStore((s) => s.setSessionUser)

  useEffect(() => {
    let cancelled = false

    // Hydrate from the current session immediately.
    void refreshSession().catch(() => {})

    const supabase = createClient()
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      // SIGNED_OUT / USER_DELETED → clear; otherwise sync from session user.
      if (event === 'SIGNED_OUT' || !session?.user) {
        void setSessionUser(null)
      } else {
        void setSessionUser(session.user.id)
      }
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [refreshSession, setSessionUser])

  return null
}
