'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useAuthStore, SEED_USERS } from '@/stores/auth-store'
import { useCan } from '@/lib/permissions'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import type { User } from '@/types'

const ROLE_BADGE_COLORS: Record<User['role'], string> = {
  admin: 'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  officer: 'bg-slate-100 text-slate-700',
}

/**
 * UserSwitcher — admin-only Acting-As affordance (RBAC-024).
 *
 * Renders nothing for users who lack the `Switch User (Demo)` permission. For
 * admins, shows a small avatar trigger; clicking it opens a dropdown listing
 * every seed user. Clicking a row calls `auth.switchUser(id)`.
 *
 * Audit logging: the auth-store's `switchUser` action emits `auth.switch_user`
 * itself, so this component does not need to log redundantly.
 */
export function UserSwitcher() {
  const { t } = useTranslation()
  const canSwitch = useCan('Switch User (Demo)')
  const currentUser = useAuthStore((s) => s.user)
  const originalUserId = useAuthStore((s) => s.originalUserId)
  const switchUser = useAuthStore((s) => s.switchUser)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  if (!canSwitch || !currentUser) return null

  const triggerAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.avatarSeed || currentUser.name}`
  const roleLabelKey = `team.role${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}` as TranslationKey

  const handleSelect = (userId: string) => {
    if (userId !== currentUser.id) {
      switchUser(userId)
    }
    setOpen(false)
  }

  const handleReset = () => {
    if (originalUserId && originalUserId !== currentUser.id) {
      switchUser(originalUserId)
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-slate-800/50 hover:bg-slate-800 px-2 py-1 transition-colors cursor-pointer"
        title={t('rbac.switchUser')}
      >
        <img
          src={triggerAvatar}
          alt={currentUser.name}
          className="w-7 h-7 rounded-full border-2 border-slate-700"
        />
        <span
          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${ROLE_BADGE_COLORS[currentUser.role] ?? ROLE_BADGE_COLORS.officer}`}
        >
          {t(roleLabelKey)}
        </span>
        <Icon icon="lucide:chevron-up" className="text-slate-400 text-sm" />
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 start-0 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden"
          role="menu"
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {t('rbac.switchUser')}
            </p>
            <p className="text-xs text-slate-700 mt-1 font-medium">
              {t('rbac.actingAs', {
                name: currentUser.name,
                role: t(roleLabelKey),
              })}
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {SEED_USERS.map((u) => {
              const isActive = u.id === currentUser.id
              const seedRoleLabel = `team.role${u.role.charAt(0).toUpperCase() + u.role.slice(1)}` as TranslationKey
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(u.id)}
                    className={`w-full text-start flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer ${
                      isActive ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.avatarSeed || u.name}`}
                      alt={u.name}
                      className="w-8 h-8 rounded-full border border-slate-200"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                    </div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${ROLE_BADGE_COLORS[u.role] ?? ROLE_BADGE_COLORS.officer}`}
                    >
                      {t(seedRoleLabel)}
                    </span>
                    {isActive && (
                      <Icon icon="lucide:check" className="text-emerald-600 text-base" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-slate-100">
            <button
              type="button"
              onClick={handleReset}
              disabled={!originalUserId || originalUserId === currentUser.id}
              className="w-full text-start flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <Icon icon="lucide:rotate-ccw" className="text-sm" />
              {t('rbac.resetActingAs')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
