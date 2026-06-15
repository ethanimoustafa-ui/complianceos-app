// Server-backed "Pending Approvals" for the Managerial dashboard. Replaces the
// client-side cross-store scan (letters/policies/audits) with one indexed call.

'use client'

import { useEffect, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'
import type { ApprovalItem } from '@/app/api/dashboard/approvals/route'

interface ApprovalsResponse {
  items: ApprovalItem[]
  total: number
}

const inflight = new Map<string, Promise<ApprovalsResponse>>()

export interface UseDashboardApprovalsResult {
  items: ApprovalItem[]
  total: number
  isLoading: boolean
  error: ApiClientError | null
}

export function useDashboardApprovals(): UseDashboardApprovalsResult {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<ApiClientError | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const key = 'approvals'
    let promise = inflight.get(key)
    if (!promise) {
      promise = api.get<ApprovalsResponse>('/dashboard/approvals')
      inflight.set(key, promise)
      promise.finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    }
    setIsLoading(true)
    promise.then(
      (res) => {
        if (cancelled.current) return
        setItems(res.items ?? [])
        setTotal(res.total ?? 0)
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

  return { items, total, isLoading, error }
}
