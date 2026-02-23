'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useRequirementStore } from '@/stores/requirement-store'
import { exportRequirementsLocalized } from '@/lib/export'
import { AddRequirementModal } from '@/components/correspondence/add-requirement-modal'
import type { Requirement as RequirementType, ChecklistItem } from '@/types'

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

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  implementing: 'bg-amber-100 text-amber-700',
  drafting: 'bg-blue-100 text-blue-700',
  pending: 'bg-slate-100 text-slate-700',
}

const categoryColors: Record<string, string> = {
  'Cybersecurity':       'bg-blue-100 text-blue-700',
  'AML/CTF':             'bg-rose-100 text-rose-700',
  'Consumer Protection': 'bg-emerald-100 text-emerald-700',
  'Risk Management':     'bg-amber-100 text-amber-700',
  'Data Protection':     'bg-violet-100 text-violet-700',
  'Governance':          'bg-teal-100 text-teal-700',
}
const categoryColorFallback = 'bg-slate-100 text-slate-600'

const departmentColors: Record<string, string> = {
  'Compliance':      'bg-emerald-100 text-emerald-700 border-emerald-200',
  'IT':              'bg-blue-100 text-blue-700 border-blue-200',
  'Finance':         'bg-amber-100 text-amber-700 border-amber-200',
  'Operations':      'bg-teal-100 text-teal-700 border-teal-200',
  'Risk Management': 'bg-orange-100 text-orange-700 border-orange-200',
  'HR':              'bg-pink-100 text-pink-700 border-pink-200',
  'Legal':           'bg-violet-100 text-violet-700 border-violet-200',
}
const departmentColorFallback = 'bg-slate-100 text-slate-500 border-slate-200'

type SortCol = 'name' | 'category' | 'releaseDate' | 'status' | 'dueDate' | 'progress'
type SortState = { col: SortCol; dir: 'asc' | 'desc' } | null

function SortHeader({
  label,
  col,
  sort,
  onSort,
  onClear,
  isRTL,
}: {
  label: string
  col: SortCol
  sort: SortState
  onSort: (col: SortCol) => void
  onClear: () => void
  isRTL: boolean
}) {
  const active = sort?.col === col
  const icon = active ? (sort!.dir === 'asc' ? 'lucide:chevron-up' : 'lucide:chevron-down') : 'lucide:chevrons-up-down'
  return (
    <div className={`flex items-center gap-1`}>
      <button
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer ${active ? 'text-emerald-600' : ''}`}
      >
        {label}
        <Icon icon={icon} className="text-sm" />
      </button>
      {active && (
        <button onClick={onClear} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Clear sort">
          <Icon icon="lucide:x" className="text-xs" />
        </button>
      )}
    </div>
  )
}

function calcProgress(req: RequirementType): number {
  if (req.checklist && req.checklist.length > 0) {
    return Math.round((req.checklist.filter(i => i.completed).length / req.checklist.length) * 100)
  }
  return req.progress
}

export default function RegistryPage() {
  const { t, isRTL } = useTranslation()
  const requirementStore = useRequirementStore()
  const searchParams = useSearchParams()

  const [isAddRequirementOpen, setIsAddRequirementOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementType | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Registry view filters
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  // Deep-link: auto-open view modal when ?id= is present
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    const req = requirementStore.requirements.find(r => r.id === id)
    if (req) { setSelectedRequirement(req); setIsViewModalOpen(true) }
  }, [searchParams, requirementStore.requirements])

  const handleSort = (col: SortCol) => {
    setSort(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  const handleView = (req: RequirementType) => {
    setSelectedRequirement(req)
    setIsViewModalOpen(true)
  }

  const handleEdit = (req: RequirementType) => {
    setSelectedRequirement(req)
    setIsEditModalOpen(true)
  }

  const handleDeleteClick = (req: RequirementType) => {
    setSelectedRequirement(req)
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (selectedRequirement) {
      requirementStore.delete(selectedRequirement.id)
      setIsDeleteDialogOpen(false)
      setSelectedRequirement(null)
      showToast(t('correspondence.requirementDeleted' as TranslationKey))
    }
  }

  const handleToggleChecklistItem = (req: RequirementType, itemId: string) => {
    const updated = (req.checklist ?? []).map(i =>
      i.id === itemId ? { ...i, completed: !i.completed } : i
    )
    requirementStore.update(req.id, { checklist: updated })
    setSelectedRequirement(prev => prev ? { ...prev, checklist: updated } : prev)
  }

  // Filter requirements for registry view
  const statusOrder: Record<string, number> = { pending: 0, drafting: 1, implementing: 2, completed: 3 }

  const filteredRequirements = useMemo(() => {
    const filtered = requirementStore.requirements.filter(req => {
      const matchesSearch = req.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = !categoryFilter || req.category === categoryFilter
      const matchesStatus = !statusFilter || req.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
    if (!sort) return filtered
    const { col, dir } = sort
    const mul = dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (col) {
        case 'name':     return mul * a.name.localeCompare(b.name)
        case 'category': return mul * a.category.localeCompare(b.category)
        case 'releaseDate': return mul * a.releaseDate.localeCompare(b.releaseDate)
        case 'dueDate':  return mul * a.dueDate.localeCompare(b.dueDate)
        case 'status':   return mul * ((statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0))
        case 'progress': return mul * (calcProgress(a) - calcProgress(b))
        default:         return 0
      }
    })
  }, [requirementStore.requirements, searchTerm, categoryFilter, statusFilter, sort])

  const uniqueCategories = useMemo(() =>
    [...new Set(requirementStore.requirements.map(r => r.category))],
    [requirementStore.requirements]
  )

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isRTL ? 'rtl' : ''}`}>
      <div className="flex-1 overflow-auto hide-scrollbar bg-slate-50 p-8">
        <div className="requirements-view">
          {/* Header */}
          <div className={`flex justify-between items-center mb-8`}>
            <div className={isRTL ? 'text-right' : ''}>
              <div className={`flex items-center gap-3 mb-2`}>
                <Link
                  href="/correspondence/feed"
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon={isRTL ? "lucide:arrow-right" : "lucide:arrow-left"} className="text-2xl" />
                </Link>
                <h1 className="text-2xl font-bold font-display text-slate-900">{t('correspondence.regulatoryRequirements')}</h1>
              </div>
              <p className={`text-sm text-slate-500 ${isRTL ? 'mr-11' : 'ml-11'}`}>{t('correspondence.comprehensiveList')}</p>
            </div>
            <button
              onClick={() => setIsAddRequirementOpen(true)}
              className={`bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 cursor-pointer`}
            >
              <Icon icon="lucide:plus" />
              {t('correspondence.addRequirement')}
            </button>
          </div>

          {/* Filters */}
          <div className="glass-card rounded-2xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('common.search')}</label>
                <div className="relative">
                  <Icon icon="lucide:search" className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('common.searchRecords')}
                    className={`w-full ${isRTL ? 'pl-8 pr-4 py-4' : 'pl-10 pr-4'} py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                  />
                </div>
              </div>
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.category')}</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                >
                  <option value="">{t('correspondence.allCategories')}</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('common.status')}</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                >
                  <option value="">{t('correspondence.allStatuses')}</option>
                  <option value="completed">{t('common.completed')}</option>
                  <option value="implementing">{t('correspondence.implementing')}</option>
                  <option value="drafting">{t('correspondence.drafting')}</option>
                  <option value="pending">{t('common.pending')}</option>
                </select>
              </div>
            </div>
            <div className={`flex gap-3 mt-4`}>
              <button
                onClick={() => { setSearchTerm(''); setCategoryFilter(''); setStatusFilter(''); }}
                className={`px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer`}
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
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('correspondence.requirementName')} col="name" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('correspondence.category')} col="category" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('correspondence.releaseDate')} col="releaseDate" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('common.status')} col="status" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('observations.dueDate')} col="dueDate" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>
                      <SortHeader label={t('common.progress')} col="progress" sort={sort} onSort={handleSort} onClear={() => setSort(null)} isRTL={isRTL} />
                    </th>
                    <th className={`text-left p-4 text-xs font-black text-slate-600 uppercase tracking-wider`}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequirements.map(req => (
                    <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <p className="text-sm font-bold text-slate-900">{req.name}</p>
                      </td>
                      <td className="p-4">
                        <div className={`flex flex-col items-start gap-1 ${isRTL ? 'items-end' : ''}`}>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${categoryColors[req.category] ?? categoryColorFallback}`}>{req.category}</span>
                          {req.affectedDepartment && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${departmentColors[req.affectedDepartment] ?? departmentColorFallback}`}>{req.affectedDepartment}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{req.releaseDate}</td>
                      <td className="p-4">
                        <span className={`text-xs font-bold ${statusColors[req.status]} px-3 py-1 rounded-full capitalize`}>
                          {req.status.replace('-', ' ')}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{req.dueDate}</td>
                      <td className="p-4 min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${calcProgress(req)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 shrink-0 w-8 text-right">{calcProgress(req)}%</span>
                        </div>
                        {req.checklist && req.checklist.length > 0 && (
                          <p className={`text-[10px] text-slate-400 mt-0.5`}>
                            {req.checklist.filter(i => i.completed).length}/{req.checklist.length}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleView(req)}
                            className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                            title="View Details"
                          >
                            <Icon icon="lucide:eye" className="text-lg" />
                          </button>
                          <button
                            onClick={() => handleEdit(req)}
                            className="text-blue-600 hover:text-blue-700 p-2 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                            title="Edit"
                          >
                            <Icon icon="lucide:pencil" className="text-lg" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(req)}
                            className="text-rose-500 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Delete"
                          >
                            <Icon icon="lucide:trash-2" className="text-lg" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`bg-slate-50 p-4 flex justify-between items-center border-t border-slate-200`}>
              <p className={`text-sm text-slate-600`}>
                {t('correspondence.showingRequirements').replace('{count}', String(filteredRequirements.length)).replace('{total}', String(requirementStore.requirements.length))}
              </p>
              <button
                onClick={() => {
                  exportRequirementsLocalized(filteredRequirements, 'requirements', t, isRTL)
                  showToast(t('correspondence.exportToCsv'))
                }}
                className={`px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded transition-colors flex items-center gap-1 cursor-pointer`}
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
      <AddRequirementModal
        isOpen={isAddRequirementOpen}
        onClose={() => setIsAddRequirementOpen(false)}
        onSuccess={() => showToast(t('correspondence.requirementAdded'))}
      />

      {/* View Requirement Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => { setIsViewModalOpen(false); setSelectedRequirement(null) }}
        title={t('correspondence.requirementName' as TranslationKey)}
        size="lg"
      >
        {selectedRequirement && (
          <div className="space-y-5">
            {/* Name */}
            <div>
              <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.requirementName')}</p>
              <p className={`text-base font-bold text-slate-900`}>{selectedRequirement.name}</p>
            </div>

            <div className={`grid grid-cols-2 gap-4`}>
              {/* Category */}
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.category')}</p>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">{selectedRequirement.category}</span>
              </div>
              {/* Status */}
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('common.status')}</p>
                <span className={`text-xs font-bold ${statusColors[selectedRequirement.status]} px-3 py-1 rounded-full capitalize`}>
                  {selectedRequirement.status.replace('-', ' ')}
                </span>
              </div>
            </div>

            {/* Affected Department */}
            {selectedRequirement.affectedDepartment && (
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.affectedDepartment' as TranslationKey)}</p>
                <p className={`text-sm text-slate-700`}>{selectedRequirement.affectedDepartment}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Release Date */}
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.releaseDate')}</p>
                <p className={`text-sm text-slate-700`}>{selectedRequirement.releaseDate}</p>
              </div>
              {/* Due Date */}
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('observations.dueDate')}</p>
                <p className={`text-sm text-slate-700`}>{selectedRequirement.dueDate}</p>
              </div>
            </div>

            {/* Reference URL */}
            {selectedRequirement.referenceUrl && (
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.referenceUrl' as TranslationKey)}</p>
                <a
                  href={/^https?:\/\//i.test(selectedRequirement.referenceUrl!) ? selectedRequirement.referenceUrl : `https://${selectedRequirement.referenceUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-sm text-emerald-600 hover:text-emerald-700 underline flex items-center gap-1`}
                >
                  <Icon icon="lucide:external-link" className="text-base" />
                  {t('correspondence.viewReference' as TranslationKey)}
                </a>
              </div>
            )}

            {/* Progress */}
            <div>
              <div className={`flex justify-between items-center mb-1`}>
                <p className="text-xs font-bold text-slate-500 uppercase">{t('common.progress')}</p>
                <p className="text-xs font-bold text-slate-700">{calcProgress(selectedRequirement)}%</p>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${calcProgress(selectedRequirement)}%` }}
                />
              </div>
            </div>

            {/* Checklist */}
            {selectedRequirement.checklist && selectedRequirement.checklist.length > 0 && (
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-2`}>{t('correspondence.complianceChecklist' as TranslationKey)}</p>
                <div className="space-y-2">
                  {[...selectedRequirement.checklist]
                    .sort((a, b) => a.order - b.order)
                    .map(item => (
                      <label key={item.id} className={`flex items-center gap-3 cursor-pointer group`}>
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleToggleChecklistItem(selectedRequirement, item.id)}
                          className="w-4 h-4 rounded accent-emerald-600 shrink-0"
                        />
                        <span className={`text-sm ${item.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {item.title}
                        </span>
                      </label>
                    ))}
                </div>
                <p className={`text-xs text-slate-400 mt-2`}>
                  {t('correspondence.checklistProgress' as TranslationKey)
                    .replace('{{done}}', String(selectedRequirement.checklist.filter(i => i.completed).length))
                    .replace('{{total}}', String(selectedRequirement.checklist.length))}
                </p>
              </div>
            )}

            {/* Description */}
            {selectedRequirement.description && (
              <div>
                <p className={`text-xs font-bold text-slate-500 uppercase mb-1`}>{t('correspondence.descriptionOptional')}</p>
                <p className={`text-sm text-slate-700 leading-relaxed`}>{selectedRequirement.description}</p>
              </div>
            )}

            {/* ID footer */}
            <div className="pt-2 border-t border-slate-100">
              <p className={`text-xs text-slate-400`}>ID: {selectedRequirement.id}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Requirement Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setSelectedRequirement(null) }}
        title={t('correspondence.editRequirement' as TranslationKey)}
        size="lg"
      >
        {selectedRequirement && (
          <EditRequirementForm
            t={t}
            isRTL={isRTL}
            requirement={selectedRequirement}
            onSuccess={() => {
              setIsEditModalOpen(false)
              setSelectedRequirement(null)
              showToast(t('correspondence.requirementUpdated' as TranslationKey))
            }}
            onClose={() => { setIsEditModalOpen(false); setSelectedRequirement(null) }}
            onValidationError={() => showToast(t('correspondence.fillRequiredFields'))}
          />
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => { setIsDeleteDialogOpen(false); setSelectedRequirement(null) }}
        onConfirm={handleDeleteConfirm}
        itemType={t('correspondence.requirementName' as TranslationKey)}
        itemName={selectedRequirement?.name}
      />
    </div>
  )
}

// Edit Requirement Form Component
const predefinedDepartments = ['Compliance', 'IT', 'Finance', 'Operations', 'Risk Management', 'HR', 'Legal']
const predefinedCategories = ['Cybersecurity', 'AML/CTF', 'Consumer Protection', 'Risk Management', 'Data Protection', 'Governance']

function EditRequirementForm({
  t,
  isRTL,
  requirement,
  onSuccess,
  onClose,
  onValidationError,
}: {
  t: (key: TranslationKey) => string
  isRTL: boolean
  requirement: RequirementType
  onSuccess: () => void
  onClose: () => void
  onValidationError: () => void
}) {
  const requirementStore = useRequirementStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomCategory, setShowCustomCategory] = useState(!predefinedCategories.includes(requirement.category))
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(requirement.checklist ?? [])
  const [formData, setFormData] = useState({
    name: requirement.name,
    category: requirement.category,
    affectedDepartment: requirement.affectedDepartment ?? '',
    releaseDate: requirement.releaseDate,
    status: requirement.status,
    dueDate: requirement.dueDate,
    description: requirement.description ?? '',
    progress: requirement.progress,
    referenceUrl: requirement.referenceUrl ?? '',
  })

  const addChecklistItem = () => {
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      title: '',
      completed: false,
      order: checklistItems.length,
    }
    setChecklistItems(prev => [...prev, newItem])
  }

  const updateChecklistItem = (id: string, title: string) => {
    setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, title } : i))
  }

  const removeChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.filter(i => i.id !== id).map((i, idx) => ({ ...i, order: idx })))
  }

  const handleSubmit = () => {
    if (!formData.name || !formData.category || !formData.releaseDate || !formData.status) {
      onValidationError()
      return
    }

    setIsSubmitting(true)
    requirementStore.update(requirement.id, {
      name: formData.name,
      category: formData.category,
      affectedDepartment: formData.affectedDepartment || undefined,
      releaseDate: formData.releaseDate,
      status: formData.status as RequirementType['status'],
      dueDate: formData.dueDate || formData.releaseDate,
      description: formData.description,
      progress: formData.progress,
      referenceUrl: formData.referenceUrl || undefined,
      checklist: checklistItems.filter(i => i.title.trim() !== ''),
    })
    setIsSubmitting(false)
    onSuccess()
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.requirementName')} *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.category')} *</label>
            <select
              value={showCustomCategory ? 'custom' : formData.category}
              onChange={(e) => {
                setShowCustomCategory(e.target.value === 'custom')
                setFormData(prev => ({ ...prev, category: e.target.value === 'custom' ? '' : e.target.value }))
              }}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
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
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.newCategoryName')}</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder={t('common.enterCategory')}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
              />
            </div>
          ) : (
            <div>
              <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.releaseDate')} *</label>
              <input
                type="date"
                value={formData.releaseDate}
                onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
                className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.complianceStatus' as TranslationKey)} *</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as RequirementType['status'] }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            >
              <option value="">{t('common.selectStatus')}</option>
              <option value="pending">{t('common.pending')}</option>
              <option value="drafting">{t('correspondence.drafting')}</option>
              <option value="implementing">{t('correspondence.implementing')}</option>
              <option value="completed">{t('common.completed')}</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('observations.dueDate')}</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
            />
          </div>
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.affectedDepartment' as TranslationKey)}</label>
          <select
            value={formData.affectedDepartment}
            onChange={(e) => setFormData(prev => ({ ...prev, affectedDepartment: e.target.value }))}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
          >
            <option value="">—</option>
            {predefinedDepartments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* Progress slider — only shown when no checklist items exist */}
        {checklistItems.length === 0 && (
          <div>
            <div className={`flex justify-between items-center mb-2`}>
              <label className={`text-xs font-bold text-slate-700 uppercase`}>{t('common.progress')} ({formData.progress}%)</label>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={formData.progress}
              onChange={(e) => setFormData(prev => ({ ...prev, progress: Number(e.target.value) }))}
              className="w-full accent-emerald-600"
            />
          </div>
        )}

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.descriptionOptional')}</label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('correspondence.addDetailedDescription')}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
          />
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.referenceUrl' as TranslationKey)}</label>
          <input
            type="url"
            value={formData.referenceUrl}
            onChange={(e) => setFormData(prev => ({ ...prev, referenceUrl: e.target.value }))}
            placeholder={t('correspondence.referenceUrlPlaceholder' as TranslationKey)}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
          />
        </div>

        {/* Checklist management */}
        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block`}>{t('correspondence.complianceChecklist' as TranslationKey)}</label>
          {checklistItems.length === 0 && (
            <p className={`text-xs text-slate-400 mb-2`}>{t('correspondence.noChecklistItems' as TranslationKey)}</p>
          )}
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <div key={item.id} className={`flex gap-2 items-center`}>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateChecklistItem(item.id, e.target.value)}
                  placeholder={t('correspondence.checklistItemPlaceholder' as TranslationKey)}
                  className={`flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500`}
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(item.id)}
                  className="text-rose-500 hover:text-rose-700 p-2 hover:bg-rose-50 rounded-lg transition-all cursor-pointer shrink-0"
                >
                  <Icon icon="lucide:x" className="text-base" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addChecklistItem}
            className={`mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 cursor-pointer`}
          >
            <Icon icon="lucide:plus" className="text-base" />
            {t('correspondence.addChecklistItem' as TranslationKey)}
          </button>
        </div>
      </div>

      <div className={`flex gap-3 mt-6`}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer`}
        >
          {isSubmitting ? (
            <>
              <Icon icon="lucide:loader-2" className="text-lg animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" className="text-lg" />
              {t('common.save')}
            </>
          )}
        </button>
        <button
          onClick={onClose}
          className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}
