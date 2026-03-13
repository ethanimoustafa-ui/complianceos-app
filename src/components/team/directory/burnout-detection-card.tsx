'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useTeamStore } from '@/stores/team-store'
import { useBurnoutDetection, useTeamWorkloads } from '@/hooks/useWorkload'
import type { WorkloadItem } from '@/hooks/useWorkload'
import { useObservationStore } from '@/stores/observation-store'
import { useAuditStore } from '@/stores/audit-store'
import { usePolicyStore } from '@/stores/policy-store'
import { useCorrespondenceStore } from '@/stores/correspondence-store'
import { useAdvisoryStore } from '@/stores/advisory-store'
import { useSAMALetterStore } from '@/stores/sama-letter-store'
import { useRiskStore } from '@/stores/risk-store'
import { useCircularStore } from '@/stores/circular-store'
import { useDepartmentStore } from '@/stores/department-store'

const BADGE_COLORS: Record<string, string> = {
  observation: 'bg-rose-100 text-rose-700',
  audit: 'bg-emerald-100 text-emerald-700',
  policy: 'bg-blue-100 text-blue-700',
  'sama-letter': 'bg-amber-100 text-amber-700',
  circular: 'bg-violet-100 text-violet-700',
  correspondence: 'bg-slate-200 text-slate-700',
  advisory: 'bg-indigo-100 text-indigo-700',
  risk: 'bg-orange-100 text-orange-700',
  task: 'bg-slate-200 text-slate-600',
}

function CapacityRing({ capacity }: { capacity: number }) {
  const circumference = 2 * Math.PI * 18
  const isOverloaded = capacity > 100
  const displayFill = isOverloaded ? 1 : capacity / 100
  const offset = circumference - displayFill * circumference
  const overflowFill = isOverloaded ? Math.min((capacity - 100) / 100, 1) : 0
  const overflowOffset = circumference - overflowFill * circumference
  const ringColor = isOverloaded ? 'text-purple-800' : capacity >= 90 ? 'text-rose-500' : capacity >= 75 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="relative w-10 h-10">
      <svg className={`w-full h-full -rotate-90 ${isOverloaded ? 'animate-[spin_6s_linear_infinite]' : ''}`} viewBox="0 0 44 44">
        <circle className="text-slate-200 stroke-current" strokeWidth="4" fill="transparent" r="18" cx="22" cy="22" />
        {isOverloaded && (
          <circle className="text-rose-400 stroke-current" strokeWidth="4" fill="transparent" r="18" cx="22" cy="22" />
        )}
        <circle className={`${ringColor} stroke-current`} strokeWidth="4" strokeLinecap="round" fill="transparent" r="18" cx="22" cy="22" strokeDasharray={circumference} strokeDashoffset={isOverloaded ? overflowOffset : offset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[9px] font-bold ${isOverloaded ? 'text-purple-800' : 'text-slate-900'}`}>{capacity}%</span>
      </div>
    </div>
  )
}

function reassignItem(item: WorkloadItem, fromMemberName: string, toMember: { id: string; name: string; department: string; email: string; role: 'officer' | 'manager' | 'admin'; workload: number }) {
  switch (item.type) {
    case 'observation': {
      const store = useObservationStore.getState()
      const obs = store.observations.find(o => o.id === item.id)
      const oldAssignees = obs?.assignees || []
      const newAssignee = { id: toMember.id, name: toMember.name, avatar: toMember.name, role: toMember.role }
      const newAssignees = oldAssignees.filter(a => a.name !== fromMemberName).concat([newAssignee])
      const updateData: Record<string, unknown> = {
        assignee: newAssignee,
        assignees: newAssignees,
      }
      if (obs?.leaderId === oldAssignees.find(a => a.name === fromMemberName)?.id) {
        updateData.leaderId = toMember.id
      }
      store.update(item.id, updateData as Partial<import('@/types').Observation>)
      break
    }
    case 'audit': {
      const store = useAuditStore.getState()
      store.update(item.id, {
        assignee: { id: toMember.id, name: toMember.name, email: toMember.email, role: toMember.role, avatar: toMember.name, department: toMember.department, workload: toMember.workload },
      })
      break
    }
    case 'policy': {
      const store = usePolicyStore.getState()
      store.update(item.id, {
        owner: { name: toMember.name, avatar: toMember.name, department: toMember.department },
      })
      break
    }
    case 'correspondence': {
      const store = useCorrespondenceStore.getState()
      store.update(item.id, { assignee: toMember.name })
      break
    }
    case 'advisory': {
      const store = useAdvisoryStore.getState()
      store.reassign(item.id, toMember.name)
      break
    }
    case 'sama-letter': {
      const store = useSAMALetterStore.getState()
      store.update(item.id, { assignedTo: toMember.name })
      break
    }
    case 'risk': {
      const store = useRiskStore.getState()
      store.update(item.id, {
        owner: { id: toMember.id, name: toMember.name, email: toMember.email, role: toMember.role, avatar: toMember.name, department: toMember.department, workload: toMember.workload },
      })
      break
    }
    case 'circular': {
      const store = useCircularStore.getState()
      store.update(item.id, { assignedTo: toMember.name })
      break
    }
  }
}

export function BurnoutDetectionCard() {
  const { t, isRTL } = useTranslation()
  const members = useTeamStore((s) => s.members)
  const reassignTask = useTeamStore((s) => s.reassignTask)
  const departments = useDepartmentStore((s) => s.departments)
  const atRisk = useBurnoutDetection(members)
  const workloads = useTeamWorkloads(members)

  const deptLabel = (name: string) => {
    if (!isRTL) return name
    return departments.find(d => d.name === name)?.nameAr || name
  }

  const [reassignFrom, setReassignFrom] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const tierColors = {
    mild: 'text-amber-600 bg-amber-50',
    moderate: 'text-orange-600 bg-orange-50',
    severe: 'text-rose-600 bg-rose-50',
  }

  const tierLabels = {
    mild: '< 3d',
    moderate: '3-7d',
    severe: '> 7d',
  }

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Icon icon="lucide:heart-pulse" className="text-slate-400" />
        {t('team.burnoutDetection' as TranslationKey)}
        {atRisk.length > 0 && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {atRisk.length}
          </span>
        )}
      </h3>

      {atRisk.length === 0 ? (
        <div className="text-center py-8">
          <Icon icon="lucide:smile" className="text-3xl text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">{t('team.noOverloadedMembers' as TranslationKey)}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {atRisk.map((item) => {
            const fullMember = members.find(m => m.id === item.member.id)
            const wl = workloads[item.member.id]
            const allItems = wl?.items || []
            const manualTasks = fullMember?.assignments || []
            const isExpanded = reassignFrom === item.member.id
            const activeMembers = members.filter(m => m.status === 'active' && m.id !== item.member.id)

            return (
              <div key={item.member.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <CapacityRing capacity={item.capacity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{item.member.name}</p>
                    <p className="text-[10px] text-slate-500">{deptLabel(item.member.department)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-500">
                        {item.assignmentCount} {t('team.tasksPending' as TranslationKey)}
                      </span>
                      {item.daysOverloaded > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tierColors[item.escalationTier]}`}>
                          {tierLabels[item.escalationTier]}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReassignFrom(isExpanded ? null : item.member.id)
                      setExpandedItem(null)
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 cursor-pointer shrink-0"
                  >
                    {t('team.suggestReassignment' as TranslationKey)}
                  </button>
                </div>

                {isExpanded && (allItems.length > 0 || manualTasks.length > 0) && (
                  <div className="mt-3 ms-13 space-y-1">
                    <p className="text-[10px] font-bold text-slate-500 mb-2">
                      {t('team.currentAssignments' as TranslationKey)}:
                    </p>
                    {/* All workload items from stores */}
                    {allItems.map((wi, idx) => {
                      const itemKey = `${item.member.id}-${wi.type}-${wi.id}-${idx}`
                      const isItemExpanded = expandedItem === itemKey
                      return (
                        <div key={itemKey}>
                          <button
                            onClick={() => setExpandedItem(isItemExpanded ? null : itemKey)}
                            className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-white transition-colors cursor-pointer text-start"
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${BADGE_COLORS[wi.type] || 'bg-slate-100 text-slate-600'}`}>
                                {wi.type}
                              </span>
                              <span className="text-[10px] font-bold text-slate-700 truncate">{wi.title}</span>
                            </div>
                            <Icon
                              icon={isItemExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                              className="w-3 h-3 text-slate-400 shrink-0 ms-2"
                            />
                          </button>
                          {isItemExpanded && (
                            <div className="ms-4 mt-1 space-y-1 pb-1">
                              <p className="text-[9px] font-bold text-slate-400 mb-1">{t('team.reassignTo' as TranslationKey)}:</p>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {activeMembers.map((am) => {
                                  const amWl = workloads[am.id]
                                  return (
                                    <button
                                      key={am.id}
                                      onClick={() => {
                                        reassignItem(wi, item.member.name, { id: am.id, name: am.name, department: am.department, email: am.email, role: am.role, workload: am.workload })
                                        setExpandedItem(null)
                                        setReassignFrom(null)
                                      }}
                                      className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                                    >
                                      <span className="text-[10px] font-bold text-slate-700">{am.name}</span>
                                      <span className="text-[9px] text-slate-400">({amWl?.percentage ?? am.workload}%)</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {/* Manual task assignments */}
                    {manualTasks.map((assignment) => {
                      const taskKey = `${item.member.id}-task-${assignment.title}`
                      const isTaskExpanded = expandedItem === taskKey
                      return (
                        <div key={taskKey}>
                          <button
                            onClick={() => setExpandedItem(isTaskExpanded ? null : taskKey)}
                            className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-white transition-colors cursor-pointer text-start"
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${BADGE_COLORS.task}`}>
                                task
                              </span>
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold text-slate-700 block truncate">{assignment.title}</span>
                                <span className="text-[9px] text-slate-400">{t('team.due' as TranslationKey)}: {assignment.dueDate}</span>
                              </div>
                            </div>
                            <Icon
                              icon={isTaskExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                              className="w-3 h-3 text-slate-400 shrink-0 ms-2"
                            />
                          </button>
                          {isTaskExpanded && (
                            <div className="ms-4 mt-1 space-y-1 pb-1">
                              <p className="text-[9px] font-bold text-slate-400 mb-1">{t('team.reassignTo' as TranslationKey)}:</p>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {activeMembers.map((am) => {
                                  const amWl = workloads[am.id]
                                  return (
                                    <button
                                      key={am.id}
                                      onClick={() => {
                                        reassignTask(item.member.id, am.id, assignment.title)
                                        setExpandedItem(null)
                                        setReassignFrom(null)
                                      }}
                                      className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                                    >
                                      <span className="text-[10px] font-bold text-slate-700">{am.name}</span>
                                      <span className="text-[9px] text-slate-400">({amWl?.percentage ?? am.workload}%)</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
