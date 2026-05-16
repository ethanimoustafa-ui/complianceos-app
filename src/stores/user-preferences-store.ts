// User preferences store — Phase 5 review.
//
// **KEPT PERSISTED (client-only) for MVP.** Per-user preferences (dashboard
// view, timezone, date format, notification module/event/scope toggles, email
// digest, Slack) live in localStorage because no `/api/team/me/preferences`
// (nor equivalent column on `profiles`) endpoint exists yet. `/api/team/me`
// only exposes `preferred_language` and never a richer preference bag.
//
// This is acceptable for MVP because preferences are non-critical and
// re-derivable: a fresh device just renders the documented defaults. When the
// backend grows a `profiles.preferences` JSONB column (or a dedicated
// `/api/settings/me/preferences` endpoint), this store should migrate to the
// canonical server-state pattern from `.planning/09-store-pattern.md`.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DashboardView, DateFormatPreference, NotificationModule, NotificationEvent, NotificationScope, NotificationPreferences } from '@/types'

const defaultNotificationPreferences: NotificationPreferences = {
  modules: {
    rules: true,
    policies: true,
    audits: true,
    observations: true,
    samaLetters: true,
    training: true,
  },
  events: {
    dueDates: true,
    criticalAlerts: true,
    approvalRequests: true,
    overdueItems: true,
    statusChanges: true,
  },
  scope: 'own',
  emailDigestEnabled: false,
  emailDigestAddress: '',
  slackEnabled: false,
}

interface UserPreferencesState {
  dashboardView: DashboardView
  timezone: string
  dateFormat: DateFormatPreference
  notificationPreferences: NotificationPreferences

  setDashboardView: (view: DashboardView) => void
  setTimezone: (tz: string) => void
  setDateFormat: (format: DateFormatPreference) => void
  toggleModuleNotification: (module: NotificationModule) => void
  toggleEventNotification: (event: NotificationEvent) => void
  setNotificationScope: (scope: NotificationScope) => void
  setEmailDigest: (enabled: boolean) => void
  setEmailDigestAddress: (address: string) => void
  setSlackEnabled: (enabled: boolean) => void
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      dashboardView: 'executive',
      timezone: 'Asia/Riyadh',
      dateFormat: 'DD/MM/YYYY',
      notificationPreferences: defaultNotificationPreferences,

      setDashboardView: (view) => set({ dashboardView: view }),
      setTimezone: (tz) => set({ timezone: tz }),
      setDateFormat: (format) => set({ dateFormat: format }),

      toggleModuleNotification: (module) =>
        set((s) => ({
          notificationPreferences: {
            ...s.notificationPreferences,
            modules: {
              ...s.notificationPreferences.modules,
              [module]: !s.notificationPreferences.modules[module],
            },
          },
        })),

      toggleEventNotification: (event) =>
        set((s) => ({
          notificationPreferences: {
            ...s.notificationPreferences,
            events: {
              ...s.notificationPreferences.events,
              [event]: !s.notificationPreferences.events[event],
            },
          },
        })),

      setNotificationScope: (scope) =>
        set((s) => ({
          notificationPreferences: { ...s.notificationPreferences, scope },
        })),

      setEmailDigest: (enabled) =>
        set((s) => ({
          notificationPreferences: { ...s.notificationPreferences, emailDigestEnabled: enabled },
        })),

      setEmailDigestAddress: (address) =>
        set((s) => ({
          notificationPreferences: { ...s.notificationPreferences, emailDigestAddress: address },
        })),

      setSlackEnabled: (enabled) =>
        set((s) => ({
          notificationPreferences: { ...s.notificationPreferences, slackEnabled: enabled },
        })),
    }),
    {
      name: 'user-preferences-storage',
      version: 2,
      partialize: (state) => ({
        dashboardView: state.dashboardView,
        timezone: state.timezone,
        dateFormat: state.dateFormat,
        notificationPreferences: state.notificationPreferences,
      }),
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return {
            dashboardView: persisted.dashboardView ?? 'executive',
            timezone: persisted.timezone ?? 'Asia/Riyadh',
            dateFormat: persisted.dateFormat ?? 'DD/MM/YYYY',
            notificationPreferences: {
              ...defaultNotificationPreferences,
              emailDigestEnabled: persisted.emailDigestEnabled ?? false,
              emailDigestAddress: persisted.emailDigestAddress ?? '',
              slackEnabled: persisted.slackEnabled ?? false,
            },
          }
        }
        return persisted as any
      },
    }
  )
)
