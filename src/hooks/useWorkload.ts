'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiClientError } from '@/lib/api-client'

export interface WorkloadItem {
  type: 'observation' | 'audit' | 'policy' | 'correspondence' | 'advisory' | 'sama-letter' | 'risk' | 'circular'
  id: string
  title: string
}

/**
 * Fetch the actual open work items assigned to one member (id + title + type)
 * from /api/dashboard/workload/items. The team-workload hooks only return
 * COUNTS (the server `compute_team_workload` aggregate), so this is the source
 * the Burnout Detection card's reassignment drawer uses to list reassignable
 * items. Returns [] on any failure so the drawer degrades to "no items".
 */
export async function fetchMemberWorkloadItems(memberId: string): Promise<WorkloadItem[]> {
  try {
    const res = await api.get<{ items: WorkloadItem[] }>('/dashboard/workload/items', { memberId })
    return res.items ?? []
  } catch {
    return []
  }
}

export interface WorkloadResult {
  totalAssignments: number
  breakdown: {
    observations: number
    audits: number
    policies: number
    correspondence: number
    advisory: number
    samaLetters: number
    risks: number
    circulars: number
  }
  items: WorkloadItem[]
  percentage: number
}

type Breakdown = WorkloadResult['breakdown']

interface WorkloadMember {
  burnoutSince?: string
  assignments?: { title: string; dueDate: string; progress?: number }[]
}

const EMPTY_BREAKDOWN: Breakdown = {
  observations: 0,
  audits: 0,
  policies: 0,
  correspondence: 0,
  advisory: 0,
  samaLetters: 0,
  risks: 0,
  circulars: 0,
}

// Apply the capacity % formula to a member's server-computed assignment counts.
// (Phase B: counts come from /api/dashboard/workload; the rate/discount math
// stays client-side because it needs per-member burnoutSince + manual
// assignments, which live on the team member, not in the DB aggregate.)
function workloadResultFromCounts(breakdown: Breakdown, member?: WorkloadMember): WorkloadResult {
  const b = breakdown
  const entityTotal =
    b.observations + b.audits + b.policies + b.correspondence + b.advisory + b.samaLetters + b.risks + b.circulars
  const manualCount = member?.assignments?.length ?? 0
  const total = entityTotal + manualCount

  let ratePerAssignment = 10
  if (member?.burnoutSince) {
    const daysSinceBurnout = Math.max(
      0,
      Math.floor((Date.now() - new Date(member.burnoutSince).getTime()) / (1000 * 60 * 60 * 24)),
    )
    if (daysSinceBurnout > 7) ratePerAssignment = 30
    else if (daysSinceBurnout >= 3) ratePerAssignment = 20
  }

  const base = total * ratePerAssignment
  const discount = (member?.assignments ?? []).filter((a) => (a.progress ?? 0) >= 75).length * 5
  return { totalAssignments: total, breakdown: b, items: [], percentage: Math.max(0, base - discount) }
}

// Shared, deduped fetch of the server per-member counts map. Mirrors
// useDashboardSummary's in-flight coalescing so the multiple workload hooks on a
// page hit the wire once.
const inflight = new Map<string, Promise<Record<string, Breakdown>>>()

function useDashboardWorkload(): { counts: Record<string, Breakdown> | null; isLoading: boolean } {
  const [counts, setCounts] = useState<Record<string, Breakdown> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    const key = 'all'
    let promise = inflight.get(key)
    if (!promise) {
      promise = api
        .get<{ workloads: Record<string, Breakdown> }>('/dashboard/workload')
        .then((r) => r.workloads ?? {})
      inflight.set(key, promise)
      promise.finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key)
      })
    }
    setIsLoading(true)
    promise.then(
      (data) => {
        if (cancelled.current) return
        setCounts(data)
        setIsLoading(false)
      },
      (err: unknown) => {
        if (cancelled.current) return
        // Degrade to "no data" (callers fall back to the member's stored
        // workload) rather than throwing inside a render-path hook.
        if (!(err instanceof ApiClientError)) {
          // eslint-disable-next-line no-console
          console.warn('[useWorkload] failed to load team workload', err)
        }
        setCounts({})
        setIsLoading(false)
      },
    )
    return () => {
      cancelled.current = true
    }
  }, [])

  return { counts, isLoading }
}

/**
 * True while the shared per-member workload counts are still on their first
 * fetch. Lets widgets (Burnout Detection, workload distribution) render a
 * skeleton instead of a misleading "nothing overloaded" empty state during
 * load. Shares the deduped in-flight request with the other workload hooks.
 */
export function useWorkloadLoading(): boolean {
  return useDashboardWorkload().isLoading
}

/**
 * Single-member workload. Counts come from the server; the % formula is applied
 * with the member's burnout/manual-assignment context. Returns zeros until the
 * server counts resolve. (`memberName` is retained for call-site compatibility;
 * server matching is by user id.)
 */
export function useWorkload(
  memberId: string,
  member?: WorkloadMember,
  _memberName?: string,
): WorkloadResult {
  const { counts } = useDashboardWorkload()
  return useMemo(
    () => workloadResultFromCounts(counts?.[memberId] ?? EMPTY_BREAKDOWN, member),
    [counts, memberId, member],
  )
}

/**
 * Per-member workload map for a team. Returns `{}` until the server counts
 * resolve so callers can fall back to each member's stored `workload` during
 * load (the views already do `workloads[m.id]?.percentage ?? m.workload`).
 */
export function useTeamWorkloads(
  members: Array<{ id: string; name: string; burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }>,
): Record<string, WorkloadResult> {
  const { counts } = useDashboardWorkload()
  return useMemo(() => {
    if (!counts) return {}
    const result: Record<string, WorkloadResult> = {}
    for (const m of members) {
      result[m.id] = workloadResultFromCounts(counts[m.id] ?? EMPTY_BREAKDOWN, m)
    }
    return result
  }, [counts, members])
}

export interface BurnoutMember {
  member: { id: string; name: string; avatar?: string; department: string; burnoutSince?: string }
  capacity: number
  assignmentCount: number
  daysOverloaded: number
  escalationTier: 'mild' | 'moderate' | 'severe'
}

export function useBurnoutDetection(
  members: Array<{ id: string; name: string; avatar?: string; department: string; workload: number; burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] }>,
): BurnoutMember[] {
  const workloads = useTeamWorkloads(members)

  return useMemo(() => {
    const atRisk: BurnoutMember[] = []

    for (const m of members) {
      const wl = workloads[m.id]
      const capacity = Math.round(wl?.percentage ?? 0)

      if (capacity < 75) continue

      let daysOverloaded = 0
      if (m.burnoutSince) {
        const since = new Date(m.burnoutSince)
        daysOverloaded = Math.max(0, Math.floor((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24)))
      }

      let escalationTier: BurnoutMember['escalationTier'] = 'mild'
      if (daysOverloaded > 7) escalationTier = 'severe'
      else if (daysOverloaded > 3) escalationTier = 'moderate'

      atRisk.push({
        member: { id: m.id, name: m.name, avatar: m.avatar, department: m.department, burnoutSince: m.burnoutSince },
        capacity,
        assignmentCount: wl?.totalAssignments || m.assignments?.length || 0,
        daysOverloaded,
        escalationTier,
      })
    }

    return atRisk.sort((a, b) => b.capacity - a.capacity)
  }, [members, workloads])
}
