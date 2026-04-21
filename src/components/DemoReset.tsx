'use client'

import { useEffect, useState } from 'react'
import { needsDemoReset, runDemoReset } from '@/lib/demo-reset'

export function DemoReset({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (needsDemoReset()) {
      runDemoReset()
      window.location.reload()
      return
    }
    setReady(true)
  }, [])

  if (!ready) return null
  return <>{children}</>
}
