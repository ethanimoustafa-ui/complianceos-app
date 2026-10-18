'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { hasRole } from '@/lib/rbac/permissions'

// Officers only get the Training sub-page of the Team section — the
// directory (member roster, pending approvals, burnout) and user logs are
// manager/admin views. Call at the top of a guarded page and render nothing
// while it returns false; officers are replaced to /team/training.
export function useTeamSectionGuard(): boolean {
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const allowed = hasRole(user, 'manager')
  useEffect(() => {
    if (user && !allowed) router.replace('/team/training')
  }, [user, allowed, router])
  return allowed
}
