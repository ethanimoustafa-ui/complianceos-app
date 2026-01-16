'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { RiskMatrix, RiskHeatmapCompact } from '@/components/dashboard/risk-matrix'

// Types
interface Letter {
  id: number
  ref: string
  title: string
  content: string
  date: string
  status: 'sent' | 'draft' | 'received'
  archived: boolean
  assignee?: string
}

interface Requirement {
  id: number
  name: string
  subtitle: string
  status: 'implementing' | 'drafting' | 'completed' | 'pending'
  dueText: string
  progress: number
}

// Sample data
const letters: Letter[] = [
  {
    id: 1,
    ref: 'CM-9942',
    title: 'Sent to SAMA',
    content: 'Clarification on Risk Management Hub',
    date: '2 hours ago',
    status: 'sent',
    archived: false,
  },
  {
    id: 2,
    ref: 'CM-9943',
    title: 'Draft - Quarterly Filing',
    content: 'Q3 Compliance Report Summary',
    date: 'Draft',
    status: 'draft',
    archived: false,
    assignee: 'Felix H.',
  },
]

const requirements: Requirement[] = [
  {
    id: 1,
    name: 'SAMA Circular 44321/2024',
    subtitle: 'Cybersecurity Framework - Update 4',
    status: 'implementing',
    dueText: 'Due in 4 Days',
    progress: 80,
  },
  {
    id: 2,
    name: 'AML/CTF Periodic Review',
    subtitle: 'KYC Update Requirements for Corporates',
    status: 'drafting',
    dueText: 'Due in 14 Days',
    progress: 30,
  },
  {
    id: 3,
    name: 'Consumer Protection Update',
    subtitle: 'Rulebook V2.1 Implementation',
    status: 'completed',
    dueText: 'Completed',
    progress: 100,
  },
]

const teamMembers = [
  { name: 'Sarah Connor', avatar: 'Sarah', load: 95, role: 'Senior Compliance Officer' },
  { name: 'Michael Scott', avatar: 'Michael', load: 62, role: 'Risk Analyst' },
  { name: 'Felix Henderson', avatar: 'Felix', load: 24, role: 'Compliance Analyst' },
]

export default function CorrespondenceHubPage() {
  const [isNewCorrespondenceOpen, setIsNewCorrespondenceOpen] = useState(false)
  const [isRiskMatrixOpen, setIsRiskMatrixOpen] = useState(false)
  const [isLetterDetailOpen, setIsLetterDetailOpen] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleViewLetter = (letter: Letter) => {
    setSelectedLetter(letter)
    setIsLetterDetailOpen(true)
  }

  const filteredLetters = letters.filter((letter) => {
    const matchesSearch =
      letter.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      letter.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      letter.ref.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || letter.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <>
      <Header title="Correspondence Hub" subtitle="Regulatory Command Center" />

      <div className="flex-1 overflow-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="gap-2">
                <Icon icon="lucide:mail" className="text-emerald-500" />
                SAMA Letters
              </Button>
              <Button variant="secondary" size="sm" className="gap-2">
                <Icon icon="lucide:refresh-cw" className="text-blue-500" />
                Regulatory Updates
              </Button>
              <Button variant="secondary" size="sm" className="gap-2">
                <Icon icon="lucide:crosshair" className="text-rose-500" />
                Observations Tracker
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                <div className="px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Live Pulse</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
              <Button onClick={() => setIsNewCorrespondenceOpen(true)} className="gap-2">
                <Icon icon="lucide:plus" />
                New Correspondence
              </Button>
            </div>
          </div>

          {/* Metrics Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              icon="lucide:file-check"
              iconColor="emerald"
              label="+12% vs LY"
              title="SAMA Submissions"
              value="18"
              subtitle="/ 24 Quarterly"
              progress={75}
            />
            <MetricCard
              icon="lucide:alert-circle"
              iconColor="rose"
              label="3 Urgent"
              title="Audit Observations"
              value="12"
              subtitle="Open Findings"
              progressSegments={[
                { color: 'bg-rose-500', flex: 1 },
                { color: 'bg-rose-300', flex: 1 },
                { color: 'bg-slate-100', flex: 1 },
              ]}
            />
            <MetricCard
              icon="lucide:shield-check"
              iconColor="blue"
              label="On Target"
              title="Saudization Rate"
              value="42.8%"
              subtitle="Target: 40%"
              progress={85}
              progressColor="bg-blue-500"
            />
            <MetricCard
              icon="lucide:graduation-cap"
              iconColor="amber"
              label="95% Complete"
              title="Mandatory Training"
              value="1,240"
              subtitle="Employees Certified"
              progress={95}
              progressColor="bg-amber-500"
            />
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-12 gap-8">
            {/* Central Tracker: Regulatory Rules */}
            <div className="col-span-12 lg:col-span-8 space-y-8">
              {/* Regulatory Tracker */}
              <Card className="rounded-3xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-bold font-display text-slate-900">
                      Regulatory Tracker
                    </h2>
                    <p className="text-xs text-slate-500">
                      Real-time status of active circulars and mandates
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-2">
                      <Icon icon="lucide:plus-circle" className="text-lg" />
                      Add Requirement
                    </button>
                    <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">
                      View Full Registry &rarr;
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {requirements.map((req) => (
                    <RequirementRow key={req.id} requirement={req} />
                  ))}
                </div>
              </Card>

              {/* Letter Correspondence and Policy Status */}
              <div className="grid grid-cols-2 gap-8">
                {/* Letter Correspondence */}
                <Card className="rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Icon icon="lucide:mail" className="text-slate-400" />
                      Correspondence Feed
                    </h3>
                    <div className="flex gap-2">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">All</option>
                        <option value="sent">Sent</option>
                        <option value="draft">Draft</option>
                        <option value="received">Received</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    placeholder="Search correspondence..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mb-4 text-xs"
                  />

                  <div className="space-y-4">
                    {filteredLetters.map((letter) => (
                      <CorrespondenceItem
                        key={letter.id}
                        letter={letter}
                        onView={() => handleViewLetter(letter)}
                      />
                    ))}
                    {filteredLetters.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">
                        No correspondence found
                      </p>
                    )}
                  </div>
                </Card>

                {/* Policy Status */}
                <Card className="rounded-3xl p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Icon icon="lucide:scroll-text" className="text-slate-400" />
                    Policy Review
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        Current
                      </span>
                      <p className="text-xl font-bold text-slate-900">84%</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black text-rose-500 uppercase">
                        Expired
                      </span>
                      <p className="text-xl font-bold text-rose-600">4</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span>Next Review: InfoSec Policy</span>
                    <span className="text-blue-600">Nov 12</span>
                  </div>
                </Card>
              </div>
            </div>

            {/* Sidebar Components */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              {/* Risk Register Summary */}
              <Card className="rounded-3xl p-6 bg-slate-900 text-white border-slate-800">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold font-display">Risk Heatmap</h2>
                  <Icon icon="lucide:trending-up" className="text-emerald-400 text-xl" />
                </div>
                <RiskHeatmapCompact />
                <Button
                  variant="secondary"
                  className="w-full mt-6 bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
                  onClick={() => setIsRiskMatrixOpen(true)}
                >
                  Full Risk Analysis
                </Button>
              </Card>

              {/* Team Workload */}
              <Card className="rounded-3xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                    Team Capacity
                  </h2>
                  <button>
                    <Icon
                      icon="lucide:more-horizontal"
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    />
                  </button>
                </div>
                <div className="space-y-5">
                  {teamMembers.map((member) => (
                    <TeamMemberRow key={member.name} member={member} />
                  ))}
                </div>
              </Card>

              {/* SAMA Filing Deadlines */}
              <Card className="rounded-3xl p-6 border-emerald-100 bg-emerald-50/20">
                <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4">
                  Upcoming Submission
                </h2>
                <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                  <p className="text-sm font-bold text-slate-900">Quarterly PRM Report</p>
                  <p className="text-xs text-slate-500 mt-1">Compliance risk self-assessment</p>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <span className="text-xs font-bold text-rose-500">Oct 30, 2024</span>
                    <Button size="sm">Review File</Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* New Correspondence Modal */}
      <Modal
        isOpen={isNewCorrespondenceOpen}
        onClose={() => setIsNewCorrespondenceOpen(false)}
        title="New Correspondence"
        size="lg"
      >
        <div className="space-y-4">
          <Input label="To" placeholder="Enter recipient" />
          <Input label="Subject" placeholder="Enter subject" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
            <textarea
              rows={6}
              placeholder="Type your message..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button className="flex-1 gap-2">
              <Icon icon="lucide:send" />
              Send
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsNewCorrespondenceOpen(false)}
            >
              Save as Draft
            </Button>
          </div>
        </div>
      </Modal>

      {/* Risk Matrix Modal */}
      <Modal
        isOpen={isRiskMatrixOpen}
        onClose={() => setIsRiskMatrixOpen(false)}
        title="Risk Analysis Matrix"
        size="xl"
      >
        <p className="text-sm text-slate-500 mb-6">
          Comprehensive risk assessment by severity and likelihood
        </p>
        <RiskMatrix />
      </Modal>

      {/* Letter Detail Modal */}
      <Modal
        isOpen={isLetterDetailOpen}
        onClose={() => setIsLetterDetailOpen(false)}
        title={selectedLetter?.title || 'Letter Details'}
        size="md"
      >
        {selectedLetter && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Reference</p>
              <p className="text-sm font-bold text-slate-900">{selectedLetter.ref}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Status</p>
              <Badge
                variant={
                  selectedLetter.status === 'sent'
                    ? 'success'
                    : selectedLetter.status === 'draft'
                      ? 'warning'
                      : 'info'
                }
              >
                {selectedLetter.status.charAt(0).toUpperCase() + selectedLetter.status.slice(1)}
              </Badge>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Date</p>
              <p className="text-sm font-bold text-slate-900">{selectedLetter.date}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Content</p>
              <p className="text-sm text-slate-700">{selectedLetter.content}</p>
            </div>
            {selectedLetter.assignee && (
              <div className="bg-emerald-50 p-4 rounded-lg">
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Assigned To</p>
                <p className="text-sm font-bold text-slate-900">{selectedLetter.assignee}</p>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button className="flex-1 gap-2">
                <Icon icon="lucide:reply" />
                Reply
              </Button>
              <Button variant="secondary" className="px-6">
                Archive
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// Sub-components
function MetricCard({
  icon,
  iconColor,
  label,
  title,
  value,
  subtitle,
  progress,
  progressColor = 'bg-emerald-500',
  progressSegments,
}: {
  icon: string
  iconColor: 'emerald' | 'rose' | 'blue' | 'amber'
  label: string
  title: string
  value: string
  subtitle: string
  progress?: number
  progressColor?: string
  progressSegments?: { color: string; flex: number }[]
}) {
  const iconColors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  }

  const labelColors = {
    emerald: 'text-emerald-600 bg-emerald-50',
    rose: 'text-rose-600 bg-rose-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
  }

  return (
    <Card hover className="p-6 rounded-2xl">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 ${iconColors[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-2xl" />
        </div>
        <span className={`text-[10px] font-bold ${labelColors[iconColor]} px-2 py-0.5 rounded-full`}>
          {label}
        </span>
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      {progressSegments && (
        <div className="mt-4 flex gap-1">
          {progressSegments.map((segment, i) => (
            <div
              key={i}
              className={`h-1.5 ${segment.color} rounded-full`}
              style={{ flex: segment.flex }}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function RequirementRow({ requirement }: { requirement: Requirement }) {
  const statusConfig = {
    implementing: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Implementing' },
    drafting: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Drafting' },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Verified' },
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Pending' },
  }

  const config = statusConfig[requirement.status]
  const isCompleted = requirement.status === 'completed'
  const isDueSoon = requirement.dueText.includes('4 Days')

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl border ${isCompleted ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
          <Icon
            icon={isCompleted ? 'lucide:check-circle' : 'lucide:landmark'}
            className={isCompleted ? 'text-emerald-500' : 'text-slate-400'}
          />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{requirement.name}</p>
          <p className="text-[10px] text-slate-500">{requirement.subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <span
            className={`text-[10px] font-black uppercase ${isDueSoon ? 'text-rose-500' : isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}
          >
            {requirement.dueText}
          </span>
          <div className="h-1 w-24 bg-slate-200 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${isCompleted ? 'bg-emerald-500' : isDueSoon ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${requirement.progress}%` }}
            />
          </div>
        </div>
        <span className={`px-3 py-1 ${config.bg} ${config.text} text-[10px] font-bold rounded-full`}>
          {config.label}
        </span>
      </div>
    </div>
  )
}

function CorrespondenceItem({ letter, onView }: { letter: Letter; onView: () => void }) {
  const isSent = letter.status === 'sent'

  return (
    <div className="flex gap-3">
      <div
        className={`w-8 h-8 rounded-full ${isSent ? 'bg-blue-100' : 'bg-slate-100'} flex items-center justify-center shrink-0`}
      >
        <Icon
          icon={isSent ? 'lucide:arrow-up-right' : 'lucide:pencil'}
          className={`${isSent ? 'text-blue-600' : 'text-slate-600'} text-sm`}
        />
      </div>
      <div className="flex-1">
        <p className="text-xs font-bold text-slate-900">{letter.title}</p>
        <p className="text-[10px] text-slate-500">{letter.content}</p>
        <p className="text-[9px] text-slate-400 mt-1">
          {letter.date} {letter.ref && `- REF: ${letter.ref}`}
        </p>
        {letter.assignee && (
          <p className="text-[9px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">
            Assigned: {letter.assignee}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onView}
            className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700"
          >
            View
          </button>
          {isSent && (
            <button className="text-[9px] font-bold text-blue-600 hover:text-blue-700">Reply</button>
          )}
          <button className="text-[9px] font-bold text-slate-500 hover:text-slate-700">
            Archive
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamMemberRow({
  member,
}: {
  member: { name: string; avatar: string; load: number; role: string }
}) {
  const isOverloaded = member.load > 80

  return (
    <div className="flex items-center gap-3">
      <img
        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
        className="w-8 h-8 rounded-full border border-slate-200"
        alt={member.name}
      />
      <div className="flex-1">
        <div className="flex justify-between text-[10px] font-bold mb-1">
          <span>{member.name}</span>
          <span className={isOverloaded ? 'text-rose-500' : 'text-blue-500'}>{member.load}% Load</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full">
          <div
            className={`h-full ${isOverloaded ? 'bg-rose-500' : member.load > 50 ? 'bg-blue-500' : 'bg-emerald-500'} rounded-full`}
            style={{ width: `${member.load}%` }}
          />
        </div>
      </div>
    </div>
  )
}
