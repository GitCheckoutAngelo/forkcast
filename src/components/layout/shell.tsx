"use client"

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { logout } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Nav progress bar ─────────────────────────────────────────────────────────
// Shows after a 150ms delay so fast navigations don't flash a bar at all.
// Phases: idle → start (width 0, no transition) → running (width 85%, slow
// ease-out) → done (width 100%, fade out) → idle.

type BarPhase = 'idle' | 'start' | 'running' | 'done'

function NavProgressBar({ isPending }: { isPending: boolean }) {
  const [phase, setPhase] = useState<BarPhase>('idle')
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isPending) {
      delayRef.current = setTimeout(() => setPhase('start'), 150)
      return () => {
        if (delayRef.current) clearTimeout(delayRef.current)
      }
    }
    // Navigation complete — cancel delay if it hasn't fired yet
    if (delayRef.current) { clearTimeout(delayRef.current); delayRef.current = null }
    setPhase((prev) => (prev === 'idle' || prev === 'start') ? 'idle' : 'done')
  }, [isPending])

  // Double rAF: let 'start' commit at w-0, then trigger the width transition.
  useEffect(() => {
    if (phase !== 'start') return
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('running'))
    })
    return () => cancelAnimationFrame(raf)
  }, [phase])

  if (phase === 'idle') return null

  return (
    <div
      aria-hidden
      onTransitionEnd={(e) => {
        if (phase === 'done' && e.propertyName === 'opacity') setPhase('idle')
      }}
      className={cn(
        'pointer-events-none fixed left-0 top-0 z-[100] h-[2px] bg-primary',
        phase === 'start'   && 'w-0',
        phase === 'running' && 'w-[85%] transition-[width] duration-[5s] ease-out',
        phase === 'done'    && 'w-full opacity-0 transition-[width,opacity] duration-150',
      )}
    />
  )
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { href: "/", label: "Home" },
  { href: "/recipes", label: "Recipes" },
  { href: "/food-items", label: "Food Items" },
  { href: "/plans", label: "Plans" },
  { href: "/settings", label: "Settings" },
]

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function Shell({
  children,
  userEmail,
  userDisplayName,
}: {
  children: React.ReactNode
  userEmail: string | null
  userDisplayName: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [intendedPath, setIntendedPath] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Clear intended path once the navigation settles so active state
  // derives from the real pathname again.
  useEffect(() => {
    if (!isPending) setIntendedPath(null)
  }, [isPending])

  function handleNav(href: string) {
    setIntendedPath(href)
    setMobileOpen(false)
    startTransition(() => { router.push(href) })
  }

  // Optimistic active: if navigation is in-flight, highlight the intended route.
  const effectivePath = intendedPath ?? pathname

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavProgressBar isPending={isPending} />

      <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-semibold tracking-tight text-foreground font-heading sm:text-2xl">
              Forkcast
            </Link>
            <nav className="hidden items-center gap-3 md:flex">
              {navItems.map((item) => {
                const active = item.href === "/" ? effectivePath === item.href : effectivePath?.startsWith(item.href)
                return (
                  <button
                    key={item.href}
                    onClick={() => handleNav(item.href)}
                    className={cn(
                      "rounded-full px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <p
              className="text-sm text-muted-foreground"
              title={userEmail ?? undefined}
            >
              Hi, {userDisplayName ?? userEmail?.split('@')[0] ?? 'there'}!
            </p>
            <form action={logout}>
              <Button type="submit" size="sm" variant="outline">
                Logout
              </Button>
            </form>
          </div>

          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger render={<Button size="icon" variant="ghost" />}>
                <Menu className="size-4" />
                <span className="sr-only">Open menu</span>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(90vw,320px)]">
                <SheetHeader>
                  <div className="flex items-center justify-between gap-2">
                    <SheetTitle>Forkcast</SheetTitle>
                    <SheetClose>
                      <X className="size-4" />
                      <span className="sr-only">Close</span>
                    </SheetClose>
                  </div>
                  <p className="text-sm text-muted-foreground">Plan your meals, hit your macros.</p>
                </SheetHeader>
                <div className="space-y-3 px-4">
                  {navItems.map((item) => {
                    const active = item.href === "/" ? effectivePath === item.href : effectivePath?.startsWith(item.href)
                    return (
                      <button
                        key={item.href}
                        onClick={() => handleNav(item.href)}
                        className={cn(
                          "block w-full rounded-3xl px-4 py-4 text-left text-base font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
                <Separator className="my-4" />
                <div className="space-y-3 px-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Hi, {userDisplayName ?? userEmail?.split('@')[0] ?? 'there'}!
                    </p>
                    {userEmail && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{userEmail}</p>
                    )}
                  </div>
                  <form action={logout}>
                    <Button type="submit" size="sm" className="w-full">
                      Logout
                    </Button>
                  </form>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
