import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  // W38: default type="text" — without it the input renders type-less, which
  // breaks `input[type="text"]` CSS/test selectors and autofill heuristics.
  ({ className, type = 'text', error, label, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            'flex h-11 w-full rounded-xl border bg-white px-4 py-2 text-sm text-slate-900 transition-colors',
            'placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50',
            error
              ? 'border-rose-300 focus:ring-rose-500'
              : 'border-slate-200 hover:border-slate-300',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-rose-500">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
