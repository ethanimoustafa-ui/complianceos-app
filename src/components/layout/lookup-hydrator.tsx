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
import { useNotificationStore } from '@/stores/notification-store'
import { useMessageStore } from '@/stores/message-store'

export function LookupHydrator() {
  useEffect(() => {
    void useDepartmentStore.getState().fetchAll().catch(() => {})
    void useTeamStore.getState().fetchAll().catch(() => {})
    void useFrameworkConfigStore.getState().fetch().catch(() => {})
    void useCalendarEventTypeStore.getState().fetchAll().catch(() => {})
    // Hydrate BOTH sidebar unread badges on mount with the cheap count-only
    // endpoints (a COUNT / sum — tiny payload), NOT the full `pageSize=100`
    // lists. The panels fetch their full list on open (their only other reader),
    // so nothing always-visible needs the list here — except the Officer
    // dashboard's "Recent Activity" widget, which fetches its own notifications.
    void useNotificationStore.getState().fetchUnreadCount().catch(() => {})
    void useMessageStore.getState().fetchUnreadCount().catch(() => {})
  }, [])

  // Keep both unread badges fresh without a manual reload. This is the steady-
  // state background load for every open tab, so it's deliberately cheap:
  //   - polls the count-only endpoints (a COUNT / sum, tiny payload) rather than
  //     re-pulling the full `pageSize=100` lists,
  //   - pauses entirely while the tab is hidden (no compute for backgrounded
  //     tabs), and refreshes once the moment the tab becomes visible again,
  //   - runs every 2 min instead of 1.
  // The panels still call their full fetch on open, so opening a panel always
  // shows live data.
  useEffect(() => {
    const refreshBadges = () => {
      void useNotificationStore.getState().fetchUnreadCount().catch(() => {})
      void useMessageStore.getState().fetchUnreadCount().catch(() => {})
    }

    const tick = () => {
      if (document.visibilityState === 'visible') refreshBadges()
    }
    const id = setInterval(tick, 120_000)

    // Catch up immediately when the user returns to a backgrounded tab.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshBadges()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
