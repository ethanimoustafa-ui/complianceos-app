'use client'

// W50 — archived audit cycles: a dedicated card listing previous cycles
// (scrolling, capped at 5 with View more), one click opens the frozen
// snapshot in a read-only rollback view, with a plain PDF report download.

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { useAuditStore, type AuditCycleSummary, type AuditCycleDetail } from '@/stores/audit-store'
import { generateAuditCyclePdf } from '@/lib/audit-cycle-pdf'

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-600 border-amber-200',
  pending: 'bg-slate-50 text-slate-500 border-slate-200',
  overdue: 'bg-rose-50 text-rose-600 border-rose-200',
}

export function AuditHistoryCard({ auditId, auditTitle }: { auditId: string; auditTitle: string }) {
  const { t, isRTL } = useTranslation()
  const cycles = useAuditStore((s) => s.cyclesByAudit[auditId])
  const fetchCycles = useAuditStore((s) => s.fetchCycles)
  const fetchCycleDetail = useAuditStore((s) => s.fetchCycleDetail)
  const [visible, setVisible] = useState(5)
  const [viewing, setViewing] = useState<AuditCycleDetail | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    void fetchCycles(auditId)
  }, [auditId, fetchCycles])

  const list: AuditCycleSummary[] = cycles ?? []
  if (list.length === 0) return null

  const openCycle = async (c: AuditCycleSummary) => {
    setLoadingId(c.id)
    const detail = await fetchCycleDetail(auditId, c.id)
    setLoadingId(null)
    if (detail) setViewing(detail)
  }

  const snap = viewing?.snapshot

  return (
    <>
      <Card className="overflow-hidden">
        <div className={`p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between`}>
          <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditHistory' as never)}</h3>
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            {list.length}
          </span>
        </div>
        <div className="max-h-[340px] overflow-y-auto hide-scrollbar divide-y divide-slate-100">
          {list.slice(0, visible).map((c) => (
            <button
              key={c.id}
              onClick={() => void openCycle(c)}
              className={`w-full px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer ${isRTL ? 'text-right' : 'text-left'}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {t('auditDetail.cycleN' as never).replace('{{n}}', String(c.cycleNumber))}
                </p>
                <p className="text-[11px] text-slate-400">
                  {new Date(c.closedAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { dateStyle: 'medium' })}
                  {' · '}{c.counts.tasks} {t('auditDetail.tasksCount' as never)} · {c.counts.documents} {t('auditDetail.docsCount' as never)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLE[c.status ?? 'pending'] ?? STATUS_STYLE.pending}`}>
                  {c.progress}%
                </span>
                {loadingId === c.id
                  ? <Icon icon="lucide:loader-2" className="animate-spin text-slate-400" />
                  : <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="text-slate-300" />}
              </div>
            </button>
          ))}
        </div>
        {list.length > visible && (
          <button
            onClick={() => setVisible((v) => v + 5)}
            className="w-full py-2.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            {t('common.loadMore')} ({list.length - visible})
          </button>
        )}
      </Card>

      {/* Read-only rollback view */}
      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewing(null)}
        size="lg"
        title={viewing ? `${auditTitle} — ${t('auditDetail.cycleN' as never).replace('{{n}}', String(viewing.cycleNumber))}` : ''}
      >
        {viewing && snap && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-2">
                <Icon icon="lucide:archive" />
                {t('auditDetail.viewingArchived' as never)}
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => generateAuditCyclePdf(viewing, auditTitle)}>
                  <Icon icon="lucide:download" />
                  {t('auditDetail.downloadReport' as never)}
                </Button>
                <Button variant="dark" size="sm" onClick={() => setViewing(null)}>
                  <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                  {t('auditDetail.backToCurrent' as never)}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                [t('common.status'), String(viewing.status ?? '-')],
                [t('auditDetail.progress'), `${viewing.progress}%`],
                [t('auditDetail.dueDate'), viewing.dueDate ?? '-'],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 p-3 rounded-xl">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{label}</p>
                  <p className="text-sm font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <section>
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                {t('auditDetail.historyChecklist' as never)} ({snap.tasks.length})
              </h4>
              <div className="space-y-1.5 max-h-44 overflow-y-auto hide-scrollbar">
                {snap.tasks.map((task, i) => {
                  const r = task as { title?: string; completed?: boolean }
                  return (
                    <p key={i} className="text-sm text-slate-600 flex items-center gap-2">
                      <Icon icon={r.completed ? 'lucide:check-circle-2' : 'lucide:circle'} className={r.completed ? 'text-emerald-500' : 'text-slate-300'} />
                      {r.title ?? '-'}
                    </p>
                  )
                })}
                {snap.tasks.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-6">
              <section>
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                  {t('auditDetail.historyDocuments' as never)} ({snap.documents.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto hide-scrollbar">
                  {snap.documents.map((d, i) => (
                    <p key={i} className="text-sm text-slate-600 truncate">• {(d as { name?: string }).name ?? '-'}</p>
                  ))}
                  {snap.documents.length === 0 && <p className="text-xs text-slate-400">—</p>}
                </div>
              </section>
              <section>
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                  {t('auditDetail.historyComments' as never)} ({snap.comments.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto hide-scrollbar">
                  {snap.comments.map((c, i) => (
                    <p key={i} className="text-sm text-slate-600 truncate">• {(c as { content?: string }).content ?? ''}</p>
                  ))}
                  {snap.comments.length === 0 && <p className="text-xs text-slate-400">—</p>}
                </div>
              </section>
            </div>

            <section>
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                {t('auditDetail.historyActivity' as never)} ({snap.logs.length})
              </h4>
              <div className="space-y-1 max-h-36 overflow-y-auto hide-scrollbar">
                {snap.logs.slice(0, 30).map((l, i) => {
                  const r = l as { timestamp?: string; user_name?: string; action?: string }
                  return (
                    <p key={i} className="text-xs text-slate-500">
                      {r.timestamp?.slice(0, 16).replace('T', ' ')} — <span className="font-medium text-slate-700">{r.user_name}</span> — {r.action}
                    </p>
                  )
                })}
                {snap.logs.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </section>
          </div>
        )}
      </Modal>
    </>
  )
}
