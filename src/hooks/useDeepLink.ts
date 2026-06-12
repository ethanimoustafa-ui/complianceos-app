'use client'

import { useEffect, useRef } from 'react'
import { useDeepLinkStore } from '@/stores/deep-link-store'

// C(#31): destination-side consumption of a pending deep-link target.
//
// Two cooperating hooks so a detail view can: (1) switch to the tab the target
// asked for, then (2) once that tab's content has rendered, scroll the exact
// sub-item into view and glow it. The hand-off value lives in
// `useDeepLinkStore` (set by the calendar before navigating) and is consumed
// exactly once here.

function escapeId(id: string): string {
  // CSS.escape is standard in all evergreen browsers; fall back to a manual
  // escape for the (UUID-shaped, already-safe) ids if it's ever missing.
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(id)
  return id.replace(/["\\]/g, '\\$&')
}

/**
 * On mount, if a deep-link target carries a `tab`, hand it to `applyTab` so the
 * view activates the right tab before the highlight runs. Peeks (does not
 * clear) — the highlight hook is responsible for consuming the target.
 */
export function useDeepLinkTab(applyTab: (tab: string) => void): void {
  // Apply at most once. Callers typically pass an inline arrow (new identity
  // each render); `appliedRef` guards against re-applying, so listing `applyTab`
  // in the deps is harmless and keeps the effect reading the latest closure.
  const appliedRef = useRef(false)
  useEffect(() => {
    if (appliedRef.current) return
    const target = useDeepLinkStore.getState().peek()
    if (target?.tab) {
      appliedRef.current = true
      applyTab(target.tab)
    }
  }, [applyTab])
}

/**
 * Once `ready` is true (the target sub-item is rendered — e.g. the right tab is
 * active and its data has loaded), find `[data-highlight-id]`, scroll it into
 * view, and pulse the glow animation. Consumes the target so it fires once.
 * Retries across a handful of animation frames to absorb the render lag between
 * `ready` flipping and the element actually mounting.
 */
export function useDeepLinkHighlight(ready: boolean): void {
  const doneRef = useRef(false)
  useEffect(() => {
    if (!ready || doneRef.current) return
    const target = useDeepLinkStore.getState().peek()
    if (!target?.highlightId) return
    const id = target.highlightId
    let attempts = 0
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      doneRef.current = true
      useDeepLinkStore.getState().consume()
    }

    const tryHighlight = () => {
      const el = document.querySelector<HTMLElement>(`[data-highlight-id="${escapeId(id)}"]`)
      if (el) {
        finish()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('animate-element-glow')
        const cleanup = () => {
          el.classList.remove('animate-element-glow')
          el.removeEventListener('animationend', cleanup)
        }
        el.addEventListener('animationend', cleanup)
        // Safety net: drop the class even if animationend never fires.
        timer = setTimeout(cleanup, 4000)
        return
      }
      attempts += 1
      if (attempts < 40) {
        raf = requestAnimationFrame(tryHighlight)
      } else {
        // Element never appeared — clear the target so it can't leak into a
        // later open of an unrelated entity.
        finish()
      }
    }

    raf = requestAnimationFrame(tryHighlight)
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [ready])
}
