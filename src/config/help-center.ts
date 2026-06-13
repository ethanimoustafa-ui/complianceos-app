// ── Help Center content gate ────────────────────────────────────────────────
//
// Flip this to `true` once you've authored real help content. While it's
// `false`, the Help Center (sidebar ❓ button) shows a branded "coming soon"
// panel instead of the placeholder articles.
//
// HOW TO ADD CONTENT + GO LIVE:
//   1. Write your articles in   docs/help-center/articles.md   (see the README
//      there for the format).
//   2. Mirror them into the seeded help store (src/stores/help-store.ts) — each
//      article = { id, title, summary, content, category, icon }.
//   3. Set HELP_CENTER_ENABLED = true and reload.
//
// See docs/help-center/README.md for the full walkthrough.

export const HELP_CENTER_ENABLED = false
