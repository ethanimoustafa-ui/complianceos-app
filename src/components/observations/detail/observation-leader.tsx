'use client'

import { memo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface Leader {
  id: string
  name: string
  avatar?: string
}

export interface ObservationLeaderProps {
  leader: Leader | null
  canTransfer: boolean
  onTransfer: () => void
  isRTL: boolean
}

export const ObservationLeader = memo(function ObservationLeader({
  leader,
  canTransfer,
  onTransfer,
  isRTL,
}: ObservationLeaderProps) {
  const { t } = useTranslation()

  return (
    <div>
      <div className={`flex items-center justify-between mb-4`}>
        <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest`}>
          {t('observations.detail.observationLeader')}
        </h4>
        {canTransfer ? (
          <button
            onClick={onTransfer}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            title={t('observations.detail.transferLeadership')}
          >
            <Icon icon="lucide:arrow-right-left" className="text-sm" />
          </button>
        ) : null}
      </div>
      {leader ? (
        <div className={`flex items-center gap-3`}>
          <div className="relative">
            <img
              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${leader.avatar || leader.name}`}
              className="w-10 h-10 rounded-full ring-2 ring-emerald-500 ring-offset-2"
              alt={leader.name}
            />
          </div>
          <div className={`text-[10px] ${isRTL ? 'text-right' : ''}`}>
            <p className="font-bold text-slate-900">{leader.name}</p>
            <p className="text-emerald-600 uppercase font-black">{t('observations.detail.leader')}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">{t('observations.detail.noLeader')}</p>
      )}
    </div>
  )
})
