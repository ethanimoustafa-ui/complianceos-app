'use client'

import { ReactNode } from 'react'

// Base shimmering placeholder — wraps a tailwind class with the standard
// pulse animation. Use as the smallest building block for list/table/card
// skeletons.
//
// Pattern used by Wave-2 list pages:
//   if (isLoading && items.length === 0) {
//     return <ListSkeleton rows={5} />
//   }
//
// Refetches (`isLoading === true && items.length > 0`) keep the stale list
// visible — DO NOT re-trigger the skeleton there.

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
      data-testid="skeleton-block"
    />
  )
}

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

/**
 * Five (configurable) row placeholders matching the typical observation /
 * letter / advisory / policy / audit / risk / training table layout.
 *
 * `data-testid="list-skeleton"` is asserted by `tests/e2e/wave2-e-verify.spec.ts`.
 */
export function ListSkeleton({ rows = 5, columns = 4, className = '' }: TableSkeletonProps) {
  return (
    <div
      className={`w-full space-y-3 ${className}`}
      data-testid="list-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Header bar */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex items-center gap-4 px-4 py-4 border-b border-slate-50">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton
              key={`r-${r}-c-${c}`}
              className={c === 0 ? 'h-5 w-2/5' : 'h-4 flex-1'}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface CardSkeletonProps {
  count?: number
  className?: string
  children?: ReactNode
}

/** A grid of card placeholders for dashboard / calendar / training views. */
export function CardSkeleton({ count = 4, className = '', children }: CardSkeletonProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
      data-testid="card-skeleton"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {children ??
        Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
    </div>
  )
}
