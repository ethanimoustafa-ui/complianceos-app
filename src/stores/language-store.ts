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
