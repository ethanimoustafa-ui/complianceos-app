'use client'

// Settings → Letter Templates. Owner decision: the configurables "Letter Type"
// entry now lists the actual letter TEMPLATES (a letter type's inherent
// function), not bare type labels — so templates created on the Letters page (or
// here) show up in one place. Create/edit reuse the same TemplateEditForm the
// Letters page uses; delete is optimistic.

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { Gate } from '@/components/auth/gate'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { useTranslation, type TranslationKey } from '@/i18n'
import { useLetterTemplateStore } from '@/stores/letter-template-store'
import { useLetterTypeStore } from '@/stores/letter-type-store'
import { TemplateEditForm } from '@/components/correspondence/letters'
import { pushToast } from '@/stores/toast-store'
import type { LetterTemplate } from '@/types'

type SortCol = 'name' | 'type' | 'lastModified' | 'usageCount'

const typeColors: Record<string, string> = {
  'non-objection': 'emerald', inquiry: 'blue', submission: 'amber', notification: 'rose',
}
const typeIcons: Record<string, string> = {
  'non-objection': 'lucide:user-check', inquiry: 'lucide:help-circle', submission: 'lucide:file-up', notification: 'lucide:alert-triangle',
}

export function LetterTemplatesSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const templates = useLetterTemplateStore((s) => s.templates)
  const isLoading = useLetterTemplateStore((s) => s.isLoading)
  const createTemplate = useLetterTemplateStore((s) => s.create)
  const updateTemplate = useLetterTemplateStore((s) => s.update)
  const deleteTemplate = useLetterTemplateStore((s) => s.delete)
  const fetchTemplates = useLetterTemplateStore((s) => s.fetchAll)
  // Letter TYPE labels resolve the type column to a friendly name.
  const letterTypes = useLetterTypeStore((s) => s.types)
  const fetchTypes = useLetterTypeStore((s) => s.fetchAll)

  useEffect(() => {
    void fetchTemplates()
    void fetchTypes()
  }, [fetchTemplates, fetchTypes])

  const [sort, setSort] = useState<SortState<SortCol>>(null)
  const [editing, setEditing] = useState<LetterTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)

  function typeLabel(typeId: string): string {
    const match = letterTypes.find((lt) => lt.key === typeId || lt.id === typeId)
    if (match) return isRTL && match.labelAr ? match.labelAr : match.label
    return typeId
  }

  const sorted = useMemo(() => {
    const list = [...templates]
    if (!sort) return list
    return list.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      if (sort.col === 'name') return dir * a.name.localeCompare(b.name)
      if (sort.col === 'type') return dir * String(a.type).localeCompare(String(b.type))
      if (sort.col === 'lastModified') return dir * a.lastModified.localeCompare(b.lastModified)
      if (sort.col === 'usageCount') return dir * (a.usageCount - b.usageCount)
      return 0
    })
  }, [templates, sort])

  function handleSort(col: SortCol) {
    setSort((prev) => (prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }))
  }

  async function handleSave(data: Partial<LetterTemplate>) {
    const resolvedType = data.type || 'non-objection'
    const payload = {
      ...data,
      name: data.name || 'Untitled Template',
      type: resolvedType,
      icon: data.icon || typeIcons[resolvedType] || 'lucide:mail',
      color: data.color || typeColors[resolvedType] || 'slate',
      description: data.description || '',
      status: data.status || 'Draft',
    }
    try {
      if (editing) {
        await updateTemplate(editing.id, payload)
        pushToast(t('settings.templateUpdated' as TranslationKey), 'success')
      } else {
        await createTemplate(payload as Omit<LetterTemplate, 'id' | 'createdDate' | 'lastModified' | 'usageCount'>)
        pushToast(t('configurables.letterTemplateCreated' as TranslationKey), 'success')
      }
    } catch {
      pushToast(t('configurables.letterTemplateFailed' as TranslationKey), 'error')
      return
    }
    setCreating(false)
    setEditing(null)
  }

  const pendingDeleteTemplate = pendingDeleteId ? templates.find((tm) => tm.id === pendingDeleteId) : null
  async function confirmRowDelete() {
    if (!pendingDeleteId) return
    setRowDeleting(true)
    try {
      await deleteTemplate(pendingDeleteId)
    } finally {
      setRowDeleting(false)
      setPendingDeleteId(null)
    }
  }

  return (
    <section className={embedded ? '' : 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}>
      <div className={embedded ? 'flex items-center justify-end pb-4' : 'p-8 border-b border-slate-100 flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.letterTemplates' as TranslationKey)}</h2>
          </div>
        )}
        <Gate perm="Manage Letter Templates">
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Icon icon="lucide:plus" />
            {t('configurables.newLetterTemplate' as TranslationKey)}
          </Button>
        </Gate>
      </div>

      {isLoading && templates.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={5} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <SortHeader label={t('settings.templateNameCol')} column="name" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <SortHeader label={t('listsAndCategories.sectionLetterType')} column="type" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <SortHeader label={t('settings.lastModifiedCol')} column="lastModified" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <SortHeader label={t('settings.usageCol')} column="usageCount" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-end">
                  {t('settings.actionsCol')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-xs text-slate-400 italic">
                    {t('listsAndCategories.empty')}
                  </td>
                </tr>
              )}
              {sorted.map((tmpl) => (
                <tr key={tmpl.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <Icon icon={tmpl.icon || 'lucide:mail'} className="text-blue-500" />
                      <span className="text-sm font-bold text-slate-700">{tmpl.name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-xs font-medium text-slate-500">{typeLabel(String(tmpl.type))}</td>
                  <td className="px-8 py-4 text-xs text-slate-500">{tmpl.lastModified}</td>
                  <td className="px-8 py-4"><span className="text-xs font-bold text-slate-600">{tmpl.usageCount}</span></td>
                  <td className="px-8 py-4 text-end">
                    <Gate perm="Manage Letter Templates">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setEditing(tmpl)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer p-1.5 rounded-md hover:bg-emerald-50"
                          aria-label={t('common.edit')}
                        >
                          <Icon icon="lucide:edit-3" />
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(tmpl.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer p-1.5 rounded-md hover:bg-rose-50"
                          aria-label={t('settings.deleteTemplate')}
                        >
                          <Icon icon="lucide:trash-2" />
                        </button>
                      </div>
                    </Gate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit — the Letters page's TemplateEditForm. */}
      <Modal isOpen={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null) }} size="xl">
        {(creating || editing) && (
          <TemplateEditForm
            template={editing}
            onClose={() => { setCreating(false); setEditing(null) }}
            onSave={handleSave}
          />
        )}
      </Modal>

      {/* Row-level delete confirmation. */}
      <Modal
        isOpen={pendingDeleteId !== null}
        onClose={() => !rowDeleting && setPendingDeleteId(null)}
        title={t('listsAndCategories.deleteTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('listsAndCategories.deleteConfirmSimple', { label: pendingDeleteTemplate?.name ?? '' })}
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPendingDeleteId(null)} disabled={rowDeleting}>{t('common.cancel')}</Button>
            <LoadingButton variant="danger" loading={rowDeleting} loadingLabel={t('common.deleting')} onClick={() => void confirmRowDelete()}>
              {t('listsAndCategories.deleteConfirmAction')}
            </LoadingButton>
          </div>
        </div>
      </Modal>
    </section>
  )
}
