import { createClient } from '@/lib/supabase/server'
import { logout } from './actions'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <div>Not authenticated</div>
  }

  return (
    <div className="min-h-[calc(100vh-6rem)]">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl flex-col justify-center gap-10 rounded-[2rem] border border-border bg-card/95 p-8 shadow-sm shadow-slate-200/50">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-4 text-4xl font-heading tracking-tight text-foreground sm:text-5xl">
            Meals, macros, and planning in one calm workspace.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-foreground/75">
            You’re signed in as <span className="font-semibold text-foreground">{user.email}</span>. Start by exploring recipes, food items, or plans from the navigation above.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background/80 p-6">
            <p className="text-sm font-medium text-muted-foreground">Today</p>
            <p className="mt-3 text-lg font-semibold text-foreground">A lighter, more intentional way to plan.</p>
          </div>
          <div className="rounded-3xl border border-border bg-background/80 p-6">
            <p className="text-sm font-medium text-muted-foreground">Next step</p>
            <p className="mt-3 text-lg font-semibold text-foreground">Check your recipes, food items, and weekly plans.</p>
          </div>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  )
}
