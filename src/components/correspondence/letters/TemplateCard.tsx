'use client'

import { Icon } from '@iconify/react'

export function TemplateCard({
  type,
  icon,
  color,
  description,
  onClick,
}: {
  type: string
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

  // W43: templates store HEX colors from the editor's swatch picker — the
  // named-class map only covered 4 Tailwind names, so pinned template cards
  // rendered colorless. Hex values get an inline tint (12% alpha background).
  const isHex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
  const named = colorClasses[color]

  return (
    <button
      onClick={onClick}
      className="bg-white p-5 rounded-2xl text-left border border-slate-100 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all cursor-pointer"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${named ?? (isHex ? '' : 'bg-slate-50 text-slate-600')}`}
        style={isHex ? { backgroundColor: `${color}1f`, color } : undefined}
      >
        <Icon icon={icon} className="text-xl" />
      </div>
      <h3 className="font-bold text-slate-900 text-sm mb-1">{type}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </button>
  )
}
