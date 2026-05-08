'use client'

import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface ForbiddenPanelProps {
  /** Optional override for the body copy. Defaults to the i18n key `rbac.forbiddenBody`. */
  message?: string
  /** Render a compact inline panel instead of a centred page-level block. */
  inline?: boolean
}

/**
 * ForbiddenPanel — placeholder rendered when a `<Gate>` denies access to a
 * page-level surface. Surfaces a localised "Ask an admin" message so the
 * user understands the access is configurable.
 */
export function ForbiddenPanel({ message, inline = false }: ForbiddenPanelProps) {
  const { t } = useTranslation()
  const body = message ?? t('rbac.forbiddenBody')

  if (inline) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <Icon icon="lucide:shield-off" className="w-5 h-5 text-slate-400 shrink-0" />
        <p className="text-xs text-slate-600">{body}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
        <Icon icon="lucide:shield-off" className="w-8 h-8 text-slate-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 mb-2">{t('rbac.forbiddenTitle')}</h2>
      <p className="text-sm text-slate-500 max-w-md">{body}</p>
    </div>
  )
}
