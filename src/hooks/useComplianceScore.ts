import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { calculateComplianceScore, getPeriodConfig } from '@/lib/compliance-engine'
import type { PeriodFilter, ComplianceScoreResult } from '@/lib/compliance-engine.types'

export function useComplianceScore(periodFilter: PeriodFilter): ComplianceScoreResult {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const risks = useRiskStore((s) => s.risks)
  const policies = usePolicyStore((s) => s.policies)
  const trainings = useTrainingStore((s) => s.trainings)
  const weights = useComplianceSettingsStore((s) => s.weights)
  const targetScore = useComplianceSettingsStore((s) => s.targetScore)

  return useMemo(
    () =>
      calculateComplianceScore({
        audits,
        observations,
        risks,
        policies,
        trainings,
        config: { weights, targetScore },
        period: getPeriodConfig(periodFilter),
      }),
    [audits, observations, risks, policies, trainings, weights, targetScore, periodFilter]
  )
}
