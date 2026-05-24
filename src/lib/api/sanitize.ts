// SEC-3 / SEC-4 / SEC-10: server-side input hardening for circulars schemas.
//
// These helpers are used inside the Zod schemas via `.transform()` so the
// hardening happens at the validation boundary — the client is never trusted.

import sanitizeHtml from 'sanitize-html'

// SEC-4: strip ALL HTML from a plain-text field. The circulars text columns
// (`description`, `title`, `notes`, workflow step `label`/`action_label`,
// checklist `text`, article `title`/`description`) are plain text, never rich
// HTML — so the allow-list is empty: zero tags, zero attributes. An injected
// `<img src=x onerror=...>` is reduced to harmless text; punctuation, Arabic,
// ampersands and other normal characters survive unharmed.
const STRIP_ALL: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // Drop the *content* of these tags entirely rather than leaving the inner
  // text behind (e.g. `<script>alert(1)</script>` → '' not 'alert(1)').
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
}

// SEC-4: sanitize-html re-escapes the surviving text (`&` → `&amp;`, `<` →
// `&lt;`). For a PLAIN-TEXT column we want the literal characters back, so we
// decode the small set of entities sanitize-html emits. This keeps `R&D`,
// `<3` and quotes intact while the tag-stripping above still removes all
// markup. Done as a fixed table (not a generic HTML decoder) so it can never
// re-introduce a tag.
const ENTITY_DECODE: [RegExp, string][] = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&#x2F;/g, '/'],
  [/&amp;/g, '&'], // must run last so `&amp;lt;` → `&lt;` not `<`
]

function decodeEntities(s: string): string {
  let out = s
  for (const [re, ch] of ENTITY_DECODE) out = out.replace(re, ch)
  return out
}

/**
 * SEC-4: strip every HTML tag / event handler from a plain-text value.
 *
 * Runs in three passes so an attacker can't smuggle markup past the stripper
 * by HTML-entity-encoding it:
 *   1. decode entities  — `&lt;script&gt;` becomes a real `<script>` tag
 *   2. strip all tags   — sanitize-html removes every tag + handler
 *   3. decode again     — undo sanitize-html's re-escaping of surviving text
 *                          so `R&D`, `<3`, quotes survive as literal chars
 * Normal text (ampersands, Arabic, punctuation) is preserved exactly.
 */
export function stripHtml(value: string): string {
  const decoded = decodeEntities(value)
  const stripped = sanitizeHtml(decoded, STRIP_ALL)
  return decodeEntities(stripped)
}

// SEC-3: only `http:` and `https:` URL schemes are permitted in URL-shaped
// fields. `javascript:`, `data:`, `vbscript:`, `file:` etc. are rejected.
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * SEC-3: returns true when `value` is a well-formed absolute URL whose scheme
 * is http or https. Used by the Zod `.refine()` on `reference_url` and any
 * other URL field. Empty values are NOT validated here — callers gate that
 * with `.nullable()` / `.optional()` so clearing the field still works.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return ALLOWED_URL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

// SEC-10: ASCII control characters (NUL through US, plus DEL). Built from a
// string-literal regex source so this source file holds no literal control
// bytes — important because some editors / formatters silently strip them.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

// SEC-10 / W17-V3: characters that LOOK like a path separator to a user or a
// downstream filesystem but aren't ASCII `/` or `\`:
//   - U+FF0F FULLWIDTH SOLIDUS               ／
//   - U+FF3C FULLWIDTH REVERSE SOLIDUS       ＼
//   - U+2044 FRACTION SLASH                  ⁄
//   - U+2215 DIVISION SLASH                  ∕
// Each one collapses to ASCII `/` so the basename split picks off the tail.
const HOMOGLYPH_SEPARATORS = new RegExp('[\\uFF0F\\uFF3C\\u2044\\u2215]', 'g')

// SEC-10 / W17-V3: dot homoglyphs / dot-leader characters that an attacker
// could use to smuggle a `../`-style traversal past a naïve ASCII-`.`-only
// check. We normalize each to ASCII `.` BEFORE the `..` collapse:
//   - U+FF0E FULLWIDTH FULL STOP             ．
//   - U+2024 ONE DOT LEADER                  ․
//   - U+2025 TWO DOT LEADER                  ‥
//   - U+2026 HORIZONTAL ELLIPSIS             …
//   - U+3002 IDEOGRAPHIC FULL STOP           。
const DOT_HOMOGLYPHS = new RegExp('[\\uFF0E\\u2024\\u2025\\u2026\\u3002]', 'g')

// Maximum stored basename length. 200 chars leaves headroom for a generated
// suffix (`-1234567890.bin`) downstream and stays well under the common 255-
// char filename cap on ext4 / NTFS.
const MAX_BASENAME_LEN = 200

// Sentinel returned when sanitization leaves nothing usable. Per spec the
// function must never return an empty string, so attempts to upload `"   "`
// or `"...."` still land on a real filename.
const SENTINEL = 'unnamed.bin'

/**
 * SEC-10 / W17-V3: reduce a user-supplied filename to a safe basename.
 *
 * Defence-in-depth, in this exact order — order matters:
 *  1. Strip ALL ASCII control characters (\x00-\x1f, \x7f), NUL included.
 *     Many filesystems and middleware truncate at the first NUL
 *     (`evil\0.pdf` → `evil`), so we delete them before any other step.
 *  2. Normalize separator homoglyphs (FULLWIDTH SOLIDUS, FRACTION SLASH, …)
 *     to ASCII `/` so a Unicode `．．／` traversal can't sneak through.
 *  3. Normalize dot homoglyphs (FULLWIDTH FULL STOP, dot-leaders, ellipsis,
 *     IDEOGRAPHIC FULL STOP) to ASCII `.` for the same reason.
 *  4. Take the LAST segment after any `/` or `\` separator. This collapses
 *     any directory prefix — `../../../etc/passwd.pdf` becomes `passwd.pdf`.
 *  5. Collapse runs of two-or-more dots to a single dot so a path that
 *     survived the split (e.g. `..pdf`) loses its traversal marker.
 *  6. Re-strip control chars (belt + braces in case an earlier step
 *     re-introduced one — currently impossible, but cheap insurance).
 *  7. Strip leading dots so an attacker can't write a hidden dotfile
 *     (`.htaccess`, `.env`).
 *  8. `.trim()` whitespace.
 *  9. Truncate to MAX_BASENAME_LEN, preserving the LAST extension when
 *     it looks like a real one (≤16 chars including the dot).
 * 10. Fall back to SENTINEL when nothing usable remains.
 *
 * Explicit non-policy: this function does NOT URL-decode its input. A literal
 * `%2e%2e%2fpasswd.pdf` is stored AS `%2e%2e%2fpasswd.pdf` — the percent
 * signs are left intact. Callers that need decoding must decode BEFORE
 * passing the value here, never after; decoding inside would re-expand
 * encoded traversal sequences that we already sanitized.
 */
export function safeBasename(name: string): string {
  // 1. ASCII control chars (NUL included).
  let s = name.replace(CONTROL_CHARS, '')
  // 2. Separator homoglyphs → `/`.
  s = s.replace(HOMOGLYPH_SEPARATORS, '/')
  // 3. Dot homoglyphs → `.`.
  s = s.replace(DOT_HOMOGLYPHS, '.')
  // 4. Last path segment.
  const last = s.split(/[/\\]/).pop() ?? s
  // 5 + 6 + 7 + 8.
  let cleaned = last
    .replace(/\.\.+/g, '.')
    .replace(CONTROL_CHARS, '')
    .replace(/^\.+/, '')
    .trim()

  // 9. Length cap, preserving an extension if there is one.
  if (cleaned.length > MAX_BASENAME_LEN) {
    const dot = cleaned.lastIndexOf('.')
    if (dot > 0 && cleaned.length - dot <= 16) {
      const ext = cleaned.slice(dot)
      cleaned = cleaned.slice(0, MAX_BASENAME_LEN - ext.length) + ext
    } else {
      cleaned = cleaned.slice(0, MAX_BASENAME_LEN)
    }
  }

  // 10. Sentinel fallback.
  return cleaned.length > 0 ? cleaned : SENTINEL
}
