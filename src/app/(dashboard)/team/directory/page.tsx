'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Icon } from '@iconify/react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'

// Types
interface TeamMember {
  id: number
  name: string
  email: string
  role: string
  roleColor: 'dark' | 'blue' | 'slate' | 'purple'
  capacity: number
  status: 'active' | 'offline' | 'away'
  lastActive: string
  avatar: string
  assignments: { title: string; dueDate: string }[]
  permissions: { label: string; enabled: boolean }[]
}

// Mock Data
const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: 'Sarah Connor',
    email: 'sarah.c@complianceos.io',
    role: 'Lead Auditor',
    roleColor: 'dark',
    capacity: 95,
    status: 'active',
    lastActive: '2 mins ago',
    avatar: 'Sarah',
    assignments: [
      { title: 'ISO 27001 Annual Review', dueDate: 'Oct 15, 2024' },
      { title: 'SOC2 Internal Audit (Q3)', dueDate: 'Oct 30, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 2,
    name: 'Michael Scott',
    email: 'm.scott@complianceos.io',
    role: 'Org Admin',
    roleColor: 'blue',
    capacity: 62,
    status: 'active',
    lastActive: '1 hour ago',
    avatar: 'Michael',
    assignments: [
      { title: 'Vendor Risk Assessment', dueDate: 'Nov 5, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: true },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 3,
    name: 'David Wallace',
    email: 'd.wallace@complianceos.io',
    role: 'Compliance Officer',
    roleColor: 'slate',
    capacity: 45,
    status: 'offline',
    lastActive: '3 days ago',
    avatar: 'David',
    assignments: [
      { title: 'GDPR Compliance Check', dueDate: 'Nov 12, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: true },
    ],
  },
  {
    id: 4,
    name: 'Kelly Kapoor',
    email: 'k.kapoor@complianceos.io',
    role: 'Reporting Analyst',
    roleColor: 'purple',
    capacity: 22,
    status: 'active',
    lastActive: 'Just now',
    avatar: 'Kelly',
    assignments: [
      { title: 'Q4 Compliance Report', dueDate: 'Dec 1, 2024' },
    ],
    permissions: [
      { label: 'Manage Org Settings', enabled: false },
      { label: 'Approve Compliance Docs', enabled: false },
    ],
  },
]

const trainingModules = [
  { nameKey: 'team.complianceFundamentals' as const, completed: 16, total: 18 },
  { nameKey: 'team.dataPrivacyGdpr' as const, completed: 14, total: 18 },
  { nameKey: 'team.riskAssessment' as const, completed: 12, total: 18 },
  { nameKey: 'team.auditProcedures' as const, completed: 18, total: 18 },
]

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

// Helper Components
function StatCard({
  icon,
  iconColor,
  value,
  label,
  badge,
  badgeColor,
  isRTL,
}: {
  icon: string
  iconColor: 'emerald' | 'blue' | 'orange' | 'purple'
  value: string
  label: string
  badge: string
  badgeColor: 'emerald' | 'blue' | 'orange' | 'purple'
  isRTL: boolean
}) {
  const iconColorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  const badgeColorClasses = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50',
  }

  return (
    <Card className="p-6">
      <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}
        >
          <Icon icon={icon} className="text-xl" />
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${badgeColorClasses[badgeColor]}`}>
          {badge}
        </span>
      </div>
      <p className={`text-2xl font-bold text-slate-900 ${isRTL ? 'text-right' : ''}`}>{value}</p>
      <p className={`text-xs font-medium text-slate-500 ${isRTL ? 'text-right' : ''}`}>{label}</p>
    </Card>
  )
}

function RoleBadge({ role, color }: { role: string; color: 'dark' | 'blue' | 'slate' | 'purple' }) {
  const colorClasses = {
    dark: 'bg-slate-900 text-white',
    blue: 'bg-blue-100 text-blue-700',
    slate: 'bg-slate-100 text-slate-600',
    purple: 'bg-purple-100 text-purple-700',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${colorClasses[color]}`}
    >
      {role}
    </span>
  )
}

function WorkloadBar({ capacity, isRTL }: { capacity: number; isRTL: boolean }) {
  const getBarColor = (cap: number) => {
    if (cap >= 90) return 'bg-rose-500'
    if (cap >= 70) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="w-32">
      <div className={`flex justify-between text-[10px] font-bold mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-slate-400">{capacity}%</span>
      </div>
      <div className={`h-1.5 w-full bg-slate-100 rounded-full overflow-hidden ${isRTL ? 'rotate-180' : ''}`}>
        <div
          className={`h-full rounded-full ${getBarColor(capacity)}`}
          style={{ width: `${capacity}%` }}
        />
      </div>
    </div>
  )
}

function StatusIndicator({ status, label, isRTL }: { status: 'active' | 'offline' | 'away'; label: string; isRTL: boolean }) {
  const statusConfig = {
    active: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    offline: { color: 'bg-slate-300', textColor: 'text-slate-400' },
    away: { color: 'bg-amber-500', textColor: 'text-amber-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {label}
    </span>
  )
}

function CapacityRing({ capacity }: { capacity: number }) {
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (capacity / 100) * circumference
  const ringColor = capacity >= 90 ? 'text-rose-500' : capacity >= 70 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-200 stroke-current"
          strokeWidth="12"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <circle
          className={`${ringColor} stroke-current transition-all duration-700`}
          strokeWidth="12"
          strokeLinecap="round"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-900">{capacity}%</span>
      </div>
    </div>
  )
}

function TrainingCircularProgress({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-100 stroke-current"
          strokeWidth="10"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <circle
          className="text-emerald-500 stroke-current"
          strokeWidth="10"
          strokeLinecap="round"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-slate-900">{value}%</span>
      </div>
    </div>
  )
}

function TrainingProgressBar({
  label,
  completed,
  total,
  isRTL,
}: {
  label: string
  completed: number
  total: number
  isRTL: boolean
}) {
  const percentage = (completed / total) * 100
  const isComplete = completed === total

  return (
    <div>
      <div className={`flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-slate-500">{label}</span>
        <span className={isComplete ? 'text-emerald-600' : 'text-slate-900'}>
          {completed}/{total}
        </span>
      </div>
      <div className={`h-1.5 w-full bg-slate-100 rounded-full ${isRTL ? 'rotate-180' : ''}`}>
        <div
          className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export default function TeamDirectoryPage() {
  const { t, isRTL } = useTranslation()
  const pathname = usePathname()
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(teamMembers[0])
  const [isDrawerOpen, setIsDrawerOpen] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Translated member status labels
  const memberStatusLabels: Record<TeamMember['status'], string> = {
    active: t('team.active'),
    offline: t('team.offline'),
    away: t('team.away'),
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
          <div className={`flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 transition-colors border-x border-slate-100 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Icon icon="lucide:search" className="text-slate-400" />
              <input
                type="text"
                placeholder={t('team.findTeammate')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-transparent outline-none text-xs font-medium w-48 placeholder:text-slate-400 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
            <button className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">{t('team.filters')}</button>
          </div>
          <RoleGuard requiredPermission="team:invite" hidden>
            <Button onClick={() => setIsInviteModalOpen(true)}>
              <Icon icon="lucide:user-plus" />
              {t('team.inviteMember')}
            </Button>
          </RoleGuard>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main directory content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <StatCard
                icon="lucide:users-2"
                iconColor="emerald"
                value="18"
                label={t('team.totalMembers')}
                badge={`+2 ${t('team.thisMonth')}`}
                badgeColor="emerald"
                isRTL={isRTL}
              />
              <StatCard
                icon="lucide:shield"
                iconColor="blue"
                value="4"
                label={t('team.adminAccounts')}
                badge={t('team.stable')}
                badgeColor="blue"
                isRTL={isRTL}
              />
              <StatCard
                icon="lucide:activity"
                iconColor="orange"
                value="142"
                label={t('team.assignedTasks')}
                badge={`82% ${t('team.capacity')}`}
                badgeColor="orange"
                isRTL={isRTL}
              />
              <StatCard
                icon="lucide:key"
                iconColor="purple"
                value="100%"
                label={t('team.securityCoverage')}
                badge={t('team.ssoActive')}
                badgeColor="purple"
                isRTL={isRTL}
              />
            </div>

            {/* Training Compliance Section */}
            <div className="mb-8">
              <h3 className={`text-sm font-black text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                {t('team.trainingComplianceOverview')}
              </h3>
              <Card className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className={`flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <TrainingCircularProgress value={89} />
                    <div className={isRTL ? 'text-right' : ''}>
                      <p className="text-sm font-bold text-slate-800">{t('team.overallTrainingCompletion')}</p>
                      <p className="text-xs text-slate-500 mt-1">16 of 18 {t('team.teamMembersCertified')}</p>
                      <p className="text-xs text-amber-600 font-bold mt-1">2 {t('team.certificationsExpiring')}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {trainingModules.map((module, index) => (
                      <TrainingProgressBar
                        key={index}
                        label={t(module.nameKey)}
                        completed={module.completed}
                        total={module.total}
                        isRTL={isRTL}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Member Table */}
            <Card className="overflow-hidden">
              <CardHeader className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <h3 className="text-sm font-bold text-slate-900">{t('team.allTeamMembers')}</h3>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                    <Icon icon="lucide:download" />
                  </button>
                  <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                    <Icon icon="lucide:more-vertical" />
                  </button>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className={`w-full ${isRTL ? 'text-right' : 'text-left'}`}>
                  <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                      <th className="px-6 py-4">{t('team.member')}</th>
                      <th className="px-6 py-4">{t('team.role')}</th>
                      <th className="px-6 py-4">{t('team.workload')}</th>
                      <th className="px-6 py-4">{t('team.status')}</th>
                      <th className="px-6 py-4">{t('team.lastActive')}</th>
                      <th className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>{t('team.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamMembers
                      .filter((member) =>
                        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        member.email.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((member) => (
                        <tr
                          key={member.id}
                          onClick={() => {
                            setSelectedMember(member)
                            setIsDrawerOpen(true)
                          }}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                              <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                                className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                alt={member.name}
                              />
                              <div className={isRTL ? 'text-right' : ''}>
                                <p className="text-sm font-bold text-slate-900">{member.name}</p>
                                <p className="text-xs text-slate-500">{member.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <RoleBadge role={member.role} color={member.roleColor} />
                          </td>
                          <td className="px-6 py-4">
                            <WorkloadBar capacity={member.capacity} isRTL={isRTL} />
                          </td>
                          <td className="px-6 py-4">
                            <StatusIndicator status={member.status} label={memberStatusLabels[member.status]} isRTL={isRTL} />
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">{member.lastActive}</td>
                          <td className={`px-6 py-4 ${isRTL ? 'text-left' : 'text-right'}`}>
                            <RoleGuard requiredPermission="team:edit" hidden>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-slate-900 transition-colors p-2 cursor-pointer"
                              >
                                <Icon icon="lucide:edit-3" />
                              </button>
                            </RoleGuard>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className={`px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <p className="text-xs text-slate-500 font-medium">{t('team.showingMembers').replace('{shown}', '4').replace('{total}', '18')}</p>
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Button variant="outline" size="sm" disabled>
                    {t('team.previous')}
                  </Button>
                  <Button variant="outline" size="sm">
                    {t('team.next')}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Member Detail Drawer */}
        <aside
          className={`bg-white ${isRTL ? 'border-r' : 'border-l'} border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden ${
            isDrawerOpen && selectedMember ? 'w-[400px]' : 'w-0'
          }`}
        >
          {selectedMember && (
            <div className="flex-1 flex flex-col h-full min-w-[400px]">
              <div className="p-6 border-b border-slate-100">
                <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                    {t('team.memberInsights')}
                  </span>
                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <Icon icon="lucide:x" className="text-xl" />
                  </button>
                </div>

                <div className={`flex items-center gap-4 mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedMember.avatar}`}
                    className="w-16 h-16 rounded-2xl border-4 border-slate-50"
                    alt={selectedMember.name}
                  />
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-xl font-bold font-display text-slate-900">
                      {selectedMember.name}
                    </h2>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                      {selectedMember.role}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Assignments */}
                <section>
                  <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span>{t('team.currentAssignments')}</span>
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">
                      {selectedMember.assignments.length}
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {selectedMember.assignments.map((assignment, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-xl border border-slate-100 bg-slate-50 ${isRTL ? 'text-right' : ''}`}
                      >
                        <p className="text-xs font-bold text-slate-700">{assignment.title}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">
                          {t('team.due')}: {assignment.dueDate}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Capacity Metric */}
                <section>
                  <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                    {t('team.bandwidthAnalysis')}
                  </h3>
                  <div className={`flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <CapacityRing capacity={selectedMember.capacity} />
                    <div className={isRTL ? 'text-right' : ''}>
                      <p className="text-sm font-bold text-slate-900">
                        {selectedMember.capacity >= 90
                          ? t('team.nearCapacity')
                          : selectedMember.capacity >= 70
                          ? t('team.moderateLoad')
                          : t('team.available')}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedMember.assignments.length} {t('team.tasksPending')}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Permissions */}
                <section>
                  <h3 className={`text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                    {t('team.accessControl')}
                  </h3>
                  <div className="space-y-2">
                    {selectedMember.permissions.map((permission, index) => (
                      <label
                        key={index}
                        className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl cursor-pointer ${isRTL ? 'flex-row-reverse' : ''} ${
                          permission.enabled ? 'bg-emerald-50/30' : ''
                        }`}
                      >
                        <span className="text-xs font-medium text-slate-700">
                          {permission.label}
                        </span>
                        <div
                          className={`w-8 h-4 rounded-full relative ${
                            permission.enabled ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        >
                          <div
                            className={`absolute top-1 w-2 h-2 bg-white rounded-full ${
                              permission.enabled ? 'right-1' : 'left-1'
                            }`}
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className="p-6 border-t border-slate-100">
                <Button variant="dark" className="w-full">
                  {t('team.updatePermissions')}
                  <Icon icon="lucide:shield-check" />
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title={t('team.inviteNewMember')}
        size="md"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <Input label={t('team.fullName')} placeholder={t('team.fullNamePlaceholder')} />
            <Input label={t('team.workEmail')} type="email" placeholder={t('team.workEmailPlaceholder')} />
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('team.assignRole')}
              </label>
              <select className={`w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white ${isRTL ? 'text-right' : ''}`}>
                <option value="lead-auditor">{t('team.leadAuditor')}</option>
                <option value="compliance-officer">{t('team.complianceOfficer')}</option>
                <option value="reporting-analyst">{t('team.reportingAnalyst')}</option>
                <option value="org-admin">{t('team.organizationAdmin')}</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium text-slate-700 mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                {t('team.accessLevel')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input
                    type="radio"
                    name="access"
                    defaultChecked
                    className="accent-emerald-600"
                  />
                  <span className="text-xs font-bold text-slate-700">{t('team.limitedAccess')}</span>
                </label>
                <label className={`flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <input type="radio" name="access" className="accent-emerald-600" />
                  <span className="text-xs font-bold text-slate-700">{t('team.fullControl')}</span>
                </label>
              </div>
            </div>
          </div>
          <div className={`flex gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsInviteModalOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button className="flex-1">
              {t('team.sendInvitation')}
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
