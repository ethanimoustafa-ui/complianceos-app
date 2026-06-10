'use client'

// W50/W51 — archived audit cycles. The card lists previous cycles (scrolling,
// capped at 5 with Load more); selecting one takes over the WHOLE PAGE with a
// read-only view of the frozen snapshot (ArchivedCycleView) — one button
// returns to the current audit, another downloads a plain PDF report.

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { useAuditStore, type AuditCycleSummary, type AuditCycleDetail } from '@/stores/audit-store'
import { useTeamStore } from '@/stores/team-store'
import { generateAuditCyclePdf } from '@/lib/audit-cycle-pdf'
import { formatAuditAction } from '@/lib/audit-log-format'
import { supabase as supabaseClient } from '@/lib/supabase/client'

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  in_progress: 'bg-amber-50 text-amber-600 border-amber-200',
  pending: 'bg-slate-50 text-slate-500 border-slate-200',
  overdue: 'bg-rose-50 text-rose-600 border-rose-200',
}

export function AuditHistoryCard({
  auditId,
  onSelect,
}: {
  auditId: string
  onSelect: (cycle: AuditCycleDetail) => void
}) {
  const { t, isRTL } = useTranslation()
  const cycles = useAuditStore((s) => s.cyclesByAudit[auditId])
  const fetchCycles = useAuditStore((s) => s.fetchCycles)
  const fetchCycleDetail = useAuditStore((s) => s.fetchCycleDetail)
  const [visible, setVisible] = useState(5)
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
    if (detail) onSelect(detail)
  }

  return (
    <Card className="overflow-hidden">
      <div className={`p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between`}>
        <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditHistory')}</h3>
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
                {t('auditDetail.cycleN').replace('{{n}}', String(c.cycleNumber))}
              </p>
              <p className="text-[11px] text-slate-400">
                {new Date(c.closedAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { dateStyle: 'medium' })}
                {' · '}{c.counts.tasks} {t('auditDetail.tasksCount')} · {c.counts.documents} {t('auditDetail.docsCount')}
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
  )
}

// ── Full-page read-only view of an archived cycle ────────────────────────────

export function ArchivedCycleView({
  cycle,
  auditTitle,
  onBack,
}: {
  cycle: AuditCycleDetail
  auditTitle: string
  onBack: () => void
}) {
  const { t, isRTL } = useTranslation()
  const teamMembers = useTeamStore((s) => s.members)
  const snap = cycle.snapshot
  const audit = snap.audit as Record<string, unknown>

  // W52: snapshots taken after this fix carry author_name; older ones only
  // have author_id — resolve those through the org directory.
  const commentAuthor = (c: { author_name?: string | null; author_id?: string | null }): string =>
    c.author_name ||
    (c.author_id ? teamMembers.find((m) => m.id === c.author_id)?.name : undefined) ||
    '—'

  // W52: archived documents stay downloadable — the storage objects outlive
  // the cycle (only the live metadata rows are cleared on reschedule).
  const downloadDoc = async (name: string, storagePath?: string) => {
    if (!storagePath) return
    const { data } = await supabaseClient.storage
      .from('audit_documents')
      .createSignedUrl(storagePath, 60, { download: name })
    if (!data?.signedUrl) return
    // Anchor click — popup blockers kill window.open after an await.
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors shrink-0 cursor-pointer"
            aria-label={t('auditDetail.backToCurrent')}
          >
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">
              <span>{t('auditDetail.auditHistory')}</span>
              <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} />
              <span className="text-amber-600">{t('auditDetail.cycleN').replace('{{n}}', String(cycle.cycleNumber))}</span>
            </div>
            <h1 className="text-xl font-bold font-display text-slate-900">{auditTitle}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => generateAuditCyclePdf(cycle, auditTitle)}>
            <Icon icon="lucide:download" />
            {t('auditDetail.downloadReport')}
          </Button>
          <Button variant="dark" onClick={onBack}>
            <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
            {t('auditDetail.backToCurrent')}
          </Button>
        </div>
      </header>

      <div className="p-8 space-y-6 max-w-6xl mx-auto">
        {/* Read-only banner */}
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Icon icon="lucide:archive" className="text-amber-600" />
          <p className="text-sm font-bold text-amber-700">{t('auditDetail.viewingArchived')}</p>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            [t('common.status'), String(cycle.status ?? '-')],
            [t('auditDetail.progress'), `${cycle.progress}%`],
            [t('auditDetail.dueDate'), cycle.dueDate ?? '-'],
            [t('auditDetail.closedAt' as never), new Date(cycle.closedAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { dateStyle: 'medium' })],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">{label}</p>
              <p className="text-sm font-bold text-slate-900">{value}</p>
            </Card>
          ))}
        </div>
        {Boolean(audit.description) && (
          <Card className="p-5">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('auditDetail.scopeDescription')}</p>
            <p className="text-sm text-slate-600 leading-relaxed">{String(audit.description)}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Checklist */}
          <Card className="overflow-hidden">
            <div className="p-5 bg-slate-50/50 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {t('auditDetail.historyChecklist')} ({snap.tasks.length})
              </h3>
            </div>
            <div className="p-5 space-y-2 max-h-72 overflow-y-auto hide-scrollbar">
              {snap.tasks.map((task, i) => {
                const r = task as { title?: string; completed?: boolean; due_date?: string }
                return (
                  <p key={i} className="text-sm text-slate-600 flex items-center gap-2">
                    <Icon icon={r.completed ? 'lucide:check-circle-2' : 'lucide:circle'} className={`shrink-0 ${r.completed ? 'text-emerald-500' : 'text-slate-300'}`} />
                    <span className="truncate">{r.title ?? '-'}</span>
                    {r.due_date && <span className="text-[10px] text-slate-400 shrink-0">{r.due_date}</span>}
                  </p>
                )
              })}
              {snap.tasks.length === 0 && <p className="text-xs text-slate-400">—</p>}
            </div>
          </Card>

          {/* Documents + Comments */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div className="p-5 bg-slate-50/50 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  {t('auditDetail.historyDocuments')} ({snap.documents.length})
                </h3>
              </div>
              <div className="p-5 space-y-1.5 max-h-32 overflow-y-auto hide-scrollbar">
                {snap.documents.map((d, i) => {
                  const r = d as { name?: string; storage_path?: string }
                  return (
                    <div key={i} className="flex items-center gap-2 group">
                      <Icon icon="lucide:file-text" className="text-slate-300 shrink-0" />
                      <span className="text-sm text-slate-600 truncate flex-1">{r.name ?? '-'}</span>
                      <button
                        onClick={() => void downloadDoc(r.name ?? 'document', r.storage_path)}
                        className="p-1 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer shrink-0"
                        title={t('auditDetail.downloadReport')}
                      >
                        <Icon icon="lucide:download" className="text-sm" />
                      </button>
                    </div>
                  )
                })}
                {snap.documents.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="p-5 bg-slate-50/50 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  {t('auditDetail.historyComments')} ({snap.comments.length})
                </h3>
              </div>
              <div className="p-5 space-y-2 max-h-32 overflow-y-auto hide-scrollbar">
                {snap.comments.map((c, i) => {
                  const r = c as { content?: string; created_at?: string; author_name?: string | null; author_id?: string | null }
                  return (
                    <p key={i} className="text-sm text-slate-600">
                      <span className="font-bold text-slate-800">{commentAuthor(r)}</span>{' '}
                      <span className="text-[10px] text-slate-400">{r.created_at?.slice(0, 10)}</span>
                      <br />
                      {r.content ?? ''}
                    </p>
                  )
                })}
                {snap.comments.length === 0 && <p className="text-xs text-slate-400">—</p>}
              </div>
            </Card>
          </div>
        </div>

        {/* Activity */}
        <Card className="overflow-hidden">
          <div className="p-5 bg-slate-50/50 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              {t('auditDetail.historyActivity')} ({snap.logs.length})
            </h3>
          </div>
          <div className="p-5 space-y-2 max-h-72 overflow-y-auto hide-scrollbar">
            {snap.logs.map((l, i) => {
              const r = l as { timestamp?: string; user_name?: string; action?: string; metadata?: Record<string, unknown> }
              return (
                <p key={i} className="text-xs text-slate-500">
                  {r.timestamp?.slice(0, 16).replace('T', ' ')} — <span className="font-medium text-slate-700">{r.user_name}</span> —{' '}
                  {formatAuditAction(r.action, r.metadata ?? null, t)}
                </p>
              )
            })}
            {snap.logs.length === 0 && <p className="text-xs text-slate-400">—</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
