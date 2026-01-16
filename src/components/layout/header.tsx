'use client'

import { Icon } from '@iconify/react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-8">
        <div>
          <h1 className="text-xl font-bold font-display text-slate-900">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
          <Icon icon="lucide:search" className="text-slate-400" />
          <input
            type="text"
            placeholder="Search records..."
            className="bg-transparent border-none text-sm focus:outline-none text-slate-600 w-48"
          />
        </div>

        {/* Export Button */}
        <button className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all">
          <Icon icon="lucide:download" />
          Export CSV
        </button>
      </div>
    </header>
  )
}
