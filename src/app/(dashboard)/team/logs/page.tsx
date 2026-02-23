'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

// Types
interface UserLog {
  id: number
  timestamp: string
  user: string
  action: 'sign_in' | 'sign_out' | 'session_timeout' | 'password_change' | 'profile_update' | 'permission_change' | 'mfa_enabled' | 'failed_login'
  detailsKey: string
  ipAddress: string
  device: string
  location: string
  status: 'success' | 'warning' | 'failed' | 'info'
}

// Mock Data
const userLogs: UserLog[] = [
  { id: 1, timestamp: '2024-01-15 14:32:18', user: 'Sarah Connor', action: 'sign_in', detailsKey: 'team.signedInViaSso', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 2, timestamp: '2024-01-15 14:28:45', user: 'Michael Scott', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'info' },
  { id: 3, timestamp: '2024-01-15 13:55:12', user: 'David Wallace', action: 'password_change', detailsKey: 'team.passwordUpdatedSuccessfully', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 4, timestamp: '2024-01-15 13:42:30', user: 'Kelly Kapoor', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 5, timestamp: '2024-01-15 12:18:09', user: 'John Smith', action: 'mfa_enabled', detailsKey: 'team.enabledTwoFactorAuth', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 6, timestamp: '2024-01-15 11:45:22', user: 'Jane Doe', action: 'profile_update', detailsKey: 'team.updatedProfilePictureBio', ipAddress: '192.168.1.55', device: 'Chrome on MacOS', location: 'Austin, TX', status: 'success' },
  { id: 7, timestamp: '2024-01-15 11:20:33', user: 'Sarah Connor', action: 'permission_change', detailsKey: 'team.grantedDocumentApprovalAccess', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 8, timestamp: '2024-01-15 10:55:47', user: 'Michael Scott', action: 'failed_login', detailsKey: 'team.invalidPasswordAttempt', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'warning' },
  { id: 9, timestamp: '2024-01-15 10:12:18', user: 'David Wallace', action: 'sign_in', detailsKey: 'team.signedInWithPassword', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 10, timestamp: '2024-01-15 09:38:55', user: 'Kelly Kapoor', action: 'sign_in', detailsKey: 'team.signedInViaGoogleOauth', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 11, timestamp: '2024-01-14 16:45:12', user: 'John Smith', action: 'sign_out', detailsKey: 'team.userSignedOutManually', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 12, timestamp: '2024-01-14 15:22:30', user: 'Jane Doe', action: 'failed_login', detailsKey: 'team.accountLockedFailedAttempts', ipAddress: '10.0.0.55', device: 'Unknown Browser', location: 'Unknown', status: 'failed' },
  { id: 13, timestamp: '2024-01-14 14:18:45', user: 'Sarah Connor', action: 'session_timeout', detailsKey: 'team.sessionExpiredInactivity', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'info' },
  { id: 14, timestamp: '2024-01-14 13:55:09', user: 'Michael Scott', action: 'profile_update', detailsKey: 'team.updatedEmailNotificationPreferences', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'success' },
  { id: 15, timestamp: '2024-01-14 12:42:33', user: 'David Wallace', action: 'permission_change', detailsKey: 'team.adminAccessRevoked', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'warning' },
]

// Helper Components
function UserActionBadge({ action, label }: { action: UserLog['action']; label: string }) {
  const actionColors: Record<UserLog['action'], string> = {
    sign_in: 'bg-emerald-100 text-emerald-700',
    sign_out: 'bg-slate-100 text-slate-700',
    session_timeout: 'bg-blue-100 text-blue-700',
    password_change: 'bg-purple-100 text-purple-700',
    profile_update: 'bg-indigo-100 text-indigo-700',
    permission_change: 'bg-orange-100 text-orange-700',
    mfa_enabled: 'bg-green-100 text-green-700',
    failed_login: 'bg-rose-100 text-rose-700',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionColors[action]}`}
    >
      {label}
    </span>
  )
}

function LogStatusIndicator({ status, label, isRTL }: { status: UserLog['status']; label: string; isRTL: boolean }) {
  const statusConfig = {
    success: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    warning: { color: 'bg-orange-500', textColor: 'text-orange-600' },
    failed: { color: 'bg-rose-500', textColor: 'text-rose-600' },
    info: { color: 'bg-blue-500', textColor: 'text-blue-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

export default function TeamLogsPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()
  const [expandedLogs, setExpandedLogs] = useState<number[]>([])
  const [logSearch, setLogSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Translated action labels
  const actionLabels: Record<UserLog['action'], string> = {
    sign_in: t('team.signIn'),
    sign_out: t('team.signOut'),
    session_timeout: t('team.sessionTimeout'),
    password_change: t('team.passwordChange'),
    profile_update: t('team.profileUpdate'),
    permission_change: t('team.permissionChange'),
    mfa_enabled: t('team.mfaEnabled'),
    failed_login: t('team.failedLogin'),
  }

  // Translated status labels
  const statusTranslations: Record<UserLog['status'], string> = {
    success: t('team.success'),
    warning: t('team.warning'),
    failed: t('team.failed'),
    info: t('team.info'),
  }

  const filteredLogs = userLogs.filter((log) => {
    const translatedDetails = t(log.detailsKey as Parameters<typeof t>[0])
    const matchSearch = !logSearch ||
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      translatedDetails.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.device.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.location.toLowerCase().includes(logSearch.toLowerCase())
    const matchUser = !filterUser || log.user === filterUser
    const matchAction = !filterAction || log.action === filterAction
    const matchStatus = !filterStatus || log.status === filterStatus
    return matchSearch && matchUser && matchAction && matchStatus
  })

  const clearFilters = () => {
    setLogSearch('')
    setFilterUser('')
    setFilterAction('')
    setFilterStatus('')
  }

  const toggleLogExpand = (logId: number) => {
    setExpandedLogs((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    )
  }

  return (
    <div className={`flex flex-col h-full ${isRTL ? 'rtl' : ''}`}>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold text-slate-900">{t('team.title' as TranslationKey)}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('team.subtitle' as TranslationKey)}</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <Link href="/team/directory" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/directory') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.activeDirectory' as TranslationKey)}
            </Link>
            <Link href="/team/logs" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/logs') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.userLogs' as TranslationKey)}
            </Link>
            <Link href="/team/training" className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${pathname.startsWith('/team/training') ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
              {t('team.tabs.training' as TranslationKey)}
            </Link>
          </div>
        </div>
        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* no right-side buttons */}
        </div>
      </header>
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
      {/* Filters */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
              {t('team.searchLogs')}
            </label>
            <div className="relative">
              <Icon
                icon="lucide:search"
                className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`}
              />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder={t('team.searchByUserDeviceLocation')}
                className={`w-full ${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors`}
              />
            </div>
          </div>
          <div>
            <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
              {t('team.user')}
            </label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('team.allUsers')}</option>
              <option value="Sarah Connor">Sarah Connor</option>
              <option value="Michael Scott">Michael Scott</option>
              <option value="David Wallace">David Wallace</option>
              <option value="Kelly Kapoor">Kelly Kapoor</option>
              <option value="John Smith">John Smith</option>
              <option value="Jane Doe">Jane Doe</option>
            </select>
          </div>
          <div>
            <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
              {t('team.actionType')}
            </label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('team.allActions')}</option>
              <option value="sign_in">{t('team.signIn')}</option>
              <option value="sign_out">{t('team.signOut')}</option>
              <option value="session_timeout">{t('team.sessionTimeout')}</option>
              <option value="password_change">{t('team.passwordChange')}</option>
              <option value="profile_update">{t('team.profileUpdate')}</option>
              <option value="permission_change">{t('team.permissionChange')}</option>
              <option value="mfa_enabled">{t('team.mfaEnabled')}</option>
              <option value="failed_login">{t('team.failedLogin')}</option>
            </select>
          </div>
          <div>
            <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ${isRTL ? 'text-right' : ''}`}>
              {t('team.status')}
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('team.allStatuses')}</option>
              <option value="success">{t('team.success')}</option>
              <option value="warning">{t('team.warning')}</option>
              <option value="failed">{t('team.failed')}</option>
              <option value="info">{t('team.info')}</option>
            </select>
          </div>
        </div>
        <div className={`flex items-center justify-between mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={clearFilters}
            className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            {t('team.clearFilters')}
          </button>
          <Button size="sm">
            <Icon icon="lucide:download" />
            {t('team.exportLogs')}
          </Button>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="overflow-hidden">
        <CardHeader className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
          <h3 className="text-sm font-bold text-slate-900">{t('team.userActivityLogs')}</h3>
          <span className="text-xs text-slate-500 font-medium">
            {filteredLogs.length} {t('team.entriesFound')}
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                <th className="px-6 py-4">
                  <div className={`flex items-center gap-2 cursor-pointer hover:text-slate-600 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {t('team.timestamp')}
                    <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className={`flex items-center gap-2 cursor-pointer hover:text-slate-600 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    {t('team.userName')}
                    <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                  </div>
                </th>
                <th className="px-6 py-4">{t('team.actionType')}</th>
                <th className="px-6 py-4">{t('team.deviceLocation')}</th>
                <th className="px-6 py-4">{t('team.details')}</th>
                <th className="px-6 py-4">{t('team.status')}</th>
                <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'} w-12`}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    onClick={() => toggleLogExpand(log.id)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      expandedLogs.includes(log.id) ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                    )}
                  >
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {log.timestamp}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                          className="w-6 h-6 rounded-full border border-slate-200"
                          alt={log.user}
                        />
                        <span className="text-sm font-bold text-slate-900">{log.user}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <UserActionBadge action={log.action} label={actionLabels[log.action]} />
                    </td>
                    <td className="px-6 py-4">
                      <div className={isRTL ? 'text-right' : ''}>
                        <p className="text-xs font-medium text-slate-700">{log.device}</p>
                        <p className="text-[10px] text-slate-400">{log.location}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                      {t(log.detailsKey as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-6 py-4">
                      <LogStatusIndicator status={log.status} label={statusTranslations[log.status]} isRTL={isRTL} />
                    </td>
                    <td className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                      <Icon
                        icon={expandedLogs.includes(log.id) ? "lucide:chevron-up" : "lucide:chevron-down"}
                        className="w-4 h-4 text-slate-400"
                      />
                    </td>
                  </tr>
                  {/* Expandable detail row */}
                  {expandedLogs.includes(log.id) && (
                    <tr className="animate-expand-row">
                      <td colSpan={7} className="px-4 py-4 bg-slate-50">
                        <div className={`${isRTL ? 'mr-8' : 'ml-8'} p-5 bg-white rounded-xl border border-slate-200 shadow-sm`}>
                          <div className="grid grid-cols-4 gap-6">
                            <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                              <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                                className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                alt={log.user}
                              />
                              <div className={isRTL ? 'text-right' : ''}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('team.user')}</p>
                                <p className="text-sm font-bold text-slate-900">{log.user}</p>
                              </div>
                            </div>
                            <div className={isRTL ? 'text-right' : ''}>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.logId')}</p>
                              <p className="font-mono text-sm text-slate-700">#{log.id.toString().padStart(6, '0')}</p>
                            </div>
                            <div className={isRTL ? 'text-right' : ''}>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.device')}</p>
                              <p className="text-sm font-bold text-slate-900">{log.device}</p>
                            </div>
                            <div className={isRTL ? 'text-right' : ''}>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.location')}</p>
                              <p className="text-sm text-slate-600">{log.location}</p>
                            </div>
                          </div>
                          <div className={`mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('team.fullContext')}</p>
                            <p className="text-sm text-slate-700 leading-relaxed">{t(log.detailsKey as Parameters<typeof t>[0])}</p>
                            <p className="text-xs text-slate-500 mt-2">{t('team.ipAddress')}: {log.ipAddress}</p>
                          </div>
                          <div className={`flex gap-3 mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Button variant="outline" size="sm">
                              <Icon icon="lucide:user" className="w-3 h-3" />
                              {t('team.viewUserProfile')}
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Icon icon="lucide:download" className="w-3 h-3" />
                              {t('team.exportLogEntry')}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
          <p className="text-xs text-slate-500 font-medium">
            {t('team.showingLogs').replace('{shown}', filteredLogs.length.toString()).replace('{total}', userLogs.length.toString())}
          </p>
          <Button variant="outline" size="sm">
            {t('team.loadMore')}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  )
}
