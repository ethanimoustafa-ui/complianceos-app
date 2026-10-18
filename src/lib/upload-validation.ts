// Shared client-side file-upload validation.
//
// Centralizes the size/type checks that every upload surface needs (avatars,
// group photos, attachments) so a rejected file ALWAYS produces a clear,
// localized, non-blaming message instead of a silent failure or a raw Storage
// error. Returns a `{ key, params }` translation spec (a `ToastMessage`) which
// the caller surfaces either as an inline error (`t(err.key, err.params)`) or a
// toast (`pushToast(err, 'error')`).
//
// Copy follows the product UX-writing rules: states what happened AND how to fix
// it, no jargon, no blame.

import { formatBytes } from '@/lib/format/bytes'
import type { ToastMessage } from '@/stores/toast-store'

/**
 * Image upload limits. These MIRROR the Storage `avatars` bucket configured in
 * migration 113 (public, 5 MB, png/jpeg/webp). Keep client + server in sync —
 * the client check exists to give a friendly message BEFORE the bytes leave the
 * browser; the bucket is still the source of truth.
 */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
/** Human label of the allowed image formats, interpolated into the error copy. */
export const IMAGE_ALLOWED_LABEL = 'PNG, JPG, or WebP'

export interface FileValidationRule {
  /** Max byte size; omit for no size cap. */
  maxBytes?: number
  /** Allowed MIME types; omit to accept any type. */
  allowedTypes?: readonly string[]
  /** Human label of allowed types for the error copy (e.g. "PNG, JPG, or WebP"). */
  allowedLabel?: string
}

/** Ready-made rule for avatar / group-photo image uploads. */
export const IMAGE_UPLOAD_RULE: FileValidationRule = {
  maxBytes: IMAGE_MAX_BYTES,
  allowedTypes: IMAGE_ALLOWED_TYPES,
  allowedLabel: IMAGE_ALLOWED_LABEL,
}

/**
 * Validate a single {@link File} against size/type rules. Returns a
 * `ToastMessage` ({ key, params } translation spec) describing what's wrong and
 * how to fix it when the file is rejected, or `null` when it passes.
 *
 * Type is checked before size so the message points at the most fundamental
 * problem first (a 20 MB PDF reports "unsupported type", not "too large").
 */
export function validateFile(file: File, rule: FileValidationRule): ToastMessage | null {
  const { maxBytes, allowedTypes, allowedLabel } = rule

  if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      key: 'upload.wrongType',
      params: { types: allowedLabel ?? allowedTypes.join(', ') },
    }
  }

  if (maxBytes != null && file.size > maxBytes) {
    return {
      key: 'upload.tooLarge',
      params: { max: formatBytes(maxBytes, 0) },
    }
  }

  return null
}
