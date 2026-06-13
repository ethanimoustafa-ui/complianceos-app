'use client'

// Wave-24 W24-6c — Settings manager for the `observation.source` enum list.
// The observation filter dropdown + the Add Observation source picker read
// their options here. Observation sources are pure labels (key + EN/AR names +
// sort order), so inline edit is the right shape — but the seeded/custom flag
// was dropped (it doesn't matter to the user) and sort order now carries a
// help hint. Adds apply optimistically and the modal closes immediately so the
// popup never lingers behind the freshly-added row.

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useEnumValuesStore, type EnumValue } from '@/stores/enum-values-store'
import { useObservationStore } from '@/stores/observation-store'

const DOMAIN = 'observation.source'

// W19.7-BUG-1 fix: module-level stable empty reference.
const EMPTY_ENUM_VALUES: EnumValue[] = []

export function SourcesSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const rows = useEnumValuesStore((s) => s.byDomain[DOMAIN] ?? EMPTY_ENUM_VALUES)
  const isLoading = useEnumValuesStore((s) => s.loading[DOMAIN] ?? false)
  const fetchValues = useEnumValuesStore((s) => s.fetch)
  const addValue = useEnumValuesStore((s) => s.add)
  const updateValue = useEnumValuesStore((s) => s.update)
  const removeValue = useEnumValuesStore((s) => s.remove)
  const observations = useObservationStore((s) => s.observations)

  useEffect(() => { void fetchValues(DOMAIN) }, [fetchValues])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNameEn, setEditNameEn] = useState('')
  const [editNameAr, setEditNameAr] = useState('')
  const [editSort, setEditSort] = useState('')

  const [adding, setAdding] = useState(false)
  const [addKey, setAddKey] = useState('')
  const [addNameEn, setAddNameEn] = useState('')
  const [addNameAr, setAddNameAr] = useState('')
  const [addSort, setAddSort] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<{ id: string; key: string; nameEn: string } | null>(null)

  const usageCount = useMemo(
    () => (key: string) => observations.filter((o) => o.source === key).length,
    [observations],
  )

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [rows],
  )

  function startEdit(row: EnumValue) {
    setEditingId(row.id)
    setEditNameEn(row.nameEn)
    setEditNameAr(row.nameAr)
    setEditSort(String(row.sortOrder))
  }
  function cancelEdit() {
    setEditingId(null)
    setEditNameEn('')
    setEditNameAr('')
    setEditSort('')
  }
  function saveEdit() {
    if (!editingId) return
    const row = rows.find((r) => r.id === editingId)
    if (!row) return
    const patch: { nameEn?: string; nameAr?: string; sortOrder?: number } = {}
    if (!row.isDefault) {
      const en = editNameEn.trim()
      const ar = editNameAr.trim()
      if (!en || !ar) return
      if (en !== row.nameEn) patch.nameEn = en
      if (ar !== row.nameAr) patch.nameAr = ar
    }
    const sortNum = Number.parseInt(editSort, 10)
    if (Number.isFinite(sortNum) && sortNum !== row.sortOrder) patch.sortOrder = sortNum
    // Optimistic update — close the inline editor immediately; the store
    // reconciles/reverts + toasts on failure.
    if (Object.keys(patch).length > 0) void updateValue(editingId, patch)
    cancelEdit()
  }

  function openAdd() {
    setAdding(true)
    setAddKey('')
    setAddNameEn('')
    setAddNameAr('')
    setAddSort('')
    setAddError(null)
  }
  function saveAdd() {
    const key = addKey.trim().toLowerCase()
    const en = addNameEn.trim()
    const ar = addNameAr.trim()
    if (!key || !en || !ar) return
    if (!/^[a-z0-9._-]+$/i.test(key)) {
      setAddError(t('settings.enumValues.keyHint' as TranslationKey))
      return
    }
    const sortNum = addSort.trim() ? Number.parseInt(addSort, 10) : undefined
    // Optimistic: the row appears instantly, so close the popup in the same
    // tick (no lag where the new row shows behind a still-open modal). The
    // store shows a revert toast if the server rejects it.
    void addValue(DOMAIN, key, en, ar, Number.isFinite(sortNum as number) ? sortNum : undefined)
    setAdding(false)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    void removeValue(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <section className={embedded ? '' : 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}>
      <div className={embedded ? 'flex items-center justify-end pb-4' : 'px-6 py-4 border-b border-slate-100 flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {t('settings.sources.title' as TranslationKey)}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('settings.sources.description' as TranslationKey)}
            </p>
          </div>
        )}
        <Button size="sm" variant="primary" onClick={openAdd}>
          <Icon icon="lucide:plus" className="text-sm" />
          {t('settings.sources.addSource' as TranslationKey)}
        </Button>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={4} /></div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.key' as TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameEn' as TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameAr' as TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <span className="inline-flex items-center gap-1">
                  {t('settings.enumValues.sortOrder' as TranslationKey)}
                  <span className="cursor-help inline-flex" title={t('settings.enumValues.sortOrderHelp' as TranslationKey)}>
                    <Icon icon="lucide:help-circle" className="text-slate-400 text-xs" />
                  </span>
                </span>
              </th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-end">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-6 text-center text-slate-400 italic text-xs">—</td>
              </tr>
            )}
            {sorted.map((row) => {
              const isEditing = editingId === row.id
              const usage = usageCount(row.key)
              return (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3">
                    <span className="text-xs font-mono text-slate-600">{row.key}</span>
                  </td>
                  <td className="px-6 py-3">
                    {isEditing && !row.isDefault ? (
                      <Input value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} autoFocus />
                    ) : (
                      <span className="text-xs font-bold text-slate-800">{row.nameEn}</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {isEditing && !row.isDefault ? (
                      <Input value={editNameAr} onChange={(e) => setEditNameAr(e.target.value)} dir="rtl" />
                    ) : (
                      <span className="text-xs text-slate-600">{row.nameAr}</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {isEditing ? (
                      <Input type="number" value={editSort} onChange={(e) => setEditSort(e.target.value)} className="w-20" />
                    ) : (
                      <span className="text-xs text-slate-600">{row.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer">
                            <Icon icon="lucide:check" className="text-sm" />
                          </button>
                          <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer">
                            <Icon icon="lucide:x" className="text-sm" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(row)}
                            className="text-slate-400 hover:text-emerald-600 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer"
                            title={row.isDefault ? t('settings.enumValues.cannotEditDefault' as TranslationKey) : t('common.edit')}
                          >
                            <Icon icon="lucide:pencil" className="text-sm" />
                          </button>
                          <button
                            onClick={() => !row.isDefault && usage === 0 && setPendingDelete({ id: row.id, key: row.key, nameEn: row.nameEn })}
                            disabled={row.isDefault || usage > 0}
                            className="p-1.5 rounded-md cursor-pointer text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            title={
                              row.isDefault
                                ? t('settings.enumValues.cannotDeleteDefault' as TranslationKey)
                                : usage > 0
                                ? t('settings.enumValues.inUse' as TranslationKey)
                                : t('common.delete')
                            }
                          >
                            <Icon icon="lucide:trash-2" className="text-sm" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Add modal */}
      <Modal isOpen={adding} onClose={() => setAdding(false)} title={t('settings.sources.addSource' as TranslationKey)} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.key' as TranslationKey)}<span className="text-rose-500"> *</span>
            </label>
            <Input value={addKey} onChange={(e) => setAddKey(e.target.value)} placeholder="my_source" autoFocus />
            <p className="text-[10px] text-slate-400 mt-1">{t('settings.enumValues.keyHint' as TranslationKey)}</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.nameEn' as TranslationKey)}<span className="text-rose-500"> *</span>
            </label>
            <Input value={addNameEn} onChange={(e) => setAddNameEn(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.nameAr' as TranslationKey)}<span className="text-rose-500"> *</span>
            </label>
            <Input value={addNameAr} onChange={(e) => setAddNameAr(e.target.value)} dir="rtl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.sortOrder' as TranslationKey)}{' '}
              <span className="text-slate-400 font-normal normal-case">({t('common.optional')})</span>
            </label>
            <Input type="number" value={addSort} onChange={(e) => setAddSort(e.target.value)} placeholder="(auto)" />
          </div>
          {addError && <p className="text-xs text-rose-600">{addError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!addKey.trim() || !addNameEn.trim() || !addNameAr.trim()}
              onClick={saveAdd}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('settings.sources.deleteConfirmTitle' as TranslationKey)}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('settings.sources.deleteConfirmBody' as TranslationKey)}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
