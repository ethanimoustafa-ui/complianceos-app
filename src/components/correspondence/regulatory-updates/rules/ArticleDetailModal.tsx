'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useCircularStore } from '@/stores/circular-store'
import type { CircularArticle, ArticleRiskLevel, ArticleComplianceStatus } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { TimelineMeta } from './CircularDetailsContent'
import { VersionHistoryList } from './VersionHistoryList'
import { TimelineLoadMore } from './TimelineLoadMore'
// W17-3: single shared enum formatter. Never inline an enum label.
import {
  formatRiskLevel,
  formatComplianceStatus,
  formatDepartment,
} from '@/lib/format/enum'

type ArticleTab = 'details' | 'versions' | 'activity'

type Props = {
  circularId: string
  article?: CircularArticle
  mode: 'create' | 'edit' | 'view'
  onClose: () => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

export function ArticleDetailModal({ circularId, article, mode, onClose, t, isRTL }: Props) {
  const { addArticle, updateArticle, deleteArticle, toggleChecklistItem, addChecklistItem, deleteChecklistItem, loadArticleTimeline, loadMoreArticleTimeline, loadArticleVersions, loadMoreArticleVersions } = useCircularStore()
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const teamMembers = useTeamStore(s => s.members)
  // GAP-15: per-article Activity timeline pagination state.
  const articleTimelinePage = useCircularStore((s) =>
    article ? s.articleTimelinePagination[`${circularId}:${article.id}`] : undefined,
  )
  // W15-5: per-article Version History pagination state.
  const articleVersionPage = useCircularStore((s) =>
    article ? s.articleVersionPagination[`${circularId}:${article.id}`] : undefined,
  )

  // GAP-15 / W15-5: lazily load the first page of the article Activity timeline
  // AND Version History when the modal is open in view mode for a persisted
  // article (no-ops when `fetchById` already seeded the pagination state).
  useEffect(() => {
    if (mode === 'view' && article) {
      void loadArticleTimeline(circularId, article.id)
      void loadArticleVersions(circularId, article.id)
    }
  }, [mode, article, circularId, loadArticleTimeline, loadArticleVersions])

  const [currentMode, setCurrentMode] = useState(mode)
  const [activeArticleTab, setActiveArticleTab] = useState<ArticleTab>('details')
  const [artNumber, setArtNumber] = useState(article?.articleNumber ?? '')
  const [artTitle, setArtTitle] = useState(article?.title ?? '')
  const [artDescription, setArtDescription] = useState(article?.description ?? '')
  const [artRiskLevel, setArtRiskLevel] = useState<ArticleRiskLevel>(article?.riskLevel ?? 'medium')
  const [artComplianceStatus, setArtComplianceStatus] = useState<ArticleComplianceStatus>(article?.complianceStatus ?? 'not-started')
  const [artDept, setArtDept] = useState(article?.responsibleDepartment ?? '')
  const [artAssignedTo, setArtAssignedTo] = useState(article?.assignedTo ?? '')
  const [localChecklist, setLocalChecklist] = useState(article?.checklist ?? [])
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const isEditable = currentMode === 'edit' || currentMode === 'create'

  // Side-bug: `assignedTo` is a team-member UUID on the server. Resolve it to a
  // display name for view mode; show "Unassigned" when null/empty.
  const assignedMemberName = (() => {
    if (!artAssignedTo) return t('common.unassigned')
    const member = teamMembers.find((m) => m.id === artAssignedTo)
    return member ? member.name : artAssignedTo
  })()

  const riskColors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  }
  const complianceColors: Record<string, string> = {
    compliant: 'bg-emerald-100 text-emerald-700',
    'in-progress': 'bg-blue-100 text-blue-700',
    'non-compliant': 'bg-rose-100 text-rose-700',
    'not-started': 'bg-slate-100 text-slate-600',
  }
  // W17-3: route every enum render through the shared formatter
  // (`src/lib/format/enum.ts`). Per-component label maps are gone.
  const riskLabel = (v: string) => formatRiskLevel(t, v)
  const complianceLabel = (v: string) => formatComplianceStatus(t, v)
  const deptLabel = (name: string) =>
    formatDepartment(t, name, allDepartments, isRTL ? 'ar' : 'en')

  function handleSave() {
    const data = {
      articleNumber: artNumber,
      title: artTitle,
      description: artDescription,
      riskLevel: artRiskLevel,
      complianceStatus: artComplianceStatus,
      responsibleDepartment: artDept,
      assignedTo: artAssignedTo || undefined,
      checklist: currentMode === 'create' ? localChecklist : (article?.checklist ?? []),
      attachments: article?.attachments ?? [],
    }
    // Close-on-click + fire-and-forget. Store applies optimistic insert/patch
    // (with temp-id swap for new articles) and rolls back on failure.
    onClose()
    if (currentMode === 'create') {
      void Promise.resolve(addArticle(circularId, data)).catch(() => {})
    } else if (currentMode === 'edit' && article) {
      void Promise.resolve(updateArticle(circularId, article.id, data)).catch(() => {})
    }
  }

  function handleAddChecklistItem() {
    if (!newChecklistTitle.trim()) return
    if (article) {
      addChecklistItem(circularId, article.id, newChecklistTitle.trim())
    } else {
      // GAP-20: prefix the client placeholder id with `temp-` so the store's
      // persisted-id guards unambiguously treat it as not-yet-persisted until
      // `addArticle` swaps in the server UUID.
      setLocalChecklist(prev => [...prev, {
        id: `temp-${Math.random().toString(36).slice(2)}`,
        title: newChecklistTitle.trim(),
        completed: false,
        order: prev.length,
      }])
    }
    setNewChecklistTitle('')
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={currentMode === 'create' ? t('regulatoryUpdates.addArticle') : article?.title ?? ''}
      size="lg"
    >
      <div className="space-y-5">
        {/* View mode header badges */}
        {currentMode === 'view' && article && (
          <div className={`flex items-center gap-2 flex-wrap`}>
            <span className="text-xs font-bold text-emerald-600">{article.articleNumber}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[article.riskLevel])}>{riskLabel(article.riskLevel)}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[article.complianceStatus])}>{complianceLabel(article.complianceStatus)}</span>
          </div>
        )}

        {/* Tabs (view mode only) */}
        {currentMode === 'view' && article && (
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {(['details', 'versions', 'activity'] as ArticleTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveArticleTab(tab)}
                className={cn('px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer',
                  activeArticleTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab === 'details' ? t('regulatoryUpdates.tabOverview') :
                 tab === 'versions' ? t('regulatoryUpdates.articleVersionHistory') :
                 t('regulatoryUpdates.articleActivity')}
              </button>
            ))}
          </div>
        )}

        {/* Details tab (or create/edit mode) */}
        {(activeArticleTab === 'details' || currentMode !== 'view') && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleNumber')}</label>
                {isEditable ? (
                  <Input placeholder={t('regulatoryUpdates.articleNumberPlaceholder')} value={artNumber} onChange={(e) => setArtNumber(e.target.value)} />
                ) : (
                  <p className="text-sm font-bold text-emerald-600">{artNumber || '—'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.responsibleDepartment')}</label>
                {isEditable ? (
                  <EditableSelect
                    value={artDept || null}
                    onChange={(id) => setArtDept(id)}
                    items={allDepartments.map((dept) => ({
                      id: dept.name,
                      label: dept.name,
                      labelAr: dept.nameAr,
                      isDefault: dept.isDefault,
                    }))}
                    onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.name)}
                    onEdit={(id, label, labelAr) => {
                      const dept = allDepartments.find((d) => d.name === id)
                      if (dept) updateDepartment(dept.id, { name: label, nameAr: labelAr ?? label })
                    }}
                    onDelete={(id) => {
                      const dept = allDepartments.find((d) => d.name === id)
                      if (dept) removeDepartment(dept.id)
                    }}
                    placeholder={t('regulatoryUpdates.selectDepartment')}
                    isRTL={isRTL}
                  />
                ) : (
                  <p className="text-sm text-slate-700">{artDept ? deptLabel(artDept) : '—'}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('calendar.assignedTo')}</label>
              {isEditable ? (
                <EditableSelect
                  value={artAssignedTo || null}
                  onChange={(id) => setArtAssignedTo(id)}
                  items={teamMembers.filter((m) => m.status === 'active').map((m) => ({
                    // Send the team-member UUID, not the name — assigned_to
                    // is a UUID column on the server (HANDOFF #15).
                    id: m.id,
                    // Cosmetic: only append "— department" when the member has
                    // one; otherwise the label trails a dangling separator.
                    label: m.department ? `${m.name} — ${m.department}` : m.name,
                  }))}
                  placeholder={t('common.select' as any)}
                  isRTL={isRTL}
                />
              ) : (
                <p className="text-sm text-slate-700">{assignedMemberName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleTitle')}</label>
              {isEditable ? (
                <Input placeholder={t('regulatoryUpdates.articleTitlePlaceholder')} value={artTitle} onChange={(e) => setArtTitle(e.target.value)} />
              ) : (
                <p className="text-sm font-bold text-slate-900">{artTitle || '—'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.articleDescription')}</label>
              {isEditable ? (
                <textarea
                  className="flex w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm min-h-[80px] resize-none focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                  value={artDescription}
                  onChange={(e) => setArtDescription(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-600">{artDescription || '—'}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.riskLevel')}</label>
                {isEditable ? (
                  <EditableSelect
                    locked
                    value={artRiskLevel}
                    onChange={(id) => setArtRiskLevel(id as ArticleRiskLevel)}
                    items={[
                      { id: 'critical', label: t('regulatoryUpdates.critical') },
                      { id: 'high', label: t('regulatoryUpdates.high') },
                      { id: 'medium', label: t('regulatoryUpdates.medium') },
                      { id: 'low', label: t('regulatoryUpdates.low') },
                    ]}
                    isRTL={isRTL}
                  />
                ) : (
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[artRiskLevel])}>{riskLabel(artRiskLevel)}</span>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.complianceStatus')}</label>
                {isEditable ? (
                  <EditableSelect
                    locked
                    value={artComplianceStatus}
                    onChange={(id) => setArtComplianceStatus(id as ArticleComplianceStatus)}
                    items={[
                      { id: 'compliant', label: t('regulatoryUpdates.compliant') },
                      { id: 'in-progress', label: t('regulatoryUpdates.inProgress') },
                      { id: 'non-compliant', label: t('regulatoryUpdates.nonCompliant') },
                      { id: 'not-started', label: t('regulatoryUpdates.notStarted') },
                    ]}
                    isRTL={isRTL}
                  />
                ) : (
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[artComplianceStatus])}>{complianceLabel(artComplianceStatus)}</span>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div>
              <div className="border-b border-slate-100 pb-2 mb-3">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('regulatoryUpdates.articleChecklist')}</h4>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 mb-3">
                {(article ? article.checklist : localChecklist).map((item) => (
                  <div key={item.id} className={`flex items-center gap-3`}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => {
                        if (article) {
                          toggleChecklistItem(circularId, article.id, item.id)
                        } else {
                          setLocalChecklist(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i))
                        }
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                    />
                    <span className={cn('text-sm flex-1', item.completed ? 'line-through text-slate-400' : 'text-slate-700')}>{item.title}</span>
                    <button
                      onClick={() => {
                        if (article) {
                          deleteChecklistItem(circularId, article.id, item.id)
                        } else {
                          setLocalChecklist(prev => prev.filter(i => i.id !== item.id))
                        }
                      }}
                      className="cursor-pointer p-1 text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                    >
                      <Icon icon="lucide:x" className="text-xs" />
                    </button>
                  </div>
                ))}
                {(article ? article.checklist : localChecklist).length === 0 && (
                  <p className="text-xs text-slate-400">—</p>
                )}
              </div>
              <div className={`flex gap-2`}>
                <Input
                  placeholder={t('regulatoryUpdates.checklistItemPlaceholder')}
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem() }}
                  className="flex-1 h-11"
                />
                <button
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistTitle.trim()}
                  className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Icon icon="lucide:plus" className="text-xs" />
                  {t('regulatoryUpdates.addChecklistItem')}
                </button>
              </div>
            </div>

            {/* Attachments (view only) */}
            {article && (article.attachments?.length ?? 0) > 0 && (
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.articleAttachments')}</h4>
                <div className="space-y-1">
                  {article.attachments.map((att) => (
                    <div key={att.id} className={`flex items-center gap-2 p-2 bg-slate-50 rounded-lg`}>
                      <Icon icon="lucide:paperclip" className="text-slate-400 shrink-0 text-xs" />
                      <span className="text-xs text-slate-700">{att.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Versions tab — GAP-19: shared Version History list.
            W15-5: paginated 10/page via the shared Load More control. */}
        {activeArticleTab === 'versions' && currentMode === 'view' && article && (
          <>
            <VersionHistoryList
              items={(article.versions ?? []).map((ver) => ({
                version: ver.version,
                date: ver.date,
                author: ver.author,
                // Wave-19.4 / Item-3 — dual-store: pick the locale column.
                summary: isRTL ? ver.textAr : ver.textEn,
                fieldChanges: ver.fieldChanges ?? [],
                approved: ver.approved,
              }))}
              t={t}
            />
            {articleVersionPage?.hasMore && (
              <div className="mt-3">
                <TimelineLoadMore
                  loading={!!articleVersionPage?.loadingMore}
                  onClick={() => void loadMoreArticleVersions(circularId, article.id)}
                  label={t('regulatoryUpdates.loadMoreActivity')}
                  loadingLabel={t('regulatoryUpdates.loadingActivity')}
                />
              </div>
            )}
          </>
        )}

        {/* Activity tab — GAP-15: newest-at-top, lazy-loaded, paginated. */}
        {activeArticleTab === 'activity' && currentMode === 'view' && article && (
          <div>
            {(article.timeline?.length ?? 0) > 0 ? (
              <>
                <div className={`space-y-4 relative before:absolute ${isRTL ? 'before:right-2' : 'before:left-2'} before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100`}>
                  {(article.timeline ?? []).map((event) => (
                    <div key={event.id} className={`relative ${isRTL ? 'pr-8' : 'pl-8'}`}>
                      <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-1 w-4 h-4 rounded-full border-2 ${
                        event.status === 'completed' ? 'bg-emerald-100 border-emerald-500' :
                        event.status === 'active' ? 'bg-blue-100 border-blue-500' :
                        'bg-slate-100 border-slate-300'
                      }`} />
                      <p className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'}`}>
                        {/* Wave-19.1 / Q8 — dual-store: pick the column for
                            the current locale. Legacy/optimistic rows fall
                            back to `title` / `titleAr`. */}
                        {(isRTL
                          ? event.textAr || event.titleAr || event.title
                          : event.textEn || event.title) || ''}
                      </p>
                      <TimelineMeta
                        date={event.date}
                        user={event.user}
                        isRTL={isRTL}
                        muted={event.status === 'pending'}
                      />
                    </div>
                  ))}
                </div>
                {articleTimelinePage?.hasMore && (
                  <div className="mt-4">
                    <TimelineLoadMore
                      loading={!!articleTimelinePage?.loadingMore}
                      onClick={() => void loadMoreArticleTimeline(circularId, article.id)}
                      label={t('regulatoryUpdates.loadMoreActivity')}
                      loadingLabel={t('regulatoryUpdates.loadingActivity')}
                    />
                  </div>
                )}
              </>
            ) : articleTimelinePage?.loadingMore ? (
              <p className="text-sm text-slate-400">{t('regulatoryUpdates.loadingActivity')}</p>
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>
        )}

        {/* Missing-required hint — only shown in create/edit mode, matches the
            Register modal's pattern (Story 5 #5.4). */}
        {isEditable && (() => {
          const missing = [
            !artNumber && t('regulatoryUpdates.articleNumber'),
            !artDept && t('regulatoryUpdates.responsibleDepartment'),
            !artTitle && t('regulatoryUpdates.articleTitle'),
          ].filter(Boolean) as string[]
          if (missing.length === 0) return null
          return (
            <p className="text-xs text-rose-600 text-right pt-1">
              {t('regulatoryUpdates.missingRequired')}: {missing.join(', ')}
            </p>
          )
        })()}

        {/* Action buttons */}
        <div className={`flex justify-between items-center pt-4 border-t border-slate-100`}>
          <div className={`flex gap-2`}>
            {currentMode === 'view' && article && (
              <>
                <Button variant="outline" onClick={() => setCurrentMode('edit')}>
                  <Icon icon="lucide:pencil" className="w-4 h-4" />
                  {t('common.edit')}
                </Button>
                {!deleteConfirm ? (
                  <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteConfirm(true)}>
                    <Icon icon="lucide:trash-2" className="w-4 h-4" />
                    {t('regulatoryUpdates.deleteArticle')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-600 font-bold">{t('common.confirm')}?</span>
                    <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => {
                      // Close-on-click: close the modal the same tick. The
                      // store drops the article optimistically (and adjusts
                      // Implementation Progress), runs the DELETE in the
                      // background, and reverts + toasts on failure.
                      onClose()
                      void Promise.resolve(deleteArticle(circularId, article.id)).catch(() => {})
                    }}>
                      {t('common.delete')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>{t('common.cancel')}</Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={`flex gap-2`}>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            {isEditable && (
              <Button variant="primary" onClick={handleSave} disabled={!artTitle || !artNumber || !artDept}>
                {t('common.save')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
