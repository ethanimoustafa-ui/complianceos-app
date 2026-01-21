'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t, isRTL } = useTranslation()
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  const isVerified = searchParams.get('verified') === 'true'
  // Get email from query params (passed from sign-up)
  const email = searchParams.get('email') || 'your email'

  const handleResend = async () => {
    setIsResending(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsResending(false)
    setResendSuccess(true)
    // Reset success message after 3 seconds
    setTimeout(() => setResendSuccess(false), 3000)
  }

  const handleContinue = () => {
    router.push('/onboarding')
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        {isVerified ? (
          // Verified State
          <div className="animate-fade-in">
            {/* Success Icon */}
            <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8 verification-success-icon">
              <Icon icon="lucide:check-circle-2" className="text-emerald-600 text-5xl" />
            </div>

            <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
              {t('verification.emailVerified')}
            </h1>
            <p className="text-base text-slate-500 mb-8">
              {t('verification.accountVerified')}
            </p>

            <Button onClick={handleContinue} className="w-full py-3.5 text-base">
              {t('verification.continueSetup')}
              <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
            </Button>
          </div>
        ) : (
          // Pending State
          <div className="animate-fade-in">
            {/* Mail Icon with pulse animation */}
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-8 verification-pulse-icon">
              <Icon icon="lucide:mail" className="text-blue-600 text-5xl" />
            </div>

            <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
              {t('verification.checkEmail')}
            </h1>
            <p className="text-base text-slate-500 mb-2">
              {t('verification.verificationSent')}
            </p>
            <p className="text-base font-semibold text-slate-700 mb-8">
              {email}
            </p>

            {/* Resend Link */}
            <div className="mb-8">
              {resendSuccess ? (
                <p className="text-sm text-emerald-600 font-medium flex items-center justify-center gap-2">
                  <Icon icon="lucide:check" />
                  {t('verification.emailResent')}
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  {t('verification.didntReceive')}{' '}
                  <button
                    onClick={handleResend}
                    disabled={isResending}
                    className="font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    {isResending ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon icon="lucide:loader-2" className="animate-spin" />
                        {t('verification.sending')}
                      </span>
                    ) : (
                      t('verification.resend')
                    )}
                  </button>
                </p>
              )}
            </div>

            {/* Back to Sign In */}
            <Link
              href="/sign-in"
              className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-2"
            >
              <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
              {t('auth.backToSignIn')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// Loading fallback for Suspense
function VerifyEmailLoading() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-8 animate-pulse">
          <Icon icon="lucide:loader-2" className="text-slate-400 text-4xl animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoading />}>
      <VerifyEmailContent />
    </Suspense>
  )
}
