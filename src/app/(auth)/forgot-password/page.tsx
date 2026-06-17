'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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

// i18n-aware schema factory so the email validation message is localized.
const makeForgotPasswordSchema = (t: (key: TranslationKey) => string) =>
  z.object({
    email: z.string().email(t('errors.authPages.emailInvalid' as TranslationKey)),
  })

type ForgotPasswordInput = z.infer<ReturnType<typeof makeForgotPasswordSchema>>

const COOLDOWN_SECONDS = 60

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const { t, isRTL } = useTranslation()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(makeForgotPasswordSchema(t)),
  })

  // Cooldown timer effect
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${appUrl}/api/auth/callback`,
      })
      if (error) {
        console.error('Failed to send reset email:', error)
        // The send genuinely failed — tell the user instead of showing a
        // false-positive "check your email" screen. Mapped copy keeps the
        // message non-blaming (network / rate-limit) without leaking whether
        // the address exists.
        pushToast(mapAuthError(error), 'error')
        return
      }
      // Only show the success screen when the email actually went out.
      setSubmittedEmail(data.email)
      setIsSubmitted(true)
      setCooldown(COOLDOWN_SECONDS)
    } catch (error) {
      console.error('Failed to send reset email:', error)
      pushToast({ key: 'errors.authPages.resetSendFailed' }, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendEmail = useCallback(async () => {
    if (cooldown > 0) return

    setIsLoading(true)
    try {
      const supabase = createClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: `${appUrl}/api/auth/callback`,
      })
      if (error) {
        console.error('Failed to resend email:', error)
        // Without feedback the button just re-enables and the user retries into
        // the same silent failure — surface the mapped error instead.
        pushToast(mapAuthError(error), 'error')
        return
      }
      setCooldown(COOLDOWN_SECONDS)
    } catch (error) {
      console.error('Failed to resend email:', error)
      pushToast({ key: 'errors.authPages.resetSendFailed' }, 'error')
    } finally {
      setIsLoading(false)
    }
  }, [cooldown, submittedEmail])

  const formatCooldown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon icon="lucide:mail-check" className="text-3xl text-emerald-600" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">{t('auth.checkYourEmail')}</h1>
          <p className="text-slate-500 mb-2">
            {t('auth.resetInstructionsSent')}
          </p>
          <p className="text-sm text-slate-600 font-medium mb-8">
            {submittedEmail}
          </p>

          {/* Resend Email Button with Cooldown */}
          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={cooldown > 0 || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Icon icon="lucide:loader-2" className="animate-spin" />
                  {t('auth.sendingLink')}
                </>
              ) : cooldown > 0 ? (
                <>
                  <Icon icon="lucide:clock" />
                  Resend in {formatCooldown(cooldown)}
                </>
              ) : (
                <>
                  <Icon icon="lucide:refresh-cw" />
                  Resend Email
                </>
              )}
            </Button>

            {cooldown > 0 && (
              <p className="text-xs text-slate-500">
                Didn&apos;t receive the email? Check your spam folder or wait to resend.
              </p>
            )}

            <Link href="/sign-in">
              <Button variant="ghost" className="w-full">
                <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                {t('auth.backToSignIn')}
              </Button>
            </Link>
          </div>

          {/* Help Text */}
          <div className="mt-8 p-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-slate-600">
              <span className="font-bold">Need help?</span> If you continue to have issues,
              please contact{' '}
              <a href="mailto:support@complianceos.com" className="text-emerald-600 hover:underline">
                support@complianceos.com
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">{t('auth.resetPassword')}</h1>
          <p className="text-base text-slate-500">
            {t('auth.enterEmailToReset')}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{t('auth.emailAddress')}</label>
            <div className="relative">
              <Icon icon="lucide:mail" className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 text-lg`} />
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                className={`w-full ${isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20`}
                {...register('email')}
              />
            </div>
            {errors.email && <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>}
          </div>

          <Button type="submit" disabled={isLoading} className="w-full py-3.5 text-base">
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('auth.sendingLink')}
              </>
            ) : (
              <>
                {t('auth.sendResetInstructions')}
                <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
              </>
            )}
          </Button>

          <div className="text-center pt-4">
            <Link href="/sign-in" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-2">
              <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
              {t('auth.backToSignIn')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
