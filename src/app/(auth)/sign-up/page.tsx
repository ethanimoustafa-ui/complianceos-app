'use client'

// Sign-up is DISABLED for MVP — accounts are provisioned by an org admin
// (see BACKEND-API-MAP.md §13). This page renders a static notice with a
// link back to /sign-in.

import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <Icon icon="lucide:user-plus" className="text-3xl text-emerald-600" />
        </div>
        <h1 className="text-3xl font-display font-bold text-slate-900 mb-3">
          Sign-up is admin-only
        </h1>
        <p className="text-base text-slate-500 mb-8">
          ComplianceOS accounts are provisioned by your organisation&apos;s
          compliance admin. Contact your admin to be invited.
        </p>
        <Link href="/sign-in">
          <Button variant="outline" className="w-full">
            <Icon icon="lucide:arrow-left" />
            Back to sign-in
          </Button>
        </Link>
      </div>
    </div>
  )
}
