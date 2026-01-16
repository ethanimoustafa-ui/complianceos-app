'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ObservationSource, ObservationSeverity, sourceConfig } from './observation-types'

interface AddObservationModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ObservationFormData) => void
}

export interface ObservationFormData {
  source: ObservationSource
  title: string
  reference: string
  severity: ObservationSeverity
  description: string
  department: string
  assignee: string
  dueDate: string
}

export function AddObservationModal({ isOpen, onClose, onSave }: AddObservationModalProps) {
  const [formData, setFormData] = useState<ObservationFormData>({
    source: 'sama',
    title: '',
    reference: '',
    severity: 'critical',
    description: '',
    department: 'IT & Cybersecurity',
    assignee: '',
    dueDate: '',
  })

  const handleSourceSelect = (source: ObservationSource) => {
    setFormData((prev) => ({ ...prev, source }))
  }

  const handleSubmit = () => {
    onSave(formData)
    onClose()
    // Reset form
    setFormData({
      source: 'sama',
      title: '',
      reference: '',
      severity: 'critical',
      description: '',
      department: 'IT & Cybersecurity',
      assignee: '',
      dueDate: '',
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">
                Add New Observation
              </h2>
              <p className="text-sm text-slate-500">
                Log a new finding for tracking and remediation.
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <div className="space-y-8">
            {/* Source Selection */}
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Source Selection
              </label>
              <div className="grid grid-cols-3 gap-4">
                {(Object.keys(sourceConfig) as ObservationSource[]).map((source) => {
                  const config = sourceConfig[source]
                  const isSelected = formData.source === source

                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => handleSourceSelect(source)}
                      className={`p-4 border rounded-xl flex flex-col items-center gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                          : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                    >
                      <Icon
                        icon={config.icon}
                        className={`text-3xl ${
                          source === 'sama'
                            ? 'text-emerald-600'
                            : source === 'internal'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                        }`}
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {source === 'sama'
                          ? 'SAMA'
                          : source === 'internal'
                          ? 'Internal Audit'
                          : 'Sharia Audit'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Finding Title
                </label>
                <input
                  type="text"
                  placeholder="e.g., Inadequate Logging for Administrative Access"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., SAMA-2024-CX-01"
                  value={formData.reference}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, reference: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Severity
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      severity: e.target.value as ObservationSeverity,
                    }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed findings from the audit report..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Department Assignment
                </label>
                <select
                  value={formData.department}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, department: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option>IT & Cybersecurity</option>
                  <option>Human Resources</option>
                  <option>Risk Management</option>
                  <option>Operations</option>
                  <option>Legal</option>
                  <option>Compliance</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Lead Assignee
                </label>
                <div className="relative">
                  <Icon
                    icon="lucide:user"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Select user..."
                    value={formData.assignee}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, assignee: e.target.value }))
                    }
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Upload Report (PDF)
                </label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center gap-2 cursor-pointer hover:border-emerald-400 transition-all">
                  <Icon icon="lucide:upload-cloud" className="text-xl text-slate-400" />
                  <span className="text-xs font-bold text-slate-500">Click to browse</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Create Observation
          </Button>
        </div>
      </div>
    </Modal>
  )
}
