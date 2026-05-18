'use client'

import { useState } from 'react'
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
  const { addArticle, updateArticle, deleteArticle, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useCircularStore()
  const { departments: allDepartments, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const teamMembers = useTeamStore(s => s.members)

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
  const [expandedArticleVersion, setExpandedArticleVersion] = useState<number | null>(null)

  const isEditable = currentMode === 'edit' || currentMode === 'create'

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
    if (currentMode === 'create') {
      addArticle(circularId, data)
    } else if (currentMode === 'edit' && article) {
      updateArticle(circularId, article.id, data)
    }
    onClose()
  }

  function handleAddChecklistItem() {
    if (!newChecklistTitle.trim()) return
    if (article) {
      addChecklistItem(circularId, article.id, newChecklistTitle.trim())
    } else {
      setLocalChecklist(prev => [...prev, {
        id: Math.random().toString(36).slice(2),
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
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[article.riskLevel])}>{article.riskLevel}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[article.complianceStatus])}>{article.complianceStatus}</span>
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
                    onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).name}
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
                  <p className="text-sm text-slate-700">{artDept || '—'}</p>
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
                    id: m.name,
                    label: `${m.name} — ${m.department}`,
                  }))}
                  placeholder={t('common.select' as any)}
                  isRTL={isRTL}
                />
              ) : (
                <p className="text-sm text-slate-700">{artAssignedTo || '—'}</p>
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
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', riskColors[artRiskLevel])}>{artRiskLevel}</span>
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
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', complianceColors[artComplianceStatus])}>{artComplianceStatus}</span>
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

        {/* Versions tab */}
        {activeArticleTab === 'versions' && currentMode === 'view' && article && (
          <div className="space-y-2">
            {(article.versions?.length ?? 0) > 0 ? (
              [...(article.versions ?? [])].reverse().map((ver) => (
                <div key={ver.version}>
                  <button
                    onClick={() => setExpandedArticleVersion(expandedArticleVersion === ver.version ? null : ver.version)}
                    className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
                  >
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">v{ver.version}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700">{ver.summary}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ver.date} • {ver.author}</p>
                    </div>
                    {ver.approved && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm shrink-0 mt-0.5" />}
                    <Icon icon={expandedArticleVersion === ver.version ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-slate-400 text-sm shrink-0 mt-0.5" />
                  </button>
                  {expandedArticleVersion === ver.version && Object.keys(ver.fieldChanges ?? {}).length > 0 && (
                    <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                        <span>{t('regulatoryUpdates.fieldChanged')}</span>
                        <span>{t('regulatoryUpdates.changedFrom')}</span>
                        <span>{t('regulatoryUpdates.changedTo')}</span>
                      </div>
                      {Object.entries(ver.fieldChanges ?? {}).map(([field, diff]) => (
                        <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                          <span className="font-bold text-slate-600">{field}</span>
                          <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                          <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {expandedArticleVersion === ver.version && Object.keys(ver.fieldChanges ?? {}).length === 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 mt-1">
                      <p className="text-xs text-slate-400">{ver.summary}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </div>
        )}

        {/* Activity tab — Fix 4: RTL-aware timeline */}
        {activeArticleTab === 'activity' && currentMode === 'view' && article && (
          <div>
            {(article.timeline?.length ?? 0) > 0 ? (
              <div className={`space-y-4 relative before:absolute ${isRTL ? 'before:right-2' : 'before:left-2'} before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100`}>
                {[...(article.timeline ?? [])].reverse().map((event) => (
                  <div key={event.id} className={`relative ${isRTL ? 'pr-8' : 'pl-8'}`}>
                    <div className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-1 w-4 h-4 rounded-full border-2 ${
                      event.status === 'completed' ? 'bg-emerald-100 border-emerald-500' :
                      event.status === 'active' ? 'bg-blue-100 border-blue-500' :
                      'bg-slate-100 border-slate-300'
                    }`} />
                    <p className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'}`}>
                      {isRTL && event.titleAr ? event.titleAr : event.title}
                    </p>
                    <p className={`text-[10px] ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-400'}`}>
                      {event.date}{event.user && ` • ${event.user}`}
                    </p>
                  </div>
                ))}
              </div>
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
                    <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => { deleteArticle(circularId, article.id); onClose() }}>
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
