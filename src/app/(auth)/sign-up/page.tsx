'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'

const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  organization: z.string().min(2, 'Organization name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type SignUpInput = z.infer<typeof signUpSchema>

// Password strength calculation
function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
  feedback: string[]
} {
  const feedback: string[] = []
  let score = 0

  if (password.length >= 8) score += 1
  else feedback.push('At least 8 characters')

  if (password.length >= 12) score += 1

  if (/[a-z]/.test(password)) score += 1
  else feedback.push('Lowercase letter')

  if (/[A-Z]/.test(password)) score += 1
  else feedback.push('Uppercase letter')

  if (/[0-9]/.test(password)) score += 1
  else feedback.push('Number')

  if (/[^a-zA-Z0-9]/.test(password)) score += 1
  else feedback.push('Special character')

  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong']
  const colors = ['rose', 'rose', 'amber', 'amber', 'emerald', 'emerald']

  return {
    score,
    label: labels[Math.min(score, 5)],
    color: colors[Math.min(score, 5)],
    feedback,
  }
}

export default function SignUpPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { t, isRTL } = useTranslation()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      acceptTerms: false,
    },
  })

  const password = watch('password', '')
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password])

  const onSubmit = async (data: SignUpInput) => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsLoading(false)
    // Navigate to verification page with email
    router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">
            {t('auth.createAccount')}
          </h1>
          <p className="text-base text-slate-500">
            {t('auth.getStarted')}
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.fullName')}</label>
            <div className="relative">
              <Icon icon="lucide:user" className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t('auth.fullNamePlaceholder')}
                className="w-full auth-input-with-start-icon py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('name')}
              />
            </div>
            {errors.name && <p className="mt-1.5 text-xs text-rose-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.workEmail')}</label>
            <div className="relative">
              <Icon icon="lucide:mail" className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                className="w-full auth-input-with-start-icon py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.organization')}</label>
            <div className="relative">
              <Icon icon="lucide:building" className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={t('auth.organizationPlaceholder')}
                className="w-full auth-input-with-start-icon py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('organization')}
              />
            </div>
            {errors.organization && <p className="mt-1.5 text-xs text-rose-500">{errors.organization.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.password')}</label>
            <div className="relative">
              <Icon icon="lucide:lock" className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full auth-input-with-icons py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute auth-icon-end top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} />
              </button>
            </div>
            {errors.password && <p className="mt-1.5 text-xs text-rose-500">{errors.password.message}</p>}

            {/* Password Strength Indicator */}
            {password && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-colors',
                        level <= passwordStrength.score
                          ? passwordStrength.color === 'rose'
                            ? 'bg-rose-500'
                            : passwordStrength.color === 'amber'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          : 'bg-slate-200'
                      )}
                    />
                  ))}
                </div>
                <div className="flex justify-between items-center">
                  <span
                    className={cn(
                      'text-xs font-bold',
                      passwordStrength.color === 'rose' && 'text-rose-600',
                      passwordStrength.color === 'amber' && 'text-amber-600',
                      passwordStrength.color === 'emerald' && 'text-emerald-600'
                    )}
                  >
                    {passwordStrength.label}
                  </span>
                  {passwordStrength.feedback.length > 0 && (
                    <span className="text-xs text-slate-500">
                      Add: {passwordStrength.feedback.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.confirmPassword')}</label>
            <div className="relative">
              <Icon icon="lucide:lock" className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full auth-input-with-start-icon py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('confirmPassword')}
              />
            </div>
            {errors.confirmPassword && <p className="mt-1.5 text-xs text-rose-500">{errors.confirmPassword.message}</p>}
          </div>

          {/* Terms and Conditions Checkbox */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="acceptTerms"
              className="mt-1 w-4 h-4 text-emerald-600 bg-white border-slate-300 rounded focus:ring-emerald-500 focus:ring-2 cursor-pointer"
              {...register('acceptTerms')}
            />
            <label htmlFor="acceptTerms" className="text-sm text-slate-600 cursor-pointer">
              I agree to the{' '}
              <Link href="/terms" className="text-emerald-600 hover:text-emerald-700 font-medium">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-emerald-600 hover:text-emerald-700 font-medium">
                Privacy Policy
              </Link>
            </label>
          </div>
          {errors.acceptTerms && <p className="text-xs text-rose-500">{errors.acceptTerms.message}</p>}

          <Button type="submit" disabled={isLoading} className="w-full py-3.5 text-base mt-6">
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('auth.creatingAccount')}
              </>
            ) : (
              <>
                {t('auth.createAccount')}
                <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
              </>
            )}
          </Button>

          <div className="text-center pt-4">
            <p className="text-sm text-slate-500">
              {t('auth.alreadyHaveAccount')}{' '}
              <Link href="/sign-in" className="font-medium text-emerald-600 hover:text-emerald-700">
                {t('auth.signIn')}
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
