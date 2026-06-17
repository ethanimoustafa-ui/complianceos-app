// Maps Supabase auth errors to user-friendly i18n keys.
//
// Supabase surfaces auth failures as a message string (e.g. "Invalid login
// credentials") and, on newer SDKs, a stable `code` (e.g. "invalid_credentials").
// Both are unsafe to show to end users: they are English-only and read like
// technical jargon. This helper translates them into a `{ key, params }` spec
// that callers resolve with `t()` (inline) or hand to `pushToast()` (toast).
//
// Keep this provider-specific knowledge in ONE place so sign-in, password reset
// and resend flows all surface the same clear copy.

/** A translation spec: an i18n key plus optional interpolation params. */
export interface AuthErrorMessage {
  key: string
  params?: Record<string, string | number>
}

/** Minimal shape we read off a Supabase auth error (code is optional). */
interface SupabaseAuthErrorLike {
  message?: string
  code?: string
  status?: number
}

/**
 * Translate a Supabase auth error (or raw message string) into an i18n spec.
 * Falls back to a generic, non-blaming key when the error is unrecognised.
 */
export function mapAuthError(
  error: SupabaseAuthErrorLike | string | null | undefined,
): AuthErrorMessage {
  if (!error) return { key: 'errors.generic' }

  const code = typeof error === 'string' ? '' : (error.code ?? '').toLowerCase()
  const raw = (typeof error === 'string' ? error : error.message ?? '').toLowerCase()

  const has = (needle: string) => code.includes(needle) || raw.includes(needle)

  // Wrong email/password — by far the most common case.
  if (has('invalid_credentials') || has('invalid login')) {
    return { key: 'errors.authPages.invalidCredentials' }
  }

  // Account exists but the email was never confirmed.
  if (has('email_not_confirmed') || has('email not confirmed')) {
    return { key: 'errors.authPages.emailNotConfirmed' }
  }

  // Too many attempts / rate limited.
  if (has('over_request_rate_limit') || has('rate limit') || has('too many')) {
    return { key: 'errors.authPages.rateLimited' }
  }

  // Reset / confirmation link is expired or already used.
  if (
    has('invalid_grant') ||
    has('token_expired') ||
    has('otp_expired') ||
    has('expired') ||
    has('flow_state_not_found')
  ) {
    return { key: 'errors.authPages.linkExpired' }
  }

  // Offline / transient network failure.
  if (
    has('failed to fetch') ||
    has('network') ||
    has('fetch') ||
    has('timeout')
  ) {
    return { key: 'errors.network' }
  }

  // Unknown — generic, non-blaming fallback.
  return { key: 'errors.authPages.signInGeneric' }
}
