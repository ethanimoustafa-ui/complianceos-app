'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'

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

interface FullRequirement {
  id: number
  name: string
  category: string
  releaseDate: string
  status: 'implementing' | 'drafting' | 'completed' | 'pending'
  dueDate: string
}

// Sample data
const initialLetters: Letter[] = [
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

// Full requirements data for registry view (12 items from HTML prototype)
const fullRequirements: FullRequirement[] = [
  { id: 1, name: 'SAMA Circular 44321/2024 - Cybersecurity Framework Update', category: 'Cybersecurity', releaseDate: '2024-08-15', status: 'implementing', dueDate: '2024-10-30' },
  { id: 2, name: 'AML/CTF Periodic Review Requirements', category: 'AML/CTF', releaseDate: '2024-09-01', status: 'drafting', dueDate: '2024-11-14' },
  { id: 3, name: 'Consumer Protection Rulebook V2.1', category: 'Consumer Protection', releaseDate: '2024-07-20', status: 'completed', dueDate: '2024-09-30' },
  { id: 4, name: 'Risk Management Framework - Update 3', category: 'Risk Management', releaseDate: '2024-08-10', status: 'implementing', dueDate: '2024-11-15' },
  { id: 5, name: 'Data Privacy and Protection Standards', category: 'Data Protection', releaseDate: '2024-06-25', status: 'completed', dueDate: '2024-08-31' },
  { id: 6, name: 'Business Continuity Planning Requirements', category: 'Operational Risk', releaseDate: '2024-09-15', status: 'pending', dueDate: '2024-12-01' },
  { id: 7, name: 'Corporate Governance Guidelines Update', category: 'Governance', releaseDate: '2024-07-05', status: 'implementing', dueDate: '2024-10-15' },
  { id: 8, name: 'Customer Due Diligence Enhancement', category: 'AML/CTF', releaseDate: '2024-08-20', status: 'drafting', dueDate: '2024-11-30' },
  { id: 9, name: 'IT Security Controls - Baseline Standards', category: 'Cybersecurity', releaseDate: '2024-09-10', status: 'implementing', dueDate: '2024-12-15' },
  { id: 10, name: 'Financial Crime Prevention Measures', category: 'AML/CTF', releaseDate: '2024-07-30', status: 'completed', dueDate: '2024-09-15' },
  { id: 11, name: 'Saudization Policy Implementation', category: 'HR Compliance', releaseDate: '2024-06-15', status: 'implementing', dueDate: '2024-11-01' },
  { id: 12, name: 'Third-Party Risk Management Framework', category: 'Risk Management', releaseDate: '2024-08-25', status: 'drafting', dueDate: '2024-12-30' },
]

const teamMembers = [
  { name: 'Sarah Connor', avatar: 'Sarah', load: 95, role: 'Senior Compliance Officer' },
  { name: 'Michael Scott', avatar: 'Michael', load: 62, role: 'Risk Analyst' },
  { name: 'Felix Henderson', avatar: 'Felix', load: 24, role: 'Compliance Analyst' },
]

// Risk data from HTML prototype
interface Risk {
  id: number
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  likelihood: 'low' | 'medium' | 'high'
  impact: number
  probability: number
}

const risks: Risk[] = [
  { id: 1, name: 'Data Breach - Customer Records', severity: 'critical', likelihood: 'high', impact: 5, probability: 4 },
  { id: 2, name: 'Regulatory Non-Compliance - AML', severity: 'critical', likelihood: 'medium', impact: 5, probability: 3 },
  { id: 3, name: 'Cyber Attack - Ransomware', severity: 'high', likelihood: 'high', impact: 4, probability: 4 },
  { id: 4, name: 'Key Person Dependency', severity: 'high', likelihood: 'medium', impact: 4, probability: 3 },
  { id: 5, name: 'System Downtime - Core Banking', severity: 'high', likelihood: 'low', impact: 4, probability: 2 },
  { id: 6, name: 'Third-Party Vendor Failure', severity: 'high', likelihood: 'medium', impact: 4, probability: 3 },
  { id: 7, name: 'Fraud - Internal Controls', severity: 'high', likelihood: 'low', impact: 4, probability: 2 },
  { id: 8, name: 'Market Risk - Interest Rate', severity: 'medium', likelihood: 'high', impact: 3, probability: 4 },
  { id: 9, name: 'Operational Error - Manual Process', severity: 'medium', likelihood: 'medium', impact: 3, probability: 3 },
  { id: 10, name: 'Reputational Risk - Social Media', severity: 'medium', likelihood: 'medium', impact: 3, probability: 3 },
  { id: 11, name: 'Liquidity Risk - Funding Gap', severity: 'medium', likelihood: 'low', impact: 3, probability: 2 },
  { id: 12, name: 'Physical Security - Branch', severity: 'medium', likelihood: 'low', impact: 3, probability: 2 },
  { id: 13, name: 'Employee Training Gap', severity: 'medium', likelihood: 'medium', impact: 3, probability: 3 },
  { id: 14, name: 'Documentation Quality', severity: 'medium', likelihood: 'high', impact: 3, probability: 4 },
  { id: 15, name: 'Minor Policy Deviation', severity: 'low', likelihood: 'medium', impact: 2, probability: 3 },
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

export default function CorrespondenceHubPage() {
  const { t, isRTL } = useTranslation()
  const [letters, setLetters] = useState<Letter[]>(initialLetters)
  const [isNewCorrespondenceOpen, setIsNewCorrespondenceOpen] = useState(false)
  const [isRiskMatrixOpen, setIsRiskMatrixOpen] = useState(false)
  const [isLetterDetailOpen, setIsLetterDetailOpen] = useState(false)
  const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false)
  const [isAddRequirementOpen, setIsAddRequirementOpen] = useState(false)
  const [isRegistryViewOpen, setIsRegistryViewOpen] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null)
  const [selectedCellRisks, setSelectedCellRisks] = useState<Risk[] | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Registry view filters
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const handleViewLetter = (letter: Letter) => {
    setSelectedLetter(letter)
    setIsLetterDetailOpen(true)
  }

  const handleReply = (letter: Letter) => {
    setSelectedLetter(letter)
    setIsReplyComposerOpen(true)
  }

  const handleArchive = (letterId: number) => {
    setLetters(prev => prev.map(l =>
      l.id === letterId ? { ...l, archived: !l.archived } : l
    ))
    const letter = letters.find(l => l.id === letterId)
    showToast(letter?.archived ? t('correspondence.letterUnarchived') : t('correspondence.letterArchived'))
    setIsLetterDetailOpen(false)
  }

  const handleReviewFile = () => {
    showToast(t('correspondence.openingPrmReport'))
  }

  // Risk counts for heatmap display
  const riskCounts = {
    critical: risks.filter(r => r.severity === 'critical').length,
    high: risks.filter(r => r.severity === 'high').length,
    medium: risks.filter(r => r.severity === 'medium').length,
    low: risks.filter(r => r.severity === 'low').length,
  }

  // Get risks for a specific matrix cell
  const getRisksForCell = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    return risks.filter(r => r.impact === impact && r.likelihood === likelihood)
  }

  // Get cell style based on combined risk score (using inline styles for Tailwind v4 compatibility)
  const getCellStyle = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
    const score = impact * likelihoodScore
    if (score >= 16) return { bg: 'rgba(244, 63, 94, 0.2)', border: 'rgb(244, 63, 94)' }      // rose-500
    if (score >= 12) return { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' }    // orange-500
    if (score >= 8) return { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgb(251, 191, 36)' }     // amber-400
    return { bg: 'rgba(96, 165, 250, 0.2)', border: 'rgb(96, 165, 250)' }                      // blue-400
  }

  const getCellDotColor = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
    const score = impact * likelihoodScore
    if (score >= 16) return 'rgb(244, 63, 94)'    // rose-500
    if (score >= 12) return 'rgb(249, 115, 22)'   // orange-500
    if (score >= 8) return 'rgb(251, 191, 36)'    // amber-400
    return 'rgb(96, 165, 250)'                     // blue-400
  }

  const handleCellClick = (impact: number, likelihood: 'low' | 'medium' | 'high') => {
    const cellRisks = getRisksForCell(impact, likelihood)
    if (cellRisks.length > 0) {
      setSelectedCellRisks(cellRisks)
    } else {
      showToast(t('correspondence.noRisksInCategory'))
    }
  }

  // Filter requirements for registry view
  const filteredRequirements = fullRequirements.filter(req => {
    const matchesSearch = req.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !categoryFilter || req.category === categoryFilter
    const matchesStatus = !statusFilter || req.status === statusFilter
    return matchesSearch && matchesCategory && matchesStatus
  })

  const uniqueCategories = [...new Set(fullRequirements.map(r => r.category))]

  // Registry View
  if (isRegistryViewOpen) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
          <div className="requirements-view">
            {/* Header */}
            <div className={`flex justify-between items-center mb-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={isRTL ? 'text-right' : ''}>
                <div className={`flex items-center gap-3 mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <button
                    onClick={() => setIsRegistryViewOpen(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <Icon icon={isRTL ? "lucide:arrow-right" : "lucide:arrow-left"} className="text-2xl" />
                  </button>
                  <h1 className="text-2xl font-bold font-display text-slate-900">{t('correspondence.regulatoryRequirements')}</h1>
                </div>
                <p className={`text-sm text-slate-500 ${isRTL ? 'mr-11' : 'ml-11'}`}>{t('correspondence.comprehensiveList')}</p>
              </div>
              <button
                onClick={() => setIsAddRequirementOpen(true)}
                className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <Icon icon="lucide:plus" />
                {t('correspondence.addRequirement')}
              </button>
            </div>

            {/* Filters */}
            <div className="glass-card rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.search')}</label>
                  <div className="relative">
                    <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={t('common.searchRecords')}
                      className={`w-full ${isRTL ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                    />
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.category')}</label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                  >
                    <option value="">{t('correspondence.allCategories')}</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.status')}</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                  >
                    <option value="">{t('correspondence.allStatuses')}</option>
                    <option value="completed">{t('common.completed')}</option>
                    <option value="implementing">{t('correspondence.implementing')}</option>
                    <option value="drafting">{t('correspondence.drafting')}</option>
                    <option value="pending">{t('common.pending')}</option>
                  </select>
                </div>
              </div>
              <div className={`flex gap-3 mt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  onClick={() => { setSearchTerm(''); setCategoryFilter(''); setStatusFilter(''); }}
                  className={`px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  <Icon icon="lucide:x" className="text-lg" />
                  {t('correspondence.clearFilters')}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b-2 border-slate-200">
                    <tr>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                        {t('correspondence.requirementName')}
                        <Icon icon="lucide:chevrons-up-down" className={`text-sm inline ${isRTL ? 'mr-1' : 'ml-1'}`} />
                      </th>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                        {t('correspondence.category')}
                        <Icon icon="lucide:chevrons-up-down" className={`text-sm inline ${isRTL ? 'mr-1' : 'ml-1'}`} />
                      </th>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                        {t('correspondence.releaseDate')}
                        <Icon icon="lucide:chevrons-up-down" className={`text-sm inline ${isRTL ? 'mr-1' : 'ml-1'}`} />
                      </th>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                        {t('common.status')}
                        <Icon icon="lucide:chevrons-up-down" className={`text-sm inline ${isRTL ? 'mr-1' : 'ml-1'}`} />
                      </th>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                        {t('observations.dueDate')}
                        <Icon icon="lucide:chevrons-up-down" className={`text-sm inline ${isRTL ? 'mr-1' : 'ml-1'}`} />
                      </th>
                      <th className={`${isRTL ? 'text-right' : 'text-left'} p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequirements.map(req => {
                      const statusColors: Record<string, string> = {
                        completed: 'bg-emerald-100 text-emerald-700',
                        implementing: 'bg-amber-100 text-amber-700',
                        drafting: 'bg-blue-100 text-blue-700',
                        pending: 'bg-slate-100 text-slate-700'
                      }
                      return (
                        <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <p className="text-sm font-bold text-slate-900">{req.name}</p>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">{req.category}</span>
                          </td>
                          <td className="p-4 text-sm text-slate-600">{req.releaseDate}</td>
                          <td className="p-4">
                            <span className={`text-xs font-bold ${statusColors[req.status]} px-3 py-1 rounded-full capitalize`}>
                              {req.status.replace('-', ' ')}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-slate-600">{req.dueDate}</td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => showToast(`Viewing: ${req.name}`)}
                                className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                                title="View Details"
                              >
                                <Icon icon="lucide:eye" className="text-lg" />
                              </button>
                              <button
                                onClick={() => showToast('Edit requirement')}
                                className="text-blue-600 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                                title="Edit"
                              >
                                <Icon icon="lucide:pencil" className="text-lg" />
                              </button>
                              <button
                                onClick={() => showToast('Downloading...')}
                                className="text-slate-600 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                                title="Download"
                              >
                                <Icon icon="lucide:download" className="text-lg" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className={`bg-slate-50 p-4 flex justify-between items-center border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <p className={`text-sm text-slate-600 ${isRTL ? 'text-right' : ''}`}>
                  {t('correspondence.showingRequirements').replace('{count}', String(filteredRequirements.length)).replace('{total}', String(fullRequirements.length))}
                </p>
                <button
                  onClick={() => showToast('Exporting to CSV...')}
                  className={`px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors flex items-center gap-1 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
                >
                  <Icon icon="lucide:download" className="text-lg" />
                  {t('correspondence.exportToCsv')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

        {/* Add Requirement Modal */}
        <Modal
          isOpen={isAddRequirementOpen}
          onClose={() => setIsAddRequirementOpen(false)}
          title={t('correspondence.addNewRequirement')}
          subtitle={t('correspondence.createNewEntry')}
          size="lg"
        >
          <AddRequirementForm
            t={t}
            isRTL={isRTL}
            onSuccess={() => { setIsAddRequirementOpen(false); showToast(t('correspondence.requirementAdded')); }}
            onValidationError={() => showToast(t('correspondence.fillRequiredFields'))}
          />
        </Modal>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className={isRTL ? 'text-right' : ''}>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('correspondence.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{t('correspondence.subtitle')}</p>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2" />

          <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Link
              href="/sama-letters"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              {t('navigation.samaLetters')}
            </Link>
            <Link
              href="/regulatory-updates"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              {t('navigation.regulatoryUpdates')}
            </Link>
            <Link
              href="/observations"
              className={`px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              {t('navigation.observations')}
            </Link>
          </div>
        </div>

        <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className={`px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span>{t('common.livePulse')}</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          <button
            onClick={() => setIsNewCorrespondenceOpen(true)}
            className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <Icon icon="lucide:plus" />
            {t('correspondence.newCorrespondence')}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        <div className="space-y-8">

          {/* Metrics Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              icon="lucide:file-check"
              iconColor="emerald"
              label={`+12% ${t('correspondence.vsLy')}`}
              title={t('correspondence.samaSubmissions')}
              value="18"
              subtitle={`/ 24 ${t('correspondence.quarterly')}`}
              progress={75}
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:alert-circle"
              iconColor="rose"
              label={`3 ${t('correspondence.urgent')}`}
              title={t('correspondence.auditObservations')}
              value="12"
              subtitle={t('correspondence.openFindings')}
              progressSegments={[
                { color: 'bg-rose-500', flex: 1 },
                { color: 'bg-rose-300', flex: 1 },
                { color: 'bg-slate-100', flex: 1 },
              ]}
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:shield-check"
              iconColor="blue"
              label={t('correspondence.onTarget')}
              title={t('correspondence.saudizationRate')}
              value="42.8%"
              subtitle="Target: 40%"
              progress={85}
              progressColor="bg-blue-500"
              isRTL={isRTL}
            />
            <MetricCard
              icon="lucide:graduation-cap"
              iconColor="amber"
              label={`95% ${t('correspondence.complete')}`}
              title={t('correspondence.mandatoryTraining')}
              value="1,240"
              subtitle={t('correspondence.employeesCertified')}
              progress={95}
              progressColor="bg-amber-500"
              isRTL={isRTL}
            />
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-12 gap-8">
            {/* Central Tracker: Regulatory Rules */}
            <div className="col-span-12 lg:col-span-8 space-y-8">
              {/* Regulatory Tracker */}
              <section className="glass-card rounded-3xl p-6">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-lg font-bold font-display text-slate-900">
                      {t('correspondence.regulatoryTracker')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('correspondence.trackerSubtitle')}
                    </p>
                  </div>
                  <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <button
                      onClick={() => setIsAddRequirementOpen(true)}
                      className={`text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
                    >
                      <Icon icon="lucide:plus-circle" className="text-lg" />
                      {t('correspondence.addRequirement')}
                    </button>
                    <button
                      onClick={() => setIsRegistryViewOpen(true)}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                    >
                      {t('correspondence.viewFullRegistry')} {isRTL ? '\u2190' : '\u2192'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {requirements.map((req) => (
                    <RequirementRow key={req.id} requirement={req} t={t} isRTL={isRTL} />
                  ))}
                </div>
              </section>

              {/* Letter Correspondence and Policy Status */}
              <div className="grid grid-cols-2 gap-8">
                {/* Letter Correspondence */}
                <section className="glass-card rounded-3xl p-6">
                  <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:mail" className="text-slate-400" />
                    {t('correspondence.correspondenceFeed')}
                  </h3>
                  <div className="space-y-4">
                    {letters.filter(l => !l.archived).map((letter) => (
                      <CorrespondenceItem
                        key={letter.id}
                        letter={letter}
                        onView={() => handleViewLetter(letter)}
                        onReply={() => handleReply(letter)}
                        onArchive={() => handleArchive(letter.id)}
                        t={t}
                        isRTL={isRTL}
                      />
                    ))}
                  </div>
                </section>

                {/* Policy Status */}
                <section className="glass-card rounded-3xl p-6">
                  <h3 className={`text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Icon icon="lucide:scroll-text" className="text-slate-400" />
                    {t('correspondence.policyReview')}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase">
                        {t('correspondence.current')}
                      </span>
                      <p className="text-xl font-bold text-slate-900">84%</p>
                    </div>
                    <div className={`bg-slate-50 p-3 rounded-xl border border-slate-100 ${isRTL ? 'text-right' : ''}`}>
                      <span className="text-[10px] font-black text-rose-500 uppercase">
                        {t('correspondence.expired')}
                      </span>
                      <p className="text-xl font-bold text-rose-600">4</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center justify-between text-[10px] font-bold text-slate-500 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span>{t('correspondence.nextReview')}: InfoSec Policy</span>
                    <span className="text-blue-600">Nov 12</span>
                  </div>
                </section>
              </div>
            </div>

            {/* Sidebar Components */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
              {/* Risk Register Summary */}
              <section className="rounded-3xl p-6 bg-slate-900 text-white">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h2 className="text-lg font-bold font-display">{t('correspondence.riskHeatmap')}</h2>
                  <Icon icon="lucide:trending-up" className="text-emerald-400 text-xl" />
                </div>
                <div className="space-y-4">
                  <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('observations.severity')}</span>
                    <span className="text-xs text-slate-400 uppercase tracking-widest font-black">{t('common.items')}</span>
                  </div>
                  <div className="space-y-3">
                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 w-[15%]" />
                      </div>
                      <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.critical')} ({riskCounts.critical})</span>
                    </div>
                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 w-[35%]" />
                      </div>
                      <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.high')} ({riskCounts.high})</span>
                    </div>
                    <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[60%]" />
                      </div>
                      <span className="text-[10px] font-bold w-16 shrink-0">{t('riskRegister.medium')} ({riskCounts.medium})</span>
                    </div>
                  </div>
                </div>
                <button
                  className="w-full mt-6 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  onClick={() => setIsRiskMatrixOpen(true)}
                >
                  {t('correspondence.fullRiskAnalysis')}
                </button>
              </section>

              {/* Team Workload */}
              <section className="glass-card rounded-3xl p-6">
                <div className={`flex justify-between items-center mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">
                    {t('correspondence.teamCapacity')}
                  </h2>
                  <button onClick={() => showToast('Team options menu')} className="cursor-pointer">
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
              </section>

              {/* SAMA Filing Deadlines */}
              <section className="glass-card rounded-3xl p-6 border-emerald-100 bg-emerald-50/20">
                <h2 className={`text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-4 ${isRTL ? 'text-right' : ''}`}>
                  {t('correspondence.upcomingSubmission')}
                </h2>
                <div className={`bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm ${isRTL ? 'text-right' : ''}`}>
                  <p className="text-sm font-bold text-slate-900">{t('correspondence.quarterlyPrmReport')}</p>
                  <p className="text-xs text-slate-500 mt-1">{t('correspondence.complianceRiskAssessment')}</p>
                  <div className={`flex items-center justify-between mt-4 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-bold text-rose-500">Oct 30, 2024</span>
                    <button
                      onClick={handleReviewFile}
                      className="text-[10px] px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors cursor-pointer"
                    >
                      {t('correspondence.reviewFile')}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* New Correspondence Modal */}
      <Modal
        isOpen={isNewCorrespondenceOpen}
        onClose={() => setIsNewCorrespondenceOpen(false)}
        title={t('correspondence.newCorrespondence')}
        subtitle={t('common.createNew')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.to')}</label>
            <input
              type="text"
              placeholder={t('common.enterRecipient')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.subject')}</label>
            <input
              type="text"
              placeholder={t('common.enterSubject')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.message')}</label>
            <textarea
              rows={8}
              placeholder={t('common.typeMessage')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => { setIsNewCorrespondenceOpen(false); showToast(t('correspondence.correspondenceSent')); }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:send" className="text-lg" />
              {t('correspondence.send')}
            </button>
            <button
              onClick={() => setIsNewCorrespondenceOpen(false)}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('correspondence.saveAsDraft')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reply Composer Modal */}
      <Modal
        isOpen={isReplyComposerOpen}
        onClose={() => setIsReplyComposerOpen(false)}
        title={t('correspondence.reply')}
        subtitle={`RE: ${selectedLetter?.ref || t('correspondence.newCorrespondence')}`}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.to')}</label>
            <input
              type="text"
              value="SAMA - Compliance Department"
              readOnly
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('common.subject')}</label>
            <input
              type="text"
              placeholder={t('common.enterSubject')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.message')}</label>
            <textarea
              rows={8}
              placeholder={t('common.typeReply')}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              onClick={() => { setIsReplyComposerOpen(false); showToast(t('correspondence.replySentSuccess')); }}
              className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <Icon icon="lucide:send" className="text-lg" />
              {t('correspondence.sendReply')}
            </button>
            <button
              onClick={() => setIsReplyComposerOpen(false)}
              className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Risk Matrix Modal */}
      <Modal
        isOpen={isRiskMatrixOpen}
        onClose={() => { setIsRiskMatrixOpen(false); setSelectedCellRisks(null); }}
        title={selectedCellRisks ? `${t('correspondence.riskHeatmap')}: ${t('correspondence.impact')} ${selectedCellRisks[0]?.impact}, ${t('correspondence.likelihood')} ${selectedCellRisks[0]?.likelihood}` : t('correspondence.riskAnalysisMatrix')}
        subtitle={selectedCellRisks ? `${selectedCellRisks.length} ${t('common.items')}` : t('correspondence.comprehensiveRiskAssessment')}
        size="lg"
      >
        {selectedCellRisks ? (
          // Cell Detail View
          <div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto hide-scrollbar">
              {selectedCellRisks.map(risk => {
                const severityColors: Record<string, string> = {
                  critical: 'bg-rose-100 text-rose-700 border-rose-200',
                  high: 'bg-orange-100 text-orange-700 border-orange-200',
                  medium: 'bg-amber-100 text-amber-700 border-amber-200',
                  low: 'bg-blue-100 text-blue-700 border-blue-200'
                }
                return (
                  <div key={risk.id} className={cn('p-4 border rounded-lg', severityColors[risk.severity])}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{risk.name}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">{risk.severity}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">Impact: {risk.impact}</span>
                        </div>
                      </div>
                      <button className="text-slate-600 hover:text-slate-900 cursor-pointer">
                        <Icon icon="lucide:arrow-right" className="text-lg" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setSelectedCellRisks(null)}
              className="w-full mt-6 py-3 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {t('correspondence.backToMatrix')}
            </button>
          </div>
        ) : (
          // Matrix View
          <div>
            {/* Legend */}
            <div className="mb-6 flex items-center gap-4 justify-center pb-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-rose-500 rounded" />
                <span className="text-xs font-bold text-slate-600">Critical ({riskCounts.critical})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded" />
                <span className="text-xs font-bold text-slate-600">High ({riskCounts.high})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-400 rounded" />
                <span className="text-xs font-bold text-slate-600">Medium ({riskCounts.medium})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-400 rounded" />
                <span className="text-xs font-bold text-slate-600">Low ({riskCounts.low})</span>
              </div>
            </div>

            {/* Matrix */}
            <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
              <div className="flex items-center justify-center mb-4">
                <span className="text-sm font-bold text-slate-600">Likelihood &rarr;</span>
              </div>

              {/* Header Row */}
              <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6 mb-4">
                <div />
                <div className="text-xs font-bold text-slate-600 text-center">Low</div>
                <div className="text-xs font-bold text-slate-600 text-center">Medium</div>
                <div className="text-xs font-bold text-slate-600 text-center">High</div>
              </div>

              {/* Matrix Rows */}
              <div className="relative">
                <div className="impact-label-vertical">Impact &rarr;</div>
                <div className="space-y-3">
                  {[5, 4, 3, 2, 1].map(impact => {
                    const impactLabels: Record<number, string> = {
                      5: 'Critical (5)',
                      4: 'High (4)',
                      3: 'Medium (3)',
                      2: 'Low (2)',
                      1: 'Very Low (1)'
                    }
                    return (
                      <div key={impact} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6">
                        <div className="flex items-center justify-end pr-4 text-xs font-bold text-slate-600">
                          {impactLabels[impact]}
                        </div>
                        {(['low', 'medium', 'high'] as const).map(likelihood => {
                          const cellRisks = getRisksForCell(impact, likelihood)
                          const cellStyle = getCellStyle(impact, likelihood)
                          const dotColor = getCellDotColor(impact, likelihood)
                          return (
                            <div
                              key={likelihood}
                              onClick={() => handleCellClick(impact, likelihood)}
                              className="risk-matrix-cell rounded-lg p-4 flex flex-wrap gap-2 cursor-pointer border-2 transition-all hover:scale-105 hover:shadow-lg"
                              style={{ height: '110px', backgroundColor: cellStyle.bg, borderColor: cellStyle.border }}
                            >
                              {cellRisks.map((risk, idx) => (
                                <div
                                  key={risk.id}
                                  className="risk-dot w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: dotColor }}
                                  title={risk.name}
                                >
                                  {idx + 1}
                                </div>
                              ))}
                              {cellRisks.length === 0 && (
                                <span className="text-xs text-slate-400 text-center w-full">-</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 ${isRTL ? 'text-right' : ''}`}>
              <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Icon icon="lucide:info" className="text-blue-600 text-xl shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-900">{t('correspondence.interactiveMatrix')}</p>
                  <p className="text-xs text-blue-700 mt-1">{t('correspondence.clickCellToView')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Letter Detail Modal */}
      <Modal
        isOpen={isLetterDetailOpen}
        onClose={() => setIsLetterDetailOpen(false)}
        title={selectedLetter?.title || t('correspondence.letterDetails')}
        subtitle={selectedLetter ? `REF: ${selectedLetter.ref}` : undefined}
        size="lg"
      >
        {selectedLetter && (
          <div className="space-y-4">
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.status')}</p>
              <p className="text-sm font-bold text-slate-900">{selectedLetter.status === 'sent' ? t('correspondence.sentToSama') : t('common.draft')}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('common.date')}</p>
              <p className="text-sm font-bold text-slate-900">{selectedLetter.date}</p>
            </div>
            <div className={`bg-slate-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t('correspondence.content')}</p>
              <p className="text-sm text-slate-700">{selectedLetter.content}</p>
            </div>
            {selectedLetter.assignee && (
              <div className={`bg-emerald-50 p-4 rounded-lg ${isRTL ? 'text-right' : ''}`}>
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">{t('correspondence.assignedTo')}</p>
                <p className="text-sm font-bold text-slate-900">{selectedLetter.assignee}</p>
              </div>
            )}
            <div className={`flex gap-3 pt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={() => { setIsLetterDetailOpen(false); handleReply(selectedLetter); }}
                className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <Icon icon="lucide:reply" className="text-lg" />
                {t('correspondence.reply')}
              </button>
              <button
                onClick={() => handleArchive(selectedLetter.id)}
                className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {selectedLetter.archived ? t('correspondence.unarchive') : t('correspondence.archive')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Requirement Modal */}
      <Modal
        isOpen={isAddRequirementOpen}
        onClose={() => setIsAddRequirementOpen(false)}
        title={t('correspondence.addNewRequirement')}
        subtitle={t('correspondence.createNewEntry')}
        size="lg"
      >
        <AddRequirementForm
          t={t}
          isRTL={isRTL}
          onSuccess={() => { setIsAddRequirementOpen(false); showToast(t('correspondence.requirementAdded')); }}
          onValidationError={() => showToast(t('correspondence.fillRequiredFields'))}
        />
      </Modal>
    </div>
  )
}

// Add Requirement Form Component
function AddRequirementForm({ t, isRTL, onSuccess, onValidationError }: { t: (key: TranslationKey) => string; isRTL: boolean; onSuccess: () => void; onValidationError: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomCategory, setShowCustomCategory] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    releaseDate: '',
    status: '',
    dueDate: '',
    description: ''
  })

  const handleSubmit = () => {
    // Validation
    if (!formData.name || !formData.category || !formData.releaseDate || !formData.status) {
      onValidationError()
      return
    }

    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      onSuccess()
    }, 1500)
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.requirementName')} *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., SAMA Circular 44321/2024 - Cybersecurity Framework"
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.category')} *</label>
            <select
              value={formData.category}
              onChange={(e) => {
                setShowCustomCategory(e.target.value === 'custom')
                setFormData(prev => ({ ...prev, category: e.target.value === 'custom' ? '' : e.target.value }))
              }}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectCategory')}</option>
              <option value="Cybersecurity">{t('correspondence.cybersecurity')}</option>
              <option value="AML/CTF">{t('correspondence.amlCtf')}</option>
              <option value="Consumer Protection">{t('correspondence.consumerProtection')}</option>
              <option value="Risk Management">{t('correspondence.riskManagement')}</option>
              <option value="Data Protection">{t('correspondence.dataProtection')}</option>
              <option value="Governance">{t('correspondence.governance')}</option>
              <option value="custom">{t('correspondence.addNewCategory')}</option>
            </select>
          </div>
          {showCustomCategory ? (
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.newCategoryName')}</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder={t('common.enterCategory')}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
          ) : (
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.releaseDate')} *</label>
              <input
                type="date"
                value={formData.releaseDate}
                onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.complianceStatus')} *</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectStatus')}</option>
              <option value="pending">{t('common.pending')}</option>
              <option value="drafting">{t('correspondence.drafting')}</option>
              <option value="implementing">{t('correspondence.implementing')}</option>
              <option value="completed">{t('common.completed')}</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('observations.dueDate')}</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>{t('correspondence.descriptionOptional')}</label>
          <textarea
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('correspondence.addDetailedDescription')}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>
      </div>

      <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 ${isRTL ? 'text-right' : ''}`}>
        <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:info" className="text-blue-600 text-xl shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900">{t('correspondence.requiredFields')}</p>
            <p className="text-xs text-blue-700 mt-1">{t('correspondence.requiredFieldsNote')}</p>
          </div>
        </div>
      </div>

      <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          {isSubmitting ? (
            <>
              <Icon icon="lucide:loader-2" className="text-lg animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" className="text-lg" />
              {t('correspondence.addRequirement')}
            </>
          )}
        </button>
        <button className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer">
          {t('common.cancel')}
        </button>
      </div>
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
  isRTL = false,
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
  isRTL?: boolean
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
    <div className={`glass-card stat-card-hover p-6 rounded-2xl ${isRTL ? 'text-right' : ''}`}>
      <div className={`flex justify-between items-start mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`p-2 ${iconColors[iconColor]} rounded-lg`}>
          <Icon icon={icon} className="text-2xl" />
        </div>
        <span className={`text-[10px] font-bold ${labelColors[iconColor]} px-2 py-0.5 rounded-full`}>
          {label}
        </span>
      </div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <span className="text-2xl font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{subtitle}</span>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${progressColor}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      {progressSegments && (
        <div className={`mt-4 flex gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {progressSegments.map((segment, i) => (
            <div
              key={i}
              className={`h-1.5 ${segment.color} rounded-full`}
              style={{ flex: segment.flex }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequirementRow({ requirement, t, isRTL }: { requirement: Requirement; t: (key: TranslationKey) => string; isRTL: boolean }) {
  const statusConfig = {
    implementing: { bg: 'bg-amber-100', text: 'text-amber-700', label: t('correspondence.implementing') },
    drafting: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('correspondence.drafting') },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: t('correspondence.verified') },
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', label: t('common.pending') },
  }

  const config = statusConfig[requirement.status]
  const isCompleted = requirement.status === 'completed'
  const isDueSoon = requirement.dueText.includes('4 Days')

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl border ${isCompleted ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'} ${isRTL ? 'flex-row-reverse' : ''}`}
    >
      <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 shadow-sm">
          <Icon
            icon={isCompleted ? 'lucide:check-circle' : 'lucide:landmark'}
            className={isCompleted ? 'text-emerald-500' : 'text-slate-400'}
          />
        </div>
        <div className={isRTL ? 'text-right' : ''}>
          <p className="text-sm font-bold text-slate-900">{requirement.name}</p>
          <p className="text-[10px] text-slate-500">{requirement.subtitle}</p>
        </div>
      </div>
      <div className={`flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={isRTL ? 'text-left' : 'text-right'}>
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

function CorrespondenceItem({
  letter,
  onView,
  onReply,
  onArchive,
  t,
  isRTL
}: {
  letter: Letter
  onView: () => void
  onReply: () => void
  onArchive: () => void
  t: (key: TranslationKey) => string
  isRTL: boolean
}) {
  const isSent = letter.status === 'sent'

  return (
    <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full ${isSent ? 'bg-blue-100' : 'bg-slate-100'} flex items-center justify-center shrink-0`}
      >
        <Icon
          icon={isSent ? 'lucide:arrow-up-right' : 'lucide:pencil'}
          className={`${isSent ? 'text-blue-600' : 'text-slate-600'} text-sm`}
        />
      </div>
      <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
        <p className="text-xs font-bold text-slate-900">{letter.title}</p>
        <p className="text-[10px] text-slate-500">{letter.content}</p>
        <p className="text-[9px] text-slate-400 mt-1">
          {letter.date} {letter.ref && `- REF: ${letter.ref}`}
        </p>
        {letter.assignee && (
          <p className="text-[9px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">
            {t('correspondence.assignedTo')}: {letter.assignee}
          </p>
        )}
        <div className={`flex gap-2 mt-2 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
          <button
            onClick={onView}
            className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
          >
            {t('common.view')}
          </button>
          {isSent && (
            <button
              onClick={onReply}
              className="text-[9px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {t('correspondence.reply')}
            </button>
          )}
          <button
            onClick={onArchive}
            className="text-[9px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            {t('correspondence.archive')}
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
  // Color logic matching HTML: >80 = rose, >50 = blue, else = emerald
  const getLoadColor = (load: number) => {
    if (load > 80) return { text: 'text-rose-500', bar: 'bg-rose-500' }
    if (load > 50) return { text: 'text-blue-500', bar: 'bg-blue-500' }
    return { text: 'text-emerald-500', bar: 'bg-emerald-500' }
  }

  const colors = getLoadColor(member.load)

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
          <span className={colors.text}>{member.load}%</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full">
          <div
            className={`h-full ${colors.bar} rounded-full`}
            style={{ width: `${member.load}%` }}
          />
        </div>
      </div>
    </div>
  )
}
