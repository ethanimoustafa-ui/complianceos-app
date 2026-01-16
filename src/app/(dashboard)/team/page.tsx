'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

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

interface AuditLog {
  id: number
  timestamp: string
  user: string
  action: 'opened' | 'closed' | 'deleted' | 'commented' | 'uploaded' | 'created' | 'assigned' | 'updated'
  audit: string
  details: string
  status: 'completed' | 'pending' | 'failed' | 'info'
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

const auditLogs: AuditLog[] = [
  { id: 1, timestamp: '2024-01-15 14:32:18', user: 'Sarah Connor', action: 'opened', audit: 'ISO 27001 Annual Review', details: 'Opened audit for review', status: 'completed' },
  { id: 2, timestamp: '2024-01-15 14:28:45', user: 'Michael Scott', action: 'commented', audit: 'SOC2 Internal Audit (Q3)', details: 'Added comment: "Needs additional documentation"', status: 'info' },
  { id: 3, timestamp: '2024-01-15 13:55:12', user: 'David Wallace', action: 'uploaded', audit: 'GDPR Compliance Check', details: 'Uploaded file: compliance_report_v2.pdf', status: 'completed' },
  { id: 4, timestamp: '2024-01-15 13:42:30', user: 'Kelly Kapoor', action: 'closed', audit: 'PCI DSS Quarterly Review', details: 'Marked audit as completed', status: 'completed' },
  { id: 5, timestamp: '2024-01-15 12:18:09', user: 'John Smith', action: 'created', audit: 'HIPAA Security Assessment', details: 'Created new audit template', status: 'completed' },
  { id: 6, timestamp: '2024-01-15 11:45:22', user: 'Jane Doe', action: 'assigned', audit: 'ISO 27001 Annual Review', details: 'Assigned to Sarah Connor', status: 'completed' },
  { id: 7, timestamp: '2024-01-15 11:20:33', user: 'Sarah Connor', action: 'updated', audit: 'SOC2 Internal Audit (Q3)', details: 'Updated audit status to In Progress', status: 'completed' },
  { id: 8, timestamp: '2024-01-15 10:55:47', user: 'Michael Scott', action: 'deleted', audit: 'Legacy Audit 2023', details: 'Permanently deleted archived audit', status: 'completed' },
  { id: 9, timestamp: '2024-01-15 10:12:18', user: 'David Wallace', action: 'opened', audit: 'NIST Framework Assessment', details: 'Opened audit for initial review', status: 'completed' },
  { id: 10, timestamp: '2024-01-15 09:38:55', user: 'Kelly Kapoor', action: 'uploaded', audit: 'ISO 27001 Annual Review', details: 'Uploaded file: evidence_pack.zip', status: 'completed' },
]

const trainingModules = [
  { name: 'Compliance Fundamentals', completed: 16, total: 18 },
  { name: 'Data Privacy (GDPR)', completed: 14, total: 18 },
  { name: 'Risk Assessment', completed: 12, total: 18 },
  { name: 'Audit Procedures', completed: 18, total: 18 },
]

export default function TeamManagementPage() {
  const [activeTab, setActiveTab] = useState<'directory' | 'audit'>('directory')
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(teamMembers[0])
  const [isDrawerOpen, setIsDrawerOpen] = useState(true)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filteredLogs = auditLogs.filter((log) => {
    const matchSearch = !logSearch ||
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.audit.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(logSearch.toLowerCase())
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

  return (
    <>
      <Header title="Team Management" subtitle="Organization & Permissions" />

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub Header with Tabs */}
          <div className="h-14 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('directory')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                  activeTab === 'directory'
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Active Directory
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                  activeTab === 'audit'
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Audit Logs
              </button>
            </div>

            <div className="flex items-center gap-4">
              {activeTab === 'directory' && (
                <>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                    <Icon icon="lucide:search" className="text-slate-400 text-sm" />
                    <input
                      type="text"
                      placeholder="Find a teammate..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none text-xs font-medium w-40 placeholder:text-slate-400"
                    />
                  </div>
                  <Button onClick={() => setIsInviteModalOpen(true)}>
                    <Icon icon="lucide:user-plus" />
                    Invite Member
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Directory Content */}
          {activeTab === 'directory' && (
            <div className="flex-1 overflow-auto bg-slate-50 p-8">
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
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
                      <Icon icon="lucide:download" />
                    </button>
                    <button className="p-2 hover:bg-slate-50 rounded-lg text-slate-400">
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
                                className="text-slate-400 hover:text-slate-900 transition-colors p-2"
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

          {/* Audit Logs Content */}
          {activeTab === 'audit' && (
            <div className="flex-1 overflow-auto bg-slate-50 p-8">
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
                        placeholder="Search by user, audit, action..."
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
                      <option value="opened">Opened</option>
                      <option value="closed">Closed</option>
                      <option value="deleted">Deleted</option>
                      <option value="commented">Commented</option>
                      <option value="uploaded">Uploaded File</option>
                      <option value="created">Created</option>
                      <option value="assigned">Assigned</option>
                      <option value="updated">Updated</option>
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
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={clearFilters}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
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
                        <th className="px-6 py-4">Audit Name</th>
                        <th className="px-6 py-4">Details</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
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
                            <ActionBadge action={log.action} />
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">
                            {log.audit}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                            {log.details}
                          </td>
                          <td className="px-6 py-4">
                            <LogStatusIndicator status={log.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-slate-400 hover:text-slate-900 transition-colors p-2">
                              <Icon icon="lucide:eye" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-medium">
                    Showing {filteredLogs.length} of {auditLogs.length} logs
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
            className={`w-[400px] bg-white border-l border-slate-200 flex flex-col shadow-2xl transition-transform duration-300 ${
              isDrawerOpen && selectedMember ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {selectedMember && (
              <div className="flex-1 flex flex-col h-full">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                      Member Insights
                    </span>
                    <button
                      onClick={() => setIsDrawerOpen(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
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
                          className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl ${
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

function ActionBadge({ action }: { action: AuditLog['action'] }) {
  const actionColors = {
    opened: 'bg-blue-100 text-blue-700',
    closed: 'bg-green-100 text-green-700',
    deleted: 'bg-rose-100 text-rose-700',
    commented: 'bg-purple-100 text-purple-700',
    uploaded: 'bg-orange-100 text-orange-700',
    created: 'bg-emerald-100 text-emerald-700',
    assigned: 'bg-indigo-100 text-indigo-700',
    updated: 'bg-slate-100 text-slate-700',
  }

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionColors[action]}`}
    >
      {action}
    </span>
  )
}

function LogStatusIndicator({ status }: { status: AuditLog['status'] }) {
  const statusConfig = {
    completed: { color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    pending: { color: 'bg-orange-500', textColor: 'text-orange-600' },
    failed: { color: 'bg-rose-500', textColor: 'text-rose-600' },
    info: { color: 'bg-blue-500', textColor: 'text-blue-600' },
  }

  const config = statusConfig[status]

  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} uppercase`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {status}
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
