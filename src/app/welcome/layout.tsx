'use client'

import { useTranslation } from '@/i18n'

export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isRTL } = useTranslation()

  return (
    <div className="min-h-screen bg-[#010409]" dir={isRTL ? 'rtl' : 'ltr'}>
      {children}
    </div>
  )
}
