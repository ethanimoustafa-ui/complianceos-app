'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { RBACError } from '@/lib/rbac-error'

// Round 4 Phase 6 — global RBAC toast.
//
// Mutating store actions throw `RBACError` when the current user lacks the
// required permission. UI handlers can catch + handle locally, but for the
// many call sites that fire the store action through a button without an
// explicit try/catch (and especially for async actions whose rejection
// reaches the window as `unhandledrejection`), we surface a small toast.
//
// The component listens at the window level for both synchronous `error`
// events and `unhandledrejection` events whose `.reason` is an `RBACError`,
// then renders a dismissable bottom-right pill. No external toast library is
// pulled in — this is the simplest viable primitive per Phase-6 brief.
export function RBACToastHost() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = (err: unknown) => {
      if (err instanceof RBACError) {
        setMessage(t('rbac.deniedToast'))
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setMessage(null), 4500)
      }
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      fire(e.reason)
      if (e.reason instanceof RBACError) {
        // Suppress the noisy uncaught-promise console trace — the toast IS the
        // user-visible signal. Other error types are left untouched.
        e.preventDefault?.()
      }
    }
    const onError = (e: ErrorEvent) => {
      fire(e.error)
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
      if (timer) clearTimeout(timer)
    }
  }, [t])

  if (!message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 end-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl bg-rose-600 text-white text-sm font-semibold max-w-sm animate-in fade-in slide-in-from-bottom-2"
    >
      <Icon icon="lucide:shield-alert" className="text-lg flex-shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        onClick={() => setMessage(null)}
        className="opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <Icon icon="lucide:x" className="text-lg" />
      </button>
    </div>
  )
}
