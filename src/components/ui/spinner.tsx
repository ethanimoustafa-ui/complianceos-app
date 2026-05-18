'use client'

import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'

export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface SpinnerProps {
  size?: SpinnerSize
  className?: string
  /** Accessible label. Defaults to "Loading". */
  label?: string
}

const SIZE_PX: Record<SpinnerSize, number> = { sm: 14, md: 16, lg: 20 }

/**
 * Inline loading indicator. Uses lucide `loader-2` with a CSS spin.
 * Defaults to `currentColor`, so it inherits the text colour of its parent —
 * pair with `text-slate-500`, `text-white`, etc. depending on background.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  const px = SIZE_PX[size]
  return (
    <Icon
      icon="lucide:loader-2"
      width={px}
      height={px}
      className={cn('animate-spin shrink-0', className)}
      role="status"
      aria-label={label}
    />
  )
}

export default Spinner
