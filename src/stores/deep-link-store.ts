// Deep-link store — a tiny transient hand-off for "open this entity AND scroll
// to / glow this exact sub-item".
//
// C(#31): when the user clicks a calendar deadline that represents a SUB-ITEM
// (a workflow step, a checklist item, …), we want to open the parent's detail
// view, switch to the right tab, scroll the sub-item into view, and briefly
// glow it. The sub-item id is deliberately NOT put in the URL — query params
// there tended to "stick" and re-trigger navigation/refetch loops. Instead the
// navigator sets the target here right before `router.push(baseRoute)`, and the
// destination detail view consumes it once (and clears it) after its data has
// rendered.
//
// highlightId is a globally-unique DB id (matched against a `data-highlight-id`
// attribute), so a stale value can never highlight the wrong element — it just
// matches nothing and is cleared on the next consume.

import { create } from 'zustand'

export interface DeepLinkTarget {
  /** The `data-highlight-id` to scroll to + glow. Null = open only (no sub-item). */
  highlightId: string | null
  /** Optional tab key the destination should activate before highlighting. */
  tab?: string | null
}

interface DeepLinkState {
  target: DeepLinkTarget | null
  /** Set the pending deep-link target. Call immediately before navigating. */
  setDeepLink: (target: DeepLinkTarget) => void
  /** Read the current target without clearing it (peek). */
  peek: () => DeepLinkTarget | null
  /** Read + clear the target. Destination views call this once they've consumed it. */
  consume: () => DeepLinkTarget | null
  clear: () => void
}

export const useDeepLinkStore = create<DeepLinkState>((set, get) => ({
  target: null,
  setDeepLink: (target) => set({ target }),
  peek: () => get().target,
  consume: () => {
    const t = get().target
    if (t) set({ target: null })
    return t
  },
  clear: () => set({ target: null }),
}))

// Parse a UnifiedCalendarItem id (e.g. "policy-step-<uuid>", "risk-cl-<uuid>",
// "obs-cl-<uuid>", "circ-step-<uuid>") into the raw sub-item DB id used as the
// `data-highlight-id` on the destination, plus the tab to open (if any).
//
// Returns null when the item is a top-level entity (no sub-item to highlight).
export function deepLinkTargetFromItemId(
  itemId: string,
): { highlightId: string; tab?: string } | null {
  // Policy workflow step → open the Workflow tab and glow the step (B #30).
  const polStep = itemId.match(/^policy-step-(.+)$/)
  if (polStep) return { highlightId: polStep[1], tab: 'workflow' }

  // Circular workflow step → Workflow tab + glow the step.
  const circStep = itemId.match(/^circ-step-(.+)$/)
  if (circStep) return { highlightId: circStep[1], tab: 'workflow' }

  // Circular article checklist item (D #32) lives in a nested article modal,
  // so there's no element to glow at the circular level — just open the
  // circular cleanly (no tab switch, no highlight).

  // Risk mitigation-checklist item → glow the checklist row.
  const riskCl = itemId.match(/^risk-cl-(.+)$/)
  if (riskCl) return { highlightId: riskCl[1] }

  // Observation checklist item → glow the checklist row.
  const obsCl = itemId.match(/^obs-cl-(.+)$/)
  if (obsCl) return { highlightId: obsCl[1] }

  return null
}
