'use client'

import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { PolicyWorkflowStep, PolicyEvidence, PolicyAttachment, LetterApprovalStep } from '@/types'
import { RoleGuard } from '@/components/auth/role-guard'
import { usePolicyStore } from '@/stores/policy-store'
import { useLetterStore } from '@/stores/letter-store'
import { useAuthStore } from '@/stores/auth-store'
import Link from 'next/link'

interface ApprovalItem {
  id: string
  type: 'policy' | 'sama-letter'
  title: string
  reference?: string
  urgent: boolean
  contextSummary: string
  workflowStepInfo?: string
  linkHref: string
  workflowTimeline?: PolicyWorkflowStep[]
  evidence?: PolicyEvidence[]
  attachments?: PolicyAttachment[]
  approvalChain?: LetterApprovalStep[]
  /** W38: the policy workflow step awaiting the manager — target of approve/reject. */
  currentStepId?: string
}

export function PendingApprovalsCard() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const policies = usePolicyStore((s) => s.policies)
  // W38: approvals from this card go through the server-driven workflow action
  // (POST /workflow/advance). The old client-only `approve`/`update` calls
  // flipped local state that vanished on reload — nothing was persisted.
  const advancePolicyWorkflow = usePolicyStore((s) => s.advanceWorkflowStep)
  const letters = useLetterStore((s) => s.letters)
  const approveLetterStep = useLetterStore((s) => s.approveStep)
  const rejectLetterStep = useLetterStore((s) => s.rejectStep)

  // This card scans the policy + letter stores client-side, but the directory
  // page only hydrates the team store — so without this the stores were empty
  // on a fresh load and the card always showed "no approvals pending". Hydrate
  // both here (fetches are deduped) and track first-fetch for the skeleton.
  const fetchPolicies = usePolicyStore((s) => s.fetchAll)
  const fetchLetters = useLetterStore((s) => s.fetchAll)
  const policiesFetched = usePolicyStore((s) => s.lastFetched)
  const lettersFetched = useLetterStore((s) => s.lastFetched)
  useEffect(() => {
    void fetchPolicies()
    void fetchLetters()
  }, [fetchPolicies, fetchLetters])

  const [page, setPage] = useState(0)
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null)
  const [notes, setNotes] = useState('')
  const perPage = 5

  const items = useMemo<ApprovalItem[]>(() => {
    const now = Date.now()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const result: ApprovalItem[] = []
    // Only notify-manager steps count as managerial approval
    for (const p of policies) {
      if (p.status === 'under-review' || p.status === 'requires-review') {
        const currentStep = p.workflowTimeline?.find(
          s => s.status === 'current' && s.actionType === 'notify-manager' && s.stepState === 'awaiting-manager'
        )
        if (!currentStep) continue
        const deadlineClose = p.nextReviewDate
          ? (new Date(p.nextReviewDate).getTime() - now) < thirtyDaysMs
          : false
        result.push({
          id: p.id,
          type: 'policy',
          title: p.name,
          reference: p.id,
          urgent: deadlineClose || p.status === 'requires-review',
          contextSummary: 'Policy awaiting manager approval',
          workflowStepInfo: `Current step: ${currentStep.step}`,
          linkHref: `/correspondence/regulatory-updates/policies?policyId=${p.id}&tab=workflow`,
          workflowTimeline: p.workflowTimeline,
          evidence: p.evidence,
          attachments: p.attachments,
          currentStepId: currentStep.id,
        })
      }
    }
    // Only Department Head (step 2) counts as managerial approval
    for (const l of letters) {
      if (l.status === 'pending-approval') {
        const deptHeadStep = l.approvalChain?.find(s => s.role === 'Department Head' && s.status === 'pending')
        if (!deptHeadStep) continue
        const deadlineClose = l.responseDeadline
          ? (new Date(l.responseDeadline).getTime() - now) < thirtyDaysMs
          : false
        result.push({
          id: l.id,
          type: 'sama-letter',
          title: l.subject || l.reference,
          reference: l.reference,
          urgent: l.priority === 'urgent' || deadlineClose,
          contextSummary: `Letter awaiting Department Head approval`,
          workflowStepInfo: deptHeadStep.assignedTo ? `Pending: ${deptHeadStep.assignedTo}` : 'Pending: Department Head',
          linkHref: `/correspondence/letters?id=${l.id}`,
          approvalChain: l.approvalChain,
        })
      }
    }
    return result
  }, [policies, letters])

  const totalPages = Math.ceil(items.length / perPage)
  const pageItems = items.slice(page * perPage, (page + 1) * perPage)
  // Show the skeleton until BOTH source stores have completed their first fetch
  // (and only while we have nothing to show yet) — never flash the empty state
  // mid-load.
  const isLoading = (policiesFetched === null || lettersFetched === null) && items.length === 0

  const typeIcons: Record<string, { icon: string; color: string }> = {
    policy: { icon: 'lucide:file-text', color: 'text-blue-600 bg-blue-50' },
    'sama-letter': { icon: 'lucide:mail', color: 'text-purple-600 bg-purple-50' },
  }

  const typeLabels: Record<string, string> = {
    policy: t('correspondence.policyReview' as TranslationKey),
    'sama-letter': t('navigation.letters' as TranslationKey),
  }

  const handleApprove = (item: ApprovalItem) => {
    const name = currentUser?.name || 'Manager'
    if (item.type === 'policy') {
      // W38: server-driven approve — persists the step completion + activity
      // row and promotes the next step (same path as PolicyDetailsContent).
      void advancePolicyWorkflow(item.id, {
        action: 'approve',
        stepId: item.currentStepId,
        note: notes || undefined,
        userName: name,
      })
    } else if (item.type === 'sama-letter') {
      const letter = letters.find(l => l.id === item.id)
      if (letter) {
        const pendingStep = letter.approvalChain?.find(s => s.status === 'pending')
        if (pendingStep) {
          // Round 4 Phase 6: store derives approver from auth user.
          void name
          approveLetterStep(item.id, pendingStep.step, notes || undefined)
        }
      }
    }
    setNotes('')
    setSelectedItem(null)
  }

  const handleReject = (item: ApprovalItem) => {
    if (item.type === 'policy') {
      // W38: server-driven reject — clears the awaiting state and writes the
      // step_denied activity row server-side (the old local update() persisted
      // nothing: toUpdatePayload never mapped workflowTimeline/activityLog).
      void advancePolicyWorkflow(item.id, {
        action: 'reject',
        stepId: item.currentStepId,
        note: notes || undefined,
        userName: currentUser?.name || 'Manager',
      })
    } else if (item.type === 'sama-letter') {
      const letter = letters.find(l => l.id === item.id)
      if (letter) {
        const pendingStep = letter.approvalChain?.find(s => s.status === 'pending')
        if (pendingStep) {
          rejectLetterStep(item.id, pendingStep.step, notes || 'Rejected via directory')
        }
      }
    }
    setNotes('')
    setSelectedItem(null)
  }

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Icon icon="lucide:clock" className="text-slate-400" />
        {t('team.pendingApprovals' as TranslationKey)}
        {items.length > 0 && (
          <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        )}
      </h3>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <Icon icon="lucide:check-circle" className="text-3xl text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">{t('team.noApprovalsPending' as TranslationKey)}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pageItems.map((item) => {
            const icon = typeIcons[item.type]
            return (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => setSelectedItem(item)}
                className={`p-3 rounded-xl border cursor-pointer transition-colors hover:shadow-sm ${item.urgent ? 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${icon.color}`}>
                    <Icon icon={icon.icon} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {typeLabels[item.type]} {item.reference && `· ${item.reference}`}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-[10px] font-bold text-slate-500 disabled:opacity-30 cursor-pointer">
                {t('team.previous' as TranslationKey)}
              </button>
              <span className="text-[10px] text-slate-400">{page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="text-[10px] font-bold text-slate-500 disabled:opacity-30 cursor-pointer">
                {t('team.next' as TranslationKey)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => { setSelectedItem(null); setNotes('') }}
        title={t('team.pendingApprovalsDetail' as TranslationKey)}
        size="md"
      >
        {selectedItem && (() => {
          const icon = typeIcons[selectedItem.type]
          return (
            <div className="space-y-5">
              {/* Type Badge + Title */}
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${icon.color}`}>
                  <Icon icon={icon.icon} className="w-5 h-5" />
                </div>
                <div>
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 ${icon.color}`}>
                    {typeLabels[selectedItem.type]}
                  </span>
                  <h4 className="text-base font-bold text-slate-900">{selectedItem.title}</h4>
                  {selectedItem.reference && (
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedItem.reference}</p>
                  )}
                </div>
              </div>

              {/* Urgency Indicator */}
              <div className={`p-3 rounded-xl border ${selectedItem.urgent ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <Icon
                    icon={selectedItem.urgent ? 'lucide:alert-triangle' : 'lucide:info'}
                    className={`w-4 h-4 ${selectedItem.urgent ? 'text-rose-500' : 'text-slate-400'}`}
                  />
                  <span className={`text-xs font-bold ${selectedItem.urgent ? 'text-rose-700' : 'text-slate-600'}`}>
                    {selectedItem.urgent ? t('team.urgent' as TranslationKey) : t('team.status')}
                  </span>
                </div>
              </div>

              {/* Context Summary */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('team.details')}</p>
                <p className="text-sm text-slate-700">{selectedItem.contextSummary}</p>
                {selectedItem.workflowStepInfo && (
                  <p className="text-xs text-slate-500 mt-1">{selectedItem.workflowStepInfo}</p>
                )}
              </div>

              {/* Mini Workflow Timeline */}
              {selectedItem.workflowTimeline && selectedItem.workflowTimeline.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('policies.approvalWorkflow' as TranslationKey)}</p>
                  <div className="space-y-1.5">
                    {selectedItem.workflowTimeline.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          step.status === 'completed' ? 'bg-emerald-500'
                            : step.status === 'current' ? 'bg-amber-500'
                            : 'bg-slate-200'
                        }`} />
                        <span className={`text-xs ${step.status === 'current' ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                          {step.step}
                        </span>
                        {step.stepState === 'pending-approval' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                            {t('policies.awaitingApproval' as TranslationKey)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Downloads */}
              {selectedItem.evidence && selectedItem.evidence.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('policies.evidenceSection' as TranslationKey)}</p>
                  <div className="space-y-1">
                    {selectedItem.evidence.map((ev, i) => (
                      <a
                        key={i}
                        href={ev.dataUrl}
                        download={ev.name}
                        className="flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium p-1.5 rounded hover:bg-emerald-50"
                      >
                        <Icon icon="lucide:download" className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{ev.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachment Downloads */}
              {selectedItem.attachments && selectedItem.attachments.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('policies.attachments' as TranslationKey)}</p>
                  <div className="space-y-1">
                    {selectedItem.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.dataUrl}
                        download={att.name}
                        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium p-1.5 rounded hover:bg-blue-50"
                      >
                        <Icon icon="lucide:paperclip" className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* SAMA Approval Chain */}
              {selectedItem.approvalChain && selectedItem.approvalChain.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('policies.approvalWorkflow' as TranslationKey)}</p>
                  <div className="space-y-1.5">
                    {selectedItem.approvalChain.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          step.status === 'approved' ? 'bg-emerald-500'
                            : step.status === 'pending' ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`} />
                        <span className={`text-xs ${step.status === 'pending' ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                          Step {step.step}: {step.role}
                        </span>
                        {step.status === 'pending' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                            {t('policies.awaitingApproval' as TranslationKey)}
                          </span>
                        )}
                        {step.status === 'approved' && step.approvedAt && (
                          <span className="text-[9px] text-slate-400">{step.approvedAt}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('team.approvalNotes' as TranslationKey)}</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('team.approvalNotesPlaceholder' as TranslationKey)}
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <RoleGuard requiredRole="manager" hidden>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(selectedItem)}
                  >
                    <Icon icon="lucide:check" className="w-4 h-4" />
                    {t('team.approveAction' as TranslationKey)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(selectedItem)}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    <Icon icon="lucide:x" className="w-4 h-4" />
                    {t('team.rejectAction' as TranslationKey)}
                  </Button>
                </RoleGuard>
                <Link
                  href={selectedItem.linkHref}
                  className="ms-auto text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  {t('team.viewDetails' as TranslationKey)}
                  <Icon icon="lucide:external-link" className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )
        })()}
      </Modal>
    </Card>
  )
}
