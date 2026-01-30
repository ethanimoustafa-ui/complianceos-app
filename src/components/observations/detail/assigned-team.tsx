'use client'

import { memo } from 'react'
import { useTranslation } from '@/i18n'

interface TeamMember {
  name: string
  avatar?: string
  role?: string
}

export interface AssignedTeamProps {
  assignees: TeamMember[]
  isRTL: boolean
}

export const AssignedTeam = memo(function AssignedTeam({
  assignees,
  isRTL,
}: AssignedTeamProps) {
  const { t } = useTranslation()

  if (assignees.length === 0) return null

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.assignedTeam')}
      </h4>
      <div className="space-y-3">
        {assignees.map((member, index) => (
          <div key={`assignee-${index}-${member.name}`} className={`flex items-center gap-3`}>
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar || member.name}`}
              className="w-8 h-8 rounded-full"
              alt={member.name}
            />
            <div className={`text-[10px] ${isRTL ? 'text-right' : ''}`}>
              <p className="font-bold text-slate-900">{member.name}</p>
              {member.role ? (
                <p className="text-slate-500 uppercase font-black">{member.role}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
