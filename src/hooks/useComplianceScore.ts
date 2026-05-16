// Server-backed compliance score hook.
//
// Phase 6 moved scoring to `/api/compliance/score`. This hook fetches the
// computed result and exposes the same `ComplianceScoreResult` shape consumers
// expected pre-migration, augmented with `isLoading` / `error` so callers can
// render a skeleton or surface failures.
//
// While the fetch is in flight (or has errored) we return a zeroed
// `ComplianceScoreResult` so destructuring stays safe at every call site.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'
import type { PeriodFilter, ComplianceScoreResult } from '@/lib/compliance-engine.types'

interface ScoreFetchResponse {
  overall: number
  change_pct: number
  confidence: ComplianceScoreResult['confidence']
  components: ComplianceScoreResult['components']
  deductions: ComplianceScoreResult['deductions']
  trend: ComplianceScoreResult['trend']
  calculated_at: string
  expires_at: string
}

interface ComputingResponse {
  status: 'computing'
  jobId?: string | null
}

export interface UseComplianceScoreResult extends ComplianceScoreResult {
  isLoading: boolean
  error: ApiClientError | null
}

// In-memory cache keyed by querystring — dedupes concurrent renders of pages
// that mount multiple consumers in the same tree. Keyed values are the
// in-flight Promise so identical queries hit the wire exactly once.
const inflight = new Map<string, Promise<ScoreFetchResponse | ComputingResponse>>()

function emptyResult(): ComplianceScoreResult {
  return {
    overall: 0,
    change: 0,
    confidence: 'insufficient',
    components: {
      auditCompletion: { score: 0, weight: 0, confidence: 'insufficient', dataPoints: 0 },
      observationClosure: { score: 0, weight: 0, confidence: 'insufficient', dataPoints: 0 },
      riskPosture: { score: 0, weight: 0, confidence: 'insufficient', dataPoints: 0 },
      policyCurrency: { score: 0, weight: 0, confidence: 'insufficient', dataPoints: 0 },
      trainingCompletion: { score: 0, weight: 0, confidence: 'insufficient', dataPoints: 0 },
    },
    frameworks: {},
    deductions: [],
    trend: [],
  }
}

export function useComplianceScore(
  periodFilter: PeriodFilter,
  options?: { framework_id?: string; department_id?: string },
): UseComplianceScoreResult {
  const [result, setResult] = useState<ComplianceScoreResult>(() => emptyResult())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiClientError | null>(null)
  const cancelled = useRef(false)

  const fwId = options?.framework_id ?? 'overall'
  const deptId = options?.department_id

  useEffect(() => {
    cancelled.current = false
    const key = JSON.stringify({ p: periodFilter, f: fwId, d: deptId ?? null })

    let promise = inflight.get(key)
    if (!promise) {
      promise = api.get<ScoreFetchResponse | ComputingResponse>('/compliance/score', {
        period: periodFilter,
        framework_id: fwId,
        department_id: deptId,
      })
      inflight.set(key, promise)
      // Drop the in-flight entry once it settles so the next mount can refetch.
      promise.finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    }

    setIsLoading(true)
    setError(null)

    promise.then(
      (data) => {
        if (cancelled.current) return
        if ('status' in data && data.status === 'computing') {
          // Server is recomputing — keep the empty result, stop loading so
          // the UI can render a "calculating" badge if desired. Callers can
          // poll by remounting; we deliberately don't auto-poll here.
          setIsLoading(false)
          return
        }
        const d = data as ScoreFetchResponse
        setResult({
          overall: d.overall,
          change: d.change_pct,
          confidence: d.confidence,
          components: d.components,
          frameworks: {}, // Per-framework scores are not surfaced via this endpoint yet.
          deductions: d.deductions,
          trend: d.trend,
        })
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
  }, [periodFilter, fwId, deptId])

  return { ...result, isLoading, error }
}
