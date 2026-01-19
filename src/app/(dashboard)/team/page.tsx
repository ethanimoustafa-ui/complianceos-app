'use client'

import React, { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

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

interface UserLog {
  id: number
  timestamp: string
  user: string
  action: 'sign_in' | 'sign_out' | 'session_timeout' | 'password_change' | 'profile_update' | 'permission_change' | 'mfa_enabled' | 'failed_login'
  details: string
  ipAddress: string
  device: string
  location: string
  status: 'success' | 'warning' | 'failed' | 'info'
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

const userLogs: UserLog[] = [
  { id: 1, timestamp: '2024-01-15 14:32:18', user: 'Sarah Connor', action: 'sign_in', details: 'Signed in via SSO', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 2, timestamp: '2024-01-15 14:28:45', user: 'Michael Scott', action: 'session_timeout', details: 'Session expired after 30 min inactivity', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'info' },
  { id: 3, timestamp: '2024-01-15 13:55:12', user: 'David Wallace', action: 'password_change', details: 'Password updated successfully', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 4, timestamp: '2024-01-15 13:42:30', user: 'Kelly Kapoor', action: 'sign_out', details: 'User signed out manually', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 5, timestamp: '2024-01-15 12:18:09', user: 'John Smith', action: 'mfa_enabled', details: 'Enabled two-factor authentication', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 6, timestamp: '2024-01-15 11:45:22', user: 'Jane Doe', action: 'profile_update', details: 'Updated profile picture and bio', ipAddress: '192.168.1.55', device: 'Chrome on MacOS', location: 'Austin, TX', status: 'success' },
  { id: 7, timestamp: '2024-01-15 11:20:33', user: 'Sarah Connor', action: 'permission_change', details: 'Granted document approval access', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'success' },
  { id: 8, timestamp: '2024-01-15 10:55:47', user: 'Michael Scott', action: 'failed_login', details: 'Invalid password attempt (2 of 3)', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'warning' },
  { id: 9, timestamp: '2024-01-15 10:12:18', user: 'David Wallace', action: 'sign_in', details: 'Signed in with password', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'success' },
  { id: 10, timestamp: '2024-01-15 09:38:55', user: 'Kelly Kapoor', action: 'sign_in', details: 'Signed in via Google OAuth', ipAddress: '192.168.1.76', device: 'Chrome on Windows', location: 'Los Angeles, CA', status: 'success' },
  { id: 11, timestamp: '2024-01-14 16:45:12', user: 'John Smith', action: 'sign_out', details: 'User signed out manually', ipAddress: '192.168.1.201', device: 'Edge on Windows', location: 'Seattle, WA', status: 'success' },
  { id: 12, timestamp: '2024-01-14 15:22:30', user: 'Jane Doe', action: 'failed_login', details: 'Account temporarily locked after 3 failed attempts', ipAddress: '10.0.0.55', device: 'Unknown Browser', location: 'Unknown', status: 'failed' },
  { id: 13, timestamp: '2024-01-14 14:18:45', user: 'Sarah Connor', action: 'session_timeout', details: 'Session expired after 30 min inactivity', ipAddress: '192.168.1.45', device: 'Chrome on MacOS', location: 'San Francisco, CA', status: 'info' },
  { id: 14, timestamp: '2024-01-14 13:55:09', user: 'Michael Scott', action: 'profile_update', details: 'Updated email notification preferences', ipAddress: '192.168.1.102', device: 'Firefox on Windows', location: 'New York, NY', status: 'success' },
  { id: 15, timestamp: '2024-01-14 12:42:33', user: 'David Wallace', action: 'permission_change', details: 'Admin access revoked', ipAddress: '192.168.1.88', device: 'Safari on iOS', location: 'Chicago, IL', status: 'warning' },
]

const trainingModules = [
  { name: 'Compliance Fundamentals', completed: 16, total: 18 },
  { name: 'Data Privacy (GDPR)', completed: 14, total: 18 },
  { name: 'Risk Assessment', completed: 12, total: 18 },
  { name: 'Audit Procedures', completed: 18, total: 18 },
]

export default function TeamManagementPage() {
  const [activeTab, setActiveTab] = useState<'directory' | 'logs'>('directory')
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(teamMembers[0])
  const [expandedLogs, setExpandedLogs] = useState<number[]>([])
  const [isDrawerOpen, setIsDrawerOpen] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filteredLogs = userLogs.filter((log) => {
    const matchSearch = !logSearch ||
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(logSearch.toLowerCase()) ||
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

  const getActionLabel = (action: UserLog['action']) => {
    const labels: Record<UserLog['action'], string> = {
      sign_in: 'Sign In',
      sign_out: 'Sign Out',
      session_timeout: 'Session Timeout',
      password_change: 'Password Change',
      profile_update: 'Profile Update',
      permission_change: 'Permission Change',
      mfa_enabled: 'MFA Enabled',
      failed_login: 'Failed Login',
    }
    return labels[action]
  }

  return (
    <>
      {/* Header with Tabs */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Team Management</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Organization & Permissions</p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'directory'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active Directory
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              User Logs
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-lg">
            <div className="px-4 py-1.5 text-sm font-bold text-slate-900 transition-colors border-x border-slate-100 flex items-center gap-2">
              <Icon icon="lucide:search" className="text-slate-400" />
              <input
                type="text"
                placeholder="Find a teammate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-xs font-medium w-48 placeholder:text-slate-400"
              />
            </div>
            <button className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded cursor-pointer">Filters</button>
          </div>
          <Button onClick={() => setIsInviteModalOpen(true)}>
            <Icon icon="lucide:user-plus" />
            Invite Member
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Directory Content */}
          {activeTab === 'directory' && (
            <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatCard
                  icon="lucide:users-2"
                  iconColor="emerald"
                  value="18"
                  label="Total Members"
                  badge="+2 This month"
                  badgeColor="emerald"
                />
                <StatCard
                  icon="lucide:shield"
                  iconColor="blue"
                  value="4"
                  label="Admin Accounts"
                  badge="Stable"
                  badgeColor="blue"
                />
                <StatCard
                  icon="lucide:activity"
                  iconColor="orange"
                  value="142"
                  label="Assigned Tasks"
                  badge="82% Capacity"
                  badgeColor="orange"
                />
                <StatCard
                  icon="lucide:key"
                  iconColor="purple"
                  value="100%"
                  label="Security Coverage"
                  badge="SSO Active"
                  badgeColor="purple"
                />
              </div>

              {/* Training Compliance Section */}
              <div className="mb-8">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                  Training Compliance Overview
                </h3>
                <Card className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex items-center gap-6">
                      <TrainingCircularProgress value={89} />
                      <div>
                        <p className="text-sm font-bold text-slate-800">Overall Training Completion</p>
                        <p className="text-xs text-slate-500 mt-1">16 of 18 team members certified</p>
                        <p className="text-xs text-amber-600 font-bold mt-1">2 certifications expiring soon</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {trainingModules.map((module, index) => (
                        <TrainingProgressBar
                          key={index}
                          label={module.name}
                          completed={module.completed}
                          total={module.total}
                        />
                      ))}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Member Table */}
              <Card className="overflow-hidden">
                <CardHeader className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">All Team Members</h3>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                      <Icon icon="lucide:download" />
                    </button>
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 cursor-pointer">
                      <Icon icon="lucide:more-vertical" />
                    </button>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-6 py-4">Member</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Workload</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Last Active</th>
                        <th className="px-6 py-4 text-right">Actions</th>
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
                              <div className="flex items-center gap-3">
                                <img
                                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
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
                              <RoleBadge role={member.role} color={member.roleColor} />
                            </td>
                            <td className="px-6 py-4">
                              <WorkloadBar capacity={member.capacity} />
                            </td>
                            <td className="px-6 py-4">
                              <StatusIndicator status={member.status} />
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">{member.lastActive}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-slate-900 transition-colors p-2 cursor-pointer"
                              >
                                <Icon icon="lucide:edit-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-medium">Showing 4 of 18 members</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm">
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* User Logs Content */}
          {activeTab === 'logs' && (
            <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
              {/* Filters */}
              <Card className="p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                      Search Logs
                    </label>
                    <div className="relative">
                      <Icon
                        icon="lucide:search"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        placeholder="Search by user, device, location..."
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                      User
                    </label>
                    <select
                      value={filterUser}
                      onChange={(e) => setFilterUser(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
                    >
                      <option value="">All Users</option>
                      <option value="Sarah Connor">Sarah Connor</option>
                      <option value="Michael Scott">Michael Scott</option>
                      <option value="David Wallace">David Wallace</option>
                      <option value="Kelly Kapoor">Kelly Kapoor</option>
                      <option value="John Smith">John Smith</option>
                      <option value="Jane Doe">Jane Doe</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                      Action Type
                    </label>
                    <select
                      value={filterAction}
                      onChange={(e) => setFilterAction(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
                    >
                      <option value="">All Actions</option>
                      <option value="sign_in">Sign In</option>
                      <option value="sign_out">Sign Out</option>
                      <option value="session_timeout">Session Timeout</option>
                      <option value="password_change">Password Change</option>
                      <option value="profile_update">Profile Update</option>
                      <option value="permission_change">Permission Change</option>
                      <option value="mfa_enabled">MFA Enabled</option>
                      <option value="failed_login">Failed Login</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                      Status
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 transition-colors bg-white"
                    >
                      <option value="">All Statuses</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="failed">Failed</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={clearFilters}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                  <Button size="sm">
                    <Icon icon="lucide:download" />
                    Export Logs
                  </Button>
                </div>
              </Card>

              {/* Logs Table */}
              <Card className="overflow-hidden">
                <CardHeader className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">User Activity Logs</h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {filteredLogs.length} entries found
                  </span>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="px-6 py-4">
                          <div className="flex items-center gap-2 cursor-pointer hover:text-slate-600">
                            Timestamp
                            <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                          </div>
                        </th>
                        <th className="px-6 py-4">
                          <div className="flex items-center gap-2 cursor-pointer hover:text-slate-600">
                            User Name
                            <Icon icon="lucide:chevrons-up-down" className="text-xs" />
                          </div>
                        </th>
                        <th className="px-6 py-4">Action Type</th>
                        <th className="px-6 py-4">Device / Location</th>
                        <th className="px-6 py-4">Details</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right w-12"></th>
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
                              <UserActionBadge action={log.action} />
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <p className="text-xs font-medium text-slate-700">{log.device}</p>
                                <p className="text-[10px] text-slate-400">{log.location}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                              {log.details}
                            </td>
                            <td className="px-6 py-4">
                              <LogStatusIndicator status={log.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
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
                                <div className="ml-8 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                                  <div className="grid grid-cols-4 gap-6">
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${log.user.split(' ')[0]}`}
                                        className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                                        alt={log.user}
                                      />
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">User</p>
                                        <p className="text-sm font-bold text-slate-900">{log.user}</p>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Log ID</p>
                                      <p className="font-mono text-sm text-slate-700">#{log.id.toString().padStart(6, '0')}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Device</p>
                                      <p className="text-sm font-bold text-slate-900">{log.device}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</p>
                                      <p className="text-sm text-slate-600">{log.location}</p>
                                    </div>
                                  </div>
                                  <div className="mt-4 pt-4 border-t border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Full Context</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{log.details}</p>
                                    <p className="text-xs text-slate-500 mt-2">IP Address: {log.ipAddress}</p>
                                  </div>
                                  <div className="flex gap-3 mt-4 pt-4 border-t border-slate-100">
                                    <Button variant="outline" size="sm">
                                      <Icon icon="lucide:user" className="w-3 h-3" />
                                      View User Profile
                                    </Button>
                                    <Button variant="ghost" size="sm">
                                      <Icon icon="lucide:download" className="w-3 h-3" />
                                      Export Log Entry
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
                    Showing {filteredLogs.length} of {userLogs.length} logs
                  </p>
                  <Button variant="outline" size="sm">
                    Load More
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Member Detail Drawer */}
        {activeTab === 'directory' && (
          <aside
            className={`bg-white border-l border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden ${
              isDrawerOpen && selectedMember ? 'w-[400px]' : 'w-0'
            }`}
          >
            {selectedMember && (
              <div className="flex-1 flex flex-col h-full min-w-[400px]">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                      Member Insights
                    </span>
                    <button
                      onClick={() => setIsDrawerOpen(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <Icon icon="lucide:x" className="text-xl" />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 mb-6">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedMember.avatar}`}
                      className="w-16 h-16 rounded-2xl border-4 border-slate-50"
                      alt={selectedMember.name}
                    />
                    <div>
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
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                      <span>Current Assignments</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">
                        {selectedMember.assignments.length}
                      </span>
                    </h3>
                    <div className="space-y-3">
                      {selectedMember.assignments.map((assignment, index) => (
                        <div
                          key={index}
                          className="p-3 rounded-xl border border-slate-100 bg-slate-50"
                        >
                          <p className="text-xs font-bold text-slate-700">{assignment.title}</p>
                          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">
                            Due: {assignment.dueDate}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Capacity Metric */}
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                      Bandwidth Analysis
                    </h3>
                    <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <CapacityRing capacity={selectedMember.capacity} />
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {selectedMember.capacity >= 90
                            ? 'Near Capacity'
                            : selectedMember.capacity >= 70
                            ? 'Moderate Load'
                            : 'Available'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {selectedMember.assignments.length} tasks pending
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Permissions */}
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                      Access Control
                    </h3>
                    <div className="space-y-2">
                      {selectedMember.permissions.map((permission, index) => (
                        <label
                          key={index}
                          className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl cursor-pointer ${
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
                    Update Permissions
                    <Icon icon="lucide:shield-check" />
                  </Button>
                </div>
              </div>
            )}
          </aside>
        )}

      </div>

      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite New Member"
        size="md"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <Input label="Full Name" placeholder="e.g. John Doe" />
            <Input label="Work Email" type="email" placeholder="john.d@complianceos.io" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Assign Role
              </label>
              <select className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white">
                <option value="lead-auditor">Lead Auditor</option>
                <option value="compliance-officer">Compliance Officer</option>
                <option value="reporting-analyst">Reporting Analyst</option>
                <option value="org-admin">Organization Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Access Level
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="radio"
                    name="access"
                    defaultChecked
                    className="accent-emerald-600"
                  />
                  <span className="text-xs font-bold text-slate-700">Limited Access</span>
                </label>
                <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="radio" name="access" className="accent-emerald-600" />
                  <span className="text-xs font-bold text-slate-700">Full Control</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1">
              Send Invitation
              <Icon icon="lucide:send" className="text-sm" />
            </Button>
          </div>
        </div>
      </Modal>
    </>
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
}: {
  icon: string
  iconColor: 'emerald' | 'blue' | 'orange' | 'purple'
  value: string
  label: string
  badge: string
  badgeColor: 'emerald' | 'blue' | 'orange' | 'purple'
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
      <div className="flex items-center justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorClasses[iconColor]}`}
        >
          <Icon icon={icon} className="text-xl" />
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${badgeColorClasses[badgeColor]}`}>
          {badge}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
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

function WorkloadBar({ capacity }: { capacity: number }) {
  const getBarColor = (cap: number) => {
    if (cap >= 90) return 'bg-rose-500'
    if (cap >= 70) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="w-32">
      <div className="flex justify-between text-[10px] font-bold mb-1">
        <span className="text-slate-400">{capacity}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getBarColor(capacity)}`}
          style={{ width: `${capacity}%` }}
        />
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: 'active' | 'offline' | 'away' }) {
  const statusConfig = {
    active: { color: 'bg-emerald-500', textColor: 'text-emerald-600', label: 'Active' },
    offline: { color: 'bg-slate-300', textColor: 'text-slate-400', label: 'Offline' },
    away: { color: 'bg-amber-500', textColor: 'text-amber-600', label: 'Away' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  )
}

function UserActionBadge({ action }: { action: UserLog['action'] }) {
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

  const actionLabels: Record<UserLog['action'], string> = {
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    session_timeout: 'Session Timeout',
    password_change: 'Password Change',
    profile_update: 'Profile Update',
    permission_change: 'Permission Change',
    mfa_enabled: 'MFA Enabled',
    failed_login: 'Failed Login',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionColors[action]}`}
    >
      {actionLabels[action]}
    </span>
  )
}

function LogStatusIndicator({ status }: { status: UserLog['status'] }) {
  const statusConfig = {
    success: { color: 'bg-emerald-500', textColor: 'text-emerald-600', label: 'Success' },
    warning: { color: 'bg-orange-500', textColor: 'text-orange-600', label: 'Warning' },
    failed: { color: 'bg-rose-500', textColor: 'text-rose-600', label: 'Failed' },
    info: { color: 'bg-blue-500', textColor: 'text-blue-600', label: 'Info' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
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
}: {
  label: string
  completed: number
  total: number
}) {
  const percentage = (completed / total) * 100
  const isComplete = completed === total

  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider mb-1">
        <span className="text-slate-500">{label}</span>
        <span className={isComplete ? 'text-emerald-600' : 'text-slate-900'}>
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full">
        <div
          className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
