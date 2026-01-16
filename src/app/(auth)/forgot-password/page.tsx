'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email'),
})

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsLoading(false)
    setIsSubmitted(true)
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon icon="lucide:mail-check" className="text-3xl text-emerald-600" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">Check your email</h1>
          <p className="text-slate-500 mb-8">
            We've sent password reset instructions to your email address. Please check your inbox.
          </p>
          <Link href="/sign-in">
            <Button variant="outline" className="w-full">
              <Icon icon="lucide:arrow-left" />
              Back to Sign In
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">Reset Password</h1>
          <p className="text-base text-slate-500">
            Enter your email address and we'll send you instructions to reset your password.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
            <div className="relative">
              <Icon icon="lucide:mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
              <input
                type="email"
                placeholder="you@company.com"
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="mt-1.5 text-xs text-rose-500">{errors.email.message}</p>}
          </div>

          <Button type="submit" disabled={isLoading} className="w-full py-3.5 text-base">
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                Send Reset Instructions
                <Icon icon="lucide:arrow-right" />
              </>
            )}
          </Button>

          <div className="text-center pt-4">
            <Link href="/sign-in" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-2">
              <Icon icon="lucide:arrow-left" />
              Back to Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
