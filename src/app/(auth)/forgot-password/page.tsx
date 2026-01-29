'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email'),
})

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

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
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
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
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setSubmittedEmail(data.email)
      setIsSubmitted(true)
      setCooldown(COOLDOWN_SECONDS)
    } catch (error) {
      console.error('Failed to send reset email:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendEmail = useCallback(async () => {
    if (cooldown > 0) return

    setIsLoading(true)
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setCooldown(COOLDOWN_SECONDS)
    } catch (error) {
      console.error('Failed to resend email:', error)
    } finally {
      setIsLoading(false)
    }
  }, [cooldown])

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
                  Sending...
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
