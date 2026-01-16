'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: 'lucide:layout-grid' },
  { name: 'Audits', href: '/audits', icon: 'lucide:calendar' },
  { name: 'Correspondence', href: '/correspondence', icon: 'lucide:mail' },
  { name: 'Reports', href: '/reports', icon: 'lucide:file-text' },
  { name: 'Team', href: '/team', icon: 'lucide:users' },
  { name: 'Analytics', href: '/analytics', icon: 'lucide:bar-chart-3' },
  { name: 'Settings', href: '/settings', icon: 'lucide:settings' },
]

const bottomNav = [
  { name: 'Notifications', href: '#', icon: 'lucide:bell', badge: true },
  { name: 'Messages', href: '#', icon: 'lucide:message-circle' },
  { name: 'Help', href: '#', icon: 'lucide:help-circle' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-20 lg:w-24 bg-slate-900 flex flex-col items-center py-8 gap-10 border-r border-slate-800 shrink-0">
      {/* Logo */}
      <div className="text-emerald-400">
        <Icon icon="lucide:shield-check" className="text-4xl" />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col gap-8">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'sidebar-icon transition-colors',
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-400 hover:text-emerald-400'
              )}
              title={item.name}
            >
              <Icon icon={item.icon} className="text-2xl" />
            </Link>
          )
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="mt-auto flex flex-col items-center gap-6">
        {bottomNav.map((item) => (
          <button
            key={item.name}
            className="text-slate-400 hover:text-white transition-colors relative sidebar-icon"
            title={item.name}
          >
            <Icon icon={item.icon} className="text-xl" />
            {item.badge && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full" />
            )}
          </button>
        ))}

        {/* Logout */}
        <Link
          href="/sign-in"
          className="text-slate-500 hover:text-rose-400 transition-colors sidebar-icon"
          title="Logout"
        >
          <Icon icon="lucide:log-out" className="text-xl" />
        </Link>

        {/* Profile */}
        <button className="focus:outline-none">
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
            alt="User"
            className="w-10 h-10 rounded-full border-2 border-slate-700 hover:border-emerald-400 transition-all cursor-pointer hover:scale-110"
          />
        </button>
      </div>
    </aside>
  )
}
