'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

type LetterStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Sent to SAMA' | 'SAMA Response Received' | 'Overdue'
type LetterType = 'Non-Objection' | 'Inquiry' | 'Submission' | 'Notification'

interface Letter {
  id: string
  reference: string
  type: LetterType
  subject: string
  status: LetterStatus
  lastModified: string
  createdBy: string
  assignedTo: string
}

const mockLetters: Letter[] = [
  {
    id: '1',
    reference: 'NOB-2024-082',
    type: 'Non-Objection',
    subject: 'Appointment of Head of Risk - Management Approval',
    status: 'Sent to SAMA',
    lastModified: 'Oct 12, 2024',
    createdBy: 'Felix H.',
    assignedTo: 'Board Secretary',
  },
  {
    id: '2',
    reference: 'SUB-2024-114',
    type: 'Submission',
    subject: 'Quarterly AML Compliance Self-Assessment Report',
    status: 'Draft',
    lastModified: 'Oct 20, 2024',
    createdBy: 'Sarah L.',
    assignedTo: 'Compliance Team',
  },
  {
    id: '3',
    reference: 'INQ-2024-005',
    type: 'Inquiry',
    subject: 'Clarification Request - Circular 44321/2024 (Art. 4)',
    status: 'Approved',
    lastModified: 'Oct 05, 2024',
    createdBy: 'Ahmed K.',
    assignedTo: 'Legal Team',
  },
  {
    id: '4',
    reference: 'NOT-2024-018',
    type: 'Notification',
    subject: 'System Outage Incident Report - Core Banking',
    status: 'SAMA Response Received',
    lastModified: 'Sep 28, 2024',
    createdBy: 'Michael C.',
    assignedTo: 'IT Operations',
  },
  {
    id: '5',
    reference: 'NOB-2024-079',
    type: 'Non-Objection',
    subject: 'New Digital Product Launch - Mobile Wallet',
    status: 'Pending Approval',
    lastModified: 'Oct 18, 2024',
    createdBy: 'Lisa M.',
    assignedTo: 'Product Team',
  },
  {
    id: '6',
    reference: 'SUB-2024-108',
    type: 'Submission',
    subject: 'Annual Governance Report 2024',
    status: 'Overdue',
    lastModified: 'Oct 01, 2024',
    createdBy: 'Felix H.',
    assignedTo: 'Compliance Team',
  },
]

const letterTemplates = [
  {
    type: 'Non-Objection' as LetterType,
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
  },
  {
    type: 'Inquiry' as LetterType,
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
  },
  {
    type: 'Submission' as LetterType,
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
  },
  {
    type: 'Notification' as LetterType,
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
  },
]

export default function SAMALettersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LetterStatus | 'All'>('All')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedLetterType, setSelectedLetterType] = useState<LetterType>('Non-Objection')
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null)

  const filteredLetters = mockLetters.filter((letter) => {
    const matchesSearch =
      letter.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      letter.subject.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'All' || letter.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const handleOpenCreateModal = (type: LetterType = 'Non-Objection') => {
    setSelectedLetterType(type)
    setIsCreateModalOpen(true)
  }

  const getStatusBadgeVariant = (status: LetterStatus) => {
    switch (status) {
      case 'Draft':
        return 'neutral'
      case 'Pending Approval':
        return 'warning'
      case 'Approved':
        return 'success'
      case 'Sent to SAMA':
        return 'info'
      case 'SAMA Response Received':
        return 'success'
      case 'Overdue':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  const getTypeBadgeColor = (type: LetterType) => {
    switch (type) {
      case 'Non-Objection':
        return 'bg-emerald-50 text-emerald-700'
      case 'Inquiry':
        return 'bg-blue-50 text-blue-700'
      case 'Submission':
        return 'bg-amber-50 text-amber-700'
      case 'Notification':
        return 'bg-rose-50 text-rose-700'
      default:
        return 'bg-slate-50 text-slate-700'
    }
  }

  return (
    <>
      <Header title="SAMA Letters" subtitle="Correspondence Hub" />

      <div className="flex-1 overflow-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              label="Total Letters (YTD)"
              value="142"
              trend="+12% from 2023"
              trendUp
              borderColor="emerald"
            />
            <StatCard
              label="Sent This Quarter"
              value="28"
              detail="Last sent: Yesterday"
              borderColor="blue"
            />
            <StatCard
              label="Pending Drafts"
              value="09"
              detail="3 due this week"
              detailIcon="lucide:clock"
              detailColor="amber"
              borderColor="amber"
            />
            <StatCard
              label="Overdue Replies"
              value="02"
              detail="Critical Escalation"
              detailColor="rose"
              borderColor="rose"
            />
          </div>

          {/* Letter Templates */}
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-lg font-bold font-display text-slate-900">Letter Templates</h2>
              <button className="text-xs font-bold text-emerald-600 hover:underline">
                Manage Templates &rarr;
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {letterTemplates.map((template) => (
                <TemplateCard
                  key={template.type}
                  type={template.type}
                  icon={template.icon}
                  color={template.color}
                  description={template.description}
                  onClick={() => handleOpenCreateModal(template.type)}
                />
              ))}
            </div>
          </section>

          {/* Recent Correspondence Table */}
          <Card className="overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/50">
              <h2 className="font-bold text-slate-900">Recent Correspondence</h2>
              <div className="flex gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Icon
                    icon="lucide:search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Search reference..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-full sm:w-64"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LetterStatus | 'All')}
                  className="px-3 py-2 bg-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="All">All Status</option>
                  <option value="Draft">Draft</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Sent to SAMA">Sent to SAMA</option>
                  <option value="SAMA Response Received">SAMA Response</option>
                  <option value="Overdue">Overdue</option>
                </select>
                <Button variant="primary" size="sm" onClick={() => handleOpenCreateModal()}>
                  <Icon icon="lucide:plus" />
                  New Letter
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-left">Reference #</th>
                    <th className="px-6 py-4 text-left">Type</th>
                    <th className="px-6 py-4 text-left">Subject</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Last Modified</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLetters.map((letter) => (
                    <tr
                      key={letter.id}
                      onClick={() => setSelectedLetter(letter)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900 font-display">
                          {letter.reference}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(
                            letter.type
                          )}`}
                        >
                          {letter.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 font-medium truncate max-w-xs">
                          {letter.subject}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={getStatusBadgeVariant(letter.status)} size="sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {letter.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">{letter.lastModified}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedLetter(letter)
                            }}
                            className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors"
                            title="View"
                          >
                            <Icon icon="lucide:eye" />
                          </button>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors"
                            title="Edit"
                          >
                            <Icon icon="lucide:pencil" />
                          </button>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors"
                            title="More"
                          >
                            <Icon icon="lucide:more-vertical" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredLetters.length === 0 && (
                <div className="text-center py-12">
                  <Icon icon="lucide:inbox" className="text-4xl text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No letters found matching your criteria.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Create Letter Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Draft Official Correspondence"
        size="xl"
      >
        <CreateLetterForm
          selectedType={selectedLetterType}
          onTypeChange={setSelectedLetterType}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Letter Detail Modal */}
      <Modal
        isOpen={!!selectedLetter}
        onClose={() => setSelectedLetter(null)}
        title={selectedLetter?.reference || ''}
        size="xl"
      >
        {selectedLetter && (
          <LetterDetailView letter={selectedLetter} onClose={() => setSelectedLetter(null)} />
        )}
      </Modal>
    </>
  )
}

// Stat Card Component
function StatCard({
  label,
  value,
  trend,
  trendUp,
  detail,
  detailIcon,
  detailColor,
  borderColor,
}: {
  label: string
  value: string
  trend?: string
  trendUp?: boolean
  detail?: string
  detailIcon?: string
  detailColor?: 'emerald' | 'amber' | 'rose' | 'blue'
  borderColor: 'emerald' | 'amber' | 'rose' | 'blue'
}) {
  const borderColors = {
    emerald: 'border-l-emerald-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
    blue: 'border-l-blue-500',
  }

  const detailColors = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    blue: 'text-blue-600',
  }

  return (
    <Card
      className={`p-6 border-l-4 ${borderColors[borderColor]} hover:shadow-lg transition-all hover:-translate-y-1`}
    >
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
        {label}
      </p>
      <h2 className="text-3xl font-black text-slate-900 font-display">{value}</h2>
      {trend && (
        <p className="text-xs text-emerald-600 font-bold mt-2 flex items-center gap-1">
          <Icon icon={trendUp ? 'lucide:trending-up' : 'lucide:trending-down'} />
          {trend}
        </p>
      )}
      {detail && (
        <p
          className={`text-xs font-bold mt-2 flex items-center gap-1 ${
            detailColor ? detailColors[detailColor] : 'text-slate-400'
          }`}
        >
          {detailIcon && <Icon icon={detailIcon} />}
          {detail}
        </p>
      )}
    </Card>
  )
}

// Template Card Component
function TemplateCard({
  type,
  icon,
  color,
  description,
  onClick,
}: {
  type: LetterType
  icon: string
  color: string
  description: string
  onClick: () => void
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }

  return (
    <button
      onClick={onClick}
      className="bg-white p-5 rounded-2xl text-left border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colorClasses[color]}`}
      >
        <Icon icon={icon} className="text-xl" />
      </div>
      <h3 className="font-bold text-slate-900 text-sm mb-1">{type}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  )
}

// Create Letter Form Component
function CreateLetterForm({
  selectedType,
  onTypeChange,
  onClose,
}: {
  selectedType: LetterType
  onTypeChange: (type: LetterType) => void
  onClose: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priority, setPriority] = useState<'Standard' | 'Urgent'>('Standard')

  const handleSubmit = () => {
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      onClose()
    }, 1500)
  }

  const getRefPrefix = (type: LetterType) => {
    switch (type) {
      case 'Non-Objection':
        return 'NOB'
      case 'Inquiry':
        return 'INQ'
      case 'Submission':
        return 'SUB'
      case 'Notification':
        return 'NOT'
      default:
        return 'GEN'
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Reference assigned:{' '}
        <span className="font-mono font-bold text-emerald-600">
          {getRefPrefix(selectedType)}-2026-001
        </span>
      </p>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              Letter Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => onTypeChange(e.target.value as LetterType)}
              className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="Non-Objection">Non-Objection</option>
              <option value="Inquiry">Inquiry</option>
              <option value="Submission">Submission</option>
              <option value="Notification">Notification</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              Sub-Category
            </label>
            <select className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
              <option>Key Function Appointment</option>
              <option>Product Launch</option>
              <option>Equity Participation</option>
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              Target Department (SAMA)
            </label>
            <select className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none">
              <option>Banking Supervision</option>
              <option>Payment Systems</option>
              <option>Compliance & AML</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              Priority
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('Standard')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'Standard'
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setPriority('Urgent')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'Urgent'
                    ? 'bg-rose-50 border-2 border-rose-500 text-rose-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
          Subject
        </label>
        <Input placeholder="Enter subject..." className="w-full" />
      </div>

      <div>
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
          Content
        </label>
        <div className="min-h-[200px] w-full bg-slate-50 border border-slate-100 rounded-xl p-4">
          <div className="flex gap-2 border-b border-slate-200 pb-2 mb-3">
            <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
              <Icon icon="lucide:bold" />
            </button>
            <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
              <Icon icon="lucide:italic" />
            </button>
            <button className="p-1 hover:bg-slate-200 rounded text-slate-500">
              <Icon icon="lucide:list" />
            </button>
          </div>
          <textarea
            placeholder="Type your message here..."
            className="w-full h-32 bg-transparent resize-none text-sm text-slate-700 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
        <button className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
          <Icon icon="lucide:paperclip" />
          Manage Attachments (0)
        </button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            Save as Draft
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Processing...
              </>
            ) : (
              'Send for Approval'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Letter Detail View Component
function LetterDetailView({ letter, onClose }: { letter: Letter; onClose: () => void }) {
  const [language, setLanguage] = useState<'en' | 'ar'>('en')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Badge
            variant={
              letter.status === 'Sent to SAMA'
                ? 'info'
                : letter.status === 'Approved'
                  ? 'success'
                  : letter.status === 'Draft'
                    ? 'neutral'
                    : letter.status === 'Overdue'
                      ? 'danger'
                      : 'warning'
            }
          >
            {letter.status}
          </Badge>
          <p className="text-sm text-slate-500 mt-1">
            {letter.type} - Last modified: {letter.lastModified}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Icon icon="lucide:printer" />
            Print PDF
          </Button>
          <Button variant="primary" size="sm">
            <Icon icon="lucide:pencil" />
            Edit Letter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Letter Content */}
        <div className="col-span-8">
          <div className="bg-white rounded-xl border border-slate-200 p-8 min-h-[400px]">
            {/* Language Toggle */}
            <div className="flex justify-end mb-6">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                    language === 'en' ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => setLanguage('ar')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                    language === 'ar' ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Arabic
                </button>
              </div>
            </div>

            {language === 'en' ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div className="text-sm text-slate-900">
                    <p className="font-bold">To: Compliance Department</p>
                    <p>Saudi Central Bank (SAMA)</p>
                    <p>Riyadh, Saudi Arabia</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-500">Date: {letter.lastModified}</p>
                    <p className="text-slate-500">Ref: {letter.reference}</p>
                  </div>
                </div>

                <div className="py-4">
                  <h4 className="font-black text-lg text-slate-900">Subject: {letter.subject}</h4>
                </div>

                <div className="text-slate-700 text-sm leading-relaxed space-y-4">
                  <p>Dear Sir/Madam,</p>
                  <p>
                    In accordance with SAMA circular 22/34 regarding the Governance requirements for
                    Financial Institutions, we are writing to formally submit this correspondence
                    for your review and consideration.
                  </p>
                  <p>
                    We remain at your disposal for any further information or clarification required
                    to process this request.
                  </p>
                  <p className="pt-8">Yours sincerely,</p>
                  <div>
                    <p className="font-black text-slate-900">Felix Henderson</p>
                    <p className="text-slate-500">Head of Compliance</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-right" dir="rtl">
                <div className="flex justify-between items-start">
                  <div className="text-lg text-slate-900">
                    <p className="font-bold">To: Department of Compliance</p>
                    <p>Saudi Central Bank</p>
                    <p>Riyadh, Saudi Arabia</p>
                  </div>
                  <div className="text-left text-sm">
                    <p className="text-slate-500">Date: {letter.lastModified}</p>
                    <p className="text-slate-500">Ref: {letter.reference}</p>
                  </div>
                </div>

                <div className="py-4">
                  <h4 className="font-bold text-xl text-slate-900">Subject: {letter.subject}</h4>
                </div>

                <div className="text-slate-700 text-base leading-relaxed space-y-4">
                  <p>Dear Sir/Madam,</p>
                  <p>
                    In accordance with SAMA circular 22/34 regarding the Governance requirements for
                    Financial Institutions.
                  </p>
                  <p className="pt-8">Sincerely,</p>
                  <div>
                    <p className="font-bold text-slate-900">Felix Henderson</p>
                    <p className="text-slate-500 text-sm">Head of Compliance</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="col-span-4 space-y-4">
          {/* Metadata */}
          <Card className="p-4">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
              Metadata
            </h4>
            <div className="space-y-3">
              <MetadataRow label="Category" value={letter.type} />
              <MetadataRow label="Created By" value={letter.createdBy} />
              <MetadataRow label="Assigned To" value={letter.assignedTo} highlight />
            </div>
          </Card>

          {/* Attachments */}
          <Card className="p-4">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
              Attachments (2)
            </h4>
            <div className="space-y-2">
              <AttachmentItem name="Document_1.pdf" size="1.2 MB" />
              <AttachmentItem name="Supporting_Info.pdf" size="445 KB" />
              <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all">
                + Add Attachment
              </button>
            </div>
          </Card>

          {/* Activity Timeline */}
          <Card className="p-4">
            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
              Activity Timeline
            </h4>
            <div className="space-y-4 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
              <TimelineItem title="Draft Created" date="Oct 10, 2024" user="Felix H." active />
              <TimelineItem
                title="Compliance Approved"
                date="Oct 11, 2024"
                user="Sarah C."
                active
              />
              <TimelineItem
                title="Sent to SAMA"
                date="Oct 12, 2024"
                user="Automated"
                color="blue"
                active
              />
              <TimelineItem title="Pending SAMA Reply" date="Expected: Nov 12, 2024" pending />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Helper Components
function MetadataRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  )
}

function AttachmentItem({ name, size }: { name: string; size: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-white hover:shadow-sm transition-all">
      <div className="w-8 h-8 bg-rose-50 text-rose-500 flex items-center justify-center rounded-lg">
        <Icon icon="lucide:file-text" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-slate-900 truncate">{name}</p>
        <p className="text-[9px] text-slate-400">{size}</p>
      </div>
      <Icon icon="lucide:download" className="text-slate-300 group-hover:text-slate-900" />
    </div>
  )
}

function TimelineItem({
  title,
  date,
  user,
  color = 'emerald',
  active,
  pending,
}: {
  title: string
  date: string
  user?: string
  color?: 'emerald' | 'blue'
  active?: boolean
  pending?: boolean
}) {
  const dotColors = {
    emerald: 'bg-emerald-100 border-emerald-500',
    blue: 'bg-blue-100 border-blue-500',
  }

  return (
    <div className="relative pl-6">
      <div
        className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 ${
          pending ? 'bg-slate-100 border-slate-300' : dotColors[color]
        }`}
      />
      <p className={`text-xs font-bold ${pending ? 'text-slate-300' : 'text-slate-900'}`}>
        {title}
      </p>
      <p className={`text-[10px] ${pending ? 'text-slate-300' : 'text-slate-400'}`}>
        {date}
        {user && ` - ${user}`}
      </p>
    </div>
  )
}
