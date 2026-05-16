// Legacy URL redirect. The module was once mounted at `/sama-letters`; it now
// lives at `/correspondence/letters`. Kept for backward-compat bookmarks.
import { redirect } from 'next/navigation'

export default function LegacySamaLettersRedirect() {
  redirect('/correspondence/letters')
}
