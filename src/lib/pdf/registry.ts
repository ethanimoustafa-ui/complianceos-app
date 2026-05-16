// Font registration for @react-pdf/renderer.
//
// Called once at module load. Registering twice is harmless — @react-pdf
// dedupes by (family, weight, style). Each register call is guarded so a
// missing TTF doesn't crash the worker; we log and continue, falling back
// to the renderer's bundled Helvetica (which lacks Arabic glyphs — see
// public/fonts/README.md).

import path from 'node:path'
import { existsSync } from 'node:fs'
import { Font } from '@react-pdf/renderer'

let registered = false

interface Face {
  family: string
  file: string
  fontWeight?: number | 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
}

const FACES: Face[] = [
  // Latin — Inter (using 18pt optical size for body text rendering)
  { family: 'Inter', file: 'static-inter/Inter_18pt-Regular.ttf', fontWeight: 400 },
  { family: 'Inter', file: 'static-inter/Inter_18pt-Medium.ttf',  fontWeight: 500 },
  { family: 'Inter', file: 'static-inter/Inter_18pt-Bold.ttf',    fontWeight: 700 },
  // Arabic — Amiri (Regular + Bold + their italic variants)
  { family: 'Amiri', file: 'static-amiri/Amiri-Regular.ttf',    fontWeight: 400 },
  { family: 'Amiri', file: 'static-amiri/Amiri-Bold.ttf',       fontWeight: 700 },
  { family: 'Amiri', file: 'static-amiri/Amiri-Italic.ttf',     fontWeight: 400, fontStyle: 'italic' },
  { family: 'Amiri', file: 'static-amiri/Amiri-BoldItalic.ttf', fontWeight: 700, fontStyle: 'italic' },
]

/**
 * Register all known font faces, exactly once per process.
 * Safe to call from any entry-point — subsequent calls no-op.
 */
export function ensureFontsRegistered(): void {
  if (registered) return
  registered = true

  // process.cwd() is the project root when Vercel Functions execute.
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')

  for (const f of FACES) {
    const full = path.join(fontsDir, f.file)
    if (!existsSync(full)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pdf/registry] Missing font: ${f.file} — see public/fonts/README.md. ` +
          `Falling back to bundled font for family "${f.family}".`,
      )
      continue
    }
    try {
      Font.register({
        family: f.family,
        src: full,
        fontWeight: f.fontWeight,
        fontStyle: f.fontStyle,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[pdf/registry] Failed to register ${f.file}:`, err)
    }
  }

  // Disable hyphenation across the board — Arabic does not hyphenate and we
  // want predictable line-breaking for SAMA letters.
  try {
    Font.registerHyphenationCallback((word) => [word])
  } catch {
    /* noop */
  }
}
