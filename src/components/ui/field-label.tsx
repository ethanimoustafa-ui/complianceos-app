'use client'

// Shared form-field label with an accessible required marker and an explicit
// "(Optional)" affordance. Replaces the ad-hoc `{label} *` pattern where the
// bare asterisk was decorative-only (screen readers announced "star", not
// "required") and optional fields gave no signal at all.
//
// Usage:
//   <FieldLabel required>{t('reports.riskName')}</FieldLabel>
//   <FieldLabel optional>{t('reports.mitigationPlan')}</FieldLabel>
//
// Pair with `aria-required` on the associated input for full a11y. The visible
// asterisk is aria-hidden; the announced word comes from the sr-only span.

import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

interface FieldLabelProps {
  children: React.ReactNode
  required?: boolean
  optional?: boolean
  htmlFor?: string
  className?: string
}

export function FieldLabel({ children, required, optional, htmlFor, className }: FieldLabelProps) {
  const { t } = useTranslation()
  return (
    <label
      htmlFor={htmlFor}
      className={cn('text-xs font-bold text-slate-700 uppercase mb-2 block', className)}
    >
      {children}
      {required && (
        <>
          <span className="text-rose-500" aria-hidden="true"> *</span>
          <span className="sr-only"> ({t('common.required')})</span>
        </>
      )}
      {optional && (
        <span className="ms-1 text-slate-400 font-medium normal-case">
          ({t('common.optional')})
        </span>
      )}
    </label>
  )
}
