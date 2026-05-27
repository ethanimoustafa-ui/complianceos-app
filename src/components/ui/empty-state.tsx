'use client'

import { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { Button } from './button'
import { useTranslation } from '@/i18n'

type EmptyStateVariant = 'default' | 'search' | 'filter' | 'error' | 'success'

interface EmptyStateProps {
  /** Icon to display (Iconify icon name) */
  icon?: string
  /** Title text */
  title: string
  /** Description text */
  description?: string
  /** Variant for different use cases */
  variant?: EmptyStateVariant
  /** Primary action button */
  action?: {
    label: string
    onClick: () => void
    icon?: string
  }
  /** Secondary action button */
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  /** Custom children content */
  children?: ReactNode
  /** Additional CSS classes */
  className?: string
}

const variantConfig: Record<
  EmptyStateVariant,
  { icon: string; iconColor: string; bgColor: string }
> = {
  default: {
    icon: 'lucide:inbox',
    iconColor: 'text-slate-400',
    bgColor: 'bg-slate-100',
  },
  search: {
    icon: 'lucide:search-x',
    iconColor: 'text-slate-400',
    bgColor: 'bg-slate-100',
  },
  filter: {
    icon: 'lucide:filter-x',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-50',
  },
  error: {
    icon: 'lucide:alert-circle',
    iconColor: 'text-rose-500',
    bgColor: 'bg-rose-50',
  },
  success: {
    icon: 'lucide:check-circle-2',
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
  },
}

export function EmptyState({
  icon,
  title,
  description,
  variant = 'default',
  action,
  secondaryAction,
  children,
  className = '',
}: EmptyStateProps) {
  const config = variantConfig[variant]
  const displayIcon = icon || config.icon

  return (
    <div data-empty-state="true" className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {/* Icon */}
      <div
        className={`w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center mb-6`}
      >
        <Icon icon={displayIcon} className={`text-3xl ${config.iconColor}`} />
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-slate-900 text-center mb-2">{title}</h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-slate-500 text-center max-w-md mb-6">{description}</p>
      )}

      {/* Custom content */}
      {children}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-4">
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button variant="primary" onClick={action.onClick}>
              {action.icon && <Icon icon={action.icon} className="mr-1" />}
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Pre-configured empty states for common scenarios
export function NoResultsEmptyState({
  onClearFilters,
  searchTerm,
}: {
  onClearFilters?: () => void
  searchTerm?: string
}) {
  const { t } = useTranslation()
  return (
    <EmptyState
      variant="search"
      title={t('emptyStates.noResults')}
      description={
        searchTerm
          ? t('emptyStates.noResultsSearch', { searchTerm })
          : t('emptyStates.noResultsDesc')
      }
      secondaryAction={
        onClearFilters
          ? {
              label: t('emptyStates.clearFilters'),
              onClick: onClearFilters,
            }
          : undefined
      }
    />
  )
}

export function NoDataEmptyState({
  entityName = 'items',
  onAdd,
  title,
  description,
  ctaLabel,
}: {
  entityName?: string
  onAdd?: () => void
  /** Override title (should be i18n-translated by caller) */
  title?: string
  /** Override description (should be i18n-translated by caller) */
  description?: string
  /** Override CTA label (should be i18n-translated by caller) */
  ctaLabel?: string
}) {
  const resolvedTitle = title ?? `No ${entityName} yet`
  const resolvedDescription = description ?? `Get started by adding your first ${entityName.slice(0, -1) || 'item'}.`
  const resolvedCtaLabel = ctaLabel ?? `Add ${entityName.slice(0, -1) || 'item'}`
  return (
    <EmptyState
      variant="default"
      title={resolvedTitle}
      description={resolvedDescription}
      action={
        onAdd
          ? {
              label: resolvedCtaLabel,
              onClick: onAdd,
              icon: 'lucide:plus',
            }
          : undefined
      }
    />
  )
}

export function ErrorEmptyState({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <EmptyState
      variant="error"
      title="Error"
      description={message}
      action={
        onRetry
          ? {
              label: 'Try again',
              onClick: onRetry,
              icon: 'lucide:refresh-cw',
            }
          : undefined
      }
    />
  )
}
