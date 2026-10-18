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
import { ProfileModal } from '@/components/profile/profile-modal'
import { useNotificationEngine } from '@/hooks/useNotificationEngine'
import { dicebearAvatar } from '@/lib/avatar'
import { hasRole } from '@/lib/rbac/permissions'
import { APP_VERSION } from '@/lib/version'

// `href` is the navigation target (the section's default tab, so clicking skips
// the parent route's server `redirect()` hop — which otherwise costs an extra
// proxy.ts getUser() round-trip). `match` is the section root used for active
// highlighting, so the icon stays lit across every sub-tab.
const navigation = [
  { nameKey: 'navigation.dashboard', href: '/dashboard', match: '/dashboard', icon: 'lucide:layout-grid' },
  { nameKey: 'navigation.calendar', href: '/calendar', match: '/calendar', icon: 'lucide:calendar' },
  { nameKey: 'navigation.correspondence', href: '/correspondence/feed', match: '/correspondence', icon: 'lucide:mail' },
  { nameKey: 'navigation.reports', href: '/reports/compliance-review', match: '/reports', icon: 'lucide:file-text' },
  { nameKey: 'navigation.team', href: '/team/directory', match: '/team', icon: 'lucide:users' },
  { nameKey: 'navigation.settings', href: '/settings', match: '/settings', icon: 'lucide:settings' },
]

type PanelType = 'notifications' | 'messages' | 'help' | null

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  useNotificationEngine()

  const unreadNotifications = useNotificationStore(s => s.unreadCount)
  const unreadMessages = useMessageStore(s => s.unreadCount)
  const user = useAuthStore(s => s.user)

  const [activePanel, setActivePanel] = useState<PanelType>(null)
  const [isSignOutOpen, setIsSignOutOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

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
            // Officers only get the Training sub-page of the Team section —
            // point their Team icon straight there (directory/logs pages also
            // bounce officers, this just avoids the redirect hop).
            const href =
              item.match === '/team' && !hasRole(user, 'manager') ? '/team/training' : item.href
            // Highlight by section root so the icon stays lit on every sub-tab.
            const isActive = pathname === item.match || pathname.startsWith(item.match + '/')
            const name = t(item.nameKey as any)
            return (
              <Link
                key={item.nameKey}
                href={href}
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

          {/* Acting-As affordance removed in MVP — real auth via Supabase. */}

          {/* Alpha version tag — surfaced app-wide so the build stage is always
              visible. Full "Alpha version x.y.z" string also appears on the
              auth pages. */}
          <div className="mt-1 flex flex-col items-center leading-none" title={`v${APP_VERSION}`}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/80">
              Alpha
            </span>
            <span className="text-[9px] text-slate-500">v{APP_VERSION}</span>
          </div>
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
