'use client'

import { Icon } from '@iconify/react'
import { differenceInCalendarDays } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Circular, Policy, CircularPriority, CircularStatus, PolicyStatus, PolicyCategory, CAPStatus, PolicyApprovalTier } from '@/types'
import type { TranslationKey } from '@/i18n'

interface RegDocCardProps {
  variant: 'circular' | 'policy'
  circular?: Circular
  policy?: Policy
  onClick: () => void
  isNew?: boolean
  t: (key: TranslationKey, params?: Record<string, string>) => string
  isRTL: boolean
}

// ── Circular helpers ──────────────────────────────────────────────────────────

const AUTHORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SAMA:  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  CMA:   { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200'    },
  IA:    { bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200'  },
  ZATCA: { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200'   },
  MISA:  { bg: 'bg-sky-50',      text: 'text-sky-700',      border: 'border-sky-200'     },
  SAFIU: { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200'    },
}

const PRIORITY_COLORS: Record<CircularPriority, { bg: string; text: string }> = {
  critical: { bg: 'bg-rose-100',   text: 'text-rose-700'   },
  high:     { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  medium:   { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  low:      { bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

const CIRCULAR_STATUS_COLORS: Record<CircularStatus, { bg: string; text: string }> = {
  'pending':     { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  'in-progress': { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  'completed':   { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'overdue':     { bg: 'bg-rose-100',    text: 'text-rose-700'    },
}

const CAP_COLORS: Record<CAPStatus, { bg: string; text: string }> = {
  'not-started': { bg: 'bg-slate-100',   text: 'text-slate-500'   },
  'drafting':    { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  'submitted':   { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  'approved':    { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  'in-progress': { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  'completed':   { bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

function getDaysLeft(dueDate: string): number {
  const due = new Date(dueDate)
  const now = new Date()
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function normalizeUrl(url: string): string {
  if (!url) return url
  if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`
  return url
}

// ── Policy helpers ────────────────────────────────────────────────────────────

const POLICY_STATUS_COLORS: Record<PolicyStatus, { bg: string; text: string }> = {
  draft:              { bg: 'bg-slate-100',   text: 'text-slate-600'   },
  'under-review':     { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  approved:           { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  expired:            { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  overdue:            { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  'requires-review':  { bg: 'bg-orange-100',  text: 'text-orange-700'  },
}

const CATEGORY_ICONS: Record<PolicyCategory, string> = {
  compliance:  'lucide:shield',
  it:          'lucide:server',
  operations:  'lucide:settings',
  risk:        'lucide:alert-triangle',
  hr:          'lucide:users',
  finance:     'lucide:dollar-sign',
}

const TIER_COLORS: Record<PolicyApprovalTier, { bg: string; text: string }> = {
  board:      { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  management: { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  sharia:     { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  agm:        { bg: 'bg-amber-100',   text: 'text-amber-700'   },
}

function getReviewUrgency(nextReviewDate: string, status: PolicyStatus): 'expired' | 'warning' | 'normal' {
  if (status === 'expired') return 'expired'
  if (!nextReviewDate) return 'normal'
  const daysLeft = getDaysLeft(nextReviewDate)
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 90) return 'warning'
  return 'normal'
}

// ── Main component ────────────────────────────────────────────────────────────

export function RegDocCard({ variant, circular, policy, onClick, isNew, t, isRTL }: RegDocCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white/80 backdrop-blur border border-slate-100 p-6 rounded-2xl flex items-center justify-between cursor-pointer group hover:border-emerald-500 hover:bg-white transition-all',
        isNew && 'ring-2 ring-emerald-400 ring-offset-1 shadow-emerald-100'
      )}
    >
      {variant === 'circular' && circular && (
        <CircularCardContent circular={circular} t={t} isRTL={isRTL} />
      )}
      {variant === 'policy' && policy && (
        <PolicyCardContent policy={policy} t={t} isRTL={isRTL} />
      )}
      <Icon
        icon={"lucide:chevron-right"}
        className={cn('text-slate-300 group-hover:text-emerald-500 transition-colors text-xl shrink-0 ms-4', isRTL ? 'rotate-180' : '')}
      />
    </div>
  )
}

function CircularCardContent({ circular, t, isRTL }: { circular: Circular; t: RegDocCardProps['t']; isRTL: boolean }) {
  const authorityStyle = AUTHORITY_COLORS[circular.authority] ?? AUTHORITY_COLORS.SAMA
  const priorityStyle = PRIORITY_COLORS[circular.priority]
  const statusStyle = CIRCULAR_STATUS_COLORS[circular.status]
  const capStyle = CAP_COLORS[circular.capStatus]
  const daysLeft = getDaysLeft(circular.dueDate)
  const isCompleted = circular.status === 'completed'
  const isOverdue = circular.status === 'overdue'
  const currentStep = circular.workflowSteps?.find((s) => s.status === 'current')
  const currentPhase = currentStep?.phase ?? 0

  return (
    <div className={cn('flex items-center gap-6 flex-1', )}>
      {/* Authority badge */}
      <div className={cn('flex flex-col items-center justify-center px-4 py-3 rounded-xl border shrink-0', authorityStyle.bg, authorityStyle.border)}>
        <span className={cn('text-xs font-black', authorityStyle.text)}>{circular.authority}</span>
      </div>

      {/* Main info */}
      <div className={cn('flex-1 space-y-1.5 min-w-0')}>
        <div className={cn('flex items-center gap-2', )}>
          <h4 className="text-sm font-bold text-slate-900 truncate">{circular.title}</h4>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', statusStyle.bg, statusStyle.text)}>
            {circular.status.replace('-', ' ').toUpperCase()}
          </span>
          {circular.referenceUrl && (
            <a
              href={normalizeUrl(circular.referenceUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 shrink-0"
            >
              <Icon icon="lucide:external-link" className="text-xs" />
              {t('regulatoryUpdates.viewOnline')}
            </a>
          )}
        </div>
        <div className={cn('flex items-center gap-2', )}>
          <span className="text-xs font-mono font-bold text-slate-500">{circular.reference}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', priorityStyle.bg, priorityStyle.text)}>
            {circular.priority.toUpperCase()}
          </span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          {/* Business Owner */}
          <span className="text-[10px] font-bold text-slate-400 uppercase">{t('regulatoryUpdates.businessOwnerDepartment')}:</span>
          {circular.businessOwnerDepartment ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
              {circular.businessOwnerDepartment}
            </span>
          ) : (
            <span className="text-slate-400 text-xs">—</span>
          )}
        </div>
        {/* Deadlines row */}
        {(circular.capDeadline || circular.remediationDeadline) && (
          <div className={cn('flex items-center gap-2 flex-wrap', )}>
            {circular.capDeadline && (
              <span className="bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-medium px-2 py-0.5 rounded-full">
                {t('regulatoryUpdates.capDeadline')}: {circular.capDeadline} ({differenceInCalendarDays(new Date(circular.capDeadline), new Date())}d)
              </span>
            )}
            {circular.remediationDeadline && (
              <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-medium px-2 py-0.5 rounded-full">
                {t('regulatoryUpdates.remediationDeadline')}: {circular.remediationDeadline} ({differenceInCalendarDays(new Date(circular.remediationDeadline), new Date())}d)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress + days + CAP */}
      <div className={cn('flex items-center gap-8 shrink-0', )}>
        <div className="w-36 space-y-1.5">
          <div className={cn('flex justify-between text-[10px] font-bold', )}>
            <span className="text-slate-500 uppercase">{t('regulatoryUpdates.implementationProgress')}</span>
            <span className="text-emerald-600">{circular.progress}%</span>
          </div>
          <div className={cn('h-1.5 rounded-full overflow-hidden', isCompleted ? 'bg-emerald-100' : 'bg-slate-100')}>
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${circular.progress}%` }} />
          </div>
        </div>
        <div className={cn('shrink-0 text-right')}>
          {isCompleted ? (
            <span className="text-xs font-bold text-emerald-600">{t('regulatoryUpdates.completed')}</span>
          ) : isOverdue ? (
            <span className="text-xs font-bold text-rose-500">{Math.abs(daysLeft)} {t('regulatoryUpdates.daysOverdue')}</span>
          ) : (
            <span className={cn('text-xs font-bold', daysLeft <= 14 ? 'text-rose-500' : 'text-slate-600')}>
              {daysLeft} {t('regulatoryUpdates.daysLeft')}
            </span>
          )}
          <p className="text-[10px] text-slate-400 mt-0.5">{t('regulatoryUpdates.due')}: {circular.dueDate}</p>
        </div>
        <div className={cn('shrink-0 text-center text-right')}>
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
            {t('regulatoryUpdates.currentPhase')}
          </p>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-bold',
            currentPhase === 2 ? 'bg-violet-100 text-violet-700' :
            currentPhase === 1 ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'
          )}>
            {currentPhase === 2 ? t('regulatoryUpdates.phaseRemediation') :
             currentPhase === 1 ? t('regulatoryUpdates.phaseCorrectiveActionPlan') :
             t('regulatoryUpdates.phaseCAP')}
          </span>
        </div>
      </div>
    </div>
  )
}

function PolicyCardContent({ policy, t, isRTL }: { policy: Policy; t: RegDocCardProps['t']; isRTL: boolean }) {
  const statusStyle = POLICY_STATUS_COLORS[policy.status]
  const categoryIcon = CATEGORY_ICONS[policy.category]
  const tierStyle = TIER_COLORS[policy.approvalTier] ?? TIER_COLORS.management
  const urgency = getReviewUrgency(policy.nextReviewDate, policy.status)

  const tierLabels: Record<string, string> = {
    board:      t('policies.approvalTierBoard'),
    management: t('policies.approvalTierManagement'),
    sharia:     t('policies.approvalTierSharia'),
    agm:        t('policies.approvalTierAGM'),
  }

  return (
    <div className={cn('flex items-center gap-6 flex-1', )}>
      {/* Category icon */}
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
        <Icon icon={categoryIcon} className="text-xl text-slate-600" />
      </div>

      {/* Main info */}
      <div className={cn('flex-1 space-y-1.5 min-w-0')}>
        <div className={cn('flex items-center gap-2', )}>
          <h4 className="text-sm font-bold text-slate-900 truncate">{policy.name}</h4>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', statusStyle.bg, statusStyle.text)}>
            {policy.status === 'under-review'    ? t('policies.statusUnderReview') :
             policy.status === 'approved'       ? t('policies.statusApproved') :
             policy.status === 'expired'        ? t('policies.statusExpired') :
             policy.status === 'overdue'        ? t('policies.statusOverdue') :
             policy.status === 'requires-review' ? t('policies.statusRequiresReview') :
             t('policies.statusDraft')}
          </span>
        </div>
        <div className={cn('flex items-center gap-2', )}>
          <span className="text-xs font-mono font-bold text-slate-400">{policy.id}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', tierStyle.bg, tierStyle.text)}>
            {tierLabels[policy.approvalTier]}
          </span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full">{policy.version}</span>
        </div>
      </div>

      {/* Owner + next review */}
      <div className={cn('flex items-center gap-8 shrink-0', )}>
        <div className={cn('flex items-center gap-3', )}>
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${policy.owner.avatar}`}
            className="w-8 h-8 rounded-full border border-slate-200"
            alt={policy.owner.name}
          />
          <div>
            <p className="text-xs font-bold text-slate-700">{policy.owner.name}</p>
            <p className="text-[10px] text-slate-400">{policy.owner.department}</p>
          </div>
        </div>
        <div className={cn('shrink-0 text-right')}>
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{t('policies.nextReview')}</p>
          <p className={cn(
            'text-xs font-bold',
            urgency === 'expired' ? 'text-rose-600' :
            urgency === 'warning' ? 'text-amber-600' :
            'text-slate-700'
          )}>
            {policy.nextReviewDate || '—'}
          </p>
        </div>
      </div>
    </div>
  )
}
