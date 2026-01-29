'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

const RESEND_COOLDOWN_SECONDS = 60

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t, isRTL } = useTranslation()
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', ''])
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  const isVerified = searchParams.get('verified') === 'true'
  const token = searchParams.get('token')
  // Get email from query params (passed from sign-up)
  const email = searchParams.get('email') || 'your email'

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (token && !isVerified) {
      handleTokenVerification(token)
    }
  }, [token, isVerified])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const handleTokenVerification = async (verificationToken: string) => {
    setIsVerifying(true)
    setVerificationError(null)
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 2000))
      // Simulate successful verification
      router.push('/verify-email?verified=true')
    } catch (error) {
      setVerificationError('Invalid or expired verification link. Please request a new one.')
      setIsVerifying(false)
    }
  }

  const handleCodeVerification = async () => {
    const code = verificationCode.join('')
    if (code.length !== 6) {
      setVerificationError('Please enter the complete 6-digit code')
      return
    }

    setIsVerifying(true)
    setVerificationError(null)
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 2000))
      // Simulate verification - in real app, validate the code
      router.push('/verify-email?verified=true')
    } catch (error) {
      setVerificationError('Invalid verification code. Please try again.')
      setIsVerifying(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[value.length - 1]
    }
    if (!/^\d*$/.test(value)) return

    const newCode = [...verificationCode]
    newCode[index] = value
    setVerificationCode(newCode)
    setVerificationError(null)

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`)
      prevInput?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').slice(0, 6)
    if (!/^\d+$/.test(pastedData)) return

    const newCode = [...verificationCode]
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i]
    }
    setVerificationCode(newCode)
  }

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return

    setIsResending(true)
    setResendSuccess(false)
    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500))
      setResendSuccess(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      // Reset success message after 5 seconds
      setTimeout(() => setResendSuccess(false), 5000)
    } catch (error) {
      console.error('Failed to resend email:', error)
    } finally {
      setIsResending(false)
    }
  }, [cooldown])

  const handleContinue = () => {
    router.push('/onboarding')
  }

  const formatCooldown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
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
        ) : isVerifying ? (
          // Verifying State
          <div className="animate-fade-in">
            <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8">
              <Icon icon="lucide:loader-2" className="text-emerald-600 text-5xl animate-spin" />
            </div>
            <h1 className="text-2xl font-display font-bold text-slate-900 mb-3">
              Verifying your email...
            </h1>
            <p className="text-slate-500">Please wait while we verify your account.</p>
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

            {/* Verification Code Input */}
            <div className="mb-6">
              <p className="text-sm text-slate-600 mb-4">
                Enter the 6-digit code from your email:
              </p>
              <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
                {verificationCode.map((digit, index) => (
                  <input
                    key={index}
                    id={`code-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-slate-200 rounded-lg focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                  />
                ))}
              </div>

              {verificationError && (
                <p className="text-sm text-rose-500 mb-4 flex items-center justify-center gap-2">
                  <Icon icon="lucide:alert-circle" />
                  {verificationError}
                </p>
              )}

              <Button
                onClick={handleCodeVerification}
                disabled={verificationCode.some((d) => !d)}
                className="w-full py-3"
              >
                Verify Email
              </Button>
            </div>

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
                    disabled={isResending || cooldown > 0}
                    className="font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon icon="lucide:loader-2" className="animate-spin" />
                        {t('verification.sending')}
                      </span>
                    ) : cooldown > 0 ? (
                      `Resend in ${formatCooldown(cooldown)}`
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
