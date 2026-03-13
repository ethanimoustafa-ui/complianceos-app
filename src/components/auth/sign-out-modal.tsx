'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { useAuthStore } from '@/stores/auth-store'
import { useTranslation } from '@/i18n'

interface SignOutModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SignOutModal({ isOpen, onClose }: SignOutModalProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const logout = useAuthStore(s => s.logout)

  const handleSignOut = () => {
    logout()
    onClose()
    router.push('/sign-in')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-rose-50 flex items-center justify-center">
          <Icon icon="lucide:log-out" className="text-3xl text-rose-500" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-2">{t('sidebar.signOutConfirm')}</h3>
        <p className="text-sm text-slate-500 mb-8">{t('sidebar.signOutDescription')}</p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 py-3 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-colors cursor-pointer"
          >
            {t('sidebar.confirmSignOut')}
          </button>
        </div>
      </div>
    </div>
  )
}
