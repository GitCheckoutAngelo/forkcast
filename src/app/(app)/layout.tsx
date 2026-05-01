import { getCurrentUser } from "@/lib/auth/current-user"
import { createClient } from "@/lib/supabase/server"
import Shell from "@/components/layout/shell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  let displayName: string | null = null
  if (user) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    displayName = data?.display_name ?? null
  }

  return (
    <Shell userEmail={user?.email ?? null} userDisplayName={displayName}>
      {children}
    </Shell>
  )
}
