'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useDeepLinkStore, type DeepLinkTarget } from '@/stores/deep-link-store'

// Shared "navigate with a visible loading state" helper for the dashboard's
// action buttons (Resolve Now / Review … / task-queue rows).
//
// App-Router `router.push` returns void and the destination renders its own
// data, so a click used to feel inert until the next page popped in. Wrapping
// the push in `startTransition` gives us a real pending flag that stays true
// until the target route segment (and its data) has loaded — exactly the
// "we're taking you there" window we want to surface.
//
// `pendingKey` lets a list of buttons share one hook while only the *clicked*
// one spins: pass a stable key per button and compare `pendingKey === key`.
// When the deep-link `target` is provided it's handed to the transient
// deep-link store right before navigating, so the destination can scroll to /
// glow the exact sub-item (see `useDeepLink`).
export function useNavigationLoading() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const navigate = useCallback(
    (key: string, route: string, deepLink?: DeepLinkTarget | null) => {
      if (deepLink) useDeepLinkStore.getState().setDeepLink(deepLink)
      setPendingKey(key)
      startTransition(() => {
        router.push(route)
      })
    },
    [router],
  )

  return {
    navigate,
    isNavigating: isPending,
    // Collapse to null once the transition settles so stale keys never linger.
    pendingKey: isPending ? pendingKey : null,
  }
}
