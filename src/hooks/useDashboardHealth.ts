// Server-backed dashboard-health hook.
//
// Phase 6 moved the engine to `/api/compliance/dashboard-health`. This hook
// fetches the server-computed result and surfaces the same
// `DashboardHealthResult` shape consumers used to read directly. Business
// compliance (which is still derived client-side from the evaluation store)
// is overlaid on top.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'
import type { DashboardHealthResult } from '@/lib/dashboard-health.types'

interface DashboardHealthFetchResponse {
  overall: number
  components: {
    components: DashboardHealthResult['components']
    frameworkScores: DashboardHealthResult['frameworkScores']
    businessComplianceScore: number
    businessComplianceEvaluated: number
  }
  deductions: DashboardHealthResult['deductions']
  trend: unknown[]
  confidence: DashboardHealthResult['confidence']
  calculated_at: string
  expires_at: string
}

interface ComputingResponse {
  status: 'computing'
  jobId?: string | null
}

export interface UseDashboardHealthResult extends DashboardHealthResult {
  isLoading: boolean
  error: ApiClientError | null
}

const inflight = new Map<string, Promise<DashboardHealthFetchResponse | ComputingResponse>>()

function emptyResult(): DashboardHealthResult {
  const empty = { score: 0, weight: 0, confidence: 'insufficient' as const, dataPoints: 0 }
  return {
    overall: 0,
    confidence: 'insufficient',
    components: {
      audits: empty,
      observations: empty,
      letters: empty,
      policies: empty,
      circulars: empty,
      riskPosture: empty,
      training: empty,
    },
    frameworkScores: [],
    deductions: [],
    businessComplianceScore: 0,
    businessComplianceEvaluated: 0,
  }
}

export function useDashboardHealth(
  options?: { period?: '3months' | '6months' | '12months' | 'fiscal' },
): UseDashboardHealthResult {
  const period = options?.period ?? '3months'

  const [result, setResult] = useState<DashboardHealthResult>(() => emptyResult())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiClientError | null>(null)
  const cancelled = useRef(false)

  // Business-compliance (businessComplianceScore / businessComplianceEvaluated)
  // is now computed SERVER-side and returned in the dashboard-health response —
  // see src/lib/api/services/scoring/business-compliance.ts. The hook no longer
  // downloads circulars/policies/departments/evaluations to compute it.
  useEffect(() => {
    cancelled.current = false
    const key = JSON.stringify({ p: period })

    let promise = inflight.get(key)
    if (!promise) {
      promise = api.get<DashboardHealthFetchResponse | ComputingResponse>(
        '/compliance/dashboard-health',
        { period },
      )
      inflight.set(key, promise)
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
          setIsLoading(false)
          return
        }
        const d = data as DashboardHealthFetchResponse
        setResult({
          overall: d.overall,
          confidence: d.confidence,
          components: d.components.components,
          frameworkScores: d.components.frameworkScores,
          deductions: d.deductions,
          businessComplianceScore: d.components.businessComplianceScore,
          businessComplianceEvaluated: d.components.businessComplianceEvaluated,
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
  }, [period])

  // businessComplianceScore / businessComplianceEvaluated come from the server
  // (dashboard-health response), already mapped into `result` above.
  return { ...result, isLoading, error }
}
