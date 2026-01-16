import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium',
  {
    variants: {
      variant: {
        success: 'bg-emerald-50 text-emerald-600',
        warning: 'bg-amber-50 text-amber-600',
        danger: 'bg-rose-50 text-rose-600',
        info: 'bg-blue-50 text-blue-600',
        neutral: 'bg-slate-100 text-slate-600',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, className }))} {...props} />
  )
}

// Convenience function to get badge variant from status
export function getStatusVariant(status: string): BadgeProps['variant'] {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'approved':
    case 'resolved':
    case 'success':
      return 'success'
    case 'pending':
    case 'in_progress':
    case 'warning':
      return 'warning'
    case 'overdue':
    case 'critical':
    case 'high':
    case 'danger':
    case 'failed':
      return 'danger'
    case 'info':
      return 'info'
    default:
      return 'neutral'
  }
}
