'use client'

import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/card'

interface RiskItem {
  label: string
  percentage: number
  color: string
}

interface RiskDistributionProps {
  data: RiskItem[]
  onViewBreakdown?: () => void
}

export function RiskDistribution({ data, onViewBreakdown }: RiskDistributionProps) {
  return (
    <Card className="p-8 flex flex-col">
      <h2 className="text-lg font-bold font-display text-slate-900 mb-6">Risk Distribution</h2>
      <div className="space-y-6 flex-1">
        {data.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-600">{item.label}</span>
              <span className="text-slate-900">{item.percentage}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${item.color} rounded-full transition-all duration-500`}
                style={{ width: `${item.percentage}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
      {onViewBreakdown && (
        <button
          onClick={onViewBreakdown}
          className="w-full mt-8 py-3 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors bg-emerald-50 rounded-xl group flex items-center justify-center gap-2"
        >
          View Full Breakdown
          <Icon
            icon="lucide:external-link"
            className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
          />
        </button>
      )}
    </Card>
  )
}
