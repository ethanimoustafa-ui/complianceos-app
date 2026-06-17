// User-activity metadata helpers.
//
// The `user_activity_logs` table stores a free-form `metadata` jsonb blob. Auth
// events were previously written with `metadata: {}`, so the "User Logs" table
// had nothing to show in its Device / Location columns. These helpers:
//
//   1. `collectClientActivityContext()` — captured at WRITE time (sign-in /
//      sign-out / permission-denied) from the browser so each row carries the
//      user agent, platform, language and IANA timezone.
//   2. `deviceFromMetadata()` / `locationFromMetadata()` — used at READ time to
//      turn that blob into the human "Chrome on Windows" / "Asia/Riyadh"
//      strings the table renders.
//
// Everything degrades gracefully: server-side (no `navigator`) the collector
// returns `{}`, and historical rows with an empty blob render an em-dash.

export interface ClientActivityContext {
  userAgent?: string
  platform?: string
  language?: string
  timezone?: string
  screen?: string
}

/** UUID v4-ish detector — used to spot rows whose `user_name` is a raw id. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value.trim())
}

/**
 * Snapshot the current browser context for an activity-log row. Returns `{}`
 * when called outside the browser (SSR / route handlers) so callers can spread
 * it unconditionally into the `metadata` column (which is NOT NULL DEFAULT
 * '{}'::jsonb — never send null).
 */
export function collectClientActivityContext(): ClientActivityContext {
  if (typeof navigator === 'undefined') return {}
  const ctx: ClientActivityContext = {}
  try {
    if (navigator.userAgent) ctx.userAgent = navigator.userAgent
    // `platform` is deprecated but still the most reliable cross-browser hint.
    const platform = (navigator as Navigator & { platform?: string }).platform
    if (platform) ctx.platform = platform
    if (navigator.language) ctx.language = navigator.language
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) ctx.timezone = tz
    if (typeof window !== 'undefined' && window.screen) {
      ctx.screen = `${window.screen.width}x${window.screen.height}`
    }
  } catch {
    // Best-effort — a hardened browser may throw on some probes.
  }
  return ctx
}

function asRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null
}

/**
 * Derive a readable "Browser on OS" label from a stored metadata blob's
 * `userAgent`. Returns '' when there's nothing usable so the table can fall
 * back to an em-dash.
 */
export function deviceFromMetadata(metadata: unknown): string {
  const m = asRecord(metadata)
  if (!m) return ''
  // Some rows carry an explicit `device` string already.
  if (typeof m.device === 'string' && m.device) return m.device
  const ua = typeof m.userAgent === 'string' ? m.userAgent : ''
  const platform = typeof m.platform === 'string' ? m.platform : ''
  return describeUserAgent(ua, platform)
}

/** Derive a location label (IANA timezone) from a stored metadata blob. */
export function locationFromMetadata(metadata: unknown): string {
  const m = asRecord(metadata)
  if (!m) return ''
  if (typeof m.location === 'string' && m.location) return m.location
  if (typeof m.timezone === 'string' && m.timezone) {
    // "Asia/Riyadh" → "Riyadh, Asia" reads more like a place than a tz id.
    const parts = m.timezone.split('/')
    if (parts.length === 2) return `${parts[1].replace(/_/g, ' ')}, ${parts[0]}`
    return m.timezone
  }
  return ''
}

/** Minimal UA → "Chrome on Windows" parser. Intentionally dependency-free. */
export function describeUserAgent(ua: string, platform = ''): string {
  if (!ua) return ''
  const browser =
    /Edg\//.test(ua) ? 'Edge'
      : /OPR\/|Opera/.test(ua) ? 'Opera'
        : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
          : /Firefox\//.test(ua) ? 'Firefox'
            : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
              : ''
  const os =
    /Windows NT 11|Windows NT 10/.test(ua) ? 'Windows'
      : /Windows/.test(ua) ? 'Windows'
        : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
          : /Android/.test(ua) ? 'Android'
            : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
              : /Linux/.test(ua) ? 'Linux'
                : platform || ''
  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return os
  return platform || ''
}
