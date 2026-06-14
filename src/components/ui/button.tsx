import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500',
        secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-500',
        danger: 'bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500',
        ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-500',
        dark: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-500',
        outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-500',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Show a leading spinner and disable the button while a deferred action
   * (typically an in-flight navigation) is pending. The button keeps its
   * label so the user still sees *what* is loading.
   */
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), loading && 'cursor-wait')}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
