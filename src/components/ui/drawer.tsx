'use client'

import { useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  position?: 'left' | 'right'
  hideBackdrop?: boolean
}

const sizeClasses = {
  sm: 'w-[320px]',
  md: 'w-[400px]',
  lg: 'w-[480px]',
  xl: 'w-[560px]',
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  position = 'right',
  hideBackdrop = false,
}: DrawerProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Only lock body scroll if backdrop is shown
      if (!hideBackdrop) {
        document.body.style.overflow = 'hidden'
      }
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, handleEscape, hideBackdrop])

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 animate-fade-in',
        hideBackdrop && 'pointer-events-none'
      )}
      onClick={hideBackdrop ? undefined : onClose}
    >
      {/* Backdrop (optional) */}
      {!hideBackdrop && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      )}

      {/* Drawer Content */}
      <div
        className={cn(
          'fixed top-0 h-full bg-white shadow-2xl flex flex-col pointer-events-auto border-l border-slate-200',
          sizeClasses[size],
          position === 'right'
            ? 'right-0 animate-slide-in-right'
            : 'left-0 animate-slide-in-left'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - only shown if title provided */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <Icon icon="lucide:x" className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={cn(
          'flex-1 overflow-y-auto hide-scrollbar',
          title ? 'px-6 py-4' : 'p-8'
        )}>
          {children}
        </div>
      </div>
    </div>
  )
}
