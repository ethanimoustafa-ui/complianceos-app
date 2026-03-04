'use client'

import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCircularStore } from '@/stores/circular-store'
import type { Circular, CircularArticle } from '@/types'
import { WorkflowStepRow } from './WorkflowStepRow'
import { AdvanceWorkflowModal } from './AdvanceWorkflowModal'
import { ArticleDetailModal } from './ArticleDetailModal'
import { downloadFile, normalizeUrl, readFileAsDataUrl, getBONotifyLabel } from './utils'

type DetailTab = 'overview' | 'workflow' | 'activity'

type Props = {
  circular: Circular
  onClose: () => void
  onOpenBOModal: () => void
  onEditOpen: () => void
  onDeleteOpen: (id: string) => void
  t: (key: any, params?: Record<string, string>) => string
  isRTL: boolean
}

export function CircularDetailsContent({ circular, onClose, onOpenBOModal, onEditOpen, onDeleteOpen, t, isRTL }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const [articleModal, setArticleModal] = useState<{
    open: boolean
    article?: CircularArticle
    mode: 'create' | 'edit' | 'view'
  }>({ open: false, mode: 'create' })
  const [advanceConfirm, setAdvanceConfirm] = useState<{
    open: boolean; stepId: string; stepLabel: string
  }>({ open: false, stepId: '', stepLabel: '' })
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)
  const detailPdfRef = useRef<HTMLInputElement>(null)
  const capFileRef = useRef<HTMLInputElement>(null)
  const remFileRef = useRef<HTMLInputElement>(null)

  const {
    circulars: allCirculars,
    addCAPAttachment,
    addRemediationAttachment,
    removeCAPAttachment,
    removeRemediationAttachment,
    setPdfUrl,
    clearPdfUrl,
    approveCircularEditStep,
    rejectCircularEditStep,
  } = useCircularStore()

  // Always use fresh circular data from store
  const freshCircular = allCirculars.find(c => c.id === circular.id) ?? circular

  const priorityColors: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  }
  const statusColors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    'in-progress': 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-rose-100 text-rose-700',
  }

  const currentStep = freshCircular.workflowSteps?.find((s) => s.status === 'current')
  const currentPhaseIdx = currentStep?.phase ?? 0
  const phaseLabels: Record<number, string> = {
    0: t('regulatoryUpdates.phaseCAP'),
    1: t('regulatoryUpdates.phaseCorrectiveActionPlan'),
    2: t('regulatoryUpdates.phaseRemediation'),
  }
  const phaseByIndex = [0, 1, 2] as const
  const stepsGrouped = phaseByIndex.map((phase) =>
    (freshCircular.workflowSteps ?? []).filter((s) => s.phase === phase)
  )

  const tabs: { id: DetailTab; label: string; icon: string }[] = [
    { id: 'overview', label: t('regulatoryUpdates.tabOverview'), icon: 'lucide:layout-dashboard' },
    { id: 'workflow', label: t('regulatoryUpdates.tabWorkflow'), icon: 'lucide:git-branch' },
    { id: 'activity', label: t('regulatoryUpdates.tabActivity'), icon: 'lucide:activity' },
  ]

  const getTabIconStyle = (tabId: DetailTab) =>
    tabId === 'workflow' && isRTL ? { transform: 'rotate(180deg)' } : undefined

  return (
    <div className={`flex flex-col md:flex-row gap-6`}>
      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Status / Priority row */}
        <div className={`flex items-center gap-2 mb-4 flex-wrap`}>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold', statusColors[freshCircular.status])}>
            {freshCircular.status.replace('-', ' ').toUpperCase()}
          </span>
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold', priorityColors[freshCircular.priority])}>
            {freshCircular.priority.toUpperCase()}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-700">
            {phaseLabels[currentPhaseIdx]}
          </span>
        </div>

        {/* Tabs */}
        <div className={`flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon icon={tab.icon} className="text-sm" style={getTabIconStyle(tab.id)} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.circularDescription')}</h3>
              {freshCircular.description ? (
                <p className="text-sm text-slate-600 leading-relaxed">{freshCircular.description}</p>
              ) : (
                <p className="text-sm text-slate-400 italic">—</p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-2">
                {t('regulatoryUpdates.uploadCircularPdf')}
              </h3>
              {freshCircular.referenceUrl && (
                <div className="mb-2">
                  <a href={normalizeUrl(freshCircular.referenceUrl)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                    <Icon icon="lucide:external-link" className="text-xs" />
                    {t('regulatoryUpdates.viewOnline')}
                  </a>
                </div>
              )}
              <input
                ref={detailPdfRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    setPdfUrl(freshCircular.id, dataUrl)
                  }
                  e.target.value = ''
                }}
              />
              {freshCircular.pdfUrl ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Icon icon="lucide:file-text" className="text-2xl text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-700 truncate">Circular PDF</p>
                    <p className="text-xs text-emerald-600">{t('regulatoryUpdates.pdfAttached')}</p>
                  </div>
                  <button
                    onClick={() => freshCircular.pdfUrl && downloadFile(freshCircular.pdfUrl, `${freshCircular.reference}.pdf`)}
                    className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.downloadPdf')}
                  >
                    <Icon icon="lucide:download" className="text-base" />
                  </button>
                  <button
                    onClick={() => detailPdfRef.current?.click()}
                    className="p-2 rounded-lg hover:bg-emerald-100 text-slate-500 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.uploadMoreFiles')}
                  >
                    <Icon icon="lucide:upload" className="text-base" />
                  </button>
                  <button
                    onClick={() => clearPdfUrl(freshCircular.id)}
                    className="p-2 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                    title={t('regulatoryUpdates.removePdf')}
                  >
                    <Icon icon="lucide:trash-2" className="text-base" />
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                  onClick={() => detailPdfRef.current?.click()}
                >
                  <Icon icon="lucide:upload-cloud" className="text-3xl text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{t('regulatoryUpdates.fileUploadHint')}</p>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{t('regulatoryUpdates.affectedDepartments')}</h3>
              {freshCircular.departments.length > 0 ? (
                <div className={`flex flex-wrap gap-2`}>
                  {freshCircular.departments.map((dept) => (
                    <span key={dept} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{dept}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{t('regulatoryUpdates.implementationProgress')}</h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className={`flex justify-between text-sm font-bold`}>
                  <span className="text-slate-600">{freshCircular.progress}%</span>
                  <span className="text-slate-400">{t('regulatoryUpdates.due')}: {freshCircular.dueDate}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${freshCircular.progress}%` }} />
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 flex-1">
                  {t('regulatoryUpdates.articleBreakdown')}
                </h3>
                <button
                  onClick={() => setArticleModal({ open: true, mode: 'create' })}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer ml-4 shrink-0"
                >
                  <Icon icon="lucide:plus" />
                  {t('regulatoryUpdates.addArticle')}
                </button>
              </div>
              {freshCircular.articles.length > 0 ? (
                <div className="space-y-2">
                  {freshCircular.articles.map((art) => {
                    const doneItems = art.checklist?.filter(c => c.completed).length ?? 0
                    const totalItems = art.checklist?.length ?? 0
                    return (
                      <button
                        key={art.id}
                        className="w-full p-3 bg-white border border-slate-100 rounded-xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors text-left cursor-pointer"
                        onClick={() => setArticleModal({ open: true, article: art, mode: 'view' })}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-600">{art.articleNumber}</span>
                          <div className="flex items-center gap-2">
                            {totalItems > 0 && <span className="text-[10px] font-bold text-slate-500">{doneItems}/{totalItems}</span>}
                            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                              art.complianceStatus === 'compliant' ? 'bg-emerald-100 text-emerald-700' :
                              art.complianceStatus === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                              art.complianceStatus === 'non-compliant' ? 'bg-rose-100 text-rose-700' :
                              'bg-slate-100 text-slate-600'
                            )}>{art.complianceStatus}</span>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-slate-700 mt-1">{art.title}</p>
                        {totalItems > 0 && (
                          <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${(doneItems / totalItems) * 100}%` }} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">{t('regulatoryUpdates.notStarted')}</p>
              )}
            </section>
          </div>
        )}

        {/* ── Workflow tab ─────────────────────────────────────────────────── */}
        {activeTab === 'workflow' && (
          <div className="space-y-6">
            {phaseByIndex.map((phase) => (
              <section key={phase}>
                <h3 className={`text-xs font-black text-slate-400 uppercase tracking-widest mb-3`}>
                  {phaseLabels[phase]}
                </h3>
                <div className="space-y-2 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                  {stepsGrouped[phase].map((step) => (
                    <WorkflowStepRow
                      key={step.id}
                      step={step}
                      onAdvance={() => setAdvanceConfirm({ open: true, stepId: step.id, stepLabel: step.label })}
                      isRTL={isRTL}
                    />
                  ))}
                  {stepsGrouped[phase].length === 0 && (
                    <p className="text-xs text-slate-400 pl-8">—</p>
                  )}
                </div>
              </section>
            ))}

            {/* CAP Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('regulatoryUpdates.correctiveActionPlanDocuments')}
                </h3>
                <button
                  onClick={() => capFileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <Icon icon="lucide:upload" className="text-xs" />
                  {t('regulatoryUpdates.uploadCapDocument')}
                </button>
              </div>
              <input
                ref={capFileRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    addCAPAttachment(freshCircular.id, { name: file.name, size: file.size, dataUrl, type: file.type })
                  }
                  e.target.value = ''
                }}
              />
              {(freshCircular.capAttachments?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  {(freshCircular.capAttachments ?? []).map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Icon icon="lucide:file-text" className="text-slate-400 shrink-0 text-sm" />
                      <span className="text-xs text-slate-700 flex-1 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">{att.uploadedAt?.slice(0, 10)}</span>
                      {att.dataUrl && (
                        <button
                          onClick={() => downloadFile(att.dataUrl!, att.name)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <Icon icon="lucide:download" className="text-xs" />
                        </button>
                      )}
                      <button
                        onClick={() => removeCAPAttachment(freshCircular.id, att.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('regulatoryUpdates.noAttachments')}</p>
              )}
            </section>

            {/* Remediation Evidence Documents */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {t('regulatoryUpdates.remediationEvidenceDocuments')}
                </h3>
                <button
                  onClick={() => remFileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  <Icon icon="lucide:upload" className="text-xs" />
                  {t('regulatoryUpdates.uploadRemediationDoc')}
                </button>
              </div>
              <input
                ref={remFileRef}
                type="file"
                accept=".pdf,.docx"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  for (const file of files) {
                    const dataUrl = await readFileAsDataUrl(file)
                    addRemediationAttachment(freshCircular.id, { name: file.name, size: file.size, dataUrl, type: file.type })
                  }
                  e.target.value = ''
                }}
              />
              {(freshCircular.remediationAttachments?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  {(freshCircular.remediationAttachments ?? []).map((att) => (
                    <div key={att.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <Icon icon="lucide:file-text" className="text-slate-400 shrink-0 text-sm" />
                      <span className="text-xs text-slate-700 flex-1 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">{att.uploadedAt?.slice(0, 10)}</span>
                      {att.dataUrl && (
                        <button
                          onClick={() => downloadFile(att.dataUrl!, att.name)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <Icon icon="lucide:download" className="text-xs" />
                        </button>
                      )}
                      <button
                        onClick={() => removeRemediationAttachment(freshCircular.id, att.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-500 cursor-pointer"
                      >
                        <Icon icon="lucide:x" className="text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('regulatoryUpdates.noAttachments')}</p>
              )}
            </section>
          </div>
        )}

        {/* ── Activity tab ─────────────────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <section>
              <h3 className={`text-xs font-black text-slate-400 uppercase tracking-widest mb-4`}>
                {t('regulatoryUpdates.activityTimeline')}
              </h3>
              {(freshCircular.timeline?.length ?? 0) > 0 ? (
                // Fix 3: RTL-aware connector line and item padding
                <div className={`space-y-4 relative before:absolute ${isRTL ? 'before:right-2' : 'before:left-2'} before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100`}>
                  {[...(freshCircular.timeline ?? [])].reverse().map((event) => (
                    <div key={event.id} className={`relative ${isRTL ? 'pr-8' : 'pl-8'}`}>
                      <div
                        className={`absolute ${isRTL ? 'right-0' : 'left-0'} top-1 w-4 h-4 rounded-full border-2 ${
                          event.status === 'completed'
                            ? 'bg-emerald-100 border-emerald-500'
                            : event.status === 'active'
                              ? 'bg-blue-100 border-blue-500'
                              : 'bg-slate-100 border-slate-300'
                        }`}
                      />
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
            </section>

            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                {t('regulatoryUpdates.versionHistory')}
              </h3>
              {(freshCircular.versions?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {[...(freshCircular.versions ?? [])].reverse().map((ver) => (
                    <div key={ver.version}>
                      <button
                        onClick={() => setExpandedVersion(expandedVersion === ver.version ? null : ver.version)}
                        className="w-full flex items-start gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-left"
                      >
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold font-mono shrink-0">v{ver.version}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700">{ver.changes}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{ver.date} • {ver.author}</p>
                        </div>
                        {ver.approved && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm shrink-0 mt-0.5" />}
                        <Icon icon={expandedVersion === ver.version ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="text-slate-400 text-sm shrink-0 mt-0.5" />
                      </button>
                      {expandedVersion === ver.version && ver.fieldChanges && Object.keys(ver.fieldChanges).length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3 mt-1 space-y-1.5">
                          <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                            <span>{t('regulatoryUpdates.fieldChanged')}</span>
                            <span>{t('regulatoryUpdates.changedFrom')}</span>
                            <span>{t('regulatoryUpdates.changedTo')}</span>
                          </div>
                          {Object.entries(ver.fieldChanges).map(([field, diff]) => (
                            <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                              <span className="font-bold text-slate-600">{field}</span>
                              <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                              <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </section>
          </div>
        )}
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className={`w-full md:w-72 bg-slate-50 -mx-6 -mb-4 md:mx-0 md:mb-0 p-6 md:rounded-xl space-y-5`}>
        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.authority')}</h3>
          <p className="text-sm font-bold text-slate-900">{freshCircular.authority}</p>
          <p className="text-xs font-mono text-slate-500">{freshCircular.reference}</p>
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.applicability')}</h3>
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-bold',
            freshCircular.applicability === 'applicable' ? 'bg-emerald-100 text-emerald-700' :
            freshCircular.applicability === 'not-applicable' ? 'bg-slate-100 text-slate-600' :
            'bg-amber-100 text-amber-700'
          )}>
            {freshCircular.applicability === 'applicable' ? t('regulatoryUpdates.applicable') :
             freshCircular.applicability === 'not-applicable' ? t('regulatoryUpdates.notApplicable') :
             t('regulatoryUpdates.applicabilityPending')}
          </span>
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.currentPhase')}</h3>
          <p className="text-xs font-bold text-violet-700">{phaseLabels[currentPhaseIdx]}</p>
          {currentStep && (
            <p className="text-[10px] text-slate-500 mt-0.5">{isRTL ? currentStep.labelAr : currentStep.label}</p>
          )}
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-2">
            {t('regulatoryUpdates.keyDates')}
          </h3>
          <div className="space-y-1.5">
            {freshCircular.issuanceDate && (
              <div className={`flex justify-between text-xs gap-2`}>
                <span className="text-slate-500">{t('regulatoryUpdates.issuanceDate')}</span>
                <span className="font-bold text-slate-700 shrink-0">{freshCircular.issuanceDate}</span>
              </div>
            )}
            {freshCircular.dueDate && (
              <div className={`flex justify-between text-xs gap-2`}>
                <span className="text-slate-500">{t('regulatoryUpdates.implementationDeadline')}</span>
                <span className={`font-bold shrink-0 ${
                  new Date(freshCircular.dueDate) < new Date() ? 'text-rose-600' : 'text-slate-700'
                }`}>
                  {freshCircular.dueDate}
                </span>
              </div>
            )}
            {freshCircular.capDeadline && (
              <div className={`flex justify-between text-xs gap-2`}>
                <span className="text-slate-500">{t('regulatoryUpdates.capDeadline')}</span>
                <span className={`font-bold shrink-0 ${
                  new Date(freshCircular.capDeadline) < new Date() ? 'text-rose-600' : 'text-slate-700'
                }`}>
                  {freshCircular.capDeadline}
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase mb-1">{t('regulatoryUpdates.businessOwner')}</h3>
          {freshCircular.businessOwnerDepartment ? (
            <p className="text-sm font-bold text-slate-700">{freshCircular.businessOwnerDepartment}</p>
          ) : (
            <p className="text-xs text-slate-400">—</p>
          )}
        </div>

        {/* Pending edit approval chain */}
        {freshCircular.pendingEdit?.status === 'pending' && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-bold text-amber-700 mb-2">{t('regulatoryUpdates.editApprovalPending')}</p>
            {freshCircular.pendingEdit.fieldChanges && Object.keys(freshCircular.pendingEdit.fieldChanges).length > 0 && (
              <div className="mb-3 space-y-1">
                <div className="grid grid-cols-3 gap-1 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-amber-100 pb-1">
                  <span>{t('regulatoryUpdates.fieldChanged')}</span>
                  <span>{t('regulatoryUpdates.changedFrom')}</span>
                  <span>{t('regulatoryUpdates.changedTo')}</span>
                </div>
                {Object.entries(freshCircular.pendingEdit.fieldChanges).map(([field, diff]) => (
                  <div key={field} className="grid grid-cols-3 gap-1 text-[10px]">
                    <span className="font-bold text-slate-600">{field}</span>
                    <span className="text-rose-600 line-through truncate">{diff.from || '—'}</span>
                    <span className="text-emerald-600 truncate">{diff.to || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            {freshCircular.pendingEdit.approvals.map(step => (
              <div key={step.id} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-700">{isRTL ? step.roleAr : step.role}</span>
                {step.status === 'pending' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => approveCircularEditStep(freshCircular.id, step.id, '')}
                      className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded cursor-pointer hover:bg-emerald-700"
                    >
                      {t('regulatoryUpdates.approveEdit')}
                    </button>
                    <button
                      onClick={() => rejectCircularEditStep(freshCircular.id, step.id, '')}
                      className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] rounded cursor-pointer hover:bg-rose-200"
                    >
                      {t('regulatoryUpdates.rejectEdit')}
                    </button>
                  </div>
                )}
                {step.status === 'approved' && <Icon icon="lucide:check-circle" className="text-emerald-500 text-sm" />}
                {step.status === 'rejected' && <Icon icon="lucide:x-circle" className="text-rose-500 text-sm" />}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-3 border-t border-slate-200">
          <Button variant="outline" className="w-full" onClick={onEditOpen}>
            <Icon icon="lucide:pencil" className="w-4 h-4" />
            {t('regulatoryUpdates.editCircular')}
          </Button>
          <Button variant="outline" className="w-full" onClick={onOpenBOModal}>
            <Icon icon="lucide:user-check" className="w-4 h-4" />
            {freshCircular.businessOwnerDepartment
              ? t('regulatoryUpdates.changeBusinessOwner')
              : t('regulatoryUpdates.assignBusinessOwner')}
          </Button>
          {freshCircular.businessOwnerDepartment && (
            <Button variant="outline" className="w-full" onClick={() => {
              const phase = currentPhaseIdx
              if (phase === 2) {
                const subject = t('regulatoryUpdates.notifyBoPhase2Subject', { reference: freshCircular.reference })
                const body = t('regulatoryUpdates.notifyBoPhase2Body', {
                  reference: freshCircular.reference,
                  title: freshCircular.title,
                  deadline: freshCircular.dueDate ?? '—',
                })
                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
              } else {
                const subject = t('regulatoryUpdates.notifyBoPhase1Subject', { reference: freshCircular.reference })
                const body = t('regulatoryUpdates.notifyBoPhase1Body', {
                  reference: freshCircular.reference,
                  title: freshCircular.title,
                  deadline: freshCircular.capDeadline ?? '—',
                })
                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
              }
            }}>
              <Icon icon="lucide:mail" className="w-4 h-4" />
              {getBONotifyLabel(freshCircular, t)}
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => onDeleteOpen(freshCircular.id)}
          >
            <Icon icon="lucide:trash-2" className="w-4 h-4" />
            {t('regulatoryUpdates.deleteCircular')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>

      {/* ── Article Detail Modal ──────────────────────────────────────────── */}
      {articleModal.open && (
        <ArticleDetailModal
          circularId={freshCircular.id}
          article={articleModal.article
            ? freshCircular.articles.find(a => a.id === articleModal.article!.id) ?? articleModal.article
            : undefined
          }
          mode={articleModal.mode}
          onClose={() => setArticleModal({ open: false, mode: 'create' })}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── Advance Workflow Modal ────────────────────────────────────────── */}
      <AdvanceWorkflowModal
        isOpen={advanceConfirm.open}
        stepId={advanceConfirm.stepId}
        stepLabel={advanceConfirm.stepLabel}
        circularId={freshCircular.id}
        onClose={() => setAdvanceConfirm({ open: false, stepId: '', stepLabel: '' })}
        isRTL={isRTL}
        t={t}
      />
    </div>
  )
}
