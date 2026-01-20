'use client'

import { useEffect, useState } from 'react'
import { useLanguageStore } from '@/stores/language-store'

interface LanguageProviderProps {
  children: React.ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { language, direction } = useLanguageStore()
  const [isHydrated, setIsHydrated] = useState(false)

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Update HTML attributes when language changes
  useEffect(() => {
    if (isHydrated) {
      document.documentElement.lang = language
      document.documentElement.dir = direction

      // Add/remove RTL class for CSS styling
      if (direction === 'rtl') {
        document.documentElement.classList.add('rtl')
      } else {
        document.documentElement.classList.remove('rtl')
      }
    }
  }, [language, direction, isHydrated])

  return <>{children}</>
}
