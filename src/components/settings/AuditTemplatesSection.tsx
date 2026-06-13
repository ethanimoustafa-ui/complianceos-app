'use client'

// Settings → Audit Templates. Owner decision: create/edit reuses the rich
// Create-Audit modal (template dropdown to clone, cadence picker, category,
// framework tags + a real file upload) in `mode="template"`, instead of a
// stripped-down form. The modal writes to the SAME audit_templates store this
// table reads, so saves show up here immediately.

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { formatLocalizedDate } from '@/lib/format-date'
import { AddAuditModal } from '@/components/reports/audits/add-audit-modal'
import type { AuditTemplateCategory } from '@/types'

type SortCol = 'name' | 'category' | 'updatedAt' | 'usageCount'

// Enum-label fallback for legacy seeded templates. Unified templates store the
// audit-category id directly (resolved via the audit-category store).
const CATEGORY_LABELS: Record<AuditTemplateCategory, string> = {
  'security-compliance': 'templateCategorySecurity',
  'financial-compliance': 'templateCategoryFinancial',
  'regulatory-compliance': 'templateCategoryRegulatory',
  'operational-compliance': 'templateCategoryOperational',
  'data-privacy': 'templateCategoryDataPrivacy',
  'sharia-compliance': 'templateCategorySharia',
  'internal-controls': 'templateCategoryInternalControls',
  'custom': 'templateCategoryCustom',
}

export function AuditTemplatesSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const { templates, delete: deleteTemplate } = useAuditTemplateStore()
  const isLoading = useAuditTemplateStore((s) => s.isLoading)
  const fetchTemplates = useAuditTemplateStore((s) => s.fetchAll)
  const auditCategoryItems = useAuditCategoryStore((s) => s.categories)
  // This section is now the primary surface for audit templates (configurables
  // hub), so it must hydrate itself — nothing else fetches them on mount.
  useEffect(() => { void fetchTemplates() }, [fetchTemplates])
  const [sort, setSort] = useState<SortState<SortCol>>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  // Row-level delete (owner: templates couldn't be deleted). delete() is
  // optimistic, so the row vanishes instantly on confirm.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)

  // Resolve a template's category to a display label: the audit-category store
  // first (unified templates store an id), then the legacy enum map, then raw.
  function categoryLabel(cat: string): string {
    const byId = auditCategoryItems.find((c) => c.id === cat)
    if (byId) return isRTL && byId.labelAr ? byId.labelAr : byId.label
    const key = CATEGORY_LABELS[cat as AuditTemplateCategory]
    return key ? t(('settings.' + key) as any) : cat
  }

  const sorted = useMemo(() => {
    const list = [...templates]
    if (!sort) return list
    return list.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const col = sort.col
      if (col === 'name') return dir * a.name.localeCompare(b.name)
      if (col === 'category') return dir * a.category.localeCompare(b.category)
      if (col === 'updatedAt') return dir * a.updatedAt.localeCompare(b.updatedAt)
      if (col === 'usageCount') return dir * (a.usageCount - b.usageCount)
      return 0
    })
  }, [templates, sort])

  function handleSort(col: SortCol) {
    setSort((prev) => {
      if (prev?.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col, dir: 'asc' }
    })
  }

  const editTemplate = editId ? templates.find((t) => t.id === editId) : null
  const pendingDeleteTemplate = pendingDeleteId ? templates.find((t) => t.id === pendingDeleteId) : null

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
            <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.auditTemplates')}</h2>
            <p className="text-sm text-slate-500">{t('settings.standardizeChecks')}</p>
          </div>
        )}
        <Gate perm="Manage Audit Templates">
          <Button variant="dark" onClick={() => setIsCreateOpen(true)}>
            <Icon icon="lucide:plus" />
            {t('settings.newTemplate')}
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
                <SortHeader label={t('settings.categoryCol')} column="category" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
              </th>
              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <SortHeader label={t('settings.lastModifiedCol')} column="updatedAt" activeColumn={sort?.col ?? null} direction={sort?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSort(null)} />
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
                    {/* show template's custom icon if set, else category default */}
                    <Icon
                      icon={tmpl.frequencySchedule?.templateIcon || 'lucide:file-check'}
                      className="text-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-700">{isRTL ? (tmpl.nameAr || tmpl.name) : tmpl.name}</span>
                  </div>
                </td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500">
                  {categoryLabel(tmpl.category)}
                </td>
                <td className="px-8 py-4 text-xs text-slate-500">{formatLocalizedDate(tmpl.updatedAt, isRTL ? 'ar' : 'en')}</td>
                <td className="px-8 py-4">
                  <span className="text-xs font-bold text-slate-600">{tmpl.usageCount}</span>
                </td>
                <td className="px-8 py-4 text-end">
                  <Gate perm="Manage Audit Templates">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => setEditId(tmpl.id)}
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

      {/* Create — the rich modal in template mode. */}
      <AddAuditModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        mode="template"
      />

      {/* Edit — same modal, prefilled from the target template. */}
      {editTemplate && (
        <AddAuditModal
          isOpen={!!editId}
          onClose={() => setEditId(null)}
          mode="template"
          template={editTemplate}
        />
      )}

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
