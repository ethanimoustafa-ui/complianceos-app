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

/**
 * GAP-5 — count-aware plural selection. Reusable across every list page
 * (circulars / policies / observations / letters). Given a base key, resolves
 * `<key>_one` vs `<key>_other` by `count` and interpolates `{{count}}`.
 *
 * English: `count === 1` → `_one`, else `_other`.
 * Arabic:  Arabic has 6 CLDR plural categories, but for short "N items found"
 *          UI strings the two-form one/other split reads naturally enough and
 *          keeps the dictionary small. `count === 1` → `_one`, else `_other`.
 *
 * Falls back to the bare key if the `_one`/`_other` variants are missing, so
 * adopting it incrementally never throws.
 */
function pluralize(
  dictionary: Record<string, unknown>,
  baseKey: string,
  count: number,
  params?: InterpolationParams,
): string {
  const form = count === 1 ? 'one' : 'other'
  const variant = getNestedValue(dictionary, `${baseKey}_${form}`)
  const value = variant !== `${baseKey}_${form}` ? variant : getNestedValue(dictionary, baseKey)
  return interpolate(value, { count, ...params })
}

export function useTranslation() {
  const { language, direction, setLanguage, toggleLanguage } = useLanguageStore()

  const dictionary = dictionaries[language]
  const isRTL = direction === 'rtl'

  const t = (key: TranslationKey, params?: InterpolationParams): string => {
    const value = getNestedValue(dictionary as Record<string, unknown>, key)
    return interpolate(value, params)
  }

  // GAP-5: count-aware translation. `tCount('regulatoryUpdates.circularsFound', n)`
  // resolves `circularsFound_one` / `circularsFound_other`.
  const tCount = (baseKey: string, count: number, params?: InterpolationParams): string =>
    pluralize(dictionary as Record<string, unknown>, baseKey, count, params)

  return {
    t,
    tCount,
    language,
    direction,
    isRTL,
    setLanguage,
    toggleLanguage,
  }
}

export type { TranslationKey, InterpolationParams }
