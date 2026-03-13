'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { useHelpStore } from '@/stores/help-store'
import { useTranslation } from '@/i18n'
import { HelpPanelAr } from './help-panel-ar'

const CATEGORIES = [
  'Getting Started',
  'Calendar',
  'Reports',
  'Compliance',
  'Team Management',
  'Settings',
]

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpPanel({ isOpen, onClose }: HelpPanelProps) {
  const { t, isRTL } = useTranslation()
  const { articles, searchArticles, getByCategory, getArticle, trackView } = useHelpStore()

  if (isRTL) return <HelpPanelAr isOpen={isOpen} onClose={onClose} />
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null)

  const activeArticle = activeArticleId ? getArticle(activeArticleId) : null

  const filteredArticles = search
    ? searchArticles(search)
    : activeCategory
      ? getByCategory(activeCategory)
      : articles

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (activeArticleId) { setActiveArticleId(null) }
      else { onClose() }
    }
  }, [onClose, activeArticleId])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  useEffect(() => {
    if (!isOpen) { setActiveArticleId(null); setSearch(''); setActiveCategory(null) }
  }, [isOpen])

  const openArticle = (id: string) => {
    setActiveArticleId(id)
    trackView(id)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

        <div className="ms-auto relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-slide-in-right">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">{t('sidebar.helpCenter')}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="relative">
              <Icon icon="lucide:search" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveCategory(null) }}
                placeholder={t('sidebar.searchHelp')}
                className="w-full ps-10 pe-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Category pills */}
          {!search && (
            <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-slate-100">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
                  !activeCategory ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {t('common.all')}
              </button>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
                    activeCategory === cat ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Article list */}
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Icon icon="lucide:search-x" className="text-4xl mb-3" />
                <p className="text-sm font-medium">{t('sidebar.noHelpResults')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredArticles.map(article => (
                  <button
                    key={article.id}
                    onClick={() => openArticle(article.id)}
                    className="w-full text-start p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                        <Icon icon={article.icon} className="text-xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{article.title}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{article.summary}</p>
                        <span className="inline-block mt-2 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {article.category}
                        </span>
                      </div>
                      <Icon icon="lucide:chevron-right" className="text-slate-300 shrink-0 mt-2" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Article Detail Modal — centered popup */}
      <Modal
        isOpen={!!activeArticle}
        onClose={() => setActiveArticleId(null)}
        title={activeArticle?.title}
        size="lg"
      >
        {activeArticle && (
          <div className="space-y-6">
            {/* Category + Icon header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Icon icon={activeArticle.icon} className="text-2xl" />
              </div>
              <div>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  {activeArticle.category}
                </span>
              </div>
            </div>

            {/* Video placeholder */}
            <div className="w-full aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center gap-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 to-slate-900/80" />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                  <Icon icon="lucide:play" className="text-3xl text-white ms-1" />
                </div>
                <p className="text-sm font-medium text-white/80">{t('sidebar.videoComingSoon')}</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-sm text-slate-500 mb-2 font-bold uppercase tracking-wider">{t('common.description')}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{activeArticle.content}</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
