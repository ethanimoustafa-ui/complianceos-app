'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import type { RemediationPlan, RemediationPlanStatus } from '@/types'

interface Document {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RemediationStatusProps {
  plan: RemediationPlan | null | undefined
  canReview: boolean
  onReview: (approved: boolean, notes?: string) => Promise<void> | void
  documents: Document[]
  isRTL: boolean
  /** Render skeleton when the detail GET hasn't resolved yet. */
  isLoaded?: boolean
  /** BUG-O07: callback to open the Add Remediation Plan modal */
  onAddPlan?: () => void
  /** BUG 1: gate the dedicated "Submit Remediation Plan" CTA (assignee/leader/admin). */
  canSubmitPlan?: boolean
}

export const RemediationStatus = memo(function RemediationStatus({
  plan,
  canReview,
  onReview,
  documents,
  isLoaded = true,
  onAddPlan,
  canSubmitPlan = false,
}: RemediationStatusProps) {
  const { t } = useTranslation()
  const [reviewing, setReviewing] = useState<'approve' | 'reject' | null>(null)

  const statusColors: Record<RemediationPlanStatus, string> = {
    draft: 'bg-slate-500',
    submitted: 'bg-amber-500',
    approved: 'bg-emerald-500',
    rejected: 'bg-rose-500',
  }

  const showReview = canReview && plan?.status === 'submitted'
  const hasRemediationDocs = documents.length > 0
  const showPlanUI = plan && plan.status !== 'draft'
  // BUG 1: the explicit "Submit Remediation Plan" CTA stays visible whenever there
  // is no active structured plan yet (none, still draft, or previously rejected),
  // even when remediation documents already exist (the old upload workaround).
  const showSubmitPlan =
    Boolean(canSubmitPlan && onAddPlan) &&
    (!plan || plan.status === 'draft' || plan.status === 'rejected')

  const handleReview = async (approved: boolean) => {
    setReviewing(approved ? 'approve' : 'reject')
    try {
      await onReview(approved)
    } finally {
      setReviewing(null)
    }
  }

  if (!isLoaded) {
    return (
      <div>
        <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
          {t('observations.detail.remediationPlan')}
        </h4>
        <div className="space-y-2" data-testid="observation-remediation-skeleton" aria-busy="true">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.remediationPlan')}
      </h4>
      {showPlanUI ? (
        <div className="space-y-3">
          <div className={`flex items-center gap-2`}>
            <span className={`px-2 py-1 ${statusColors[plan.status]} text-white text-[10px] font-black rounded uppercase`}>
              {t(`observations.detail.remediationStatus.${plan.status}`)}
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-900">{plan.title}</p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{plan.description}</p>
          </div>
          {documents.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{t('observations.detail.planDocuments')}</p>
              {documents.map((doc) => (
                <a
                  key={doc.id}
                  href="#"
                  className={`flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:border-amber-400 transition-all`}
                >
                  <Icon
                    icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
                    className="text-amber-600"
                  />
                  <span className={`text-[10px] font-bold text-amber-800 truncate`}>
                    {doc.name}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
          {showReview ? (
            <div className={`flex gap-2`}>
              <LoadingButton
                variant="primary"
                onClick={() => handleReview(true)}
                loading={reviewing === 'approve'}
                disabled={reviewing !== null}
                className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                {t('observations.detail.approvePlan')}
              </LoadingButton>
              <LoadingButton
                variant="primary"
                onClick={() => handleReview(false)}
                loading={reviewing === 'reject'}
                disabled={reviewing !== null}
                className="flex-1 h-8 text-xs bg-rose-600 hover:bg-rose-700"
              >
                {t('observations.detail.rejectPlan')}
              </LoadingButton>
            </div>
          ) : null}
          {showSubmitPlan ? (
            <button
              onClick={onAddPlan}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Icon icon="lucide:clipboard-check" className="text-sm" />
              {t('observations.detail.submitRemediationPlan')}
            </button>
          ) : null}
          {plan.reviewNotes ? (
            <div className="bg-slate-100 rounded-lg p-2">
              <p className="text-xs text-slate-600">
                <span className="font-bold">{t('observations.detail.reviewNotes')}:</span> {plan.reviewNotes}
              </p>
            </div>
          ) : null}
        </div>
      ) : hasRemediationDocs ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase">{t('observations.detail.planDocuments')}</p>
            {documents.map((doc) => (
              <a
                key={doc.id}
                href="#"
                className={`flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg hover:border-amber-400 transition-all`}
              >
                <Icon
                  icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
                  className="text-amber-600"
                />
                <span className={`text-[10px] font-bold text-amber-800 truncate`}>
                  {doc.name}
                </span>
              </a>
            ))}
          </div>
          {showSubmitPlan && (
            <button
              onClick={onAddPlan}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Icon icon="lucide:clipboard-check" className="text-sm" />
              {t('observations.detail.submitRemediationPlan')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 italic text-center">{t('observations.detail.noPlanDocuments')}</p>
          {showSubmitPlan && (
            <button
              onClick={onAddPlan}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Icon icon="lucide:plus-circle" className="text-sm" />
              {t('observations.detail.submitRemediationPlan')}
            </button>
          )}
        </div>
      )}
    </div>
  )
})
