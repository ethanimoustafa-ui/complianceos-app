'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'

// Types
type LetterStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Sent to SAMA' | 'SAMA Response Received' | 'Overdue'
type LetterType = 'Non-Objection' | 'Inquiry' | 'Submission' | 'Notification'

interface Attachment {
  id: string
  name: string
  size: string
  type: 'pdf' | 'image'
}

interface TimelineEvent {
  id: string
  title: string
  date: string
  user?: string
  status: 'completed' | 'active' | 'pending'
}

interface Letter {
  id: string
  reference: string
  type: LetterType
  subject: string
  status: LetterStatus
  lastModified: string
  createdBy: string
  assignedTo: string
  contentEn?: string
  contentAr?: string
  attachments?: Attachment[]
  timeline?: TimelineEvent[]
}

// Sample data matching prototype
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
    contentEn: `In accordance with SAMA circular 22/34 regarding the Governance requirements for Financial Institutions, we are writing to formally request a non-objection regarding the appointment of Mr. Ahmad Al-Zahrani as the Chief Risk Officer of ComplianceOS Bank.

Mr. Al-Zahrani possesses over 15 years of experience in regional banking risk management and has previously served as the Head of Operational Risk at a major local bank. We have attached his full professional credentials, FIT test results, and our Board Nomination Committee's recommendation for your review.

We remain at your disposal for any further information or clarification required to process this request.`,
    contentAr: `إشارة إلى تعميم البنك المركزي السعودي رقم 22/34 بشأن متطلبات الحوكمة للمؤسسات المالية، نود التقدم بطلب رسمي للحصول على عدم ممانعة بشأن تعيين الأستاذ أحمد الزهراني في منصب رئيس إدارة المخاطر ببنك ComplianceOS.

يمتلك الأستاذ الزهراني خبرة تزيد عن 15 عاماً في إدارة المخاطر المصرفية الإقليمية، وقد شغل سابقاً منصب رئيس المخاطر التشغيلية في أحد البنوك المحلية الكبرى. نرفق لكم سيرته الذاتية الكاملة، ونتائج اختبار الملاءمة، وتوصية لجنة الترشيحات بمجلس الإدارة لمراجعتكم.

ونحن على أتم الاستعداد لتزويدكم بأي معلومات إضافية أو إيضاحات مطلوبة لمعالجة هذا الطلب.`,
    attachments: [
      { id: '1', name: 'Resume_AlZahrani.pdf', size: '1.2 MB', type: 'pdf' },
      { id: '2', name: 'FIT_Results_Final.pdf', size: '445 KB', type: 'pdf' },
    ],
    timeline: [
      { id: '1', title: 'Draft Created', date: 'Oct 10, 2024', user: 'Felix H.', status: 'completed' },
      { id: '2', title: 'Compliance Approved', date: 'Oct 11, 2024', user: 'Sarah C.', status: 'completed' },
      { id: '3', title: 'Sent to SAMA', date: 'Oct 12, 2024', user: 'Automated System', status: 'active' },
      { id: '4', title: 'Pending SAMA Reply', date: 'Expected: Nov 12, 2024', status: 'pending' },
    ],
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
]

type TemplateStatus = 'Active' | 'Draft'

interface LetterTemplate {
  id: string
  name: string
  type: LetterType
  icon: string
  color: string
  description: string
  status: TemplateStatus
  createdDate: string
  lastModified: string
  usageCount: number
}

const letterTemplates: LetterTemplate[] = [
  {
    id: 'tmpl-001',
    name: 'Key Function Appointment',
    type: 'Non-Objection',
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
    status: 'Active',
    createdDate: 'Jan 15, 2024',
    lastModified: 'Oct 10, 2024',
    usageCount: 45,
  },
  {
    id: 'tmpl-002',
    name: 'Product Launch Request',
    type: 'Non-Objection',
    icon: 'lucide:package',
    color: 'emerald',
    description: 'Request approval for new financial product launches.',
    status: 'Active',
    createdDate: 'Feb 20, 2024',
    lastModified: 'Sep 15, 2024',
    usageCount: 23,
  },
  {
    id: 'tmpl-003',
    name: 'Circular Clarification',
    type: 'Inquiry',
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
    status: 'Active',
    createdDate: 'Mar 05, 2024',
    lastModified: 'Aug 22, 2024',
    usageCount: 38,
  },
  {
    id: 'tmpl-004',
    name: 'Regulatory Interpretation',
    type: 'Inquiry',
    icon: 'lucide:book-open',
    color: 'blue',
    description: 'Request interpretation of specific regulatory requirements.',
    status: 'Draft',
    createdDate: 'Sep 01, 2024',
    lastModified: 'Oct 18, 2024',
    usageCount: 0,
  },
  {
    id: 'tmpl-005',
    name: 'Quarterly AML Report',
    type: 'Submission',
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
    status: 'Active',
    createdDate: 'Jan 01, 2024',
    lastModified: 'Oct 01, 2024',
    usageCount: 12,
  },
  {
    id: 'tmpl-006',
    name: 'Annual Compliance Report',
    type: 'Submission',
    icon: 'lucide:file-text',
    color: 'amber',
    description: 'Submit annual compliance assessment to SAMA.',
    status: 'Active',
    createdDate: 'Jan 10, 2024',
    lastModified: 'Dec 15, 2024',
    usageCount: 4,
  },
  {
    id: 'tmpl-007',
    name: 'Incident Notification',
    type: 'Notification',
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
    status: 'Active',
    createdDate: 'Apr 12, 2024',
    lastModified: 'Jul 30, 2024',
    usageCount: 8,
  },
  {
    id: 'tmpl-008',
    name: 'System Outage Report',
    type: 'Notification',
    icon: 'lucide:server-crash',
    color: 'rose',
    description: 'Report critical system outages affecting banking services.',
    status: 'Active',
    createdDate: 'May 20, 2024',
    lastModified: 'Nov 05, 2024',
    usageCount: 3,
  },
]

// Helper to get display templates for the dashboard cards
const templateTypeCards = [
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

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] animate-toast">
      <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shrink-0">
        <Icon icon="lucide:check" />
      </div>
      <span className="font-bold text-sm">{message}</span>
    </div>
  )
}

export default function SAMALettersPage() {
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard')
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedLetterType, setSelectedLetterType] = useState<LetterType>('Non-Objection')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [language, setLanguage] = useState<'en' | 'ar'>('en')

  // Template Management State
  const [isTemplateManagementOpen, setIsTemplateManagementOpen] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateTypeFilter, setTemplateTypeFilter] = useState<LetterType | 'All'>('All')
  const [templateStatusFilter, setTemplateStatusFilter] = useState<TemplateStatus | 'All'>('All')

  // Template Actions State
  const [templates, setTemplates] = useState<LetterTemplate[]>(letterTemplates)
  const [selectedTemplate, setSelectedTemplate] = useState<LetterTemplate | null>(null)
  const [isViewTemplateModalOpen, setIsViewTemplateModalOpen] = useState(false)
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  // Filter templates based on search and filters
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      templateSearch === '' ||
      template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      template.description.toLowerCase().includes(templateSearch.toLowerCase())
    const matchesType = templateTypeFilter === 'All' || template.type === templateTypeFilter
    const matchesStatus = templateStatusFilter === 'All' || template.status === templateStatusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  // Template Action Handlers
  const handleViewTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsViewTemplateModalOpen(true)
  }

  const handleEditTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsEditTemplateModalOpen(true)
  }

  const handleDuplicateTemplate = (template: LetterTemplate) => {
    const duplicatedTemplate: LetterTemplate = {
      ...template,
      id: `tmpl-${Date.now()}`,
      name: `${template.name} (Copy)`,
      status: 'Draft',
      createdDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      lastModified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      usageCount: 0,
    }
    setTemplates([duplicatedTemplate, ...templates])
    showToast('Template duplicated successfully')
  }

  const handleDeleteTemplate = (template: LetterTemplate) => {
    setSelectedTemplate(template)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      setTemplates(templates.filter((t) => t.id !== selectedTemplate.id))
      showToast('Template deleted successfully')
      setIsDeleteConfirmOpen(false)
      setSelectedTemplate(null)
    }
  }

  const handleCreateTemplate = () => {
    setSelectedTemplate(null)
    setIsEditTemplateModalOpen(true)
  }

  const handleSaveTemplate = (templateData: Partial<LetterTemplate>) => {
    if (selectedTemplate) {
      // Editing existing template
      setTemplates(templates.map((t) =>
        t.id === selectedTemplate.id
          ? { ...t, ...templateData, lastModified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
          : t
      ))
      showToast('Template updated successfully')
    } else {
      // Creating new template
      const typeColors: Record<LetterType, string> = {
        'Non-Objection': 'emerald',
        'Inquiry': 'blue',
        'Submission': 'amber',
        'Notification': 'rose',
      }
      const typeIcons: Record<LetterType, string> = {
        'Non-Objection': 'lucide:user-check',
        'Inquiry': 'lucide:help-circle',
        'Submission': 'lucide:file-up',
        'Notification': 'lucide:alert-triangle',
      }
      const newTemplate: LetterTemplate = {
        id: `tmpl-${Date.now()}`,
        name: templateData.name || 'Untitled Template',
        type: templateData.type || 'Non-Objection',
        icon: typeIcons[templateData.type || 'Non-Objection'],
        color: typeColors[templateData.type || 'Non-Objection'],
        description: templateData.description || '',
        status: templateData.status || 'Draft',
        createdDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        lastModified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        usageCount: 0,
      }
      setTemplates([newTemplate, ...templates])
      showToast('Template created successfully')
    }
    setIsEditTemplateModalOpen(false)
    setSelectedTemplate(null)
  }

  const handleViewLetter = (letter: Letter) => {
    setSelectedLetter(letter)
    setView('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBackToDashboard = () => {
    setView('dashboard')
    setSelectedLetter(null)
  }

  const handleOpenCreateModal = (type: LetterType = 'Non-Objection') => {
    setSelectedLetterType(type)
    setIsCreateModalOpen(true)
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
    }
  }

  const getStatusDisplay = (status: LetterStatus) => {
    switch (status) {
      case 'Sent to SAMA':
        return { color: 'text-blue-600', dotColor: 'bg-blue-600' }
      case 'Draft':
        return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'Approved':
        return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'Pending Approval':
        return { color: 'text-amber-600', dotColor: 'bg-amber-600' }
      case 'SAMA Response Received':
        return { color: 'text-emerald-600', dotColor: 'bg-emerald-600' }
      case 'Overdue':
        return { color: 'text-rose-600', dotColor: 'bg-rose-600' }
      default:
        return { color: 'text-slate-600', dotColor: 'bg-slate-600' }
    }
  }

  const getStatusLabel = (status: LetterStatus) => {
    if (status === 'Draft') return 'Drafting'
    if (status === 'Approved') return 'Approved for Sending'
    return status
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">SAMA Letters</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              Form Submission Overview
            </p>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2" />

          <div className="flex gap-2">
            <Link
              href="/sama-letters"
              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg transition-all border border-emerald-100 flex items-center gap-2"
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              SAMA Letters
            </Link>
            <Link
              href="/regulatory-updates"
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2"
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              Regulatory Updates
            </Link>
            <Link
              href="/observations"
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2"
            >
              <Icon icon="lucide:crosshair" className="text-rose-500" />
              Observations Tracker
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
            <div className="px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Live Pulse</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          <button
            onClick={() => handleOpenCreateModal()}
            className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer"
          >
            <Icon icon="lucide:plus" />
            Draft New Letter
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        {isTemplateManagementOpen ? (
          /* Template Management Databank View */
          <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setIsTemplateManagementOpen(false)
                    setTemplateSearch('')
                    setTemplateTypeFilter('All')
                    setTemplateStatusFilter('All')
                  }}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <Icon icon="lucide:chevron-left" className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-display">Template Databank</h2>
                  <p className="text-sm text-slate-500">Manage and organize letter templates</p>
                </div>
              </div>
              <button
                onClick={handleCreateTemplate}
                className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer"
              >
                <Icon icon="lucide:plus" />
                Create Template
              </button>
            </div>

            {/* Filters Section */}
            <div className="glass-card rounded-2xl p-6 mb-6">
              <div className="flex flex-wrap gap-4 items-center">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[280px]">
                  <Icon
                    icon="lucide:search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates by name or description..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                {/* Type Filter */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Type:</label>
                  <select
                    value={templateTypeFilter}
                    onChange={(e) => setTemplateTypeFilter(e.target.value as LetterType | 'All')}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none min-w-[150px]"
                  >
                    <option value="All">All Types</option>
                    <option value="Non-Objection">Non-Objection</option>
                    <option value="Inquiry">Inquiry</option>
                    <option value="Submission">Submission</option>
                    <option value="Notification">Notification</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Status:</label>
                  <select
                    value={templateStatusFilter}
                    onChange={(e) => setTemplateStatusFilter(e.target.value as TemplateStatus | 'All')}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none min-w-[130px]"
                  >
                    <option value="All">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                  </select>
                </div>

                {/* Results Count */}
                <div className="text-sm text-slate-500">
                  <span className="font-bold text-slate-900">{filteredTemplates.length}</span> templates found
                </div>
              </div>
            </div>

            {/* Templates Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-left">Template Name</th>
                      <th className="px-6 py-4 text-left">Type</th>
                      <th className="px-6 py-4 text-left">Description</th>
                      <th className="px-6 py-4 text-left">Status</th>
                      <th className="px-6 py-4 text-left">Last Modified</th>
                      <th className="px-6 py-4 text-center">Usage</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTemplates.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                              <Icon icon="lucide:file-x" className="text-2xl text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-500">No templates found matching your criteria</p>
                            <button
                              onClick={() => {
                                setTemplateSearch('')
                                setTemplateTypeFilter('All')
                                setTemplateStatusFilter('All')
                              }}
                              className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                            >
                              Clear filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredTemplates.map((template) => (
                        <tr
                          key={template.id}
                          className="hover:bg-slate-50 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                template.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                                template.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                                template.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                                'bg-rose-50 text-rose-600'
                              }`}>
                                <Icon icon={template.icon} className="text-lg" />
                              </div>
                              <span className="text-sm font-bold text-slate-900">{template.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(template.type)}`}>
                              {template.type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-500 truncate max-w-xs">{template.description}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`flex items-center gap-1.5 text-xs font-bold ${
                              template.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                template.status === 'Active' ? 'bg-emerald-600' : 'bg-amber-600'
                              }`} />
                              {template.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400">{template.lastModified}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-bold text-slate-900">{template.usageCount}</span>
                            <span className="text-xs text-slate-400 ml-1">uses</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleViewTemplate(template)}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="View"
                              >
                                <Icon icon="lucide:eye" />
                              </button>
                              <button
                                onClick={() => handleEditTemplate(template)}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="Edit"
                              >
                                <Icon icon="lucide:pencil" />
                              </button>
                              <button
                                onClick={() => handleDuplicateTemplate(template)}
                                className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                                title="Duplicate"
                              >
                                <Icon icon="lucide:copy" />
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(template)}
                                className="p-1.5 hover:bg-rose-100 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <Icon icon="lucide:trash-2" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : view === 'dashboard' ? (
          <div>
            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
              <StatCard
                label="Total Letters (YTD)"
                value="142"
                subtext="+12% from 2023"
                subtextIcon="lucide:trending-up"
                subtextColor="emerald"
                borderColor="emerald"
              />
              <StatCard
                label="Sent This Quarter"
                value="28"
                subtext="Last sent: Yesterday"
                borderColor="blue"
              />
              <StatCard
                label="Pending Drafts"
                value="09"
                subtext="3 due this week"
                subtextIcon="lucide:clock"
                subtextColor="amber"
                borderColor="amber"
              />
              <StatCard
                label="Overdue Replies"
                value="02"
                subtext="Critical Escalation"
                subtextColor="rose"
                borderColor="rose"
              />
            </div>

            {/* Letter Templates */}
            <div className="mb-10">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-lg font-bold font-display text-slate-900">Letter Templates</h2>
                <button
                  onClick={() => setIsTemplateManagementOpen(true)}
                  className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                >
                  Manage Templates &rarr;
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {templateTypeCards.map((template) => (
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
            </div>

            {/* Recent Letters Table */}
            <div className="glass-card rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/50">
                <h2 className="font-bold text-slate-900">Recent Correspondence</h2>
                <div className="flex gap-3">
                  <div className="relative">
                    <Icon
                      icon="lucide:search"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search reference..."
                      className="pl-10 pr-4 py-2 bg-slate-100 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none w-64"
                    />
                  </div>
                  <button className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer">
                    <Icon icon="lucide:filter" />
                  </button>
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
                    {mockLetters.map((letter) => {
                      const statusDisplay = getStatusDisplay(letter.status)
                      return (
                        <tr
                          key={letter.id}
                          onClick={() => handleViewLetter(letter)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <span className="text-sm font-bold text-slate-900 font-display">
                              {letter.reference}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(letter.type)}`}
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
                            <span
                              className={`flex items-center gap-1.5 text-xs font-bold ${statusDisplay.color}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dotColor}`} />
                              {getStatusLabel(letter.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400">{letter.lastModified}</td>
                          <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-900 transition-colors"
                            >
                              <Icon icon="lucide:more-vertical" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          // Detail View
          <div>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBackToDashboard}
                  className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer"
                >
                  <Icon icon="lucide:chevron-left" className="text-xl" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 font-display">
                    {selectedLetter?.reference}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {selectedLetter?.type} &bull; Sent on {selectedLetter?.lastModified}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors cursor-pointer">
                  <Icon icon="lucide:printer" />
                  Print PDF
                </button>
                <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer">
                  <Icon icon="lucide:pencil" />
                  Edit Letter
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-8">
              {/* Letter Content */}
              <div className="col-span-12 lg:col-span-8">
                <div
                  className="bg-white rounded-2xl border border-slate-200 p-12 relative overflow-hidden"
                  style={{ boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)', minHeight: '600px' }}
                >
                  {/* Header */}
                  <div className="flex justify-between border-b-2 border-slate-100 pb-8 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-emerald-400">
                        <Icon icon="lucide:shield-check" className="text-3xl" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">
                          ComplianceOS Bank
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          Headquarters, Riyadh KSA
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex rounded-lg bg-slate-100 p-1 mb-2">
                        <button
                          onClick={() => setLanguage('en')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            language === 'en'
                              ? 'bg-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                        <button
                          onClick={() => setLanguage('ar')}
                          className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            language === 'ar'
                              ? 'bg-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Arabic
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Letter Content */}
                  {language === 'en' ? (
                    <div className="space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="text-sm text-slate-900">
                          <p className="font-bold">To: Compliance Department</p>
                          <p>Saudi Central Bank (SAMA)</p>
                          <p>Riyadh, Saudi Arabia</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-slate-500">Date: 12 October 2024</p>
                          <p className="text-slate-500">Ref: {selectedLetter?.reference}</p>
                        </div>
                      </div>

                      <div className="py-4">
                        <h4 className="font-black text-lg text-slate-900">
                          Subject: Request for Non-Objection - Appointment of Chief Risk Officer
                        </h4>
                      </div>

                      <div className="text-slate-700 text-sm leading-relaxed space-y-4">
                        <p>Dear Sir/Madam,</p>
                        <p>
                          In accordance with SAMA circular 22/34 regarding the Governance
                          requirements for Financial Institutions, we are writing to formally
                          request a non-objection regarding the appointment of{' '}
                          <strong>Mr. Ahmad Al-Zahrani</strong> as the Chief Risk Officer of
                          ComplianceOS Bank.
                        </p>
                        <p>
                          Mr. Al-Zahrani possesses over 15 years of experience in regional banking
                          risk management and has previously served as the Head of Operational Risk
                          at a major local bank. We have attached his full professional credentials,
                          FIT test results, and our Board Nomination Committee&apos;s recommendation
                          for your review.
                        </p>
                        <p>
                          We remain at your disposal for any further information or clarification
                          required to process this request.
                        </p>
                        <p className="pt-8">Yours sincerely,</p>
                        <div>
                          <p className="font-black text-slate-900">Felix Henderson</p>
                          <p className="text-slate-500">Head of Compliance</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
                      <div className="flex justify-between items-start">
                        <div className="text-lg text-slate-900">
                          <p className="font-bold">إلى: إدارة الالتزام</p>
                          <p>البنك المركزي السعودي (ساما)</p>
                          <p>الرياض، المملكة العربية السعودية</p>
                        </div>
                        <div className="text-left text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                          <p className="text-slate-500">التاريخ: 12 أكتوبر 2024</p>
                          <p className="text-slate-500">المرجع: {selectedLetter?.reference}</p>
                        </div>
                      </div>

                      <div className="py-4">
                        <h4 className="font-bold text-2xl text-slate-900">
                          الموضوع: طلب عدم ممانعة - تعيين رئيس إدارة المخاطر
                        </h4>
                      </div>

                      <div className="text-slate-700 text-lg leading-relaxed space-y-4">
                        <p>السادة الكرام،</p>
                        <p>
                          إشارة إلى تعميم البنك المركزي السعودي رقم 22/34 بشأن متطلبات الحوكمة
                          للمؤسسات المالية، نود التقدم بطلب رسمي للحصول على عدم ممانعة بشأن تعيين{' '}
                          <strong>الأستاذ أحمد الزهراني</strong> في منصب رئيس إدارة المخاطر ببنك
                          ComplianceOS.
                        </p>
                        <p>
                          يمتلك الأستاذ الزهراني خبرة تزيد عن 15 عاماً في إدارة المخاطر المصرفية
                          الإقليمية، وقد شغل سابقاً منصب رئيس المخاطر التشغيلية في أحد البنوك المحلية
                          الكبرى. نرفق لكم سيرته الذاتية الكاملة، ونتائج اختبار الملاءمة، وتوصية لجنة
                          الترشيحات بمجلس الإدارة لمراجعتكم.
                        </p>
                        <p>
                          ونحن على أتم الاستعداد لتزويدكم بأي معلومات إضافية أو إيضاحات مطلوبة
                          لمعالجة هذا الطلب.
                        </p>
                        <p className="pt-8">وتقبلوا خالص التحية والتقدير،،</p>
                        <div>
                          <p className="font-bold text-slate-900">فيليكس هندرسون</p>
                          <p className="text-slate-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            رئيس إدارة الالتزام
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="col-span-12 lg:col-span-4 space-y-6">
                {/* Metadata */}
                <section className="glass-card p-6 rounded-2xl">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                    Metadata
                  </h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Category</span>
                      <span className="text-xs font-bold text-slate-900">
                        {selectedLetter?.type}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Recipient Dept.</span>
                      <span className="text-xs font-bold text-slate-900">Compliance</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Created By</span>
                      <div className="flex items-center gap-2">
                        <img
                          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                          className="w-5 h-5 rounded-full"
                          alt="Felix"
                        />
                        <span className="text-xs font-bold text-slate-900">
                          {selectedLetter?.createdBy}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Assigned To</span>
                      <span className="text-xs font-bold text-emerald-600">
                        {selectedLetter?.assignedTo}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Attachments */}
                <section className="glass-card p-6 rounded-2xl">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                    Attachments ({selectedLetter?.attachments?.length || 0})
                  </h4>
                  <div className="space-y-3">
                    {selectedLetter?.attachments?.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-white hover:shadow-sm transition-all"
                      >
                        <div
                          className={`w-8 h-8 ${attachment.type === 'pdf' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'} flex items-center justify-center rounded-lg`}
                        >
                          <Icon icon="lucide:file-text" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-900 truncate">
                            {attachment.name}
                          </p>
                          <p className="text-[9px] text-slate-400">{attachment.size}</p>
                        </div>
                        <Icon
                          icon="lucide:download"
                          className="text-slate-300 group-hover:text-slate-900"
                        />
                      </div>
                    ))}
                    <button className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer">
                      + Add Attachment
                    </button>
                  </div>
                </section>

                {/* Activity Timeline */}
                <section className="glass-card p-6 rounded-2xl">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">
                    Activity Timeline
                  </h4>
                  <div className="space-y-6 relative before:absolute before:left-2 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-100">
                    {selectedLetter?.timeline?.map((event) => (
                      <div key={event.id} className="relative pl-8">
                        <div
                          className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 ${
                            event.status === 'completed'
                              ? 'bg-emerald-100 border-emerald-500'
                              : event.status === 'active'
                                ? 'bg-blue-100 border-blue-500'
                                : 'bg-slate-100 border-slate-300'
                          }`}
                        />
                        <p
                          className={`text-xs font-bold ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-900'}`}
                        >
                          {event.title}
                        </p>
                        <p
                          className={`text-[10px] ${event.status === 'pending' ? 'text-slate-300' : 'text-slate-400'}`}
                        >
                          {event.date}
                          {event.user && ` \u2022 ${event.user}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Letter Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        size="xl"
      >
        <CreateLetterForm
          selectedType={selectedLetterType}
          onTypeChange={setSelectedLetterType}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false)
            showToast('Letter submitted for internal compliance approval.')
          }}
        />
      </Modal>

      {/* View Template Modal */}
      <Modal
        isOpen={isViewTemplateModalOpen}
        onClose={() => {
          setIsViewTemplateModalOpen(false)
          setSelectedTemplate(null)
        }}
        size="md"
      >
        {selectedTemplate && (
          <div className="p-8">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  selectedTemplate.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                  selectedTemplate.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                  selectedTemplate.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                  'bg-rose-50 text-rose-600'
                }`}>
                  <Icon icon={selectedTemplate.icon} className="text-2xl" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-display">{selectedTemplate.name}</h2>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${getTypeBadgeColor(selectedTemplate.type)}`}>
                    {selectedTemplate.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsViewTemplateModalOpen(false)
                  setSelectedTemplate(null)
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Icon icon="lucide:x" className="text-2xl text-slate-400" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  Description
                </label>
                <p className="text-sm text-slate-600">{selectedTemplate.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    Status
                  </label>
                  <span className={`flex items-center gap-1.5 text-sm font-bold ${
                    selectedTemplate.status === 'Active' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      selectedTemplate.status === 'Active' ? 'bg-emerald-600' : 'bg-amber-600'
                    }`} />
                    {selectedTemplate.status}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    Usage Count
                  </label>
                  <span className="text-sm font-bold text-slate-900">{selectedTemplate.usageCount} times used</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    Created Date
                  </label>
                  <span className="text-sm text-slate-600">{selectedTemplate.createdDate}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">
                    Last Modified
                  </label>
                  <span className="text-sm text-slate-600">{selectedTemplate.lastModified}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => {
                  setIsViewTemplateModalOpen(false)
                  setSelectedTemplate(null)
                }}
                className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit/Create Template Modal */}
      <Modal
        isOpen={isEditTemplateModalOpen}
        onClose={() => {
          setIsEditTemplateModalOpen(false)
          setSelectedTemplate(null)
        }}
        size="lg"
      >
        <TemplateEditForm
          template={selectedTemplate}
          onClose={() => {
            setIsEditTemplateModalOpen(false)
            setSelectedTemplate(null)
          }}
          onSave={handleSaveTemplate}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false)
          setSelectedTemplate(null)
        }}
        size="sm"
      >
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
              <Icon icon="lucide:alert-triangle" className="text-3xl text-rose-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Delete Template</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            Are you sure you want to delete <strong>{selectedTemplate?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                setSelectedTemplate(null)
              }}
              className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 transition-colors cursor-pointer"
            >
              Delete Template
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  subtextIcon,
  subtextColor,
  borderColor,
}: {
  label: string
  value: string
  subtext: string
  subtextIcon?: string
  subtextColor?: 'emerald' | 'amber' | 'rose' | 'blue'
  borderColor: 'emerald' | 'amber' | 'rose' | 'blue'
}) {
  const borderColorValues = {
    emerald: '#22c55e',  // emerald-500
    amber: '#f59e0b',    // amber-500
    rose: '#f43f5e',     // rose-500
    blue: '#3b82f6',     // blue-500
  }

  const textColors = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    blue: 'text-blue-600',
  }

  return (
    <div
      className="glass-card p-6 rounded-2xl stat-card-hover"
      style={{
        border: `1px solid ${borderColorValues[borderColor]}`,
        borderLeftWidth: '6px'
      }}
    >
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
      <h2 className="text-3xl font-black text-slate-900 font-display">{value}</h2>
      <p
        className={`text-xs mt-2 ${
          subtextIcon
            ? `font-bold flex items-center gap-1 ${subtextColor ? textColors[subtextColor] : 'text-slate-400'}`
            : subtextColor
              ? `font-bold ${textColors[subtextColor]}`
              : 'font-medium text-slate-400'
        }`}
      >
        {subtextIcon && <Icon icon={subtextIcon} />}
        {subtext}
      </p>
    </div>
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
      className="bg-white p-5 rounded-2xl text-left border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all cursor-pointer"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colorClasses[color]}`}>
        <Icon icon={icon} className="text-xl" />
      </div>
      <h3 className="font-bold text-slate-900 text-sm mb-1">{type}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  )
}

// Create Letter Form Component (Bilingual)
function CreateLetterForm({
  selectedType,
  onTypeChange,
  onClose,
  onSuccess,
}: {
  selectedType: LetterType
  onTypeChange: (type: LetterType) => void
  onClose: () => void
  onSuccess: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priority, setPriority] = useState<'Standard' | 'Urgent'>('Standard')

  const handleSubmit = () => {
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      onSuccess()
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
    }
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            Draft Official Correspondence
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Reference assigned:{' '}
            <span className="font-mono font-bold text-emerald-600">
              {getRefPrefix(selectedType)}-2026-001
            </span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
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
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bilingual Editors */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* English Side */}
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            Subject (English)
          </label>
          <input
            type="text"
            placeholder="Enter English subject..."
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
          />
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            Content (English)
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
              className="w-full h-32 bg-transparent resize-none text-sm text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Arabic Side */}
        <div dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            الموضوع (عربي)
          </label>
          <input
            type="text"
            placeholder="أدخل الموضوع بالعربي..."
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-lg font-medium focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
          />
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            المحتوى (عربي)
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
              placeholder="اكتب نص الرسالة هنا..."
              className="w-full h-32 bg-transparent resize-none text-lg text-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <button className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer">
          <Icon icon="lucide:paperclip" />
          Manage Attachments (0)
        </button>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Save as Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Processing...
              </>
            ) : (
              'Send for Approval'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Template Edit Form Component
function TemplateEditForm({
  template,
  onClose,
  onSave,
}: {
  template: LetterTemplate | null
  onClose: () => void
  onSave: (data: Partial<LetterTemplate>) => void
}) {
  const [name, setName] = useState(template?.name || '')
  const [type, setType] = useState<LetterType>(template?.type || 'Non-Objection')
  const [description, setDescription] = useState(template?.description || '')
  const [status, setStatus] = useState<TemplateStatus>(template?.status || 'Draft')
  const [isSaving, setIsSaving] = useState(false)

  const isCreateMode = template === null

  const handleSubmit = () => {
    setIsSaving(true)
    setTimeout(() => {
      onSave({
        name,
        type,
        description,
        status,
      })
      setIsSaving(false)
    }, 500)
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            {isCreateMode ? 'Create New Template' : 'Edit Template'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isCreateMode ? 'Add a new letter template to the databank' : `Editing: ${template?.name}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            Template Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter template name..."
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            Letter Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LetterType)}
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
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this template is used for..."
            rows={3}
            className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            Status
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStatus('Active')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                status === 'Active'
                  ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-700'
                  : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatus('Draft')}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                status === 'Draft'
                  ? 'bg-amber-50 border-2 border-amber-500 text-amber-700'
                  : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${status === 'Draft' ? 'bg-amber-500' : 'bg-slate-300'}`} />
              Draft
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || !name.trim()}
          className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          {isSaving ? (
            <>
              <Icon icon="lucide:loader-2" className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Icon icon="lucide:check" />
              {isCreateMode ? 'Create Template' : 'Save Changes'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
