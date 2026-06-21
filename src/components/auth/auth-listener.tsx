'use client'

// Top-level auth listener — subscribes to Supabase `onAuthStateChange` and
// syncs the zustand store. Mount once at the root layout (after providers).
//
// Also performs a one-shot session refresh on mount so the store reflects the
// current cookie-backed session even on hard reload.

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { createClient } from '@/lib/supabase/client'
import { initSessionPersistence } from '@/lib/auth/session-persistence'

export function AuthListener() {
  const refreshSession = useAuthStore((s) => s.refreshSession)
  const setSessionUser = useAuthStore((s) => s.setSessionUser)

  useEffect(() => {
    let cancelled = false

    // "Remember me": if this is a cold browser start resuming an ephemeral
    // (remember-me-off) session, sign out instead of restoring it, then hard-
    // redirect so the server proxy deterministically re-gates the page.
    //
    // Skip this entirely on the auth/recovery routes: the password-reset flow
    // lands on /reset-password with a FRESH recovery session (set by the auth
    // callback) that must NOT be revoked, and sign-in/up don't need gating.
    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    const onAuthRoute = /^\/(sign-in|sign-up|forgot-password|reset-password|verify-email)(\/|$)/.test(path)
    if (!onAuthRoute && initSessionPersistence().expire) {
      void useAuthStore
        .getState()
        .signOut()
        .finally(() => {
          window.location.replace('/sign-in')
        })
      return () => {
        cancelled = true
      }
    }

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
