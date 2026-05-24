'use client'

// ToastHost — renders the stacked toasts from `useToastStore`, bottom-right.
//
// Mount this ONCE per page (e.g. the regulatory-updates rules page). Stores and
// components raise toasts via `pushToast(message, kind)`; this component just
// renders whatever is in the queue. Success = emerald, error = amber/rose with
// an alert icon. Accessible: success uses role="status"/aria-live="polite",
// error uses role="alert"/aria-live="assertive".

import { Icon } from '@iconify/react'
import { useToastStore } from '@/stores/toast-store'
import { useTranslation, type TranslationKey } from '@/i18n'

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  // RTL-8: key-based toasts are translated HERE, at render time — the toast
  // store lives outside React and has no `t()`.
  const { t } = useTranslation()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-8 right-8 z-[60] flex flex-col gap-2 items-end">
      {toasts.map((toast) => {
        const isError = toast.kind === 'error'
        const text = toast.messageKey
          ? t(toast.messageKey as TranslationKey, toast.messageParams)
          : toast.message
        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={
              isError
                ? 'bg-amber-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 max-w-md'
                : 'bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 max-w-md'
            }
          >
            <Icon
              icon={isError ? 'lucide:alert-triangle' : 'lucide:check-circle'}
              className="text-2xl shrink-0"
            />
            <span className="font-bold flex-1">{text}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-white/70 hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss"
            >
              <Icon icon="lucide:x" className="text-lg" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
