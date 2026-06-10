'use client'

import { useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
}

export function Modal({ isOpen, onClose, title, subtitle, children, size = 'md' }: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // W45: when a portaled dropdown (EditableSelect listbox) or an inline
      // editor inside the modal owns the Escape, don't tear the modal down —
      // Escape should peel ONE layer, not the whole stack.
      if (document.querySelector('[role="listbox"]')) return
      onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, handleEscape])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop - separate div with its own fade animation */}
      <div
        className="modal-overlay absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content - separate slide animation */}
      {/* W38: role="dialog" + aria-modal — screen readers (and the e2e specs)
          could not identify the modal as a dialog without it. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={cn(
          'modal-content relative w-full bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto hide-scrollbar',
          sizeClasses[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Single p-8 wrapper for all content */}
        <div className="p-8">
          {title && (
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 font-display">{title}</h2>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <Icon icon="lucide:x" className="text-2xl" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
