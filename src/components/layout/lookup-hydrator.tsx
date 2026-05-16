'use client'

// Lookup hydrator — mounted once at the dashboard layout so every modal,
// dropdown and selector across the app has reference data available on first
// open. Without this, modals that consume Zustand lookup stores (departments,
// team members, framework configs, calendar event types, letter sub-categories,
// audit/observation/policy/risk/training categories, business units, etc.)
// render "No options" because the page that owns the consumer might not have
// triggered the store's `fetchAll` yet.
//
// This is a no-op for users who never open a modal — fetchAll is cheap because
// the API responses are `Cache-Control: s-maxage=...` cached by Next.
//
// Add new lookup stores here as they're introduced.

import { useEffect } from 'react'
import { useDepartmentStore } from '@/stores/department-store'
import { useTeamStore } from '@/stores/team-store'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useCalendarEventTypeStore } from '@/stores/calendar-event-type-store'

export function LookupHydrator() {
  useEffect(() => {
    void useDepartmentStore.getState().fetchAll().catch(() => {})
    void useTeamStore.getState().fetchAll().catch(() => {})
    void useFrameworkConfigStore.getState().fetch().catch(() => {})
    void useCalendarEventTypeStore.getState().fetchAll().catch(() => {})
  }, [])
  return null
}
