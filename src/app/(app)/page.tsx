import { getCurrentUser } from '@/lib/auth/current-user'

export default async function Home() {
  const user = await getCurrentUser()

  if (!user) {
    return <div>Not authenticated</div>
  }

  return (
    <div>
      <div className="mx-auto flex max-w-4xl flex-col gap-10 rounded-4xl border border-border bg-card p-8 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-4 text-4xl font-heading tracking-tight text-foreground sm:text-5xl">
            Meals, macros, and planning in one calm workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
            You’re signed in as <span className="font-semibold text-foreground">{user.email}</span>. Start by exploring recipes, food items, or plans from the navigation above.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background p-6">
            <p className="text-sm font-medium text-muted-foreground">Today</p>
            <p className="mt-3 text-lg font-semibold text-foreground">A lighter, more intentional way to plan.</p>
          </div>
          <div className="rounded-3xl border border-border bg-background p-6">
            <p className="text-sm font-medium text-muted-foreground">Next step</p>
            <p className="mt-3 text-lg font-semibold text-foreground">Check your recipes, food items, and weekly plans.</p>
          </div>
        </div>

      </div>
    </div>
  )
}
