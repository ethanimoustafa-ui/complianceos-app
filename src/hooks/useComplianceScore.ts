import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useCircularStore } from '@/stores/circular-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { calculateComplianceScore, getPeriodConfig } from '@/lib/compliance-engine'
import type { PeriodFilter, ComplianceScoreResult, CircularSlice } from '@/lib/compliance-engine.types'

export function useComplianceScore(periodFilter: PeriodFilter): ComplianceScoreResult {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const risks = useRiskStore((s) => s.risks)
  const policies = usePolicyStore((s) => s.policies)
  const trainings = useTrainingStore((s) => s.trainings)
  const circularsRaw = useCircularStore((s) => s.circulars)
  const weights = useComplianceSettingsStore((s) => s.weights)
  const targetScore = useComplianceSettingsStore((s) => s.targetScore)
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)

  return useMemo(() => {
    const circulars: CircularSlice[] = circularsRaw.map((c) => ({
      id: c.id,
      priority: c.priority,
      status: c.status,
      progress: c.progress,
      frameworkIds: c.frameworkIds,
      createdAt: c.createdAt,
    }))

    // Only correspondence-based frameworks participate in per-framework scoring.
    const frameworkConfigs = frameworks.map((f) => ({
      id: f.id,
      weights: f.weights,
      enabled: f.enabled,
      correspondenceBased: f.correspondenceBased,
    }))

    return calculateComplianceScore({
      audits,
      observations,
      risks,
      policies,
      trainings,
      circulars,
      frameworkConfigs,
      config: { weights, targetScore },
      period: getPeriodConfig(periodFilter),
    })
  }, [audits, observations, risks, policies, trainings, circularsRaw, weights, targetScore, periodFilter, frameworks])
}
