'use client'

import { Card } from '@/components/ui/card'

interface ComplianceChartProps {
  data: Array<{
    month: string
    value: number
  }>
  title?: string
  subtitle?: string
}

export function ComplianceChart({
  data,
  title = 'Compliance Trend',
  subtitle = 'Historical performance for the selected period',
}: ComplianceChartProps) {
  return (
    <Card className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-bold font-display text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-100"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Target</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Actual</span>
          </div>
        </div>
      </div>
      <div className="h-64 w-full flex items-end justify-between px-2 pb-4 border-b border-slate-100">
        {data.map((item, index) => (
          <div
            key={item.month}
            className="group relative flex-1 mx-1 min-w-[32px] flex flex-col items-center gap-1"
          >
            <div className="relative w-full h-48 flex items-end">
              <div className="bg-slate-100 h-full w-full rounded-t-md opacity-50 absolute bottom-0"></div>
              <div
                className="bg-emerald-500 w-full rounded-t-md absolute bottom-0 shadow-lg shadow-emerald-500/10 transition-all duration-500 hover:bg-emerald-600"
                style={{ height: `${item.value}%` }}
              ></div>
            </div>
            <span
              className={`text-[9px] font-bold text-center mt-2 ${
                index === Math.floor(data.length / 2) ? 'text-slate-600 font-black' : 'text-slate-400'
              }`}
            >
              {item.month}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
