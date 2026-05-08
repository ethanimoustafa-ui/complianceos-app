'use client'

import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useCircularStore } from '@/stores/circular-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useComplianceEvaluationStore } from '@/stores/compliance-evaluation-store'
import { useDepartmentStore } from '@/stores/department-store'
import { calculateDashboardHealth } from '@/lib/dashboard-health'
import { calculateComplianceReviewScore } from '@/lib/compliance-review-score'
import type { DashboardHealthResult } from '@/lib/dashboard-health.types'
import type { FrameworkConfig } from '@/types'

export function useDashboardHealth(): DashboardHealthResult {
  const audits = useAuditStore(s => s.audits)
  const observations = useObservationStore(s => s.observations)
  const risks = useRiskStore(s => s.risks)
  const policies = usePolicyStore(s => s.policies)
  const trainings = useTrainingStore(s => s.trainings)
  const letters = useSAMALetterStore(s => s.letters)
  const circulars = useCircularStore(s => s.circulars)
  const frameworks = useFrameworkConfigStore(s => s.frameworks)
  const pinnedIds = useFrameworkConfigStore(s => s.pinnedIds)
  const targetScore = useComplianceSettingsStore(s => s.targetScore)
  const globalWeights = useComplianceSettingsStore(s => s.weights)
  const departments = useDepartmentStore(s => s.departments)
  const evaluations = useComplianceEvaluationStore(s => s.evaluations)

  // Only correspondence-based pinned frameworks get dashboard gauges —
  // self-assessment frameworks don't produce scoring signal.
  const pinnedFrameworks = useMemo(() => {
    return pinnedIds
      .map(id => frameworks.find(f => f.id === id))
      .filter((f): f is FrameworkConfig => !!f && f.correspondenceBased)
      .map(f => ({ id: f.id, name: f.name, weights: f.weights }))
  }, [pinnedIds, frameworks])

  // Primary weights = first pinned framework's 4 correspondence weights,
  // merged with department-wide globals for policies/risk/training. Fallback
  // when no framework is pinned keeps every surface live at a balanced split.
  const primaryWeights = useMemo(() => {
    const fw = pinnedFrameworks.length > 0
      ? pinnedFrameworks[0].weights
      : { audits: 30, observations: 25, letters: 20, circulars: 25 }
    return {
      ...fw,
      policies: globalWeights.policyCurrency,
      riskPosture: globalWeights.riskPosture,
      training: globalWeights.trainingCompletion,
    }
  }, [pinnedFrameworks, globalWeights])

  // Business-compliance score sourced from the Compliance Review tab.
  // Lives on `result.businessComplianceScore`; the dashboard surfaces it as
  // "Compliance Health". The 7-component `overall` continues to feed the
  // (renamed) Team Score path.
  //
  // Use `overallByRecords` as the canonical aggregate so this number is
  // identical to the Compliance Review page's "Overall Business Compliance"
  // KPI (§1.B). `evaluatedItems` lets callers render the §1.A "—" pending
  // state when company-wide nothing has been evaluated yet.
  const reviewScore = useMemo(
    () => calculateComplianceReviewScore({ circulars, policies, departments, evaluations }),
    [circulars, policies, departments, evaluations],
  )
  const businessComplianceScore = reviewScore.overallByRecords
  const businessComplianceEvaluated = reviewScore.totalEvaluatedItems

  return useMemo(
    () => {
      const base = calculateDashboardHealth({
        audits,
        observations,
        risks,
        policies,
        trainings,
        letters,
        circulars,
        frameworkWeights: primaryWeights,
        pinnedFrameworks,
        targetScore,
      })
      return { ...base, businessComplianceScore, businessComplianceEvaluated }
    },
    [audits, observations, risks, policies, trainings, letters, circulars, primaryWeights, pinnedFrameworks, targetScore, businessComplianceScore, businessComplianceEvaluated]
  )
}
