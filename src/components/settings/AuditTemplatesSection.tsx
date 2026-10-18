'use client'

// Settings → Audit Templates. Owner decision: create/edit reuses the rich
// Create-Audit modal (cadence, category, framework tags, file upload) in
// `mode="template"`, saving to the audit_templates store this table reads.
//
// It ALSO lists `entity_templates` (audit) — the templates saved via the
// Schedule-Audit "Save as template" footer — so this configurable reflects
// EVERY template a user sees in that dropdown (owner: "audit templates are not
// reflecting the actual audit templates"). New saves go to audit_templates;
// legacy entity templates show here read-only with a delete affordance.

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { useAuditTemplateStore } from '@/stores/audit-template-store'
import { useAuditCategoryStore } from '@/stores/audit-category-store'
import { useEntityTemplateStore } from '@/stores/entity-template-store'
import { useTranslation } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { formatLocalizedDate } from '@/lib/format/format-date'
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

type DisplayRow = {
  id: string
  name: string
  category: string
  updatedAt: string
  usageCount: number
  icon: string
  source: 'audit' | 'entity'
}

export function AuditTemplatesSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const { templates, delete: deleteTemplate } = useAuditTemplateStore()
  const auditLoading = useAuditTemplateStore((s) => s.isLoading)
  const fetchTemplates = useAuditTemplateStore((s) => s.fetchAll)
  const auditCategoryItems = useAuditCategoryStore((s) => s.categories)
  // Entity templates (Schedule-Audit "Save as template" footer) surface here too.
  const fetchEntity = useEntityTemplateStore((s) => s.fetchByType)
  const entityByType = useEntityTemplateStore((s) => s.byType)
  const entityLoading = useEntityTemplateStore((s) => s.isLoading)
  const deleteEntity = useEntityTemplateStore((s) => s.deleteTemplate)
  // Primary surface now (configurables hub), so hydrate both sources on mount.
  useEffect(() => {
    void fetchTemplates()
    void fetchEntity('audit')
  }, [fetchTemplates, fetchEntity])
  const entityTemplates = useMemo(() => entityByType['audit'] ?? [], [entityByType])

  const [sort, setSort] = useState<SortState<SortCol>>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  // Editing a legacy entity template migrates it into audit_templates.
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [rowDeleting, setRowDeleting] = useState(false)

  // Resolve a category id/key to a display label: audit-category store first
  // (unified templates store an id), then the legacy enum map, then raw.
  function categoryLabel(cat: string): string {
    if (!cat) return '—'
    const byId = auditCategoryItems.find((c) => c.id === cat)
    if (byId) return isRTL && byId.labelAr ? byId.labelAr : byId.label
    const key = CATEGORY_LABELS[cat as AuditTemplateCategory]
    return key ? t(('settings.' + key) as any) : cat
  }

  const rows = useMemo<DisplayRow[]>(() => {
    const auditRows: DisplayRow[] = templates.map((tm) => ({
      id: tm.id,
      name: isRTL ? (tm.nameAr || tm.name) : tm.name,
      category: categoryLabel(tm.category),
      updatedAt: tm.updatedAt,
      usageCount: tm.usageCount,
      icon: tm.frequencySchedule?.templateIcon || 'lucide:file-check',
      source: 'audit',
    }))
    const entityRows: DisplayRow[] = entityTemplates.map((et) => ({
      id: et.id,
      name: et.name,
      category: categoryLabel(String((et.fields as Record<string, unknown>)?.category ?? '')),
      updatedAt: et.created_at,
      usageCount: 0,
      icon: 'lucide:file-check',
      source: 'entity',
    }))
    const all = [...auditRows, ...entityRows]
    if (!sort) return all
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...all].sort((a, b) => {
      if (sort.col === 'name') return dir * a.name.localeCompare(b.name)
      if (sort.col === 'category') return dir * a.category.localeCompare(b.category)
      if (sort.col === 'updatedAt') return dir * a.updatedAt.localeCompare(b.updatedAt)
      if (sort.col === 'usageCount') return dir * (a.usageCount - b.usageCount)
      return 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, entityTemplates, sort, isRTL, auditCategoryItems])

  function handleSort(col: SortCol) {
    setSort((prev) => {
      if (prev?.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col, dir: 'asc' }
    })
  }

  const editTemplate = editId ? templates.find((tm) => tm.id === editId) : null
  const editingEntity = editingEntityId ? entityTemplates.find((et) => et.id === editingEntityId) : null
  const pendingDeleteRow = pendingDeleteId ? rows.find((r) => r.id === pendingDeleteId) : null

  async function confirmRowDelete() {
    if (!pendingDeleteRow) return
    setRowDeleting(true)
    try {
      if (pendingDeleteRow.source === 'entity') await deleteEntity(pendingDeleteRow.id, 'audit')
      else await deleteTemplate(pendingDeleteRow.id)
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
      {(auditLoading || entityLoading) && rows.length === 0 ? (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-center text-xs text-slate-400 italic">
                  {t('listsAndCategories.empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.source}-${row.id}`} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <Icon icon={row.icon} className="text-emerald-500" />
                    <span className="text-sm font-bold text-slate-700">{row.name}</span>
                  </div>
                </td>
                <td className="px-8 py-4 text-xs font-medium text-slate-500">{row.category}</td>
                <td className="px-8 py-4 text-xs text-slate-500">{formatLocalizedDate(row.updatedAt, isRTL ? 'ar' : 'en')}</td>
                <td className="px-8 py-4">
                  <span className="text-xs font-bold text-slate-600">{row.usageCount}</span>
                </td>
                <td className="px-8 py-4 text-end">
                  <Gate perm="Manage Audit Templates">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => (row.source === 'audit' ? setEditId(row.id) : setEditingEntityId(row.id))}
                        className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer p-1.5 rounded-md hover:bg-emerald-50"
                        aria-label={t('common.edit')}
                      >
                        <Icon icon="lucide:edit-3" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(row.id)}
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

      {/* Edit — same modal, prefilled from the target template (audit rows). */}
      {editTemplate && (
        <AddAuditModal
          isOpen={!!editId}
          onClose={() => setEditId(null)}
          mode="template"
          template={editTemplate}
        />
      )}

      {/* Edit a legacy entity template → prefill + create a real audit_template,
          then delete the entity (migrate-on-edit). */}
      {editingEntity && (
        <AddAuditModal
          isOpen={!!editingEntityId}
          onClose={() => setEditingEntityId(null)}
          mode="template"
          templateSeed={{
            title: String((editingEntity.fields as Record<string, unknown>)?.title ?? editingEntity.name),
            type: (editingEntity.fields as Record<string, unknown>)?.type ? String((editingEntity.fields as Record<string, unknown>).type) : 'internal',
            category: (editingEntity.fields as Record<string, unknown>)?.category ? String((editingEntity.fields as Record<string, unknown>).category) : undefined,
            priority: (editingEntity.fields as Record<string, unknown>)?.priority as 'critical' | 'high' | 'medium' | 'low' | undefined,
            frequency: (editingEntity.fields as Record<string, unknown>)?.frequency as 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'ad_hoc' | undefined,
            description: (editingEntity.fields as Record<string, unknown>)?.description ? String((editingEntity.fields as Record<string, unknown>).description) : undefined,
          }}
          onTemplateSaved={() => {
            const id = editingEntity.id
            void deleteEntity(id, 'audit')
            setEditingEntityId(null)
          }}
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
            {t('listsAndCategories.deleteConfirmSimple', { label: pendingDeleteRow?.name ?? '' })}
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
