import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Auth-aware entry point. Signed-in users land on the dashboard; everyone else
// is sent to the sign-in page. This is defense-in-depth alongside middleware —
// the root route must never funnel an unauthenticated visitor to the dashboard.
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  redirect(user ? '/dashboard' : '/sign-in')
}
