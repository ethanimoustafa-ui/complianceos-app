// Server-side business-compliance score for the dashboard health hero.
//
// Phase A (scalability): the "business compliance" number on the Compliance
// Health hero was previously computed in the BROWSER (useDashboardHealth) by
// downloading the full circulars + policies + departments + compliance_evaluations
// tables and running calculateComplianceReviewScore client-side. That's why the
// Executive dashboard still fetched those lists. This computes the SAME pure
// function server-side (reusing the lib so the hero and the Compliance Review
// page can never drift) over DB rows, so the client needs zero downloads for it.
//
// It is invoked on the dashboard-health cache-miss path, so the result is cached
// with the rest of the hero snapshot (≤1h freshness — consistent with every
// other number on the hero; the live, no-store source remains the Compliance
// Review page).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Circular, Department, Policy } from '@/types'
import type { ComplianceEvaluation } from '@/stores/compliance-evaluation-store'
import { calculateComplianceReviewScore } from '@/lib/compliance-review-score'

export interface BusinessComplianceResult {
  businessComplianceScore: number
  businessComplianceEvaluated: number
}

export async function computeBusinessCompliance(
  supabase: SupabaseClient,
): Promise<BusinessComplianceResult> {
  const [deptRes, circRes, circStepRes, polRes, polStepRes, evalRes] = await Promise.all([
    supabase.from('departments').select('id, name_en'),
    supabase.from('circulars').select('id, business_owner_department').is('deleted_at', null),
    supabase.from('circular_workflow_steps').select('circular_id, status'),
    // Mirror the client store's archive filter (policy list = active only).
    supabase.from('policies').select('id, business_owner_department_id').is('deleted_at', null).is('archived_at', null),
    supabase.from('policy_workflow_steps').select('policy_id, status'),
    supabase.from('compliance_evaluations').select('kind, item_id, department_id, verdict'),
  ])

  // Group workflow steps by their parent id.
  const circSteps = new Map<string, Array<{ status: string }>>()
  for (const s of (circStepRes.data ?? []) as Array<{ circular_id: string; status: string }>) {
    const arr = circSteps.get(s.circular_id) ?? []
    arr.push({ status: s.status })
    circSteps.set(s.circular_id, arr)
  }
  const polSteps = new Map<string, Array<{ status: string }>>()
  for (const s of (polStepRes.data ?? []) as Array<{ policy_id: string; status: string }>) {
    const arr = polSteps.get(s.policy_id) ?? []
    arr.push({ status: s.status })
    polSteps.set(s.policy_id, arr)
  }

  // Map DB rows into the shapes calculateComplianceReviewScore reads. The client
  // sets Department.name = row.name_en (department-store.ts), and the score joins
  // circulars by businessOwnerDepartment === dept.name, so name_en -> name is exact.
  const departments = ((deptRes.data ?? []) as Array<{ id: string; name_en: string }>).map((d) => ({
    id: d.id,
    name: d.name_en,
  })) as unknown as Department[]

  const circulars = ((circRes.data ?? []) as Array<{ id: string; business_owner_department: string | null }>).map((c) => ({
    id: c.id,
    businessOwnerDepartment: c.business_owner_department,
    workflowSteps: circSteps.get(c.id) ?? [],
  })) as unknown as Circular[]

  const policies = ((polRes.data ?? []) as Array<{ id: string; business_owner_department_id: string | null }>).map((p) => ({
    id: p.id,
    // compliance_evaluations.item_id references policies.id (uuid); the score
    // keys policy items by `p.uuid ?? p.id`, so uuid := id.
    uuid: p.id,
    businessOwnerDepartmentId: p.business_owner_department_id,
    workflowTimeline: polSteps.get(p.id) ?? [],
  })) as unknown as Policy[]

  const evaluations: Record<string, ComplianceEvaluation> = {}
  for (const e of (evalRes.data ?? []) as Array<{ kind: string; item_id: string; department_id: string; verdict: string }>) {
    evaluations[`${e.kind}:${e.item_id}::${e.department_id}`] = { verdict: e.verdict } as unknown as ComplianceEvaluation
  }

  const result = calculateComplianceReviewScore({ circulars, policies, departments, evaluations })
  return {
    businessComplianceScore: result.overallByRecords,
    businessComplianceEvaluated: result.totalEvaluatedItems,
  }
}
