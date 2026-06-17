'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useAuthStore } from '@/stores/auth-store'
import { pushToast } from '@/stores/toast-store'

// i18n-aware schema factory: refine messages are resolved through `t()` so
// Arabic users see localized validation copy instead of hardcoded English.
const makeSignInSchema = (t: (key: TranslationKey) => string) =>
  z.object({
    email: z.string().email(t('errors.authPages.emailInvalid' as TranslationKey)),
    password: z.string().min(8, t('errors.authPages.passwordTooShort' as TranslationKey)),
  })

type SignInInput = z.infer<ReturnType<typeof makeSignInSchema>>

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { t } = useTranslation()
  const signIn = useAuthStore((s) => s.signIn)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  // Surface a failed auth callback (expired/invalid reset or confirmation link).
  // The callback route redirects here with `?error=auth_callback_failed` but
  // otherwise gives the user no explanation — show a clear toast on mount.
  useEffect(() => {
    if (searchParams.get('error') === 'auth_callback_failed') {
      pushToast({ key: 'errors.authPages.linkExpired' }, 'error')
    }
  }, [searchParams])

  // Already authenticated → bounce to dashboard.
  useEffect(() => {
    if (hasMounted && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [hasMounted, isAuthenticated, router])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(makeSignInSchema(t)),
  })

  // Real sign-in via Supabase. On success, the AuthListener hook syncs state
  // and `middleware.ts` will let us through to the dashboard.
  const onSubmit = async (data: SignInInput) => {
    setSubmitError(null)
    setIsLoading(true)
    const result = await signIn(data.email, data.password)
    setIsLoading(false)
    if (result.ok) {
      router.push('/dashboard')
      router.refresh()
    } else {
      // The auth store already mapped the raw Supabase error to a stable i18n
      // key (see stores/auth-store signIn). Resolve it for clear, localized,
      // non-blaming copy; fall back to the generic key if none was returned.
      const errorKey = (result.error ?? 'errors.authPages.signInGeneric') as TranslationKey
      pushToast({ key: errorKey }, 'error')
      setSubmitError(t(errorKey))
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)]">
      {/* Left Side - Sign In Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Welcome Text */}
          <div className="mb-10 animate-fade-in">
            <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">
              {t('auth.welcomeBack')}
            </h1>
            <p className="text-base text-slate-500">
              {t('auth.enterCredentials')}
            </p>
          </div>

          {/* Sign In Form */}
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('auth.emailAddress')}
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:mail"
                  className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400 text-lg"
                />
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full auth-input-with-start-icon py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('auth.password')}
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:lock"
                  className="absolute auth-icon-start top-1/2 -translate-y-1/2 text-slate-400 text-lg"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full auth-input-with-icons py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute auth-icon-end top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} className="text-lg" />
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-rose-500">{errors.password.message}</p>
              )}
              {!errors.password && submitError && (
                <p className="mt-1.5 text-xs text-rose-500">{submitError}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
                  {t('auth.rememberMe')}
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 text-base"
              variant="primary"
            >
              {isLoading ? (
                <>
                  <Icon icon="lucide:loader-2" className="animate-spin" />
                  {t('auth.signingIn')}
                </>
              ) : (
                <>
                  {t('auth.signIn')}
                  <Icon icon="lucide:arrow-right" />
                </>
              )}
            </Button>

            {/* Sign-up is admin-only (per backend decision) — show a contact note. */}
            <div className="text-center pt-4">
              <p className="text-sm text-slate-500">
                Need an account? Contact your compliance admin to be invited.
              </p>
            </div>
          </form>

          {/* Social Sign In */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-slate-500">{t('auth.orContinueWith')}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <Button variant="outline" type="button" className="py-3">
                <Icon icon="flat-color-icons:google" className="text-xl" />
                {t('auth.google')}
              </Button>
              <Button variant="outline" type="button" className="py-3">
                <Icon icon="logos:microsoft-icon" className="text-xl" />
                {t('auth.microsoft')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Decorative Background */}
      <div className="hidden lg:block lg:w-1/2 bg-gradient-to-br from-slate-50 to-emerald-50 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="max-w-lg">
            {/* Feature Cards */}
            <div className="space-y-8">
              <FeatureCard
                icon="lucide:shield-check"
                title={t('auth.secureCompliant')}
                description={t('auth.secureCompliantDescription')}
              />
              <FeatureCard
                icon="lucide:zap"
                title={t('auth.realTimeInsights')}
                description={t('auth.realTimeInsightsDescription')}
                className="ml-12"
              />
              <FeatureCard
                icon="lucide:users"
                title={t('auth.teamCollaboration')}
                description={t('auth.teamCollaborationDescription')}
              />
            </div>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-6">
              <StatItem value="500+" label={t('auth.companies')} />
              <StatItem value="99.9%" label={t('auth.uptime')} />
              <StatItem value="24/7" label={t('auth.support')} />
            </div>
          </div>
        </div>

        {/* Decorative Shapes */}
        <div className="absolute top-20 right-20 w-64 h-64 bg-emerald-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-64 h-64 bg-emerald-300/20 rounded-full blur-3xl" />
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  className,
}: {
  icon: string
  title: string
  description: string
  className?: string
}) {
  return (
    <div
      className={`bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg transform hover:scale-105 transition-transform duration-300 ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon icon={icon} className="text-2xl text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-display font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  )
}
