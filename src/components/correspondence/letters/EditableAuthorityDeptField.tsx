'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { CircularAuthority } from '@/types'
import { EditableSelect } from '@/components/ui/editable-select'
import { useAuthorityDeptStore } from '@/stores/authority-department-store'
import { pushToast } from '@/stores/toast-store'
import { useTranslation } from '@/i18n'

// Editable per-authority department field — wraps EditableSelect against
// useAuthorityDeptStore. Also exposes an inline email-memory editor: typing an
// email here is persisted against the dept and surfaces as a suggestion next
// time anyone composes a letter to that department.
export function EditableAuthorityDeptField({
  authority,
  value,
  onChange,
  isRTL,
}: {
  authority: CircularAuthority
  value: string
  onChange: (id: string) => void
  isRTL: boolean
}) {
  const { t } = useTranslation()
  const { getDepartments, addDepartment, updateDepartment, removeDepartment, setDepartmentEmail } =
    useAuthorityDeptStore()
  const depts = getDepartments(authority)
  const selected = depts.find((d) => d.id === value)
  const [emailDraft, setEmailDraft] = useState(selected?.email ?? '')

  useEffect(() => {
    setEmailDraft(selected?.email ?? '')
  }, [selected?.id, selected?.email])

  return (
    <div className="space-y-2">
      <EditableSelect
        value={value || null}
        onChange={(id) => onChange(id)}
        items={depts.map((d) => ({ id: d.id, label: d.en, labelAr: d.ar }))}
        placeholder={t('letters.selectDepartment' as import('@/i18n').TranslationKey)}
        onAdd={async (label, labelAr) => {
          try {
            const created = await addDepartment(authority, label, labelAr ?? label)
            return created.id
          } catch (err) {
            console.error('Failed to add department', err)
            // Without this the add silently fails and the user assumes it
            // worked. Surface a dismissible toast so they know to retry.
            pushToast({ key: 'errors.lettersTemplate.departmentAddFailed' }, 'error')
            return undefined
          }
        }}
        onEdit={(id, label, labelAr) =>
          updateDepartment(authority, id, { en: label, ar: labelAr ?? label })
        }
        onDelete={(id) => removeDepartment(authority, id)}
        isRTL={isRTL}
        size="md"
      />
      {selected && (
        <div className="flex items-center gap-2">
          <Icon icon="lucide:mail" className="text-slate-400 text-sm" />
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onBlur={() => {
              if (emailDraft !== (selected.email ?? '')) {
                setDepartmentEmail(authority, selected.id, emailDraft)
              }
            }}
            placeholder="recipient@authority.gov.sa"
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
      )}
    </div>
  )
}
