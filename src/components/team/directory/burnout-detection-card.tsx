'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useTeamStore } from '@/stores/team-store'
import { useBurnoutDetection } from '@/hooks/useWorkload'

function CapacityRing({ capacity }: { capacity: number }) {
  const circumference = 2 * Math.PI * 18
  const offset = circumference - (capacity / 100) * circumference
  const ringColor = capacity >= 90 ? 'text-rose-500' : capacity >= 75 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="relative w-10 h-10">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle className="text-slate-200 stroke-current" strokeWidth="4" fill="transparent" r="18" cx="22" cy="22" />
        <circle className={`${ringColor} stroke-current`} strokeWidth="4" strokeLinecap="round" fill="transparent" r="18" cx="22" cy="22" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold text-slate-900">{capacity}%</span>
      </div>
    </div>
  )
}

export function BurnoutDetectionCard() {
  const { t } = useTranslation()
  const members = useTeamStore((s) => s.members)
  const reassignTask = useTeamStore((s) => s.reassignTask)
  const atRisk = useBurnoutDetection(members)

  const [reassignFrom, setReassignFrom] = useState<string | null>(null)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

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

  const lowWorkloadMembers = members
    .filter(m => m.workload < 50 && m.status === 'active')
    .sort((a, b) => a.workload - b.workload)

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
            const memberAssignments = fullMember?.assignments || []
            const isExpanded = reassignFrom === item.member.id
            return (
              <div key={item.member.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <CapacityRing capacity={item.capacity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{item.member.name}</p>
                    <p className="text-[10px] text-slate-500">{item.member.department}</p>
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
                      setExpandedTask(null)
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 cursor-pointer shrink-0"
                  >
                    {t('team.suggestReassignment' as TranslationKey)}
                  </button>
                </div>

                {isExpanded && memberAssignments.length > 0 && (
                  <div className="mt-3 ms-13 space-y-1">
                    <p className="text-[10px] font-bold text-slate-500 mb-2">
                      {t('team.currentAssignments' as TranslationKey)}:
                    </p>
                    {memberAssignments.map((assignment) => {
                      const taskKey = `${item.member.id}-${assignment.title}`
                      const isTaskExpanded = expandedTask === taskKey
                      return (
                        <div key={assignment.title}>
                          <button
                            onClick={() => setExpandedTask(isTaskExpanded ? null : taskKey)}
                            className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-white transition-colors cursor-pointer text-start"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold text-slate-700 block truncate">{assignment.title}</span>
                              <span className="text-[9px] text-slate-400">{t('team.due' as TranslationKey)}: {assignment.dueDate}</span>
                            </div>
                            <Icon
                              icon={isTaskExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'}
                              className="w-3 h-3 text-slate-400 shrink-0 ms-2"
                            />
                          </button>
                          {isTaskExpanded && lowWorkloadMembers.length > 0 && (
                            <div className="ms-4 mt-1 space-y-1 pb-1">
                              <p className="text-[9px] font-bold text-slate-400 mb-1">{t('team.reassignTo' as TranslationKey)}:</p>
                              {lowWorkloadMembers.slice(0, 3).map((lm) => (
                                <button
                                  key={lm.id}
                                  onClick={() => {
                                    reassignTask(item.member.id, lm.id, assignment.title)
                                    setExpandedTask(null)
                                    setReassignFrom(null)
                                  }}
                                  className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer"
                                >
                                  <span className="text-[10px] font-bold text-slate-700">{lm.name}</span>
                                  <span className="text-[9px] text-slate-400">({lm.workload}%)</span>
                                </button>
                              ))}
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
