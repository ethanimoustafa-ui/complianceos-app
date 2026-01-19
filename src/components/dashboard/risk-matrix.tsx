'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'

// Risk data types
interface Risk {
  id: number
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  likelihood: 'low' | 'medium' | 'high'
  impact: number
  probability: number
}

// Sample risk data
const sampleRisks: Risk[] = [
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

interface RiskMatrixProps {
  risks?: Risk[]
  className?: string
  onEmptyCellClick?: () => void
}

// Function to get cell style based on combined risk score (using inline styles for Tailwind v4 compatibility)
function getCellStyle(impact: number, likelihood: string): { bg: string; border: string } {
  const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
  const score = impact * likelihoodScore
  if (score >= 16) return { bg: 'rgba(244, 63, 94, 0.2)', border: 'rgb(244, 63, 94)' }      // rose-500
  if (score >= 12) return { bg: 'rgba(249, 115, 22, 0.2)', border: 'rgb(249, 115, 22)' }    // orange-500
  if (score >= 8) return { bg: 'rgba(251, 191, 36, 0.2)', border: 'rgb(251, 191, 36)' }     // amber-400
  return { bg: 'rgba(96, 165, 250, 0.2)', border: 'rgb(96, 165, 250)' }                      // blue-400
}

function getCellDotColor(impact: number, likelihood: string): string {
  const likelihoodScore = likelihood === 'low' ? 2 : likelihood === 'medium' ? 3 : 4
  const score = impact * likelihoodScore
  if (score >= 16) return 'rgb(244, 63, 94)'    // rose-500
  if (score >= 12) return 'rgb(249, 115, 22)'   // orange-500
  if (score >= 8) return 'rgb(251, 191, 36)'    // amber-400
  return 'rgb(96, 165, 250)'                     // blue-400
}

export function RiskMatrix({ risks = sampleRisks, className, onEmptyCellClick }: RiskMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<{ impact: number; likelihood: string } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const likelihoodLevels = ['Low', 'Medium', 'High']
  const impactLevels = [5, 4, 3, 2, 1]
  const impactLabels = ['Critical (5)', 'High (4)', 'Medium (3)', 'Low (2)', 'Very Low (1)']

  // Function to get risks for a specific cell
  function getRisksForCell(impact: number, likelihood: string): Risk[] {
    return risks.filter((r) => {
      const likelihoodMatch = r.likelihood === likelihood.toLowerCase()
      const impactMatch = r.impact === impact
      return likelihoodMatch && impactMatch
    })
  }

  const handleCellClick = (impact: number, likelihood: string) => {
    const cellRisks = getRisksForCell(impact, likelihood)
    if (cellRisks.length > 0) {
      setSelectedCell({ impact, likelihood })
      setIsModalOpen(true)
    } else if (onEmptyCellClick) {
      onEmptyCellClick()
    }
  }

  const selectedRisks = selectedCell
    ? getRisksForCell(selectedCell.impact, selectedCell.likelihood)
    : []

  const severityColors = {
    critical: 'bg-rose-100 text-rose-700 border-rose-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  }

  return (
    <div className={cn('', className)}>
      {/* Legend */}
      <div className="mb-6 flex items-center gap-4 justify-center pb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-rose-500 rounded" />
          <span className="text-xs font-bold text-slate-600">
            Critical ({risks.filter((r) => r.severity === 'critical').length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded" />
          <span className="text-xs font-bold text-slate-600">
            High ({risks.filter((r) => r.severity === 'high').length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-amber-400 rounded" />
          <span className="text-xs font-bold text-slate-600">
            Medium ({risks.filter((r) => r.severity === 'medium').length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-400 rounded" />
          <span className="text-xs font-bold text-slate-600">
            Low ({risks.filter((r) => r.severity === 'low').length})
          </span>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
        {/* Likelihood Header */}
        <div className="flex items-center justify-center mb-4">
          <div className="text-sm font-bold text-slate-600">Likelihood &rarr;</div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6 mb-4">
          <div />
          {likelihoodLevels.map((level) => (
            <div key={level} className="text-xs font-bold text-slate-600 text-center">
              {level}
            </div>
          ))}
        </div>

        {/* Matrix Rows */}
        <div className="relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 origin-center whitespace-nowrap text-sm font-bold text-slate-600 -translate-x-8">
            Impact &uarr;
          </div>
          <div className="space-y-3 ml-4">
            {impactLevels.map((impact, impactIndex) => (
              <div key={impact} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-6">
                <div className="flex items-center justify-end pr-4 text-xs font-bold text-slate-600">
                  {impactLabels[impactIndex]}
                </div>
                {likelihoodLevels.map((likelihood) => {
                  const cellRisks = getRisksForCell(impact, likelihood)
                  const cellStyle = getCellStyle(impact, likelihood)
                  const dotColor = getCellDotColor(impact, likelihood)
                  return (
                    <div
                      key={`${impact}-${likelihood}`}
                      className="h-[110px] border-2 rounded-lg p-3 flex flex-wrap gap-1 content-start cursor-pointer transition-all hover:scale-105 hover:shadow-lg risk-matrix-cell"
                      style={{ backgroundColor: cellStyle.bg, borderColor: cellStyle.border }}
                      onClick={() => handleCellClick(impact, likelihood)}
                    >
                      {cellRisks.map((risk, idx) => (
                        <div
                          key={risk.id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: dotColor }}
                          title={risk.name}
                        >
                          {idx + 1}
                        </div>
                      ))}
                      {cellRisks.length === 0 && (
                        <div className="text-xs text-slate-400 text-center w-full self-center">-</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div>
            <p className="text-sm font-bold text-blue-900">Interactive Matrix</p>
            <p className="text-xs text-blue-700 mt-1">
              Click on any cell to view detailed risk information. Numbers represent individual
              risks plotted on the matrix.
            </p>
          </div>
        </div>
      </div>

      {/* Risk Detail Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          selectedCell
            ? `Risks: Impact ${selectedCell.impact}, ${selectedCell.likelihood} Likelihood`
            : 'Risk Details'
        }
        size="lg"
      >
        <div className="space-y-3 max-h-[400px] overflow-y-auto hide-scrollbar">
          {selectedRisks.map((risk) => (
            <div
              key={risk.id}
              className={cn('p-4 border rounded-lg', severityColors[risk.severity])}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">{risk.name}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">
                      {risk.severity}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">
                      Impact: {risk.impact}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-white rounded-full">
                      Probability: {risk.probability}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {selectedRisks.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No risks in this category</p>
          )}
        </div>
      </Modal>
    </div>
  )
}

// Compact version for sidebar display
export function RiskHeatmapCompact({ risks = sampleRisks }: { risks?: Risk[] }) {
  const criticalCount = risks.filter((r) => r.severity === 'critical').length
  const highCount = risks.filter((r) => r.severity === 'high').length
  const mediumCount = risks.filter((r) => r.severity === 'medium').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 uppercase tracking-widest font-black">Severity</span>
        <span className="text-xs text-slate-400 uppercase tracking-widest font-black">Items</span>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500"
              style={{ width: `${(criticalCount / risks.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-white w-16">Critical ({criticalCount})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500"
              style={{ width: `${(highCount / risks.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-white w-16">High ({highCount})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${(mediumCount / risks.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-white w-16">Medium ({mediumCount})</span>
        </div>
      </div>
    </div>
  )
}
