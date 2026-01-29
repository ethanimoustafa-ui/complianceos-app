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
import { useTranslation } from '@/i18n'
import { formatRelativeTime, formatLocalizedDateShort } from '@/lib/time-utils'

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
  timestamp: Date
  type: 'completed' | 'upload' | 'comment'
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
    timestamp: hoursAgo(2),
    type: 'completed',
  },
  {
    id: 2,
    user: 'Sarah C.',
    avatar: 'Sarah',
    action: 'uploaded',
    detail: 'Firewall_Policy_Q3.pdf',
    timestamp: daysAgo(1),
    type: 'upload',
  },
  {
    id: 3,
    user: 'Michael S.',
    avatar: 'Michael',
    action: 'left a comment',
    detail: '"We need to confirm the encryption standards for the database before we can close A.12.3."',
    timestamp: daysAgo(4),
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
  const { t, isRTL } = useTranslation()
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
      showToast(newState ? t('auditDetail.taskCompleted') : t('auditDetail.taskIncomplete'))
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
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className={isRTL ? 'text-right' : ''}>
          <div className={`flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link href="/reports" className="hover:text-emerald-600 transition-colors cursor-pointer">{t('auditDetail.audits')}</Link>
            <Icon icon={isRTL ? "lucide:chevron-left" : "lucide:chevron-right"} />
            <span className="text-emerald-600">{t('auditDetail.details')}</span>
          </div>
          <h1 className="text-xl font-bold font-display text-slate-900">{auditData.title}</h1>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="relative hidden md:block">
            <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input
              type="text"
              placeholder={t('auditDetail.searchTask')}
              className={`${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all`}
            />
          </div>
          <Button variant="outline" onClick={() => setShowEditModal(true)}>
            <Icon icon="lucide:edit-3" />
            {t('auditDetail.editAudit')}
          </Button>
          <Button variant="primary" className="shadow-lg shadow-emerald-100" onClick={() => setShowShareModal(true)}>
            <Icon icon="lucide:share-2" />
            {t('auditDetail.shareProgress')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-8">
        <div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Main Details & Tasks */}
            <div className="lg:col-span-2 space-y-8">
              {/* Audit Title & Description Card */}
              <Card className="p-8">
                <div className={`flex items-start justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-2xl font-bold font-display text-slate-900 mb-3">{auditData.title}</h2>
                    <p className="text-slate-600 leading-relaxed max-w-2xl">{auditData.description}</p>
                  </div>
                  <Badge variant="success" className="shrink-0 border border-emerald-100">{t('auditDetail.activeAudit')}</Badge>
                </div>
                <div className={`flex flex-wrap gap-6 mt-6 pt-6 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex items-center gap-2 text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:calendar" className="text-lg text-emerald-500" />
                    <span className="text-sm font-medium">{t('auditDetail.started')}: {formatLocalizedDateShort(auditData.startDate, isRTL)}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:tag" className="text-lg text-blue-500" />
                    <span className="text-sm font-medium">{t('auditDetail.type')}: {auditData.type}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:layers" className="text-lg text-purple-500" />
                    <span className="text-sm font-medium">{t('auditDetail.scope')}: {auditData.scope}</span>
                  </div>
                </div>
              </Card>

              {/* Task Checklist */}
              <Card className="overflow-hidden">
                <div className={`p-6 border-b border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.controlChecklist')}</h3>
                  <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <button className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer" title={t('auditDetail.filterTasks')}>
                      <Icon icon="lucide:filter" />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                      title={t('auditDetail.addNewControlTask')}
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
                            className="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-600 cursor-pointer"
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
                        <div className={`bg-slate-50 px-4 pb-4 ${isRTL ? 'text-right' : ''}`}>
                          <div className="border-t border-slate-200 pt-3 space-y-2">
                            <p className="text-xs text-slate-600"><span className="font-bold">{t('auditDetail.assignee')}:</span> {task.assignee.name}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold">{t('auditDetail.dueDate')}:</span> {formatLocalizedDateShort(task.dueDate, isRTL)}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold">{t('common.notes')}:</span> {task.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-slate-50/50 flex justify-center">
                  <button className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer">{t('auditDetail.viewMoreTasks').replace('{count}', '9')}</button>
                </div>
              </Card>

              {/* Activity Timeline */}
              <Card className="p-6">
                <h3 className={`text-sm font-bold text-slate-900 mb-8 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.auditActivityTimeline')}</h3>
                <div className="space-y-8 relative">
                  {timelineItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex gap-4 relative cursor-pointer hover:bg-slate-50/50 -mx-4 px-4 py-2 rounded-xl transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}
                      onClick={() => handleTimelineClick(item)}
                    >
                      {/* Timeline line */}
                      {index < timelineItems.length - 1 && (
                        <div className={`absolute ${isRTL ? 'right-[11px]' : 'left-[11px]'} top-[24px] bottom-0 w-0.5 bg-slate-200 ${isRTL ? 'mr-4' : 'ml-4'}`}></div>
                      )}
                      <div className={`relative z-10 w-6 h-6 rounded-full ${item.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[item.type].bg + ' text-white'} flex items-center justify-center ring-4 ring-white shrink-0`}>
                        <Icon icon={timelineStyles[item.type].icon} className="text-sm" />
                      </div>
                      <div className={`flex-1 pb-2 ${isRTL ? 'text-right' : ''}`}>
                        <p className="text-sm text-slate-900">
                          <span className="font-bold">{item.user}</span>{' '}
                          {item.action}{' '}
                          {item.type !== 'comment' && <span className="font-medium">{item.detail}</span>}
                        </p>
                        {item.type === 'comment' && item.detail && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg mt-2 italic">{item.detail}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(item.timestamp, t)}{item.type === 'completed' && ` - ${t('auditDetail.automatedEvidenceCaptured')}`}{item.type === 'upload' && ` - ${t('auditDetail.artifactStorage')}`}</p>
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
                <div className={`p-6 bg-slate-50/50 border-b border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditOverview')}</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.status')}</span>
                    <Badge variant="warning" className="border border-amber-100">{auditData.status}</Badge>
                  </div>
                  <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.priority')}</span>
                    <Badge variant="danger" className="border border-rose-100">{auditData.priority}</Badge>
                  </div>
                  <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.dueDate')}</span>
                    <span className="text-sm font-bold text-slate-900">{formatLocalizedDateShort(auditData.dueDate, isRTL)}</span>
                  </div>
                  <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t('auditDetail.type')}</span>
                    <span className="text-sm font-bold text-slate-900">{auditData.auditType}</span>
                  </div>
                </div>
              </Card>

              {/* Team Members */}
              <Card>
                <div className={`p-6 border-b border-slate-100 flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h3 className="text-sm font-bold text-slate-900">{t('auditDetail.auditTeam')}</h3>
                  <button
                    className="text-emerald-600 text-xs font-bold hover:underline cursor-pointer"
                    onClick={() => setShowManageTeamModal(true)}
                  >
                    {t('auditDetail.manage')}
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
                        <button className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title="Message" onClick={(e) => { e.stopPropagation(); showToast('Message action triggered') }}>
                          <Icon icon="lucide:message-circle" className="text-sm" />
                        </button>
                        <button className="p-1 text-slate-400 hover:text-amber-600 cursor-pointer" title="Change role" onClick={(e) => { e.stopPropagation(); showToast('Change role action triggered') }}>
                          <Icon icon="lucide:user-cog" className="text-sm" />
                        </button>
                        {!member.isOwner && (
                          <button className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" title="Remove" onClick={(e) => { e.stopPropagation(); showToast('Remove action triggered') }}>
                            <Icon icon="lucide:user-x" className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    className={`w-full mt-4 py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                    onClick={() => setShowAddMemberModal(true)}
                  >
                    <Icon icon="lucide:user-plus" />
                    {t('auditDetail.addMember')}
                  </button>
                </div>
              </Card>

              {/* Related Documents */}
              <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Icon icon="lucide:folder" className="text-emerald-400" />
                  {t('auditDetail.quickAccessArtifacts')}
                </h3>
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <button
                      key={doc.name}
                      className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors group w-full text-left cursor-pointer"
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
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={t('auditDetail.editAuditDetails')} size="lg">
        <div className="space-y-6 max-h-[60vh] overflow-y-auto hide-scrollbar">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.auditTitle')}</label>
            <input type="text" defaultValue={auditData.title} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.description')}</label>
            <textarea rows={4} defaultValue={auditData.description} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.status')}</label>
              <select defaultValue="In Progress" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`}>
                <option>{t('auditDetail.inProgress')}</option>
                <option>{t('auditDetail.planned')}</option>
                <option>{t('auditDetail.completed')}</option>
                <option>{t('auditDetail.onHold')}</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.priority')}</label>
              <select defaultValue="Critical" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`}>
                <option>{t('auditDetail.critical')}</option>
                <option>{t('auditDetail.high')}</option>
                <option>{t('auditDetail.medium')}</option>
                <option>{t('auditDetail.low')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.startDate')}</label>
              <input type="date" defaultValue="2024-10-01" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
            </div>
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.dueDate')}</label>
              <input type="date" defaultValue="2024-10-24" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
            </div>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.auditType')}</label>
            <select defaultValue="Internal Audit" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`}>
              <option>{t('auditDetail.internalAudit')}</option>
              <option>{t('auditDetail.externalAudit')}</option>
              <option>{t('auditDetail.complianceReview')}</option>
              <option>{t('auditDetail.riskAssessment')}</option>
            </select>
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowEditModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => { setShowEditModal(false); showToast(t('auditDetail.auditDetailsUpdated')) }}>{t('common.saveChanges')}</Button>
        </div>
      </Modal>

      {/* Share Progress Modal */}
      <Modal isOpen={showShareModal} onClose={() => setShowShareModal(false)} title={t('auditDetail.shareAuditProgress')} size="md">
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.shareWithTeamMembers')}</label>
            <div className={`flex flex-wrap gap-2 mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className={`px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                Felix H.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
              <span className={`px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                Sarah C.
                <button className="text-emerald-600 hover:text-emerald-800"><Icon icon="lucide:x" className="text-xs" /></button>
              </span>
            </div>
            <input type="text" placeholder={t('common.email')} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.shareableLink')}</label>
            <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <input type="text" value="https://app.complianceos.com/audit/iso27001-review" readOnly className={`flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-sm ${isRTL ? 'text-right' : ''}`} />
              <Button variant="secondary" onClick={() => showToast(t('auditDetail.linkCopied'))}>
                <Icon icon="lucide:copy" />
                {t('auditDetail.copy')}
              </Button>
            </div>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.includeInReport')}</label>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.taskCompletionStatus')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.activityTimeline')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.teamMemberDetails')}</span>
              </label>
            </div>
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowShareModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => { setShowShareModal(false); showToast(t('auditDetail.progressReportSent')) }}>
            <Icon icon="lucide:send" />
            {t('auditDetail.sendReport')}
          </Button>
        </div>
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={showAddTaskModal} onClose={() => setShowAddTaskModal(false)} title={t('auditDetail.addNewControlTaskTitle')} size="md">
        <div className="space-y-5">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.taskName')}</label>
            <input type="text" placeholder={t('auditDetail.taskNamePlaceholder')} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`} />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('common.category')}</label>
            <select className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`}>
              <option>{t('auditDetail.accessControlA9')}</option>
              <option>{t('auditDetail.operationsSecurityA12')}</option>
              <option>{t('auditDetail.physicalSecurityA11')}</option>
              <option>{t('auditDetail.assetManagementA8')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.assignee')}</label>
              <select className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`}>
                <option>Felix H.</option>
                <option>Sarah C.</option>
                <option>Michael S.</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.dueDate')}</label>
              <input type="date" className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${isRTL ? 'text-right' : ''}`} />
            </div>
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowAddTaskModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => { setShowAddTaskModal(false); showToast(t('auditDetail.newControlTaskCreated')) }}>{t('auditDetail.createTask')}</Button>
        </div>
      </Modal>

      {/* Manage Team Modal */}
      <Modal isOpen={showManageTeamModal} onClose={() => setShowManageTeamModal(false)} title={t('auditDetail.manageAuditTeam')} size="md">
        <div className="space-y-4 max-h-[400px] overflow-y-auto hide-scrollbar">
          {teamMembers.map((member) => (
            <div key={member.id} className={`flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`} className="w-10 h-10 rounded-full" alt={member.name} />
                <div className={isRTL ? 'text-right' : ''}>
                  <p className="text-sm font-bold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
              </div>
              {member.isOwner ? (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">{t('auditDetail.owner')}</span>
              ) : (
                <button className="text-rose-500 hover:text-rose-700 cursor-pointer">
                  <Icon icon="lucide:trash-2" />
                </button>
              )}
            </div>
          ))}
          <button
            className={`w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all text-sm font-bold flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            onClick={() => { setShowManageTeamModal(false); setShowAddMemberModal(true) }}
          >
            <Icon icon="lucide:user-plus" />
            {t('auditDetail.addNewMember')}
          </button>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100">
          <Button variant="dark" className="w-full" onClick={() => setShowManageTeamModal(false)}>{t('auditDetail.done')}</Button>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal isOpen={showAddMemberModal} onClose={() => setShowAddMemberModal(false)} title={t('auditDetail.addTeamMember')} size="md">
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.emailAddress')}</label>
            <input type="email" placeholder={t('auditDetail.emailPlaceholder')} className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`} />
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.role')}</label>
            <select className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${isRTL ? 'text-right' : ''}`}>
              <option>{t('auditDetail.auditor')}</option>
              <option>{t('auditDetail.securityOfficer')}</option>
              <option>{t('auditDetail.complianceAnalyst')}</option>
              <option>{t('auditDetail.reviewer')}</option>
            </select>
          </div>
          <div>
            <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>{t('auditDetail.permissions')}</label>
            <div className="space-y-2">
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.viewAuditDetails')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" defaultChecked className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.editTasks')}</span>
              </label>
              <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded" />
                <span className="text-sm text-slate-700">{t('auditDetail.manageTeamMembers')}</span>
              </label>
            </div>
          </div>
        </div>
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowAddMemberModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => { setShowAddMemberModal(false); showToast(t('auditDetail.invitationSent')) }}>
            <Icon icon="lucide:user-plus" />
            {t('auditDetail.sendInvitation')}
          </Button>
        </div>
      </Modal>

      {/* Timeline Detail Modal */}
      <Modal isOpen={showTimelineModal} onClose={() => setShowTimelineModal(false)} title={t('auditDetail.activityDetails')} size="md">
        {selectedTimeline && (
          <div className="space-y-4">
            <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${selectedTimeline.type === 'comment' ? 'bg-slate-200 text-slate-500' : timelineStyles[selectedTimeline.type].bg}`}>
                <Icon icon={timelineStyles[selectedTimeline.type].icon} className="text-xl" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-lg font-bold text-slate-900">{selectedTimeline.user}</p>
                <p className="text-sm text-slate-600">{selectedTimeline.action}</p>
                <p className="text-xs text-slate-400 mt-1">{formatRelativeTime(selectedTimeline.timestamp, t)}</p>
              </div>
            </div>
            {selectedTimeline.detail && (
              <p className={`text-sm text-slate-600 leading-relaxed italic border-l-4 border-slate-100 pl-4 ${isRTL ? 'border-r-4 border-l-0 pr-4 pl-0' : ''}`}>
                {selectedTimeline.detail}
              </p>
            )}
            <div className={`bg-slate-50 p-4 rounded-xl ${isRTL ? 'text-right' : ''}`}>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('auditDetail.evidenceHash')}</h4>
              <code className="text-[10px] text-slate-500 break-all bg-white p-2 block border border-slate-200 rounded">sha256:8f2a3194...e71c9b2f</code>
            </div>
          </div>
        )}
        <div className={`mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Button variant="outline" onClick={() => setShowTimelineModal(false)}>{t('common.close')}</Button>
          <Button variant="dark">
            <Icon icon="lucide:download" />
            {t('auditDetail.downloadLogs')}
          </Button>
        </div>
      </Modal>

      {/* Toast Notification */}
      <div
        className={`fixed bottom-8 ${isRTL ? 'right-1/2' : 'left-1/2'} z-[200] px-6 py-3 bg-slate-900 text-white text-sm font-medium rounded-full shadow-2xl transition-all duration-300 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''} ${
          toast.visible ? `${isRTL ? 'translate-x-1/2' : '-translate-x-1/2'} -translate-y-8 opacity-100` : `${isRTL ? 'translate-x-1/2' : '-translate-x-1/2'} translate-y-0 opacity-0 pointer-events-none`
        }`}
      >
        <Icon icon="lucide:check-circle" className="text-emerald-400" />
        <span>{toast.message}</span>
      </div>
    </div>
  )
}
