'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { usePolicyStore } from '@/stores/policy-store'
import { useLetterStore } from '@/stores/letter-store'

function StatCard({
  icon,
  iconColor,
  value,
  label,
  badge,
  badgeColor,
  loading = false,
}: {
  icon: string
  iconColor: 'emerald' | 'blue' | 'orange' | 'purple' | 'rose'
  value: string
  label: string
  badge: string
  badgeColor: 'emerald' | 'blue' | 'orange' | 'purple' | 'rose'
  loading?: boolean
}) {
  const iconColorClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    rose: 'bg-rose-50 text-rose-600',
  }

  const badgeColorClasses: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50',
    rose: 'text-rose-600 bg-rose-50',
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}>
          <Icon icon={icon} className="text-xl" />
        </div>
        {loading ? (
          <Skeleton className="h-6 w-16 rounded-md" />
        ) : (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${badgeColorClasses[badgeColor]}`}>
            {badge}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-12 mb-1" />
      ) : (
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      )}
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </Card>
  )
}

interface DirectoryStatCardsProps {
  totalMembers: number
  adminCount: number
  assignedTasks: number
  // W44: live average team capacity (was a hardcoded "82%").
  capacityPct: number
}

export function DirectoryStatCards({ totalMembers, adminCount, assignedTasks, capacityPct }: DirectoryStatCardsProps) {
  const { t } = useTranslation()

  // Defensive hydration: the "Pending Approvals" card derives from the policy
  // and letter stores, which the team page does not fetch. Trigger both here
  // (fetches are deduped/safe) so the card doesn't depend on a sibling, and
  // track first-fetch for the skeleton gate.
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const policiesFetched = usePolicyStore((s) => s.lastFetched)
  const lettersFetched = useLetterStore((s) => s.lastFetched)
  useEffect(() => {
    void fetchPolicies()
    void fetchLetters()
  }, [fetchPolicies, fetchLetters])
  const pendingLoading = policiesFetched === null || lettersFetched === null

  const now = Date.now()
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  // Only notify-manager steps count as managerial approval
  const pendingPolicyList = usePolicyStore((s) => s.policies).filter((p) =>
    (p.status === 'under-review' || p.status === 'requires-review') &&
    p.workflowTimeline?.some(s => s.status === 'current' && s.actionType === 'notify-manager' && s.stepState === 'awaiting-manager')
  )
  // Only Department Head (step 2) counts as managerial approval
  const pendingLetterList = useLetterStore((s) => s.letters).filter((l) =>
    l.status === 'pending-approval' &&
    l.approvalChain?.some(s => s.role === 'Department Head' && s.status === 'pending')
  )
  const totalPending = pendingPolicyList.length + pendingLetterList.length
  const urgentCount =
    pendingPolicyList.filter(p =>
      p.status === 'requires-review' ||
      (p.nextReviewDate && (new Date(p.nextReviewDate).getTime() - now) < thirtyDaysMs)
    ).length +
    pendingLetterList.filter(l =>
      l.priority === 'urgent' ||
      (l.responseDeadline && (new Date(l.responseDeadline).getTime() - now) < thirtyDaysMs)
    ).length

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <StatCard
        icon="lucide:users-2"
        iconColor="emerald"
        value={String(totalMembers)}
        label={t('team.totalMembers')}
        badge={`+2 ${t('team.thisMonth')}`}
        badgeColor="emerald"
      />
      <StatCard
        icon="lucide:shield"
        iconColor="blue"
        value={String(adminCount)}
        label={t('team.adminAccounts')}
        badge={t('team.stable')}
        badgeColor="blue"
      />
      <StatCard
        icon="lucide:activity"
        iconColor="orange"
        value={String(assignedTasks)}
        label={t('team.assignedTasks')}
        badge={`${capacityPct}% ${t('team.capacity')}`}
        badgeColor="orange"
      />
      <StatCard
        icon="lucide:clock"
        iconColor={totalPending > 0 ? 'rose' : 'emerald'}
        value={String(totalPending)}
        label={t('team.pendingApprovals' as TranslationKey)}
        badge={urgentCount > 0 ? `${urgentCount} ${t('team.urgent' as TranslationKey)}` : t('team.allClear' as TranslationKey)}
        badgeColor={urgentCount > 0 ? 'rose' : 'emerald'}
        loading={pendingLoading}
      />
    </div>
  )
}
