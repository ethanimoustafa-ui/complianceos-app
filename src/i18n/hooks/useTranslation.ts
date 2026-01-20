'use client'

import { useLanguageStore, type Language } from '@/stores/language-store'
import en from '../dictionaries/en.json'
import ar from '../dictionaries/ar.json'

type Dictionary = typeof en

const dictionaries: Record<Language, Dictionary> = {
  en,
  ar,
}

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`
}[keyof ObjectType & (string | number)]

type TranslationKey = NestedKeyOf<Dictionary>

type InterpolationParams = Record<string, string | number>

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.')
  let current: unknown = obj

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return path // Return the key itself if not found
    }
  }

  return typeof current === 'string' ? current : path
}

function interpolate(text: string, params?: InterpolationParams): string {
  if (!params) return text

  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key]?.toString() ?? `{{${key}}}`
  })
}

export function useTranslation() {
  const { language, direction, setLanguage, toggleLanguage } = useLanguageStore()

  const dictionary = dictionaries[language]
  const isRTL = direction === 'rtl'

  const t = (key: TranslationKey, params?: InterpolationParams): string => {
    const value = getNestedValue(dictionary as Record<string, unknown>, key)
    return interpolate(value, params)
  }

  return {
    t,
    language,
    direction,
    isRTL,
    setLanguage,
    toggleLanguage,
  }
}

export type { TranslationKey, InterpolationParams }
