/**
 * Build a DiceBear avataaars SVG URL for a given seed.
 *
 * Centralizes the `https://api.dicebear.com/7.x/avataaars/svg?seed=...` URL
 * pattern that was previously inlined across 25+ surfaces (team directory,
 * observations, audits, settings, etc.).
 *
 * @param seed Any string used to deterministically generate the avatar.
 *   Falsy values fall back to "default" so the URL is always valid.
 */
export function dicebearAvatar(seed: string | null | undefined): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed || 'default'}`
}
