'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Skeleton } from '@/components/ui/skeleton'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useComplianceSettingsStore } from '@/stores/compliance-settings-store'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { FrameworkConfigModal } from './FrameworkConfigModal'
import { AddFrameworkModal } from './AddFrameworkModal'
import type { RegulatoryBodyId, FrameworkConfig } from '@/types'

const iconColorMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  teal: 'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
  slate: 'bg-slate-100 text-slate-600',
}

export function FrameworksSection() {
  const { t, language } = useTranslation()
  const { frameworks, toggleEnabled, pinnedIds, pinFramework, unpinFramework, replacePinned } = useFrameworkConfigStore()
  const isLoadingFrameworks = useFrameworkConfigStore((s) => s.isLoading)
  const lastFetched = useFrameworkConfigStore((s) => s.lastFetched)

  // Company-wide compliance target (singleton settings row). This is the
  // dashboard's headline Compliance Health threshold — independent of any
  // individual framework's own threshold. It had no UI until now, so it sat
  // pinned at the 90% default; hydrate + expose it here.
  const targetScore = useComplianceSettingsStore((s) => s.targetScore)
  const setTargetScore = useComplianceSettingsStore((s) => s.setTargetScore)
  const fetchComplianceSettings = useComplianceSettingsStore((s) => s.fetch)
  const isSavingTarget = useComplianceSettingsStore((s) => s.isMutating)
  useEffect(() => {
    void fetchComplianceSettings()
  }, [fetchComplianceSettings])
  // Commit on blur / Enter (matches the page's auto-save model), clamped 0–100.
  // The field is uncontrolled and keyed on `targetScore`, so the initial fetch
  // (or a save) re-seeds it without a state-mirroring effect. We also correct
  // the DOM value in place to cover the "clamps back to the current value" edge.
  function commitTargetScore(el: HTMLInputElement) {
    const next = Math.min(100, Math.max(0, Number(el.value) || 0))
    el.value = String(next)
    if (next !== targetScore) void setTargetScore(next)
  }

  const [configureId, setConfigureId] = useState<RegulatoryBodyId | null>(null)
  const [showAllModal, setShowAllModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [replaceDropdownFor, setReplaceDropdownFor] = useState<RegulatoryBodyId | null>(null)
  const [allSearchQuery, setAllSearchQuery] = useState('')

  const pinnedFrameworks = frameworks.filter((f) => pinnedIds.includes(f.id))

  const allFiltered = frameworks.filter((f) => {
    if (!allSearchQuery) return true
    const q = allSearchQuery.toLowerCase()
    return (
      f.name.toLowerCase().includes(q) ||
      f.nameAr.includes(q) ||
      f.description.toLowerCase().includes(q)
    )
  })
  const correspondenceFiltered = allFiltered.filter((f) => f.correspondenceBased)
  const selfAssessmentFiltered = allFiltered.filter((f) => !f.correspondenceBased)

  function handlePin(id: RegulatoryBodyId) {
    if (pinnedIds.includes(id)) {
      unpinFramework(id)
    } else if (pinnedIds.length < 3) {
      pinFramework(id)
    } else {
      setReplaceDropdownFor(id)
    }
  }

  function handleReplace(oldId: RegulatoryBodyId, newId: RegulatoryBodyId) {
    replacePinned(oldId, newId)
    setReplaceDropdownFor(null)
  }

  function renderFrameworkRow(fw: FrameworkConfig) {
    const name = language === 'ar' ? fw.nameAr : fw.name
    const isPinned = pinnedIds.includes(fw.id)
    return (
      <div
        key={fw.id}
        className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 ${iconColorMap[fw.iconColor] || 'bg-slate-50 text-slate-600'} rounded-lg`}>
            <Icon icon={fw.icon} className="text-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-900">{name}</p>
              {isPinned && <Icon icon="lucide:pin" className="text-emerald-500 text-xs" />}
            </div>
            <p className="text-xs text-slate-500">
              {language === 'ar' ? fw.descriptionAr : fw.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Pin button — correspondence-based only. Self-assessment
              frameworks aren't pinnable because pinning drives the scored
              dashboard, which excludes them. */}
          {fw.correspondenceBased && (
            <Gate perm="Configure Frameworks">
            <div className="relative">
              <button
                onClick={() => handlePin(fw.id)}
                className={`text-sm transition-colors cursor-pointer ${
                  isPinned ? 'text-emerald-500 hover:text-emerald-600' : 'text-slate-300 hover:text-slate-500'
                }`}
                title={isPinned ? t('settings.unpinFramework') : t('settings.pinFramework')}
              >
                <Icon icon={isPinned ? 'lucide:pin-off' : 'lucide:pin'} />
              </button>
              {replaceDropdownFor === fw.id && (
                <div className="absolute top-8 end-0 z-10 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-56">
                  <p className="text-xs font-bold text-slate-700 mb-2">{t('settings.replacePin')}</p>
                  {pinnedIds.map((pid) => {
                    const pinFw = frameworks.find((f) => f.id === pid)
                    if (!pinFw) return null
                    return (
                      <button
                        key={pid}
                        onClick={() => handleReplace(pid, fw.id)}
                        className="w-full text-start text-xs text-slate-600 hover:bg-slate-50 px-2 py-1.5 rounded-lg cursor-pointer"
                      >
                        {language === 'ar' ? pinFw.nameAr : pinFw.name}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setReplaceDropdownFor(null)}
                    className="w-full text-start text-xs text-slate-400 hover:text-slate-600 px-2 py-1 mt-1 cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}
            </div>
            </Gate>
          )}
          <button
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
              fw.enabled ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
            onClick={() => toggleEnabled(fw.id)}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                fw.enabled ? 'start-4' : 'start-0.5'
              }`}
            />
          </button>
          <Gate perm="Configure Frameworks">
            <button
              onClick={() => { setShowAllModal(false); setConfigureId(fw.id) }}
              className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              {t('settings.configure')}
            </button>
          </Gate>
        </div>
      </div>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.complianceFrameworks')}</h2>
          <p className="text-sm text-slate-500">{t('settings.manageFrameworks')}</p>
        </div>
      </div>

      {/* Company-wide compliance target — the dashboard's headline Compliance
          Health threshold, independent of any single framework. */}
      <div className="mb-8 bg-white border border-slate-200 rounded-2xl p-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Icon icon="lucide:target" className="text-xl" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{t('settings.companyThresholdTitle')}</h3>
              {isSavingTarget && <Icon icon="lucide:loader-2" className="text-emerald-500 text-sm animate-spin" />}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 max-w-md">{t('settings.companyThresholdHelp')}</p>
          </div>
        </div>
        <Gate perm="Configure Frameworks">
          <div className="flex items-center gap-2 shrink-0">
            <input
              key={targetScore}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              defaultValue={targetScore}
              onBlur={(e) => commitTargetScore(e.target)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label={t('settings.companyThresholdTitle')}
              className="w-20 px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-sm font-bold text-slate-400">%</span>
          </div>
        </Gate>
      </div>

      <p className="text-xs font-medium text-slate-400 mb-3">{t('settings.pinnedFrameworks')} ({pinnedIds.length}/3)</p>

      {isLoadingFrameworks && lastFetched === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pinnedFrameworks.map((fw) => (
          <FrameworkCard
            key={fw.id}
            framework={fw}
            language={language}
            isPinned
            onToggle={() => toggleEnabled(fw.id)}
            onConfigure={() => setConfigureId(fw.id)}
            onPin={() => unpinFramework(fw.id)}
            t={t}
          />
        ))}
      </div>
      )}

      <div className="mt-6 text-center">
        <Gate perm="Configure Frameworks">
          <button
            onClick={() => setShowAllModal(true)}
            className="text-sm font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
          >
            {t('settings.viewAllFrameworks')} &rarr;
          </button>
        </Gate>
      </div>

      {/* View All Frameworks Modal */}
      <Modal
        isOpen={showAllModal}
        onClose={() => { setShowAllModal(false); setAllSearchQuery('') }}
        title={t('settings.viewAllFrameworks')}
        subtitle={t('settings.manageFrameworks')}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon icon="lucide:search" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
              <input
                type="text"
                value={allSearchQuery}
                onChange={(e) => setAllSearchQuery(e.target.value)}
                placeholder={t('settings.searchFrameworks')}
                className="w-full ps-9 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <Gate perm="Configure Frameworks">
              <button
                onClick={() => setShowAddModal(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Icon icon="lucide:plus" className="text-sm" />
                <span>{t('settings.addFramework')}</span>
              </button>
            </Gate>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-6">
            {correspondenceFiltered.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-700 shrink-0">
                    {t('settings.correspondenceBased')}
                  </h4>
                  <div className="flex-1 h-px bg-gradient-to-r from-indigo-200 to-transparent" />
                  <span className="text-[10px] font-bold text-slate-400">{correspondenceFiltered.length}</span>
                </div>
                <div className="space-y-2">
                  {correspondenceFiltered.map((fw) => renderFrameworkRow(fw))}
                </div>
              </section>
            )}
            {selfAssessmentFiltered.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500 shrink-0">
                    {t('settings.selfAssessment')}
                  </h4>
                  <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                  <span className="text-[10px] font-bold text-slate-400">{selfAssessmentFiltered.length}</span>
                </div>
                <div className="space-y-2">
                  {selfAssessmentFiltered.map((fw) => renderFrameworkRow(fw))}
                </div>
              </section>
            )}
          </div>
        </div>
      </Modal>

      {configureId && (
        <FrameworkConfigModal
          frameworkId={configureId}
          isOpen={!!configureId}
          onClose={() => setConfigureId(null)}
        />
      )}

      <AddFrameworkModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </section>
  )
}

function FrameworkCard({
  framework,
  language,
  isPinned,
  onToggle,
  onConfigure,
  onPin,
  t,
}: {
  framework: FrameworkConfig
  language: string
  isPinned: boolean
  onToggle: () => void
  onConfigure: () => void
  onPin: () => void
  t: (key: any) => string
}) {
  const name = language === 'ar' ? framework.nameAr : framework.name
  const description = language === 'ar' ? framework.descriptionAr : framework.description

  return (
    <div className="relative bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-emerald-500 hover:-translate-y-0.5 transition-all">
      {isPinned && (
        <div className="absolute top-3 end-3">
          <Icon icon="lucide:pin" className="text-emerald-500 text-sm" />
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 ${iconColorMap[framework.iconColor] || 'bg-slate-50 text-slate-600'} rounded-xl`}>
          <Icon icon={framework.icon} className="text-2xl" />
        </div>
        <div className="flex items-center gap-2">
          <Gate perm="Configure Frameworks">
            <button
              onClick={onPin}
              className="text-slate-300 hover:text-emerald-500 transition-colors cursor-pointer"
              title={t('settings.unpinFramework')}
            >
              <Icon icon="lucide:pin-off" className="text-sm" />
            </button>
          </Gate>
          <button
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
              framework.enabled ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
            onClick={onToggle}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                framework.enabled ? 'start-4' : 'start-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-bold text-slate-900">{name}</h3>
        <span
          className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border ${
            framework.correspondenceBased
              ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
              : 'text-slate-600 bg-slate-50 border-slate-200'
          }`}
          title={framework.correspondenceBased ? t('settings.correspondenceBasedHelp') : t('settings.selfAssessmentHelp')}
        >
          {framework.correspondenceBased ? t('settings.correspondenceBadge') : t('settings.selfAssessmentBadge')}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1 mb-4">{description}</p>
      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <span className={`text-[10px] font-black ${framework.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
          {framework.enabled ? t('common.active') : t('settings.disabled')}
        </span>
        <Gate perm="Configure Frameworks">
          <button
            onClick={onConfigure}
            className={`text-xs font-bold cursor-pointer ${
              framework.enabled ? 'text-slate-400 hover:text-slate-900' : 'text-emerald-600'
            }`}
          >
            {framework.enabled ? t('settings.configure') : t('settings.enableNow')} &rarr;
          </button>
        </Gate>
      </div>
    </div>
  )
}
