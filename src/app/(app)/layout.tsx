import { getCurrentUser } from "@/lib/auth/current-user"
import Shell from "@/components/layout/shell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <Shell userEmail={user?.email ?? null}>
      {children}
    </Shell>
  )
}
