'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/time-utils'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'

const navigation = [
  { nameKey: 'navigation.dashboard', href: '/dashboard', icon: 'lucide:layout-grid' },
  { nameKey: 'navigation.calendar', href: '/calendar', icon: 'lucide:calendar' },
  { nameKey: 'navigation.correspondence', href: '/correspondence', icon: 'lucide:mail' },
  { nameKey: 'navigation.reports', href: '/reports', icon: 'lucide:file-text' },
  { nameKey: 'navigation.team', href: '/team', icon: 'lucide:users' },
  { nameKey: 'navigation.settings', href: '/settings', icon: 'lucide:settings' },
]

// Types
interface Notification {
  id: number
  title: string
  message: string
  timestamp: Date
  unread: boolean
}

// Helper to create a date relative to now
function hoursAgo(hours: number): Date {
  const date = new Date()
  date.setHours(date.getHours() - hours)
  return date
}

function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

// Mock data with actual timestamps for proper localization
const mockNotifications: Notification[] = [
  { id: 1, title: 'New SAMA Circular', message: 'Circular 44321/2024 requires immediate review', timestamp: hoursAgo(2), unread: true },
  { id: 2, title: 'Observation Assigned', message: 'You have been assigned to OBS-2024-015', timestamp: hoursAgo(5), unread: true },
  { id: 3, title: 'Report Approved', message: 'Q3 Compliance Report has been approved', timestamp: daysAgo(1), unread: false },
  { id: 4, title: 'Training Reminder', message: 'AML Training due in 3 days', timestamp: daysAgo(2), unread: false },
]

// Avatar presets for selection
const avatarPresets = ['Felix', 'Sarah', 'Michael', 'Ahmed', 'Layla', 'Omar', 'Fatima', 'Hassan', 'Nora', 'Khalid', 'Mona', 'Yusuf']

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[100] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t, isRTL } = useTranslation()

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)

  // Avatar state
  const [avatarSrc, setAvatarSrc] = useState('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix')

  // Profile state
  const [profileData, setProfileData] = useState({
    name: 'Felix Henderson',
    email: 'felix.henderson@complianceos.com',
    department: 'Compliance',
    role: 'Senior Compliance Officer',
    phone: '+966 50 123 4567',
  })

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const unreadCount = notifications.filter(n => n.unread).length

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
    showToast(t('sidebar.markAllRead'))
  }

  const handleSignOut = () => {
    if (confirm(t('sidebar.signOut') + '?')) {
      showToast(t('sidebar.signingOut'))
      setTimeout(() => {
        router.push('/sign-in')
      }, 1500)
    }
  }

  const handleProfileUpdate = () => {
    showToast(t('sidebar.profileUpdated'))
    setIsProfileOpen(false)
    setShowAvatarPicker(false)
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setAvatarSrc(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSelectPresetAvatar = (seed: string) => {
    setAvatarSrc(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`)
    setShowAvatarPicker(false)
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
            onClick={() => setIsNotificationsOpen(true)}
            className="relative w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.notifications')}
          >
            <Icon icon="lucide:bell" className="text-2xl" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"
                style={{ border: '2px solid #1e293b' }}
              />
            )}
          </button>

          {/* Messages */}
          <button
            onClick={() => showToast(t('sidebar.chatFeatureSoon'))}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.messages')}
          >
            <Icon icon="lucide:message-square" className="text-2xl" />
          </button>

          {/* Help Center */}
          <button
            onClick={() => showToast(t('sidebar.helpCenterOpening'))}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.helpCenter')}
          >
            <Icon icon="lucide:help-circle" className="text-2xl" />
          </button>
        </div>

        {/* Bottom Section: Sign Out & Profile */}
        <div className="flex flex-col gap-3 items-center">
          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-all cursor-pointer"
            title={t('sidebar.signOut')}
          >
            <Icon icon="lucide:log-out" className="text-2xl" />
          </button>

          {/* Profile */}
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
        </div>
      </aside>

      {/* Notifications Modal */}
      <Modal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        title={t('sidebar.notifications')}
        subtitle={`${unreadCount} ${t('sidebar.unread')}`}
        size="lg"
      >
        <div className="space-y-3 max-h-[400px] overflow-y-auto hide-scrollbar">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={cn(
                'flex gap-4 p-4 rounded-lg hover:bg-slate-100 transition-all',
                notif.unread ? 'bg-emerald-50' : 'bg-slate-50'
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0',
                  notif.unread ? 'bg-emerald-600' : 'bg-slate-400'
                )}
              >
                <Icon icon="lucide:bell" className="text-lg" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{notif.title}</p>
                <p className="text-xs text-slate-600 mt-1">{notif.message}</p>
                <p className="text-[10px] text-slate-400 mt-2">{formatRelativeTime(notif.timestamp, t)}</p>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={handleMarkAllRead}
          className="w-full mt-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {t('sidebar.markAllRead')}
        </button>
      </Modal>

      {/* Profile Edit Modal */}
      <Modal
        isOpen={isProfileOpen}
        onClose={() => {
          setIsProfileOpen(false)
          setShowAvatarPicker(false)
        }}
        title={t('sidebar.editProfile')}
        subtitle=""
        size="lg"
      >
        <div className="space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4 pb-6 border-b border-slate-200">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <img
                src={avatarSrc}
                alt="Profile"
                className="w-24 h-24 rounded-full border-4 border-slate-200"
              />
              <div className="absolute inset-0 bg-slate-900/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Icon icon="lucide:camera" className="text-white text-2xl" />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-2 cursor-pointer"
              >
                <Icon icon="lucide:upload" className="text-lg" />
                {t('sidebar.uploadPhoto')}
              </button>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2 cursor-pointer"
              >
                <Icon icon="lucide:grid-3x3" className="text-lg" />
                {t('sidebar.chooseAvatar')}
              </button>
            </div>

            {/* Avatar Preset Picker */}
            {showAvatarPicker && (
              <div className="w-full mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-700 uppercase mb-3">Choose an Avatar</p>
                <div className="grid grid-cols-6 gap-3">
                  {avatarPresets.map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => handleSelectPresetAvatar(seed)}
                      className="w-12 h-12 rounded-full border-2 border-slate-200 hover:border-emerald-500 transition-all overflow-hidden cursor-pointer"
                    >
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`}
                        alt={seed}
                        className="w-full h-full"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Personal Info */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
              {t('sidebar.fullName')}
            </label>
            <input
              type="text"
              value={profileData.name}
              onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
              {t('sidebar.emailAddress')}
            </label>
            <input
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('sidebar.department')}
              </label>
              <select
                value={profileData.department}
                onChange={(e) => setProfileData(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Compliance">Compliance</option>
                <option value="Risk Management">Risk Management</option>
                <option value="Internal Audit">Internal Audit</option>
                <option value="Legal">Legal</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                {t('sidebar.role')}
              </label>
              <select
                value={profileData.role}
                onChange={(e) => setProfileData(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Senior Compliance Officer">Senior Compliance Officer</option>
                <option value="Compliance Analyst">Compliance Analyst</option>
                <option value="Risk Manager">Risk Manager</option>
                <option value="Audit Manager">Audit Manager</option>
                <option value="Team Lead">Team Lead</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
              {t('sidebar.phoneNumber')}
            </label>
            <input
              type="tel"
              value={profileData.phone}
              onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 mt-8">
            <button
              onClick={handleProfileUpdate}
              className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Icon icon="lucide:check" className="text-lg" />
              {t('common.saveChanges')}
            </button>
            <button
              onClick={() => {
                setIsProfileOpen(false)
                setShowAvatarPicker(false)
              }}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </>
  )
}
