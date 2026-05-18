'use client'

// Dashboard skeleton scaffolds.
//
// The dashboard aggregates ~10 stores and ~15 widgets per view. Rather than
// each widget tracking its own `isLoading`, the page renders one of these
// composed skeletons while the *first* fetch is still in flight (i.e. the
// stores have `lastFetched === null`). Once any store hydrates, the real
// view renders and individual empty states take over.
//
// Skeleton shapes are matched to the rendered widget so layout doesn't
// jump on hydration:
//   - Hero card  → wide rounded card with ring placeholder on the right
//   - SAMA panel → 3 stacked progress rows
//   - Metric tiles → 4-column grid of square tiles
//   - Observation cards → 3 cards with progress bars
//   - Lists (task queue / approvals / notifications) → 5 row placeholders
//   - Team workload → 4 avatar+bar rows
//   - Component grid (7 health components) → 7 small tiles
//   - Framework grid → 5 small ring tiles

import { Skeleton } from '@/components/ui/skeleton'

function HeroCardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-10">
        <div className="flex-1 space-y-4 w-full">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
        <div className="flex-shrink-0">
          <Skeleton className="h-44 w-44 rounded-full" />
        </div>
      </div>
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[2rem] p-8 space-y-5">
        <Skeleton className="h-3 w-32" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MetricTileGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3"
        >
          <div className="flex justify-between items-start">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ObservationCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
        >
          <div className="flex justify-between items-start">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-6 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function TeamWorkloadSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100"
      data-testid="dashboard-list-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-2 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function ComponentGridSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-2xl p-4 text-center space-y-2"
        >
          <Skeleton className="h-3 w-16 mx-auto" />
          <Skeleton className="h-7 w-12 mx-auto" />
          <div className="flex justify-center gap-2">
            <Skeleton className="h-4 w-10 rounded-full" />
            <Skeleton className="h-4 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function FrameworkRingsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center gap-2"
        >
          <Skeleton className="h-[68px] w-[68px] rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

function SectionHeaderSkeleton() {
  return <Skeleton className="h-3 w-40 mb-4" />
}

export function ExecutiveSkeleton() {
  return (
    <div className="space-y-8" data-testid="executive-skeleton" aria-busy="true">
      <HeroCardSkeleton />
      <MetricTileGridSkeleton count={4} />
      <div>
        <SectionHeaderSkeleton />
        <FrameworkRingsSkeleton count={3} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <SectionHeaderSkeleton />
          <ObservationCardsSkeleton />
          <div className="pt-4">
            <SectionHeaderSkeleton />
            <div className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex items-center gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-4 space-y-8">
          <div>
            <SectionHeaderSkeleton />
            <TeamWorkloadSkeleton rows={4} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ManagerialSkeleton() {
  return (
    <div className="space-y-8" data-testid="managerial-skeleton" aria-busy="true">
      <HeroCardSkeleton />
      <div>
        <SectionHeaderSkeleton />
        <ComponentGridSkeleton count={7} />
      </div>
      <div>
        <SectionHeaderSkeleton />
        <FrameworkRingsSkeleton count={4} />
      </div>
      <div>
        <SectionHeaderSkeleton />
        <ListRowsSkeleton rows={5} />
      </div>
      <div>
        <SectionHeaderSkeleton />
        <TeamWorkloadSkeleton rows={4} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <SectionHeaderSkeleton />
          <ObservationCardsSkeleton />
        </div>
        <div className="lg:col-span-4">
          <SectionHeaderSkeleton />
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-6" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <SectionHeaderSkeleton />
        <div className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function OfficerSkeleton() {
  return (
    <div className="space-y-8" data-testid="officer-skeleton" aria-busy="true">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-200/60">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[2rem] p-8 flex flex-col items-center gap-4">
          <Skeleton className="h-[120px] w-[120px] rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
          <div className="grid grid-cols-4 gap-3 w-full mt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="h-5 w-6" />
                <Skeleton className="h-2 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <SectionHeaderSkeleton />
          <ListRowsSkeleton rows={6} />
        </div>
        <div className="lg:col-span-4 space-y-6">
          <div>
            <SectionHeaderSkeleton />
            <ListRowsSkeleton rows={3} />
          </div>
          <div>
            <SectionHeaderSkeleton />
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex items-center gap-2 flex-1">
                    <Skeleton className="h-3 w-3 rounded" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <Skeleton className="h-2 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
