'use client'

// GAP-15: shared "Load More" button for the circular + article Activity
// timelines. Shows an on-button spinner while the next page is fetching;
// the parent hides the button entirely once all rows are loaded.

import { Icon } from '@iconify/react'

type Props = {
  loading: boolean
  onClick: () => void
  label: string
  loadingLabel: string
}

export function TimelineLoadMore({ loading, onClick, label, loadingLabel }: Props) {
  return (
    <div className="flex justify-center pt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Icon icon="lucide:loader-2" className="text-sm animate-spin" />
            {loadingLabel}
          </>
        ) : (
          <>
            <Icon icon="lucide:chevron-down" className="text-sm" />
            {label}
          </>
        )}
      </button>
    </div>
  )
}
