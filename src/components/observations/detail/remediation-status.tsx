'use client'

import { memo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import type { RemediationPlan, RemediationPlanStatus } from '@/types'

interface Document {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RemediationStatusProps {
  plan: RemediationPlan | null | undefined
  canReview: boolean
  onReview: (approved: boolean, notes?: string) => void
  documents: Document[]
  isRTL: boolean
}

export const RemediationStatus = memo(function RemediationStatus({
  plan,
  canReview,
  onReview,
  documents,
  isRTL,
}: RemediationStatusProps) {
  const { t } = useTranslation()

  const statusColors: Record<RemediationPlanStatus, string> = {
    draft: 'bg-slate-500',
    submitted: 'bg-amber-500',
    approved: 'bg-emerald-500',
    rejected: 'bg-rose-500',
  }

  const showReview = canReview && plan?.status === 'submitted'
  const hasRemediationDocs = documents.length > 0
  // Only show plan UI when it's been submitted (not draft)
  const showPlanUI = plan && plan.status !== 'draft'

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
          {/* Remediation Plan Documents */}
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
              <button
                onClick={() => onReview(true)}
                className="flex-1 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
              >
                {t('observations.detail.approvePlan')}
              </button>
              <button
                onClick={() => onReview(false)}
                className="flex-1 px-3 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition-colors"
              >
                {t('observations.detail.rejectPlan')}
              </button>
            </div>
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
        // Show remediation docs even without a formal plan
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
      ) : (
        <p className="text-xs text-slate-400 italic text-center">{t('observations.detail.noPlanDocuments')}</p>
      )}
    </div>
  )
})
