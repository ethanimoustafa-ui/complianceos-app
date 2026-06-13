'use client'

// Settings → Departments. Departments themselves are created/renamed inline
// from the department pickers across the app (EditableSelect); this section
// exists specifically to manage each department's CONTACT EMAIL, which powers
// the "inform the department" mailto actions (risk → send-to-department, and
// the analogous policy/rules business-owner notifications). Inline-edit per
// row, mirroring SourcesSection.

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useDepartmentStore } from '@/stores/department-store'

export function DepartmentsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const departments = useDepartmentStore((s) => s.departments)
  const isLoading = useDepartmentStore((s) => s.isLoading)
  const fetchAll = useDepartmentStore((s) => s.fetchAll)
  const updateDepartment = useDepartmentStore((s) => s.updateDepartment)
  const addDepartment = useDepartmentStore((s) => s.addDepartment)

  useEffect(() => { void fetchAll() }, [fetchAll])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftEmail, setDraftEmail] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  // Owner: a department can now be created straight from the configurables hub,
  // and the create form prompts for the contact email up front (not just name).
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftNameAr, setDraftNameAr] = useState('')
  const [draftAddEmail, setDraftAddEmail] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  const resetAddForm = () => {
    setAdding(false)
    setDraftName('')
    setDraftNameAr('')
    setDraftAddEmail('')
  }

  const handleAdd = async () => {
    const name = draftName.trim()
    if (!name || savingNew) return
    setSavingNew(true)
    try {
      const created = await addDepartment(name, draftNameAr.trim() || name)
      // Persist the email in the same flow (addDepartment posts name only).
      const email = draftAddEmail.trim()
      if (email && created?.id) {
        await updateDepartment(created.id, { email })
      }
      resetAddForm()
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (id: string, email: string | undefined) => {
    setEditingId(id)
    setDraftEmail(email ?? '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setDraftEmail('')
  }
  const saveEdit = async (id: string) => {
    setSavingId(id)
    try {
      await updateDepartment(id, { email: draftEmail.trim() })
      setEditingId(null)
      setDraftEmail('')
    } finally {
      setSavingId(null)
    }
  }

  const sorted = [...departments].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className={embedded ? '' : 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}>
      <div className={embedded ? 'flex items-center justify-between gap-2 pb-3' : 'px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-2'}>
        {!embedded ? (
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {t('settings.departments.title' as TranslationKey)}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('settings.departments.description' as TranslationKey)}
            </p>
          </div>
        ) : <span />}
        <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)}>
          <Icon icon="lucide:plus" className="text-sm" />
          {t('settings.departments.addDepartment' as TranslationKey)}
        </Button>
      </div>

      {adding && (
        <div className={embedded ? 'flex flex-wrap items-center gap-2 pb-3' : 'px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2'}>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('settings.departments.name' as TranslationKey)}
            className="max-w-[200px]"
            autoFocus
          />
          <Input
            value={draftNameAr}
            onChange={(e) => setDraftNameAr(e.target.value)}
            placeholder={t('editableSelect.arabicNameOptional')}
            className="max-w-[200px]"
            dir="rtl"
          />
          <Input
            type="email"
            value={draftAddEmail}
            onChange={(e) => setDraftAddEmail(e.target.value)}
            placeholder={t('settings.departments.emailPlaceholder' as TranslationKey)}
            className="max-w-[220px]"
            dir="ltr"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
          />
          <Button size="sm" variant="primary" onClick={() => void handleAdd()} disabled={!draftName.trim() || savingNew}>
            {savingNew && <Icon icon="lucide:loader-2" className="animate-spin text-sm" />}
            {t('common.add')}
          </Button>
          <Button size="sm" variant="outline" onClick={resetAddForm} disabled={savingNew}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {isLoading && departments.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={2} /></div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {t('settings.departments.name' as TranslationKey)}
              </th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {t('settings.departments.email' as TranslationKey)}
              </th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-end">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-6 text-center text-slate-400 italic text-xs">—</td>
              </tr>
            )}
            {sorted.map((d) => {
              const isEditing = editingId === d.id
              const isSaving = savingId === d.id
              return (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3 font-bold text-slate-700 align-middle">
                    {isRTL && d.nameAr ? d.nameAr : d.name}
                  </td>
                  <td className="px-6 py-3 align-middle">
                    {isEditing ? (
                      <Input
                        type="email"
                        value={draftEmail}
                        onChange={(e) => setDraftEmail(e.target.value)}
                        placeholder={t('settings.departments.emailPlaceholder' as TranslationKey)}
                        className="max-w-xs"
                        dir="ltr"
                        autoFocus
                      />
                    ) : d.email ? (
                      <span className="text-slate-600" dir="ltr">{d.email}</span>
                    ) : (
                      <span className="text-slate-400 italic">{t('settings.departments.noEmail' as TranslationKey)}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-end align-middle">
                    {isEditing ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => void saveEdit(d.id)}
                          disabled={isSaving}
                          className="text-emerald-600 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                          aria-label={t('common.save')}
                        >
                          <Icon icon={isSaving ? 'lucide:loader-2' : 'lucide:check'} className={isSaving ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={isSaving}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 cursor-pointer disabled:opacity-40"
                          aria-label={t('common.cancel')}
                        >
                          <Icon icon="lucide:x" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(d.id, d.email)}
                        className="text-slate-400 hover:text-emerald-600 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer"
                        aria-label={t('common.edit')}
                      >
                        <Icon icon="lucide:pencil" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}
