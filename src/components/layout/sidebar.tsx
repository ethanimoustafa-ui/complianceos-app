'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useNotificationStore } from '@/stores/notification-store'
import { useMessageStore } from '@/stores/message-store'
import { useAuthStore } from '@/stores/auth-store'
import { NotificationPanel } from '@/components/notifications/notification-panel'
import { MessagePanel } from '@/components/messages/message-panel'
import { HelpPanel } from '@/components/help/help-panel'
import { SignOutModal } from '@/components/auth/sign-out-modal'
import { UserSwitcher } from '@/components/auth/user-switcher'
import { ProfileModal } from '@/components/profile/profile-modal'
import { useNotificationEngine } from '@/hooks/useNotificationEngine'
import { dicebearAvatar } from '@/lib/avatar'

const navigation = [
  { nameKey: 'navigation.dashboard', href: '/dashboard', icon: 'lucide:layout-grid' },
  { nameKey: 'navigation.calendar', href: '/calendar', icon: 'lucide:calendar' },
  { nameKey: 'navigation.correspondence', href: '/correspondence', icon: 'lucide:mail' },
  { nameKey: 'navigation.reports', href: '/reports', icon: 'lucide:file-text' },
  { nameKey: 'navigation.team', href: '/team', icon: 'lucide:users' },
  { nameKey: 'navigation.settings', href: '/settings', icon: 'lucide:settings' },
]

type PanelType = 'notifications' | 'messages' | 'help' | null

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  useNotificationEngine()

  const unreadNotifications = useNotificationStore(s => s.unreadCount)
  const threads = useMessageStore(s => s.threads)
  const user = useAuthStore(s => s.user)

  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  const unreadMessages = threads.reduce((sum, t) => sum + t.unreadCount, 0)
  const avatarSrc = user?.avatar || dicebearAvatar(user?.avatarSeed || 'Felix')

  const togglePanel = (panel: PanelType) => {
    setActivePanel(prev => prev === panel ? null : panel)
  }

  return (
    <>
      <aside className="w-20 lg:w-24 bg-slate-900 flex flex-col items-center py-8 gap-6 border-r border-slate-800 shrink-0">
        {/* Logo */}
        <div className="text-emerald-400">
          <Icon icon="lucide:shield-check" className="text-4xl" />
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 flex flex-col gap-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const name = t(item.nameKey as any)
            return (
              <Link
                key={item.nameKey}
                href={item.href}
                className={cn(
                  'flex items-center justify-center w-12 h-12 rounded-xl transition-all',
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                )}
                title={name}
              >
                <Icon icon={item.icon} className="text-2xl" />
              </Link>
            )
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 items-center">
          {/* Notifications */}
          <button
            onClick={() => togglePanel('notifications')}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.notifications')}
          >
            <Icon icon="lucide:bell" className="text-2xl" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 end-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1" style={{ border: '2px solid #1e293b' }}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {/* Messages */}
          <button
            onClick={() => togglePanel('messages')}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.messages')}
          >
            <Icon icon="lucide:message-square" className="text-2xl" />
            {unreadMessages > 0 && (
              <span className="absolute top-1 end-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1" style={{ border: '2px solid #1e293b' }}>
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </button>

          {/* Help */}
          <button
            onClick={() => togglePanel('help')}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.helpCenter')}
          >
            <Icon icon="lucide:help-circle" className="text-2xl" />
          </button>
        </div>

        {/* Bottom: Sign Out & Profile */}
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={() => setIsSignOutOpen(true)}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.signOut')}
          >
            <Icon icon="lucide:log-out" className="text-2xl" />
          </button>

          <button
            onClick={() => setIsProfileOpen(true)}
            className="focus:outline-none cursor-pointer"
            title={t('sidebar.editProfile')}
          >
            <img
              src={avatarSrc}
              alt="User"
              className="w-10 h-10 rounded-full border-2 border-slate-700 hover:border-emerald-400 transition-all cursor-pointer hover:scale-110"
            />
          </button>

          {/* RBAC-024: Acting-As affordance — admin-only Demo user switcher.
              Renders nothing when the current user lacks `Switch User (Demo)`. */}
          <UserSwitcher />
        </div>
      </aside>

      {/* Panels & Modals */}
      <NotificationPanel isOpen={activePanel === 'notifications'} onClose={() => setActivePanel(null)} />
      <MessagePanel isOpen={activePanel === 'messages'} onClose={() => setActivePanel(null)} />
      <HelpPanel isOpen={activePanel === 'help'} onClose={() => setActivePanel(null)} />
      <SignOutModal isOpen={isSignOutOpen} onClose={() => setIsSignOutOpen(false)} />
      <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </>
  )
}
