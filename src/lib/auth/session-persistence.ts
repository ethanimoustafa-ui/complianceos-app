// "Remember me" for the cookie-backed Supabase session.
//
// @supabase/ssr stores the auth session in cookies with a fixed ~400-day
// max-age (it overrides any custom maxAge on write), so we cannot downgrade the
// auth cookie to a true browser-session cookie. Instead we EMULATE "forget me on
// browser close": when a user signs in WITHOUT "remember me", we mark the
// session as ephemeral and sign them out the next time the app COLD-STARTS
// (browser fully closed, then reopened).
//
// Telling a genuine cold start apart from "user just opened a second tab" is the
// tricky bit: sessionStorage is per-tab, so a fresh tab looks like a cold start.
// We disambiguate with a short heartbeat written to localStorage by every live
// tab — if the heartbeat is still fresh when a new tab loads, another tab is
// alive and we ADOPT the session instead of expiring it.
//
// Default / "remember me" ON  → mode 'persistent' (or unset): never expires
// (this is the historical behavior, so existing sessions are unaffected).
// "remember me" OFF           → mode 'session': expires on the next cold start.
//
// This file deliberately touches NONE of the Supabase cookie/SSR plumbing, so it
// can't regress the auth flow — it only decides whether to call signOut() once,
// at app load.

const MODE_KEY = 'auth-persistence-mode' // 'persistent' | 'session'
const HEARTBEAT_KEY = 'auth-heartbeat' // last-seen epoch ms, written by any live tab
const TAB_KEY = 'auth-tab-alive' // sessionStorage sentinel (this tab participated)

const STALE_MS = 10_000 // heartbeat older than this ⇒ no live tab ⇒ cold start
const BEAT_MS = 4_000 // heartbeat write interval

let heartbeat: ReturnType<typeof setInterval> | undefined

function writeHeartbeat() {
  try {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()))
  } catch {
    /* storage disabled — ignore */
  }
}

function startHeartbeat() {
  if (typeof window === 'undefined' || heartbeat) return
  writeHeartbeat()
  // Only LIVE tabs keep the heartbeat fresh, via this interval. We deliberately
  // do NOT stamp on pagehide: a final stamp on close can't be distinguished from
  // a genuine full-browser close, which would let an ephemeral session survive a
  // quick reopen. Other still-open tabs' intervals already cover the multi-tab
  // "reopened a closed tab" case.
  heartbeat = setInterval(writeHeartbeat, BEAT_MS)
}

function stopHeartbeat() {
  if (heartbeat) {
    clearInterval(heartbeat)
    heartbeat = undefined
  }
}

/**
 * Record the user's "remember me" choice at sign-in time. Call AFTER a
 * successful sign-in, before navigating away.
 */
export function setSessionPersistence(remember: boolean): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(TAB_KEY, '1')
    if (remember) {
      localStorage.setItem(MODE_KEY, 'persistent')
      localStorage.removeItem(HEARTBEAT_KEY)
      stopHeartbeat()
    } else {
      localStorage.setItem(MODE_KEY, 'session')
      startHeartbeat()
    }
  } catch {
    /* storage disabled — ignore */
  }
}

/**
 * Called once at app load (before restoring the session). Returns
 * `{ expire: true }` when an ephemeral session is being resumed on a cold start
 * and should therefore be terminated. Otherwise marks this tab alive and (for
 * ephemeral sessions) starts the heartbeat.
 */
export function initSessionPersistence(): { expire: boolean } {
  if (typeof window === 'undefined') return { expire: false }
  try {
    const mode = localStorage.getItem(MODE_KEY)
    if (mode !== 'session') {
      // Persistent or never-set → mark this tab alive, never expire.
      sessionStorage.setItem(TAB_KEY, '1')
      return { expire: false }
    }
    // Ephemeral mode.
    const tabParticipated = sessionStorage.getItem(TAB_KEY) === '1'
    const last = Number(localStorage.getItem(HEARTBEAT_KEY) ?? 0)
    const anotherTabAlive = Date.now() - last < STALE_MS
    if (!tabParticipated && !anotherTabAlive) {
      return { expire: true } // cold start of an ephemeral session
    }
    // Same tab, or another tab is alive → adopt and keep the heartbeat going.
    sessionStorage.setItem(TAB_KEY, '1')
    startHeartbeat()
    return { expire: false }
  } catch {
    return { expire: false }
  }
}

/** Clear all persistence bookkeeping. Call from signOut(). */
export function clearSessionPersistence(): void {
  stopHeartbeat()
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(MODE_KEY)
    localStorage.removeItem(HEARTBEAT_KEY)
    sessionStorage.removeItem(TAB_KEY)
  } catch {
    /* storage disabled — ignore */
  }
}
