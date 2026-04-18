'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useUserLogStore } from '@/stores/user-log-store'
import type { UserLog } from '@/stores/user-log-store'
import { useTeamStore } from '@/stores/team-store'
import { MemberDetailDrawer } from '@/components/team/directory/member-detail-drawer'
import type { TeamMember } from '@/types'

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

function LogStatusIndicator({ status, label }: { status: UserLog['status']; label: string }) {
  const statusConfig = {
    success: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    warning: { color: 'bg-orange-500', textColor: 'text-orange-600' },
    failed: { color: 'bg-rose-500', textColor: 'text-rose-600' },
    info: { color: 'bg-blue-500', textColor: 'text-blue-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

export default function TeamLogsPage() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const [expandedLogs, setExpandedLogs] = useState<number[]>([])
  const [logSearch, setLogSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [logSort, setLogSort] = useState<{ col: 'timestamp' | 'user'; dir: 'asc' | 'desc' } | null>(null)
  const [selectedLogMember, setSelectedLogMember] = useState<TeamMember | null>(null)
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false)
  const LOGS_PER_PAGE = 10
  const [currentPage, setCurrentPage] = useState(1)

  const userLogs = useUserLogStore((s) => s.logs)
  const members = useTeamStore((s) => s.members)
  const storeUpdate = useTeamStore((s) => s.update)

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

  const toggleLogSort = (col: 'timestamp' | 'user') => {
    setLogSort(prev => {
      if (prev?.col === col) {
        return prev.dir === 'asc' ? { col, dir: 'desc' } : null
      }
      return { col, dir: 'asc' }
    })
  }

  const sortedLogs = useMemo(() => {
    if (!logSort) return filteredLogs
    const list = [...filteredLogs]
    const { col, dir } = logSort
    list.sort((a, b) => {
      const cmp = col === 'timestamp'
        ? a.timestamp.localeCompare(b.timestamp)
        : a.user.localeCompare(b.user)
      return dir === 'desc' ? -cmp : cmp
    })
    return list
  }, [filteredLogs, logSort])

  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / LOGS_PER_PAGE))

  // Reset to page 1 whenever filters / sort / search change the result set
  useEffect(() => {
    setCurrentPage(1)
  }, [logSearch, filterUser, filterAction, filterStatus, logSort])

  // Clamp page if data shrinks below current page
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * LOGS_PER_PAGE
    return sortedLogs.slice(start, start + LOGS_PER_PAGE)
  }, [sortedLogs, currentPage])

  const toggleLogExpand = (logId: number) => {
    setExpandedLogs((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
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
        <div className="flex items-center gap-4">
          {/* no right-side buttons */}
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        {/* Filters */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                {t('team.searchLogs')}
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:search"
                  className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder={t('team.searchByUserDeviceLocation')}
                  className="w-full ps-10 pe-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                {t('team.user')}
              </label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
              >
                <option value="">{t('team.allUsers')}</option>
                {Array.from(new Set(userLogs.map(l => l.user))).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                {t('team.actionType')}
              </label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
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
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                {t('team.status')}
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
              >
                <option value="">{t('team.allStatuses')}</option>
                <option value="success">{t('team.success')}</option>
                <option value="warning">{t('team.warning')}</option>
                <option value="failed">{t('team.failed')}</option>
                <option value="info">{t('team.info')}</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={clearFilters}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              {t('team.clearFilters')}
            </button>
            <Button size="sm" onClick={() => {
              import('@/lib/export').then(({ exportUserLogsLocalized }) => {
                exportUserLogsLocalized(filteredLogs, 'user-logs', t)
              })
            }}>
              <Icon icon="lucide:download" />
              {t('team.exportLogs')}
            </Button>
          </div>
        </Card>

        {/* Logs Table */}
        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{t('team.userActivityLogs')}</h3>
            <span className="text-xs text-slate-500 font-medium">
              {filteredLogs.length} {t('team.entriesFound')}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                  <th className="px-6 py-4">
                    <button onClick={() => toggleLogSort('timestamp')} className="flex items-center gap-2 cursor-pointer hover:text-slate-600">
                      {t('team.timestamp')}
                      <Icon icon={logSort?.col === 'timestamp' ? (logSort.dir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down') : 'lucide:chevrons-up-down'} className="text-xs" />
                    </button>
                  </th>
                  <th className="px-6 py-4">
                    <button onClick={() => toggleLogSort('user')} className="flex items-center gap-2 cursor-pointer hover:text-slate-600">
                      {t('team.userName')}
                      <Icon icon={logSort?.col === 'user' ? (logSort.dir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down') : 'lucide:chevrons-up-down'} className="text-xs" />
                    </button>
                  </th>
                  <th className="px-6 py-4">{t('team.actionType')}</th>
                  <th className="px-6 py-4">{t('team.deviceLocation')}</th>
                  <th className="px-6 py-4">{t('team.details')}</th>
                  <th className="px-6 py-4">{t('team.status')}</th>
                  <th className="px-6 py-4 text-end w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pagedLogs.map((log) => (
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
                        <div className="flex items-center gap-2">
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
                        <div>
                          <p className="text-xs font-medium text-slate-700">{log.device}</p>
                          <p className="text-[10px] text-slate-400">{log.location}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                        {t(log.detailsKey as Parameters<typeof t>[0])}
                      </td>
                      <td className="px-6 py-4">
                        <LogStatusIndicator status={log.status} label={statusTranslations[log.status]} />
                      </td>
                      <td className="px-6 py-4 text-end">
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
                          <div className="ms-8 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <div className="grid grid-cols-4 gap-6">
                              <div className="flex items-center gap-3">
                                <img
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                                  className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                  alt={log.user}
                                />
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('team.user')}</p>
                                  <p className="text-sm font-bold text-slate-900">{log.user}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.logId')}</p>
                                <p className="font-mono text-sm text-slate-700">#{log.id.toString().padStart(6, '0')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.device')}</p>
                                <p className="text-sm font-bold text-slate-900">{log.device}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('team.location')}</p>
                                <p className="text-sm text-slate-600">{log.location}</p>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{t('team.fullContext')}</p>
                              <p className="text-sm text-slate-700 leading-relaxed">{t(log.detailsKey as Parameters<typeof t>[0])}</p>
                              <p className="text-xs text-slate-500 mt-2">{t('team.ipAddress')}: {log.ipAddress}</p>
                            </div>
                            <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                              <Button variant="outline" size="sm" onClick={(e) => {
                                e.stopPropagation()
                                const member = members.find(m => m.name === log.user)
                                if (member) {
                                  setSelectedLogMember(member)
                                  setIsProfileDrawerOpen(true)
                                }
                              }}>
                                <Icon icon="lucide:user" className="w-3 h-3" />
                                {t('team.viewUserProfile')}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={(e) => {
                                e.stopPropagation()
                                import('@/lib/export').then(({ exportUserLogsLocalized }) => {
                                  exportUserLogsLocalized([log], `log-${log.id}`, t)
                                })
                              }}>
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
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              {sortedLogs.length === 0
                ? t('team.showingLogs').replace('{shown}', '0').replace('{total}', userLogs.length.toString())
                : t('team.showingLogs')
                    .replace('{shown}', `${(currentPage - 1) * LOGS_PER_PAGE + 1}–${Math.min(currentPage * LOGS_PER_PAGE, sortedLogs.length)}`)
                    .replace('{total}', sortedLogs.length.toString())}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Icon icon="lucide:chevron-left" className="inline w-3 h-3 me-1" />
                  {t('observations.pagination.previous' as TranslationKey)}
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | 'dots')[]>((acc, p) => {
                    const last = acc[acc.length - 1]
                    if (last !== undefined && last !== 'dots' && p - (last as number) > 1) acc.push('dots')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, idx) =>
                    p === 'dots' ? (
                      <span key={`d${idx}`} className="px-1 text-xs text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        className={cn(
                          'px-3 py-1 border rounded-lg text-xs font-bold transition-colors cursor-pointer',
                          currentPage === p
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {t('observations.pagination.next' as TranslationKey)}
                  <Icon icon="lucide:chevron-right" className="inline w-3 h-3 ms-1" />
                </button>
              </div>
            )}
          </div>
        </Card>
        </div>
        <MemberDetailDrawer
          member={selectedLogMember}
          isOpen={isProfileDrawerOpen}
          onClose={() => setIsProfileDrawerOpen(false)}
          onUpdateRole={(memberId, newRole) => storeUpdate(memberId, { role: newRole })}
          onUpdatePermission={(memberId, label, enabled) => {
            const m = members.find(x => x.id === memberId)
            if (m) storeUpdate(memberId, { accessControls: (m.accessControls || []).map(p => p.label === label ? { ...p, enabled } : p) })
          }}
          onToast={() => {}}
        />
      </div>
    </div>
  )
}
