// Server-backed dashboard KPI summary hook.
//
// Fetches the precomputed count-based KPIs from /api/dashboard/summary (the
// `dashboard_rollup` read-model, migration 104) in ONE request, replacing the
// per-entity list fan-out + client-side counting (audit findings B1/B2/B3).
// The returned shape mirrors the count-based groups of `DashboardMetrics`.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'
import type { DashboardMetrics } from '@/hooks/useDashboardMetrics'

export type DashboardSummaryData = Pick<
  DashboardMetrics,
  'audits' | 'observations' | 'risks' | 'policies' | 'samaLetters' | 'correspondence' | 'circulars' | 'training'
>

interface SummaryResponse {
  scope: string
  data: DashboardSummaryData | null
  refreshed_at: string | null
}

// Dedupe concurrent mounts (StrictMode double-render / multiple consumers) so
// the summary hits the wire once per render cycle.
const inflight = new Map<string, Promise<SummaryResponse>>()

export interface UseDashboardSummaryResult {
  data: DashboardSummaryData | null
  refreshedAt: string | null
  isLoading: boolean
  error: ApiClientError | null
}

export function useDashboardSummary(): UseDashboardSummaryResult {
  const [data, setData] = useState<DashboardSummaryData | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiClientError | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const key = 'org'
    let promise = inflight.get(key)
    if (!promise) {
      promise = api.get<SummaryResponse>('/dashboard/summary')
      inflight.set(key, promise)
      promise.finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    }

    setIsLoading(true)
    setError(null)
    promise.then(
      (res) => {
        if (cancelled.current) return
        setData(res.data)
        setRefreshedAt(res.refreshed_at)
        setIsLoading(false)
      },
      (err) => {
        if (cancelled.current) return
        setError(err instanceof ApiClientError ? err : new ApiClientError('unknown', String(err), 0))
        setIsLoading(false)
      },
    )

    return () => {
      cancelled.current = true
    }
  }, [])

  return { data, refreshedAt, isLoading, error }
}
