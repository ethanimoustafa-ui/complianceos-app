'use client'

import { Icon } from '@iconify/react'
import { differenceInCalendarDays } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Circular, Policy, CircularPriority, CircularStatus, PolicyStatus, PolicyApprovalTier } from '@/types'
import type { TranslationKey } from '@/i18n'
import { useDepartmentStore } from '@/stores/department-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { resolveAuthorityCode } from '@/lib/authority-display'
import { useTranslation } from '@/i18n'
import { dicebearAvatar } from '@/lib/avatar'
// W17-3: never inline an enum label — use the shared formatter.
// W18-cleanup: policy chips routed through the same helpers.
import { formatStatus, formatPriority, formatPolicyStatus, formatPolicyApprovalTier } from '@/lib/format/enum'

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

// Authority badge palette keyed by framework id (lowercase). Custom
// frameworks the user adds fall back to a neutral slate style.
const AUTHORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sama:          { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  cma:           { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  ia:            { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  zatca:         { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  misa:          { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  safiu:         { bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
  citc:          { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  'sharia-board':{ bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
}
const AUTHORITY_FALLBACK = { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }

function policyBusinessOwnerLabel(
  policy: Policy,
  depts: { id: string; name: string }[],
): string | null {
  if (!policy.businessOwnerDepartmentId) return null
  return depts.find((d) => d.id === policy.businessOwnerDepartmentId)?.name ?? null
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

// `PolicyCategory` is now a widened opaque string, so we render via the central
// helper which falls back to a neutral tag icon for user-added categories.
const CATEGORY_ICONS: Record<string, string> = {
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

function CircularCardContent({ circular, t }: { circular: Circular; t: RegDocCardProps['t']; isRTL: boolean }) {
  const { isRTL: rtl } = useTranslation()
  const departments = useDepartmentStore(s => s.departments)
  const frameworks = useFrameworkConfigStore(s => s.frameworks)
  const authorityKey = circular.authority?.toLowerCase?.() ?? ''
  const authorityStyle = AUTHORITY_COLORS[authorityKey] ?? AUTHORITY_FALLBACK
  const authorityCode = resolveAuthorityCode(circular.authority, frameworks)
  const priorityStyle = PRIORITY_COLORS[circular.priority]
  const statusStyle = CIRCULAR_STATUS_COLORS[circular.status]
  const daysLeft = getDaysLeft(circular.dueDate)
  const isCompleted = circular.status === 'completed'
  const isOverdue = circular.status === 'overdue'
  // Prefer the server-stamped current_phase from the list endpoint so the chip
  // is correct on first paint; fall back to the detail-fetched workflowSteps
  // if available. `phaseKnown` gates the chip vs a skeleton placeholder so we
  // never lie with "Phase 0" before the data is in.
  const currentPhase = circular.currentPhase ?? circular.workflowSteps?.find((s) => s.status === 'current')?.phase
  const phaseKnown = typeof currentPhase === 'number'

  // W17-3: shared formatter — no inline labels.
  const statusLabel = formatStatus(t, circular.status)
  const priorityLabel = formatPriority(t, circular.priority)

  const getDeptLabel = (deptName: string) => {
    const dept = departments.find(d => d.name === deptName || d.id === deptName)
    if (dept) return rtl ? dept.nameAr : dept.name
    return deptName
  }

  // RTL-10: deadline overrun suffix. English keeps the terse "(8d)" / "(-1d)"
  // notation; RTL renders an Arabic phrase with localised numerals, mirroring
  // the day-counter chip on the same row.
  const deadlineSuffix = (days: number): string => {
    if (!rtl) return `(${days}d)`
    return days < 0
      ? `(${t('regulatoryUpdates.daysOverdue')} ${Math.abs(days)})`
      : `(${days} ${t('regulatoryUpdates.daysLeft')})`
  }

  return (
    <div className={cn('flex items-center gap-6 flex-1', )}>
      {/* Authority badge */}
      <div className={cn('flex flex-col items-center justify-center px-4 py-3 rounded-xl border shrink-0', authorityStyle.bg, authorityStyle.border)}>
        <span className={cn('text-xs font-black uppercase', authorityStyle.text)}>{authorityCode}</span>
      </div>

      {/* Main info */}
      <div className={cn('flex-1 space-y-1.5 min-w-0')}>
        {/* RTL-11: `min-w-0` on the row + the title lets `truncate` engage in
            both LTR and RTL — without it a long title clips to "te…". */}
        <div className={cn('flex items-center gap-2 min-w-0', )}>
          <h4 className="text-sm font-bold text-slate-900 truncate min-w-0">{circular.title}</h4>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', statusStyle.bg, statusStyle.text)}>
            {statusLabel.toUpperCase()}
          </span>
          {circular.referenceUrl && (
            <a
              href={normalizeUrl(circular.referenceUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t('regulatoryUpdates.viewOnline')}
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 shrink-0"
            >
              <Icon icon="lucide:external-link" className="text-sm" />
            </a>
          )}
          {circular.pdfUrl && (
            <span
              title={t('regulatoryUpdates.pdfAttachedBadge')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-100"
            >
              <Icon icon="lucide:paperclip" className="text-[10px]" />
              {t('regulatoryUpdates.pdfAttachedBadge')}
            </span>
          )}
        </div>
        {/* RTL-11: `flex-wrap` so a long (often longer in Arabic) business-owner
            department name wraps cleanly instead of clipping the row edge. */}
        <div className={cn('flex items-center gap-2 flex-wrap', )}>
          <span className="text-xs font-mono font-bold text-slate-500">{circular.reference}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full shrink-0"></span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0', priorityStyle.bg, priorityStyle.text)}>
            {priorityLabel.toUpperCase()}
          </span>
          <span className="w-1 h-1 bg-slate-300 rounded-full shrink-0"></span>
          {/* Business Owner */}
          <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">{t('regulatoryUpdates.businessOwnerDepartment')}:</span>
          {circular.businessOwnerDepartment ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
              {getDeptLabel(circular.businessOwnerDepartment)}
            </span>
          ) : (
            <span className="text-slate-400 text-xs">—</span>
          )}
        </div>
        {/* Department chips */}
        {circular.departments && circular.departments.length > 0 && (
          <div className={cn('flex items-center gap-1.5 flex-wrap')}>
            {circular.departments.slice(0, 3).map((dept) => (
              <span
                key={dept}
                className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold"
              >
                {getDeptLabel(dept)}
              </span>
            ))}
            {circular.departments.length > 3 && (
              <span className="text-[10px] font-bold text-slate-500">
                +{circular.departments.length - 3} more
              </span>
            )}
          </div>
        )}
        {/* Framework tags */}
        {circular.frameworkIds && circular.frameworkIds.length > 0 && (
          <div className={cn('flex items-center gap-1.5 flex-wrap')}>
            {circular.frameworkIds.slice(0, 4).map((fid) => {
              const fw = frameworks.find((f) => f.id === fid)
              const label = fw ? (rtl ? fw.nameAr : fw.name) : String(fid)
              return (
                <span
                  key={fid}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-bold"
                >
                  <Icon icon="lucide:tag" className="text-[9px]" />
                  {label}
                </span>
              )
            })}
            {circular.frameworkIds.length > 4 && (
              <span className="text-[10px] font-bold text-slate-500">
                +{circular.frameworkIds.length - 4}
              </span>
            )}
          </div>
        )}
        {/* Deadlines row */}
        {(circular.capDeadline || circular.remediationDeadline) && (
          <div className={cn('flex items-center gap-2 flex-wrap', )}>
            {circular.capDeadline && (() => {
              const days = differenceInCalendarDays(new Date(circular.capDeadline), new Date())
              const overdue = days < 0
              return (
                <span
                  className={cn(
                    'border text-[10px] font-medium px-2 py-0.5 rounded-full',
                    overdue
                      ? 'bg-rose-50 text-rose-700 border-rose-100'
                      : 'bg-amber-50 text-amber-700 border-amber-100',
                  )}
                >
                  {t('regulatoryUpdates.capDeadline')}: {circular.capDeadline} {deadlineSuffix(days)}
                </span>
              )
            })()}
            {circular.remediationDeadline && (
              <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-medium px-2 py-0.5 rounded-full">
                {t('regulatoryUpdates.remediationDeadline')}: {circular.remediationDeadline} {deadlineSuffix(differenceInCalendarDays(new Date(circular.remediationDeadline), new Date()))}
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
          {phaseKnown ? (
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
          ) : (
            <div className="inline-block h-4 w-24 rounded-full bg-slate-200 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}

function PolicyCardContent({ policy, t }: { policy: Policy; t: RegDocCardProps['t']; isRTL: boolean }) {
  const { isRTL: rtl } = useTranslation()
  const departments = useDepartmentStore(s => s.departments)
  const statusStyle = POLICY_STATUS_COLORS[policy.status]
  const categoryIcon = CATEGORY_ICONS[policy.category] ?? 'lucide:tag'
  const tierStyle = TIER_COLORS[policy.approvalTier] ?? TIER_COLORS.management
  const urgency = getReviewUrgency(policy.nextReviewDate, policy.status)

  const getDeptLabel = (deptName: string) => {
    const dept = departments.find(d => d.name === deptName || d.id === deptName)
    if (dept) return rtl ? dept.nameAr : dept.name
    return deptName
  }

  // W18-cleanup: tier + status labels resolved by shared formatters. The
  // per-card tier map and status ternary were retired so EN/AR copy lives in
  // the dictionaries once.

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
            {formatPolicyStatus(t, policy.status)}
          </span>
        </div>
        <div className={cn('flex items-center gap-2', )}>
          <span className="text-xs font-mono font-bold text-slate-400">{policy.id}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', tierStyle.bg, tierStyle.text)}>
            {formatPolicyApprovalTier(t, policy.approvalTier)}
          </span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full">{policy.version}</span>
        </div>
      </div>

      {/* Owner + next review */}
      <div className={cn('flex items-center gap-8 shrink-0', )}>
        <div className={cn('flex items-center gap-3', )}>
          <img
            src={dicebearAvatar(policy.owner.avatar)}
            className="w-8 h-8 rounded-full border border-slate-200"
            alt={policy.owner.name}
          />
          <div>
            <p className="text-xs font-bold text-slate-700">{policy.owner.name}</p>
            <p className="text-[10px] text-slate-400">{policyBusinessOwnerLabel(policy, useDepartmentStore.getState().departments) ?? getDeptLabel(policy.owner.department)}</p>
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
