// Toast store — tiny global notification queue.
//
// Reusable across pages (regulatory-updates rules, policies, observations,
// letters). Stores raise toasts directly from their optimistic-mutation catch
// paths via `pushToast`, and `<ToastHost />` (mounted once per page) renders
// the stacked toasts. Auto-dismiss after ~4s; manual dismiss via `dismiss`.

import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type ToastKind = 'success' | 'error'

/**
 * RTL-8: a toast carries EITHER a translation key (+ optional params) OR a
 * literal, already-translated string. The store lives outside React and has no
 * `t()`, so key-based toasts are translated by `<ToastHost />` at RENDER time.
 *
 * `messageKey` set  → ToastHost renders `t(messageKey, messageParams)`.
 * `messageKey` unset → ToastHost renders the literal `message` as-is (used for
 *                      success toasts whose caller already translated the copy).
 */
export interface Toast {
  id: string
  /** Literal, already-translated text. Used when `messageKey` is absent. */
  message: string
  /** i18n key — translated at render time by ToastHost. */
  messageKey?: string
  /** Interpolation params for `messageKey`. */
  messageParams?: Record<string, string | number>
  kind: ToastKind
}

/** A toast payload: a literal string OR a `{ key, params }` translation spec. */
export type ToastMessage =
  | string
  | { key: string; params?: Record<string, string | number> }

const AUTO_DISMISS_MS = 4000

interface ToastState {
  toasts: Toast[]
  pushToast: (message: ToastMessage, kind: ToastKind) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  pushToast: (message, kind) => {
    const id = nanoid()
    const entry: Toast =
      typeof message === 'string'
        ? { id, message, kind }
        : { id, message: '', messageKey: message.key, messageParams: message.params, kind }
    set((state) => ({ toasts: [...state.toasts, entry] }))
    // Auto-dismiss. `setTimeout` runs in the browser; on the server (unlikely,
    // since toasts are raised from client interactions) it is simply skipped.
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, AUTO_DISMISS_MS)
    }
    return id
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

// Non-hook accessor so non-React modules (the optimistic helper, stores) can
// raise a toast without subscribing. Accepts a literal string OR a `{key,params}`
// translation spec — key-based toasts are translated by ToastHost at render time.
export function pushToast(message: ToastMessage, kind: ToastKind): string {
  return useToastStore.getState().pushToast(message, kind)
}
