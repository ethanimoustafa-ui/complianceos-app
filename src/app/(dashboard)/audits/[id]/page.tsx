'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Icon } from '@iconify/react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

// Types
interface Task {
  id: number
  title: string
  description: string
  category: string
  categoryColor: 'blue' | 'amber' | 'purple'
  assignee: { name: string; avatar: string }
  dueDate: string
  completed: boolean
  notes?: string
}

interface TimelineItem {
  id: number
  user: string
  avatar: string
  action: string
  detail?: string
  timestamp: string
  type: 'completed' | 'upload' | 'comment'
}

interface TeamMember {
  id: number
  name: string
  avatar: string
  role: string
  isOnline: boolean
  isOwner?: boolean
}

// Sample data
const auditData = {
  id: 'ISO-27001-2024',
  title: 'ISO 27001 Internal Review',
  description: 'Comprehensive internal assessment of the Information Security Management System (ISMS). This phase focuses specifically on Access Control (A.9) and Operations Security (A.12) to ensure all technical and administrative controls are operating effectively before the year-end external surveillance audit.',
  startDate: 'Oct 1, 2024',
  type: 'Compliance Audit',
  scope: 'Global Infrastructure',
  status: 'In Progress',
  priority: 'Critical',
  dueDate: 'Oct 24, 2024',
  auditType: 'Internal Audit',
}

const tasks: Task[] = [
  {
    id: 1,
    title: 'Review user access rights',
    description: 'Verify all privileged accounts have been reviewed within last 90 days.',
    category: 'Access Control',
    categoryColor: 'blue',
    assignee: { name: 'Felix H.', avatar: 'Felix' },
    dueDate: 'Oct 18, 2024',
    completed: true,
    notes: 'Automated review ran successfully. All accounts verified.',
  },
  {
    id: 2,
    title: 'Malware protection logs audit',
    description: 'Analyze endpoint detection logs for unauthorized software installations.',
    category: 'Security',
    categoryColor: 'amber',
    assignee: { name: 'Sarah C.', avatar: 'Sarah' },
    dueDate: 'Oct 22, 2024',
    completed: false,
    notes: 'In progress - reviewing Q3 logs.',
  },
  {
    id: 3,
    title: 'Network redundancy verification',
    description: 'Confirm failover procedures for primary gateway were tested this quarter.',
    category: 'Infrastructure',
    categoryColor: 'purple',
    assignee: { name: 'Michael S.', avatar: 'Michael' },
    dueDate: 'Oct 24, 2024',
    completed: false,
    notes: 'Awaiting test results from IT team.',
  },
]

const timelineItems: TimelineItem[] = [
  {
    id: 1,
    user: 'Felix H.',
    avatar: 'Felix',
    action: 'completed',
    detail: 'A.9.2 Provisioning Review',
    timestamp: '2 hours ago',
    type: 'completed',
  },
  {
    id: 2,
    user: 'Sarah C.',
    avatar: 'Sarah',
    action: 'uploaded',
    detail: 'Firewall_Policy_Q3.pdf',
    timestamp: 'Yesterday at 4:25 PM',
    type: 'upload',
  },
  {
    id: 3,
    user: 'Michael S.',
    avatar: 'Michael',
    action: 'left a comment',
    detail: '"We need to confirm the encryption standards for the database before we can close A.12.3."',
    timestamp: 'Oct 20, 2024',
    type: 'comment',
  },
]

const teamMembers: TeamMember[] = [
  { id: 1, name: 'Felix H.', avatar: 'Felix', role: 'Lead Auditor', isOnline: true, isOwner: true },
  { id: 2, name: 'Sarah C.', avatar: 'Sarah', role: 'Security Officer', isOnline: false },
  { id: 3, name: 'Michael S.', avatar: 'Michael', role: 'Compliance Analyst', isOnline: true },
]

const documents = [
  { name: 'Security_Policy.v2', icon: 'lucide:file-text' },
  { name: 'Server_Room_Access_Logs', icon: 'lucide:image' },
]

export default function AuditDetailPage() {
  const params = useParams()
  const [taskStates, setTaskStates] = useState<Record<number, boolean>>(
    tasks.reduce((acc, task) => ({ ...acc, [task.id]: task.completed }), {})
  )
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null)

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [showManageTeamModal, setShowManageTeamModal] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showTimelineModal, setShowTimelineModal] = useState(false)
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineItem | null>(null)

  // Toast state
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false })

  const showToast = (message: string) => {
    setToast({ message, visible: true })
    setTimeout(() => setToast({ message: '', visible: false }), 3000)
  }

  const toggleTaskCompletion = (taskId: number) => {
    setTaskStates(prev => {
      const newState = !prev[taskId]
      showToast(newState ? 'Task completed!' : 'Task marked as incomplete')
      return { ...prev, [taskId]: newState }
    })
  }

  const handleTimelineClick = (item: TimelineItem) => {
    setSelectedTimeline(item)
    setShowTimelineModal(true)
  }

  const categoryColors = {
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  }

  const timelineStyles = {
    completed: { bg: 'bg-emerald-500', icon: 'lucide:check-circle-2' },
    upload: { bg: 'bg-blue-500', icon: 'lucide:file-plus-2' },
    comment: { bg: 'bg-slate-200 text-slate-500', icon: 'lucide:message-square' },
  }

  return (
    <>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">
            <span>Organization</span>
            <Icon icon="lucide:chevron-right" />
            <Link href="/audits" className="hover:text-emerald-600 transition-colors cursor-pointer">Audits</Link>
            <Icon icon="lucide:chevron-right" />
            <span className="text-emerald-600">Details</span>
          </div>
          <h1 className="text-xl font-bold font-display text-slate-900">{auditData.title}</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search task..."
              className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all"
            />
          </div>
          <Button variant="outline" onClick={() => setShowEditModal(true)}>
            <Icon icon="lucide:edit-3" />
            Edit Audit
          </Button>
          <Button variant="primary" className="shadow-lg shadow-emerald-100" onClick={() => setShowShareModal(true)}>
            <Icon icon="lucide:share-2" />
            Share Progress
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Main Details & Tasks */}
            <div className="lg:col-span-2 space-y-8">
              {/* Audit Title & Description Card */}
              <Card className="p-8">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold font-display text-slate-900 mb-3">{auditData.title}</h2>
                    <p className="text-slate-600 leading-relaxed max-w-2xl">{auditData.description}</p>
                  </div>
                  <Badge variant="success" className="shrink-0 border border-emerald-100">Active Audit</Badge>
                </div>
                <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon icon="lucide:calendar" className="text-lg text-emerald-500" />
                    <span className="text-sm font-medium">Started: {auditData.startDate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon icon="lucide:tag" className="text-lg text-blue-500" />
                    <span className="text-sm font-medium">Type: {auditData.type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon icon="lucide:layers" className="text-lg text-purple-500" />
                    <span className="text-sm font-medium">Scope: {auditData.scope}</span>
                  </div>
                </div>
              </Card>

              {/* Task Checklist */}
              <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Control Checklist (A.9 & A.12)</h3>
                  <div className="flex gap-2">
                    <button className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors" title="Filter tasks">
                      <Icon icon="lucide:filter" />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                      title="Add new control task"
                      onClick={() => setShowAddTaskModal(true)}
                    >
                      <Icon icon="lucide:plus-circle" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <div key={task.id} className="checklist-item-wrapper">
                      <div
                        className="p-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors group cursor-pointer"
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      >
                        <div className="mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTaskCompletion(task.id)
                            }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                              taskStates[task.id]
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-300 hover:border-emerald-500'
                            }`}
                          >
                            {taskStates[task.id] && <Icon icon="lucide:check" className="text-sm" />}
                          </button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900">{task.title}</span>
                            <span className={`px-2 py-0.5 ${categoryColors[task.categoryColor]} text-[10px] font-bold rounded uppercase`}>
                              {task.category}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{task.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <img
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${task.assignee.avatar}`}
                            className="w-6 h-6 rounded-full"
                            alt={task.assignee.name}
                          />
                          <button
                            className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-600"
                            onClick={(e) => {
                              e.stopPropagation()
                              showToast('Opening task options...')
                            }}
                          >
                            <Icon icon="lucide:more-vertical" />
                          </button>
                        </div>
                      </div>
                      {expandedTaskId === task.id && (
                        <div className="bg-slate-50 px-4 pb-4">
                          <div className="border-t border-slate-200 pt-3 space-y-2">
                            <p className="text-xs text-slate-600"><span className="font-bold">Assignee:</span> {task.assignee.name}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold">Due:</span> {task.dueDate}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold">Notes:</span> {task.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-slate-50/50 flex justify-center">
                  <button className="text-xs font-bold text-emerald-600 hover:underline">View 9 more tasks</button>
                </div>
              </Card>

              {/* Activity Timeline */}
              <Card className="p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-8">Audit Activity Timeline</h3>
                <div className="space-y-8 relative">
                  {timelineItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex gap-4 relative cursor-pointer hover:bg-slate-50/50 -mx-4 px-4 py-2 rounded-xl transition-colors"
                      onClick={() => handleTimelineClick(item)}
                    >
                      {/* Timeline line */}
                      {index < timelineItems.length - 1 && (
                        <div className="absolute left-[11px] top-[24px] bottom-0 w-0.5 bg-slate-200 ml-4"></div>
                      )}
                      <div className={`relative z-10 w-6 h-6 rounded-full ${item.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[item.type].bg + ' text-white'} flex items-center justify-center ring-4 ring-white shrink-0`}>
                        <Icon icon={timelineStyles[item.type].icon} className="text-sm" />
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm text-slate-900">
                          <span className="font-bold">{item.user}</span>{' '}
                          {item.action}{' '}
                          {item.type !== 'comment' && <span className="font-medium">{item.detail}</span>}
                        </p>
                        {item.type === 'comment' && item.detail && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg mt-2 italic">{item.detail}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{item.timestamp}{item.type === 'completed' && ' - Automated Evidence Captured'}{item.type === 'upload' && ' - Artifact Storage'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right: Info & Team */}
            <div className="space-y-8">
              {/* Audit Metadata */}
              <Card className="overflow-hidden">
                <div className="p-6 bg-slate-50/50 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Audit Overview</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Status</span>
                    <Badge variant="warning" className="border border-amber-100">{auditData.status}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Priority</span>
                    <Badge variant="danger" className="border border-rose-100">{auditData.priority}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Due Date</span>
                    <span className="text-sm font-bold text-slate-900">{auditData.dueDate}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Type</span>
                    <span className="text-sm font-bold text-slate-900">{auditData.auditType}</span>
                  </div>
                </div>
              </Card>

              {/* Team Members */}
              <Card>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Audit Team</h3>
                  <button
                    className="text-emerald-600 text-xs font-bold hover:underline"
                    onClick={() => setShowManageTeamModal(true)}
                  >
                    Manage
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {teamMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
                      onClick={() => showToast('Viewing member details...')}
                    >
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                        className="w-9 h-9 rounded-full bg-slate-100 shrink-0"
                        alt={member.name}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{member.name}</p>
                        <p className="text-[11px] text-slate-400 uppercase font-bold tracking-tighter">{member.role}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${member.isOnline ? 'bg-emerald-500' : 'bg-slate-300'} shrink-0`}></div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button className="p-1 text-slate-400 hover:text-blue-600" title="Message" onClick={(e) => { e.stopPropagation(); showToast('Message action triggered') }}>
                          <Icon icon="lucide:message-circle" className="text-sm" />
                        </button>
                        <button className="p-1 text-slate-400 hover:text-amber-600" title="Change role" onClick={(e) => { e.stopPropagation(); showToast('Change role action triggered') }}>
                          <Icon icon="lucide:user-cog" className="text-sm" />
                        </button>
                        {!member.isOwner && (
                          <button className="p-1 text-slate-400 hover:text-rose-600" title="Remove" onClick={(e) => { e.stopPropagation(); showToast('Remove action triggered') }}>
                            <Icon icon="lucide:user-x" className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className="w-full mt-4 py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2"
                    onClick={() => setShowAddMemberModal(true)}
                  >
                    <Icon icon="lucide:user-plus" />
                    Add Member
                  </button>
                </div>
              </Card>

              {/* Related Documents */}
              <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Icon icon="lucide:folder" className="text-emerald-400" />
                  Quick Access Artifacts
                </h3>
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <button
                      key={doc.name}
                      className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors group w-full text-left"
                      onClick={() => showToast(`Opening ${doc.name}...`)}
                    >
                      <Icon icon={doc.icon} className="text-slate-500 group-hover:text-emerald-400" />
                      <span className="text-xs font-medium text-slate-300">{doc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Audit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Audit Details" size="lg">
        <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Audit Title</label>
            <input type="text" defaultValue={auditData.title} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
            <textarea rows={4} defaultValue={auditData.description} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
              <select defaultValue="In Progress" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                <option>In Progress</option>
                <option>Planned</option>
                <option>Completed</option>
                <option>On Hold</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Priority</label>
              <select defaultValue="Critical" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Start Date</label>
              <input type="date" defaultValue="2024-10-01" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Due Date</label>
              <input type="date" defaultValue="2024-10-24" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Audit Type</label>
            <select defaultValue="Internal Audit" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
              <option>Internal Audit</option>
              <option>External Audit</option>
              <option>Compliance Review</option>
              <option>Risk Assessment</option>
            </select>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setShowEditModal(false); showToast('Audit details updated successfully') }}>Save Changes</Button>
        </div>
      </Modal>

      {/* Share Progress Modal */}
      <Modal isOpen={showShareModal} onClose={() => setShowShareModal(false)} title="Share Audit Progress" size="md">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Share with Team Members</label>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2">
                Felix H.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2">
                Sarah C.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
            </div>
            <input type="text" placeholder="Add team member email..." className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Shareable Link</label>
            <div className="flex gap-2">
              <input type="text" value="https://app.complianceos.com/audit/iso27001-review" readOnly className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm" />
              <Button variant="secondary" onClick={() => showToast('Link copied to clipboard')}>
                <Icon icon="lucide:copy" />
                Copy
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Include in Report</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">Task completion status</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">Activity timeline</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">Team member details</span>
              </label>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowShareModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setShowShareModal(false); showToast('Progress report sent successfully') }}>
            <Icon icon="lucide:send" />
            Send Report
          </Button>
        </div>
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={showAddTaskModal} onClose={() => setShowAddTaskModal(false)} title="Add New Control Task" size="md">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Task Name</label>
            <input type="text" placeholder="e.g. Monthly backup validation" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
            <select className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
              <option>Access Control (A.9)</option>
              <option>Operations Security (A.12)</option>
              <option>Physical Security (A.11)</option>
              <option>Asset Management (A.8)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Assignee</label>
              <select className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500">
                <option>Felix H.</option>
                <option>Sarah C.</option>
                <option>Michael S.</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Due Date</label>
              <input type="date" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
            </div>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowAddTaskModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setShowAddTaskModal(false); showToast('New control task created successfully') }}>Create Task</Button>
        </div>
      </Modal>

      {/* Manage Team Modal */}
      <Modal isOpen={showManageTeamModal} onClose={() => setShowManageTeamModal(false)} title="Manage Audit Team" size="md">
        <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`} className="w-10 h-10 rounded-full" alt={member.name} />
                <div>
                  <p className="text-sm font-bold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
              </div>
              {member.isOwner ? (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">OWNER</span>
              ) : (
                <button className="text-rose-500 hover:text-rose-700">
                  <Icon icon="lucide:trash-2" />
                </button>
              )}
            </div>
          ))}
          <button
            className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2"
            onClick={() => { setShowManageTeamModal(false); setShowAddMemberModal(true) }}
          >
            <Icon icon="lucide:user-plus" />
            Add New Member
          </button>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100">
          <Button variant="dark" className="w-full" onClick={() => setShowManageTeamModal(false)}>Done</Button>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal isOpen={showAddMemberModal} onClose={() => setShowAddMemberModal(false)} title="Add Team Member" size="md">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
            <input type="email" placeholder="colleague@company.com" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Role</label>
            <select className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
              <option>Auditor</option>
              <option>Security Officer</option>
              <option>Compliance Analyst</option>
              <option>Reviewer</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Permissions</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">View audit details</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">Edit tasks</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">Manage team members</span>
              </label>
            </div>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowAddMemberModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setShowAddMemberModal(false); showToast('Invitation sent successfully') }}>
            <Icon icon="lucide:user-plus" />
            Send Invitation
          </Button>
        </div>
      </Modal>

      {/* Timeline Detail Modal */}
      <Modal isOpen={showTimelineModal} onClose={() => setShowTimelineModal(false)} title="Activity Details" size="md">
        {selectedTimeline && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${selectedTimeline.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[selectedTimeline.type].bg}`}>
                <Icon icon={timelineStyles[selectedTimeline.type].icon} className="text-xl" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{selectedTimeline.user}</p>
                <p className="text-sm text-slate-600">{selectedTimeline.action}</p>
                <p className="text-xs text-slate-400 mt-1">{selectedTimeline.timestamp}</p>
              </div>
            </div>
            {selectedTimeline.detail && (
              <p className="text-sm text-slate-600 leading-relaxed italic border-l-4 border-slate-100 pl-4">
                {selectedTimeline.detail}
              </p>
            )}
            <div className="bg-slate-50 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence Hash</h4>
              <code className="text-[10px] text-slate-500 break-all bg-white p-2 block border border-slate-200 rounded">sha256:8f2a3194...e71c9b2f</code>
            </div>
          </div>
        )}
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowTimelineModal(false)}>Close</Button>
          <Button variant="dark">
            <Icon icon="lucide:download" />
            Download Logs
          </Button>
        </div>
      </Modal>

      {/* Toast Notification */}
      <div
        className={`fixed bottom-8 left-1/2 z-[200] px-6 py-3 bg-slate-900 text-white text-sm font-medium rounded-full shadow-2xl transition-all duration-300 flex items-center gap-2 ${
          toast.visible ? '-translate-x-1/2 -translate-y-8 opacity-100' : '-translate-x-1/2 translate-y-0 opacity-0 pointer-events-none'
        }`}
      >
        <Icon icon="lucide:check-circle" className="text-emerald-400" />
        <span>{toast.message}</span>
      </div>
    </>
  )
}
