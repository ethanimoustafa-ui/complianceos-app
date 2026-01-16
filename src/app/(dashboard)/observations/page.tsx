'use client'

import { useState, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import {
  Observation,
  ObservationSource,
  ObservationSeverity,
  ObservationStatus,
  ObservationStats,
  ObservationFilters,
  ObservationTable,
  ObservationDetailModal,
  AddObservationModal,
  ObservationFormData,
} from '@/components/observations'

// Sample data based on the HTML reference
const sampleObservations: Observation[] = [
  {
    id: 'OBS-2024-101',
    title: 'MFA Implementation Gap in Corporate Banking',
    description:
      'The audit revealed that corporate banking customers are currently able to perform high-value transactions without Mandatory Multi-Factor Authentication (MFA) under certain browser configurations. This violates the SAMA Cybersecurity Framework update 4.2 regarding critical transaction security.',
    source: 'sama',
    severity: 'critical',
    status: 'in_progress',
    dueDate: 'Oct 24, 2024',
    department: 'IT Security',
    reference: 'Cybersecurity Framework - Rule 4.2',
    team: [
      { name: 'Michael Scott', avatar: 'Michael', role: 'Lead Assignee' },
      { name: 'Felix Henderson', avatar: 'Felix', role: 'Compliance Officer' },
    ],
    progress: 40,
    checklist: [
      { id: '1', text: 'Identify affected browser engine configurations', completed: true },
      { id: '2', text: 'Draft technical requirement for MFA enforcement', completed: true },
      { id: '3', text: 'Implement session hijacking prevention measures', completed: false },
      { id: '4', text: 'QA Testing - Sandbox environment', completed: false },
      { id: '5', text: 'Verification by Internal Audit team', completed: false },
    ],
    updates: [
      {
        id: '1',
        author: { name: 'Sarah Connor', avatar: 'Sarah' },
        text: 'The middleware team has confirmed the fix will be ready for staging by Friday. We need Legal to review the updated T&Cs for customers.',
        createdAt: '2 days ago',
      },
    ],
    documents: [
      { id: '1', name: 'SAMA_Cyber_Audit_2024.pdf', type: 'pdf' },
      { id: '2', name: 'Error_Screen_MFA.png', type: 'image' },
    ],
    timeline: [
      { id: '1', date: 'Today', description: "Checklist item 'Audit Verification' marked as pending" },
      { id: '2', date: 'Yesterday', description: 'Sarah Henderson added a new document' },
    ],
  },
  {
    id: 'OBS-2024-102',
    title: 'Untrained Staff in Fraud Detection Module',
    description:
      'Internal audit identified that 15% of customer service staff have not completed the mandatory fraud detection training module. This creates compliance risk with regulatory training requirements.',
    source: 'internal',
    severity: 'medium',
    status: 'open',
    dueDate: 'Nov 12, 2024',
    department: 'Compliance',
    reference: 'Compliance Training Audit 2024',
    team: [{ name: 'Ahmed Khan', avatar: 'Ahmed', role: 'Training Coordinator' }],
    checklist: [
      { id: '1', text: 'Identify all untrained staff members', completed: false },
      { id: '2', text: 'Schedule mandatory training sessions', completed: false },
      { id: '3', text: 'Track completion and update records', completed: false },
    ],
    timeline: [
      { id: '1', date: 'Oct 15, 2024', description: 'Observation created from internal audit' },
    ],
  },
  {
    id: 'OBS-2024-103',
    title: 'Contractual Ambiguity in Murabaha Clauses',
    description:
      'Sharia board review identified ambiguous language in several Murabaha contract templates that could lead to non-compliance with Islamic financing principles.',
    source: 'sharia',
    severity: 'high',
    status: 'resolved',
    dueDate: 'Oct 30, 2024',
    department: 'Legal',
    reference: 'Sharia Product Review',
    team: [
      { name: 'Dr. Hassan Ali', avatar: 'Hassan', role: 'Sharia Advisor' },
      { name: 'Lisa Martinez', avatar: 'Lisa', role: 'Legal Counsel' },
    ],
    checklist: [
      { id: '1', text: 'Review all affected contract templates', completed: true },
      { id: '2', text: 'Draft revised language with Sharia board', completed: true },
      { id: '3', text: 'Legal review of proposed changes', completed: true },
      { id: '4', text: 'Final approval from Sharia board', completed: false },
    ],
    timeline: [
      { id: '1', date: 'Oct 20, 2024', description: 'Submitted for Sharia board review' },
      { id: '2', date: 'Oct 18, 2024', description: 'Legal review completed' },
    ],
  },
  {
    id: 'OBS-2024-098',
    title: 'Outdated AML Screening Parameters',
    description:
      'Annual compliance audit found that AML screening parameters had not been updated to reflect the latest SAMA sanctions list changes.',
    source: 'sama',
    severity: 'medium',
    status: 'closed',
    dueDate: 'Sep 15, 2024',
    department: 'Compliance',
    reference: 'Annual Compliance Audit',
    team: [{ name: 'Omar Al-Rashid', avatar: 'Omar', role: 'AML Officer' }],
    checklist: [
      { id: '1', text: 'Update AML screening parameters', completed: true },
      { id: '2', text: 'Test updated screening rules', completed: true },
      { id: '3', text: 'Document changes and obtain sign-off', completed: true },
    ],
    timeline: [
      { id: '1', date: 'Sep 15, 2024', description: 'Observation verified and closed' },
      { id: '2', date: 'Sep 10, 2024', description: 'All remediation tasks completed' },
    ],
  },
]

export default function ObservationsPage() {
  // State for modals
  const [selectedObservation, setSelectedObservation] = useState<Observation | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // State for filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<ObservationSource | 'all'>('all')
  const [severityFilter, setSeverityFilter] = useState<ObservationSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ObservationStatus | 'all'>('all')

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter observations
  const filteredObservations = useMemo(() => {
    return sampleObservations.filter((obs) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        obs.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obs.id.toLowerCase().includes(searchQuery.toLowerCase())

      // Source filter
      const matchesSource = sourceFilter === 'all' || obs.source === sourceFilter

      // Severity filter
      const matchesSeverity = severityFilter === 'all' || obs.severity === severityFilter

      // Status filter
      const matchesStatus = statusFilter === 'all' || obs.status === statusFilter

      return matchesSearch && matchesSource && matchesSeverity && matchesStatus
    })
  }, [searchQuery, sourceFilter, severityFilter, statusFilter])

  // Handle row click
  const handleRowClick = (observation: Observation) => {
    setSelectedObservation(observation)
    setIsDetailModalOpen(true)
  }

  // Handle add observation
  const handleAddObservation = (data: ObservationFormData) => {
    console.log('New observation:', data)
    // In a real app, this would make an API call to save the observation
  }

  return (
    <>
      {/* Custom Header with Add Observation button */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">
              Observations Tracker
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              Audit & Remediation Management
            </p>
          </div>

          <div className="h-8 w-px bg-slate-200 mx-2 hidden lg:block" />

          {/* Quick Links */}
          <div className="hidden lg:flex gap-2">
            <a
              href="/correspondence"
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2"
            >
              <Icon icon="lucide:mail" className="text-emerald-500" />
              SAMA Letters
            </a>
            <a
              href="/audits"
              className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 flex items-center gap-2"
            >
              <Icon icon="lucide:refresh-cw" className="text-blue-500" />
              Regulatory Updates
            </a>
            <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center gap-2">
              <Icon icon="lucide:crosshair" className="text-emerald-600" />
              Observations Tracker
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* System Health */}
          <div className="hidden md:flex items-center gap-1 bg-slate-50 border border-slate-200 p-1 rounded-lg">
            <div className="px-4 py-1.5 text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>System Health</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>

          {/* Add Observation Button */}
          <Button
            variant="primary"
            onClick={() => setIsAddModalOpen(true)}
            className="shadow-lg shadow-emerald-100"
          >
            <Icon icon="lucide:plus" />
            Add Observation
          </Button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-slate-50 p-8">
        {/* Metrics Strip */}
        <ObservationStats />

        {/* Filters and List */}
        <div className="bg-white/80 backdrop-blur-sm border border-slate-100 rounded-3xl p-6">
          <ObservationFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sourceFilter={sourceFilter}
            onSourceChange={setSourceFilter}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />

          <ObservationTable
            observations={filteredObservations}
            onRowClick={handleRowClick}
            currentPage={currentPage}
            totalItems={filteredObservations.length}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
          />
        </div>
      </div>

      {/* Detail Modal */}
      <ObservationDetailModal
        observation={selectedObservation}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedObservation(null)
        }}
      />

      {/* Add Observation Modal */}
      <AddObservationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddObservation}
      />
    </>
  )
}
