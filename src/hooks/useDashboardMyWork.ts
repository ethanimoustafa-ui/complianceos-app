// Server-backed personal task lists for the Officer dashboard. Replaces
// OfficerView's client-side filtering of the observations/audits/policies/
// letters stores with one JWT-scoped call.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'
import type { MyWorkResponse } from '@/app/api/dashboard/my-work/route'

const EMPTY: MyWorkResponse = { observations: [], audits: [], policies: [], actionItems: [] }
const inflight = new Map<string, Promise<MyWorkResponse>>()

export function useDashboardMyWork(): { data: MyWorkResponse; isLoading: boolean; error: ApiClientError | null } {
  const [data, setData] = useState<MyWorkResponse>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiClientError | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const key = 'my-work'
    let promise = inflight.get(key)
    if (!promise) {
      promise = api.get<MyWorkResponse>('/dashboard/my-work')
      inflight.set(key, promise)
      promise.finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    }
    setIsLoading(true)
    promise.then(
      (res) => {
        if (cancelled.current) return
        setData(res)
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

  return { data, isLoading, error }
}
