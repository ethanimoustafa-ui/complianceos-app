'use client'

import { forwardRef } from 'react'
import { Icon } from '@iconify/react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface LoadingButtonProps extends ButtonProps {
  /** When `true`, disables the button and shows an inline spinner. */
  loading?: boolean
  /**
   * Optional override for the visible label while loading. By default
   * the existing `children` stay visible so the button width stays stable.
   */
  loadingLabel?: React.ReactNode
}

/**
 * Drop-in replacement for `<Button>` that surfaces an async-in-flight
 * state. Use it on every save/delete/advance trigger so users get
 * instant feedback and the button can't be double-clicked.
 *
 * The spinner is rendered alongside `children`, keeping the label
 * readable. Pass `loadingLabel` to swap the text while busy.
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, loadingLabel, disabled, children, className, ...rest }, ref) => {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(className)}
        {...rest}
      >
        {loading && (
          <Icon
            icon="lucide:loader-2"
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        )}
        {loading && loadingLabel !== undefined ? loadingLabel : children}
      </Button>
    )
  }
)

LoadingButton.displayName = 'LoadingButton'
