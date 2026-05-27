'use client'

// Wave-24 W24-6c — Settings section for managing the `observation.source`
// enum-value list. The observation filter dropdown and the Add Observation
// source picker both read their options from this list; the raw stored value
// (`key`) stays open per PORTING-TEMPLATE §8 to allow admin configurability.
//
// Mirrors ApprovalTiersSection.tsx structure.

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useEnumValuesStore, type EnumValue } from '@/stores/enum-values-store'
import { useObservationStore } from '@/stores/observation-store'

const DOMAIN = 'observation.source'

// W19.7-BUG-1 fix: module-level stable empty reference to prevent
// useSyncExternalStore infinite loop when byDomain[DOMAIN] is undefined.
const EMPTY_ENUM_VALUES: EnumValue[] = []

export function SourcesSection() {
  const { t, isRTL } = useTranslation()
  const rows = useEnumValuesStore((s) => s.byDomain[DOMAIN] ?? EMPTY_ENUM_VALUES)
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
  // W27.3-β: in-flight spinners for async saves
  const [isSavingAdd, setIsSavingAdd] = useState(false)
  const [isDeletingSource, setIsDeletingSource] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<{ id: string; key: string; nameEn: string } | null>(null)

  const usageCount = useMemo(
    () => (key: string) => observations.filter((o) => o.source === key).length,
    [observations],
  )

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [rows],
  )

  function startEdit(row: (typeof rows)[number]) {
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
  async function saveEdit() {
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
    if (Object.keys(patch).length === 0) { cancelEdit(); return }
    try {
      await updateValue(editingId, patch)
    } catch { /* toast shown via store */ }
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
  async function saveAdd() {
    const key = addKey.trim().toLowerCase()
    const en = addNameEn.trim()
    const ar = addNameAr.trim()
    if (!key || !en || !ar) return
    if (!/^[a-z0-9._-]+$/i.test(key)) {
      setAddError(t('settings.enumValues.keyHint' as import('@/i18n').TranslationKey))
      return
    }
    const sortNum = addSort.trim() ? Number.parseInt(addSort, 10) : undefined
    setIsSavingAdd(true)
    try {
      await addValue(DOMAIN, key, en, ar, Number.isFinite(sortNum as number) ? sortNum : undefined)
      setAdding(false)
    } catch { /* toast shown via store */ } finally {
      setIsSavingAdd(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setIsDeletingSource(true)
    try {
      await removeValue(pendingDelete.id)
    } catch { /* toast shown via store */ } finally {
      setIsDeletingSource(false)
    }
    setPendingDelete(null)
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            {t('settings.sources.title' as import('@/i18n').TranslationKey)}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('settings.sources.description' as import('@/i18n').TranslationKey)}
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={openAdd}>
          <Icon icon="lucide:plus" className="text-sm" />
          {t('settings.sources.addSource' as import('@/i18n').TranslationKey)}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.key' as import('@/i18n').TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameEn' as import('@/i18n').TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameAr' as import('@/i18n').TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.sortOrder' as import('@/i18n').TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.isDefault' as import('@/i18n').TranslationKey)}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-end">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-6 text-center text-slate-400 italic text-xs">—</td>
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
                    {row.isDefault ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {t('settings.enumValues.isDefault' as import('@/i18n').TranslationKey)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      {isEditing ? (
                        <>
                          <button onClick={() => void saveEdit()} className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer">
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
                            title={row.isDefault ? t('settings.enumValues.cannotEditDefault' as import('@/i18n').TranslationKey) : ''}
                          >
                            <Icon icon="lucide:pencil" className="text-sm" />
                          </button>
                          <button
                            onClick={() => !row.isDefault && setPendingDelete({ id: row.id, key: row.key, nameEn: row.nameEn })}
                            disabled={row.isDefault || usage > 0}
                            className="p-1.5 rounded-md cursor-pointer text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            title={
                              row.isDefault
                                ? t('settings.enumValues.cannotDeleteDefault' as import('@/i18n').TranslationKey)
                                : usage > 0
                                ? t('settings.enumValues.inUse' as import('@/i18n').TranslationKey)
                                : ''
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

      {/* Add modal */}
      <Modal isOpen={adding} onClose={() => setAdding(false)} title={t('settings.sources.addSource' as import('@/i18n').TranslationKey)} size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.key' as import('@/i18n').TranslationKey)} *
            </label>
            <Input value={addKey} onChange={(e) => setAddKey(e.target.value)} placeholder="my_source" autoFocus />
            <p className="text-[10px] text-slate-400 mt-1">{t('settings.enumValues.keyHint' as import('@/i18n').TranslationKey)}</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.nameEn' as import('@/i18n').TranslationKey)} *
            </label>
            <Input value={addNameEn} onChange={(e) => setAddNameEn(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.nameAr' as import('@/i18n').TranslationKey)} *
            </label>
            <Input value={addNameAr} onChange={(e) => setAddNameAr(e.target.value)} dir="rtl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('settings.enumValues.sortOrder' as import('@/i18n').TranslationKey)}
            </label>
            <Input type="number" value={addSort} onChange={(e) => setAddSort(e.target.value)} placeholder="(auto)" />
          </div>
          {addError && <p className="text-xs text-rose-600">{addError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={isSavingAdd}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={!addKey.trim() || !addNameEn.trim() || !addNameAr.trim() || isSavingAdd}
              aria-busy={isSavingAdd || undefined}
              onClick={() => void saveAdd()}
            >
              {isSavingAdd && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {isSavingAdd ? t('common.saving') : t('common.add')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('settings.sources.deleteConfirmTitle' as import('@/i18n').TranslationKey)}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {t('settings.sources.deleteConfirmBody' as import('@/i18n').TranslationKey)}
          </p>
          <div className={`flex justify-end gap-3`}>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={isDeletingSource}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={isDeletingSource} aria-busy={isDeletingSource || undefined} onClick={() => void confirmDelete()}>
              {isDeletingSource && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {isDeletingSource ? t('common.deleting') : t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
