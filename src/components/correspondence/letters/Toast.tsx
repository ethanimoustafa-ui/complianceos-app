'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
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
