'use client'

// Set-a-new-password page — the final step of the forgot-password walkthrough.
//
// Flow: /forgot-password emails a link to /api/auth/callback?next=/reset-password.
// The callback exchanges the recovery code for a session and redirects here, so
// the user lands with a valid (recovery) session. This page lets them choose a
// new password via supabase.auth.updateUser({ password }). If they arrive without
// a session (link expired / opened directly), we show a friendly "request a new
// link" state instead of a broken form.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { createClient } from '@/lib/supabase/client'
import { pushToast } from '@/stores/toast-store'
import { mapAuthError } from '@/lib/supabase/auth-errors'
import { clearSessionPersistence } from '@/lib/auth/session-persistence'

const makeResetSchema = (t: (key: TranslationKey) => string) =>
  z
    .object({
      password: z.string().min(8, t('errors.authPages.passwordTooShort' as TranslationKey)),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('auth.passwordsDoNotMatch' as TranslationKey),
      path: ['confirmPassword'],
    })

type ResetInput = z.infer<ReturnType<typeof makeResetSchema>>

export default function ResetPasswordPage() {
  const router = useRouter()
  const { t, isRTL } = useTranslation()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // The recovery link establishes a session (via the auth callback) before we
  // land here. Confirm one exists so we can show the form vs the expired state.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        // This recovery session is a fresh, intentional login. Drop any stale
        // "remember me off" marker from a prior sign-in so the AuthListener
        // cold-start check never expires (revokes) it out from under us.
        clearSessionPersistence()
      }
      setHasSession(!!data.session)
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetInput>({ resolver: zodResolver(makeResetSchema(t)) })

  const onSubmit = async (data: ResetInput) => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) {
        pushToast(mapAuthError(error), 'error')
        return
      }
      pushToast({ key: 'auth.passwordUpdated' }, 'success')
      router.push('/dashboard')
      router.refresh()
    } catch {
      pushToast({ key: 'errors.authPages.signInGeneric' }, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
        <Icon icon="lucide:loader-2" className="text-3xl text-emerald-600 animate-spin" />
      </div>
    )
  }

  // Arrived without a valid recovery session → link is invalid/expired.
  if (!hasSession) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon icon="lucide:link-2-off" className="text-3xl text-rose-500" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
            {t('auth.resetLinkInvalid')}
          </h1>
          <p className="text-slate-500 mb-8">{t('auth.resetLinkInvalidSubtitle')}</p>
          <Link href="/forgot-password">
            <Button variant="primary" className="w-full py-3.5 text-base">
              {t('auth.requestNewLink')}
              <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
            </Button>
          </Link>
          <div className="text-center pt-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-2"
            >
              <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">
            {t('auth.setNewPassword')}
          </h1>
          <p className="text-base text-slate-500">{t('auth.setNewPasswordSubtitle')}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {/* New password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('auth.newPassword')}
            </label>
            <div className="relative">
              <Icon
                icon="lucide:lock"
                className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder')}
                className={`w-full ${isRTL ? 'pr-12 pl-12' : 'pl-12 pr-12'} py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className={`absolute ${isRTL ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer`}
              >
                <Icon icon={showPassword ? 'lucide:eye-off' : 'lucide:eye'} className="text-lg" />
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-rose-500">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('auth.confirmNewPassword')}
            </label>
            <div className="relative">
              <Icon
                icon="lucide:lock"
                className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('auth.passwordPlaceholder')}
                className={`w-full ${isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                {...register('confirmPassword')}
              />
            </div>
            {errors.confirmPassword && (
              <p className="mt-1.5 text-xs text-rose-500">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isLoading} className="w-full py-3.5 text-base" variant="primary">
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('auth.updatingPassword')}
              </>
            ) : (
              <>
                {t('auth.updatePassword')}
                <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
              </>
            )}
          </Button>

          <div className="text-center pt-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-2"
            >
              <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
