// Language store — Phase 5 review.
//
// **KEPT PERSISTED (client-only) by design.** This is pure UI state for the
// active locale and writing direction; routing and Server Component layouts
// don't currently look it up from the database. The `profiles` table holds
// `preferred_language` but it's authoritative only for initial render via
// `/api/team/me`, not for per-tab toggling. If a future phase requires
// language preference to follow the user across devices, the toggle should
// also call `/api/team/me` (PATCH) and reconcile.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'en' | 'ar'
export type Direction = 'ltr' | 'rtl'

interface LanguageState {
  language: Language
  direction: Direction
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
}

const getDirection = (lang: Language): Direction => (lang === 'ar' ? 'rtl' : 'ltr')

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',
      direction: 'ltr',
      setLanguage: (language) =>
        set({
          language,
          direction: getDirection(language),
        }),
      toggleLanguage: () =>
        set((state) => {
          const newLanguage: Language = state.language === 'en' ? 'ar' : 'en'
          return {
            language: newLanguage,
            direction: getDirection(newLanguage),
          }
        }),
    }),
    { name: 'language-storage' }
  )
)
