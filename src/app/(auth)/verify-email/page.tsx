'use client'

// Verify-email page — handles Supabase email-confirmation redirects.
// Supabase appends a `code` param to the redirectTo URL; we exchange it for
// a session and then redirect to /sign-in (or the original `next` URL).

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'
import { createClient } from '@/lib/supabase/client'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t, isRTL } = useTranslation()

  const [status, setStatus] = useState<'verifying' | 'verified' | 'error' | 'pending'>('pending')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const code = searchParams.get('code')
  const email = searchParams.get('email') || 'your email'
  const next = searchParams.get('next') ?? '/sign-in'

  useEffect(() => {
    if (!code) {
      setStatus('pending')
      return
    }
    let cancelled = false
    setStatus('verifying')

    ;(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (cancelled) return
      if (error) {
        setErrorMessage(error.message)
        setStatus('error')
        return
      }
      setStatus('verified')
      // Brief pause so the success state is visible before redirect.
      setTimeout(() => {
        if (!cancelled) router.replace(next)
      }, 800)
    })()

    return () => {
      cancelled = true
    }
  }, [code, next, router])

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        {status === 'verified' ? (
          <div className="animate-fade-in">
            <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8">
              <Icon icon="lucide:check-circle-2" className="text-emerald-600 text-5xl" />
            </div>
            <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
              {t('verification.emailVerified')}
            </h1>
            <p className="text-base text-slate-500 mb-8">
              {t('verification.accountVerified')}
            </p>
            <Link href={next}>
              <Button className="w-full py-3.5 text-base">
                Continue
                <Icon icon={isRTL ? 'lucide:arrow-left' : 'lucide:arrow-right'} />
              </Button>
            </Link>
          </div>
        ) : status === 'verifying' ? (
          <div className="animate-fade-in">
            <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8">
              <Icon icon="lucide:loader-2" className="text-emerald-600 text-5xl animate-spin" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 mb-3">
              Verifying your email…
            </h1>
            <p className="text-slate-500">Please wait while we confirm your account.</p>
          </div>
        ) : status === 'error' ? (
          <div className="animate-fade-in">
            <div className="mx-auto w-24 h-24 bg-rose-100 rounded-full flex items-center justify-center mb-8">
              <Icon icon="lucide:alert-circle" className="text-rose-600 text-5xl" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 mb-3">
              Verification failed
            </h1>
            <p className="text-slate-500 mb-8">
              {errorMessage ?? 'Invalid or expired verification link. Please request a new one.'}
            </p>
            <Link href="/sign-in">
              <Button variant="outline" className="w-full">
                <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                {t('auth.backToSignIn')}
              </Button>
            </Link>
          </div>
        ) : (
          // Pending: user landed here without a code (e.g. after sign-up form).
          // Show the standard "check your email" prompt.
          <div className="animate-fade-in">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-8">
              <Icon icon="lucide:mail" className="text-blue-600 text-5xl" />
            </div>
            <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
              {t('verification.checkEmail')}
            </h1>
            <p className="text-base text-slate-500 mb-2">
              {t('verification.verificationSent')}
            </p>
            <p className="text-base font-semibold text-slate-700 mb-8">{email}</p>
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
