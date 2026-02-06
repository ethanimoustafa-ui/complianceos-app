import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { calculateComplianceScore, getPeriodConfig } from '@/lib/compliance-engine'
import type { PeriodFilter, ComplianceScoreResult } from '@/lib/compliance-engine.types'

export function useComplianceScore(periodFilter: PeriodFilter): ComplianceScoreResult {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const weights = useComplianceSettingsStore((s) => s.weights)
  const targetScore = useComplianceSettingsStore((s) => s.targetScore)

  return useMemo(
    () =>
      calculateComplianceScore({
        audits,
        observations,
        risks: [],
        policies: [],
        trainings: [],
        config: { weights, targetScore },
        period: getPeriodConfig(periodFilter),
      }),
    [audits, observations, weights, targetScore, periodFilter]
  )
}
