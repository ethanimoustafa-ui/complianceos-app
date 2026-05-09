'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import { useTeamStore } from '@/stores/team-store'
import { useWorkload } from '@/hooks/useWorkload'
import { SortHeader, type SortState } from '@/components/ui/sort-header'
import { EditableSelect } from '@/components/ui/editable-select'
import type { TeamMember } from '@/types'

import { DirectoryStatCards } from '@/components/team/directory/stat-cards'
import { MemberDetailDrawer } from '@/components/team/directory/member-detail-drawer'
import { PendingApprovalsCard } from '@/components/team/directory/pending-approvals-card'
import { BurnoutDetectionCard } from '@/components/team/directory/burnout-detection-card'
import { dicebearAvatar } from '@/lib/avatar'

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 z-[60] animate-toast">
      <Icon icon="lucide:check-circle" className="text-2xl" />
      <span className="font-bold">{message}</span>
    </div>
  )
}

function RoleBadge({ role }: { role: TeamMember['role'] }) {
  const { t } = useTranslation()
  const colorClasses: Record<TeamMember['role'], string> = {
    admin: 'bg-blue-100 text-blue-700',
    manager: 'bg-slate-900 text-white',
    officer: 'bg-slate-100 text-slate-600',
  }
  const roleLabels: Record<TeamMember['role'], string> = {
    officer: t('team.roleOfficer' as TranslationKey),
    manager: t('team.roleManager' as TranslationKey),
    admin: t('team.roleAdmin' as TranslationKey),
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${colorClasses[role]}`}>
      {roleLabels[role]}
    </span>
  )
}

function WorkloadBar({ memberId, memberName, member }: { memberId: string; memberName: string; member?: { burnoutSince?: string; assignments?: { title: string; dueDate: string; progress?: number }[] } }) {
  const workload = useWorkload(memberId, member, memberName)
  const capacity = Math.round(workload.percentage)

  const getBarColor = (cap: number) => {
    if (cap >= 90) return 'bg-rose-500'
    if (cap >= 75) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="w-32" title={`${workload.breakdown.observations} obs, ${workload.breakdown.audits} audits, ${workload.breakdown.policies} policies`}>
      <div className="flex justify-between text-[10px] font-bold mb-1">
        <span className="text-slate-400">{capacity}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${getBarColor(capacity)}`} style={{ width: `${capacity}%` }} />
      </div>
    </div>
  )
}

function StatusIndicator({ status, label }: { status: 'active' | 'inactive' | 'pending'; label: string }) {
  const statusConfig: Record<string, { color: string; textColor: string }> = {
    active: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    inactive: { color: 'bg-slate-300', textColor: 'text-slate-400' },
    pending: { color: 'bg-amber-500', textColor: 'text-amber-600' },
  }

  const config = statusConfig[status] || statusConfig.inactive

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

export default function TeamDirectoryPage() {
  const { t } = useTranslation()
  const pathname = usePathname()

  // Store data
  const members = useTeamStore((s) => s.members)
  const storeUpdate = useTeamStore((s) => s.update)

  // UI state — store only the ID so the member is derived from the store (Fix 3)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const selectedMember = members.find(m => m.id === selectedMemberId) ?? null
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [sortState, setSortState] = useState<SortState<'name' | 'role' | 'workload' | 'status' | 'lastActive'>>(null)
  const defaultInviteRow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return {
      fullName: '', email: '', role: 'officer' as TeamMember['role'], accessLevel: 'limited',
      permissions: { 'View Risk Register': true, 'Export Compliance Data': false, 'View Audit Reports': false, 'View Training Data': false } as Record<string, boolean>,
      accessDuration: d.toISOString().slice(0, 10),
    }
  }
  const [inviteRows, setInviteRows] = useState([defaultInviteRow()])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Click-outside to close drawer (Fix 1)
  useEffect(() => {
    if (!isDrawerOpen) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target) return
      // Ignore clicks inside the drawer
      if (target.closest('[data-member-drawer]')) return
      // Ignore clicks on table rows (they handle their own open/replace logic)
      if (target.closest('tr')) return
      // Ignore clicks on interactive elements
      if (target.closest('button, a, input, select, textarea, [role="dialog"]')) return
      setIsDrawerOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isDrawerOpen])

  const memberStatusLabels: Record<string, string> = {
    active: t('team.active'),
    inactive: t('team.offline'),
    pending: t('team.away'),
  }

  const adminCount = members.filter((m) => m.role === 'admin').length
  const totalAssignedTasks = members.reduce((sum, m) => sum + (m.assignments?.length || 0), 0)

  const handleUpdateRole = (memberId: string, newRole: TeamMember['role']) => {
    storeUpdate(memberId, { role: newRole })
  }

  const handleUpdatePermission = (memberId: string, permissionLabel: string, enabled: boolean) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    const updatedPermissions = (member.accessControls || []).map((p) =>
      p.label === permissionLabel ? { ...p, enabled } : p
    )
    storeUpdate(memberId, { accessControls: updatedPermissions })
  }

  const handleSort = (col: 'name' | 'role' | 'workload' | 'status' | 'lastActive') => {
    setSortState(prev => {
      if (prev?.col === col) {
        return prev.dir === 'asc' ? { col, dir: 'desc' } : null
      }
      return { col, dir: 'asc' }
    })
  }

  const filteredMembers = members.filter(
    (member) =>
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedMembers = useMemo(() => {
    const list = [...filteredMembers]
    if (!sortState) return list
    const { col, dir } = sortState
    list.sort((a, b) => {
      let cmp = 0
      switch (col) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'role': cmp = a.role.localeCompare(b.role); break
        case 'workload': cmp = a.workload - b.workload; break
        case 'status': cmp = a.status.localeCompare(b.status); break
        case 'lastActive': cmp = a.joinedAt.localeCompare(b.joinedAt); break
      }
      return dir === 'desc' ? -cmp : cmp
    })
    return list
  }, [filteredMembers, sortState])

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
          <Gate perm="Manage Team & Permissions">
            <Button onClick={() => setIsInviteModalOpen(true)}>
              <Icon icon="lucide:user-plus" />
              {t('team.inviteMember')}
            </Button>
          </Gate>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main directory content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
            {/* Stats Row */}
            <DirectoryStatCards
              totalMembers={members.length}
              adminCount={adminCount}
              assignedTasks={totalAssignedTasks}
            />

            {/* Pending Approvals & Burnout Detection */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <PendingApprovalsCard />
              <BurnoutDetectionCard />
            </div>

            {/* Member Table */}
            <Card className="overflow-hidden">
              <CardHeader className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">{t('team.allTeamMembers')}</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    <Icon icon="lucide:search" className="text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder={t('team.searchMembers' as TranslationKey)}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none text-xs font-medium w-48 placeholder:text-slate-400"
                    />
                  </div>
                <button
                  onClick={() => {
                    import('@/lib/export').then(({ exportToCSV }) => {
                      const data = members.map(m => ({
                        Name: m.name,
                        Email: m.email,
                        Role: m.role,
                        Department: m.department,
                        Status: m.status,
                        'Joined Date': m.joinedAt,
                        Workload: `${m.workload}%`,
                        Nationality: m.nationality || '',
                      }))
                      exportToCSV(data, { filename: 'team-members', headers: ['Name', 'Email', 'Role', 'Department', 'Status', 'Joined Date', 'Workload', 'Nationality'] })
                    })
                  }}
                  className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer"
                >
                  <Icon icon="lucide:download" />
                </button>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-start">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                      <th className="px-6 py-4 text-start">
                        <SortHeader label={t('team.member')} column="name" activeColumn={sortState?.col ?? null} direction={sortState?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSortState(null)} />
                      </th>
                      <th className="px-6 py-4 text-start">
                        <SortHeader label={t('team.role')} column="role" activeColumn={sortState?.col ?? null} direction={sortState?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSortState(null)} />
                      </th>
                      <th className="px-6 py-4 text-start">
                        <SortHeader label={t('team.workload')} column="workload" activeColumn={sortState?.col ?? null} direction={sortState?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSortState(null)} />
                      </th>
                      <th className="px-6 py-4 text-start">
                        <SortHeader label={t('team.status')} column="status" activeColumn={sortState?.col ?? null} direction={sortState?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSortState(null)} />
                      </th>
                      <th className="px-6 py-4 text-start">
                        <SortHeader label={t('team.lastActive')} column="lastActive" activeColumn={sortState?.col ?? null} direction={sortState?.dir ?? 'asc'} onSort={handleSort} onClear={() => setSortState(null)} />
                      </th>
                      <th className="px-6 py-4 text-end">{t('team.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedMembers.map((member) => (
                      <tr
                        key={member.id}
                        onClick={() => { setSelectedMemberId(member.id); setIsDrawerOpen(true) }}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={dicebearAvatar(member.avatar || member.name)}
                              className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                              alt={member.name}
                            />
                            <div>
                              <p className="text-sm font-bold text-slate-900">{member.name}</p>
                              <p className="text-xs text-slate-500">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <RoleBadge role={member.role} />
                        </td>
                        <td className="px-6 py-4">
                          <WorkloadBar memberId={member.id} memberName={member.name} member={member} />
                        </td>
                        <td className="px-6 py-4">
                          <StatusIndicator status={member.status} label={memberStatusLabels[member.status] || member.status} />
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{member.joinedAt}</td>
                        <td className="px-6 py-4 text-end">
                          <Gate perm="Manage Team & Permissions">
                            <button onClick={(e) => { e.stopPropagation(); setSelectedMemberId(member.id); setIsDrawerOpen(true) }} className="text-slate-400 hover:text-slate-900 transition-colors p-2 cursor-pointer">
                              <Icon icon="lucide:edit-3" />
                            </button>
                          </Gate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium">
                  {t('team.showingMembers').replace('{shown}', String(filteredMembers.length)).replace('{total}', String(members.length))}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled>{t('team.previous')}</Button>
                  <Button variant="outline" size="sm">{t('team.next')}</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Member Detail Drawer */}
        <MemberDetailDrawer
          member={selectedMember}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onUpdateRole={handleUpdateRole}
          onUpdatePermission={handleUpdatePermission}
          onToast={showToast}
        />
      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => { setIsInviteModalOpen(false); setInviteRows([defaultInviteRow()]) }}
        title={t('team.inviteNewMember')}
        size="lg"
      >
        <div className="space-y-6">
          {inviteRows.map((row, idx) => (
            <div key={idx} className="space-y-4 pb-4 border-b border-slate-100 last:border-0">
              {inviteRows.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                  <button onClick={() => setInviteRows(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-rose-500 hover:text-rose-700 cursor-pointer">
                    <Icon icon="lucide:x" className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('team.fullName')}
                  placeholder={t('team.fullNamePlaceholder')}
                  value={row.fullName}
                  onChange={(e) => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, fullName: e.target.value } : r))}
                />
                <Input
                  label={t('team.workEmail')}
                  type="email"
                  placeholder={t('team.workEmailPlaceholder')}
                  value={row.email}
                  onChange={(e) => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, email: e.target.value } : r))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('team.assignRole')}</label>
                  <EditableSelect
                    locked
                    value={row.role}
                    onChange={(id) => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, role: id as TeamMember['role'] } : r))}
                    items={[
                      { id: 'officer', label: t('team.complianceOfficer') },
                      { id: 'manager', label: t('team.leadAuditor') },
                      { id: 'admin', label: t('team.organizationAdmin') },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('team.accessLevel')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <input type="radio" name={`access-${idx}`} checked={row.accessLevel === 'limited'} onChange={() => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, accessLevel: 'limited' } : r))} className="accent-emerald-600" />
                      <span className="text-xs font-bold text-slate-700">{t('team.limitedAccess')}</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <input type="radio" name={`access-${idx}`} checked={row.accessLevel === 'full'} onChange={() => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, accessLevel: 'full' } : r))} className="accent-emerald-600" />
                      <span className="text-xs font-bold text-slate-700">{t('team.fullControl')}</span>
                    </label>
                  </div>
                </div>
              </div>
              {row.accessLevel === 'limited' && (
                <div className="space-y-3 pt-2">
                  <label className="block text-sm font-medium text-slate-700">{t('team.accessLevel')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['View Risk Register', 'Export Compliance Data', 'View Audit Reports', 'View Training Data'] as const).map((perm) => (
                      <label key={perm} className="flex items-center gap-2 p-2 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={row.permissions[perm] ?? false}
                          onChange={(e) => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, permissions: { ...r.permissions, [perm]: e.target.checked } } : r))}
                          className="accent-emerald-600"
                        />
                        <span className="text-xs font-bold text-slate-700">{t(`team.${perm === 'View Risk Register' ? 'permissionViewRiskRegister' : perm === 'Export Compliance Data' ? 'permissionExportData' : perm === 'View Audit Reports' ? 'viewAuditReports' : 'viewTrainingData'}` as TranslationKey)}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('team.accessUntil' as TranslationKey)}</label>
                    <input
                      type="date"
                      value={row.accessDuration}
                      onChange={(e) => setInviteRows(prev => prev.map((r, i) => i === idx ? { ...r, accessDuration: e.target.value } : r))}
                      className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setInviteRows(prev => [...prev, defaultInviteRow()])}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
          >
            <Icon icon="lucide:plus" className="w-3 h-3" />
            {t('team.addAnother' as TranslationKey)}
          </button>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => { setIsInviteModalOpen(false); setInviteRows([defaultInviteRow()]) }}>
              {t('common.cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                const store = useTeamStore.getState()
                for (const row of inviteRows) {
                  if (row.email) {
                    await store.invite({ email: row.email, role: row.role, department: '', fullName: row.fullName })
                  }
                }
                setIsInviteModalOpen(false)
                setInviteRows([defaultInviteRow()])
                showToast(t('team.sendInvitation'))
              }}
            >
              {t('team.sendInvitations' as TranslationKey)}
              <Icon icon="lucide:send" className="text-sm" />
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
