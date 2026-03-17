import { useMemo } from 'react'
import { useAuditStore } from '@/stores/audit-store'
import { useObservationStore } from '@/stores/observation-store'
import { useRiskStore } from '@/stores/risk-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useTrainingStore } from '@/stores/training-store'
import { useCircularStore } from '@/stores/circular-store'
import { useAuditTaskStore } from '@/stores/audit-task-store'
import { useCalendarStore } from '@/stores/calendar-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { calculateComplianceScore, getPeriodConfig } from '@/lib/compliance-engine'
import type { PeriodFilter, ComplianceScoreResult, TaskSlice, CircularSlice } from '@/lib/compliance-engine.types'

export function useComplianceScore(periodFilter: PeriodFilter): ComplianceScoreResult {
  const audits = useAuditStore((s) => s.audits)
  const observations = useObservationStore((s) => s.observations)
  const risks = useRiskStore((s) => s.risks)
  const policies = usePolicyStore((s) => s.policies)
  const trainings = useTrainingStore((s) => s.trainings)
  const circularsRaw = useCircularStore((s) => s.circulars)
  const auditTasks = useAuditTaskStore((s) => s.tasks)
  const calendarEvents = useCalendarStore((s) => s.events)
  const weights = useComplianceSettingsStore((s) => s.weights)
  const targetScore = useComplianceSettingsStore((s) => s.targetScore)
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)

  return useMemo(() => {
    // Map circulars to CircularSlice
    const circulars: CircularSlice[] = circularsRaw.map((c) => ({
      id: c.id,
      priority: c.priority,
      status: c.status,
      progress: c.progress,
      frameworkIds: c.frameworkIds,
      createdAt: c.createdAt,
    }))

    // Merge audit tasks + calendar events into TaskSlice[]
    const tasks: TaskSlice[] = [
      ...auditTasks.map((t) => ({
        id: t.id,
        completed: t.completed,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        severity: (t as any).severity as TaskSlice['severity'],
        frameworkIds: (t as any).frameworkIds as string[] | undefined,
        createdAt: t.createdAt,
      })),
      ...calendarEvents
        .filter((e) => e.type === 'deadline' || e.type === 'submission')
        .map((e) => ({
          id: e.id,
          completed: e.completed ?? false,
          dueDate: e.date,
          completedAt: e.completedAt,
          severity: e.severity,
          frameworkIds: e.frameworkIds as string[] | undefined,
          createdAt: e.createdAt,
        })),
    ]

    // Map framework configs for the engine
    const frameworkConfigs = frameworks.map((f) => ({
      id: f.id,
      weights: f.weights,
      enabled: f.enabled,
    }))

    return calculateComplianceScore({
      audits,
      observations,
      risks,
      policies,
      trainings,
      circulars,
      tasks,
      frameworkConfigs,
      config: { weights, targetScore },
      period: getPeriodConfig(periodFilter),
    })
  }, [audits, observations, risks, policies, trainings, circularsRaw, auditTasks, calendarEvents, weights, targetScore, periodFilter, frameworks])
}
