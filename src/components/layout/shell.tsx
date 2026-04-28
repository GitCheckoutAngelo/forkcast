"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { logout } from "@/app/actions"
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

const navItems = [
  { href: "/", label: "Home" },
  { href: "/recipes", label: "Recipes" },
  { href: "/food-items", label: "Food Items" },
  { href: "/plans", label: "Plans" },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then((result) => {
      setUserEmail(result.data.user?.email ?? null)
    })
  }, [])

  const isAuthPage = pathname?.startsWith("/login") || pathname?.startsWith("/signup")

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-semibold tracking-tight text-foreground font-heading sm:text-2xl">
              Forkcast
            </Link>
            <nav className="hidden items-center gap-3 md:flex">
              {navItems.map((item) => {
                const active = item.href === "/" ? pathname === item.href : pathname?.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground/70 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <p className="text-sm text-foreground/70">{userEmail ?? "Signed in"}</p>
            <form action={logout}>
              <Button type="submit" size="sm" variant="outline">
                Logout
              </Button>
            </form>
          </div>

          <div className="md:hidden">
            <Sheet>
              <SheetTrigger className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
                  <p className="text-sm text-foreground/70">Plan your meals, hit your macros.</p>
                </SheetHeader>
                <div className="space-y-3 px-4">
                  {navItems.map((item) => {
                    const active = item.href === "/" ? pathname === item.href : pathname?.startsWith(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-3xl px-4 py-4 text-base font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/80 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
                <Separator className="my-4" />
                <div className="space-y-3 px-4">
                  <div className="rounded-3xl border border-border bg-card px-4 py-4">
                    <p className="text-sm text-foreground/70">Signed in as</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{userEmail ?? "Loading..."}</p>
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
