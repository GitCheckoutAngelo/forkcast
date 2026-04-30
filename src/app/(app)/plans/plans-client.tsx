'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, ChevronRight, Plus, Utensils } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createMealPlan } from '@/lib/meal-plans/actions'
import type { MealPlanSummary } from '@/lib/meal-plans/queries'

// ── Date helpers ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getValidStartDates(weekStartDay: number, count = 10): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates: Date[] = []
  const d = new Date(today)
  while (d.getDay() !== weekStartDay) d.setDate(d.getDate() + 1)
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return dates
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
  }
  return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

function formatDateLabel(d: Date): string {
  return `${FULL_DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function planDisplayName(plan: MealPlanSummary): string {
  if (plan.name) return plan.name
  const s = new Date(plan.start_date + 'T00:00:00')
  return `Week of ${MONTH_NAMES[s.getMonth()]} ${s.getDate()}`
}

// ── New plan dialog ──────────────────────────────────────────────────────────

function NewPlanDialog({
  open,
  onOpenChange,
  weekStartDay,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  weekStartDay: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const validDates = getValidStartDates(weekStartDay)
  const [selectedDate, setSelectedDate] = useState(toISODate(validDates[0]))
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createMealPlan(selectedDate, name.trim() || undefined)
      if (result.error) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      router.push(`/plans/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New meal plan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-start">Start date</Label>
            <Select value={selectedDate} onValueChange={(v) => { if (v) setSelectedDate(v) }}>
              <SelectTrigger id="plan-start" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {validDates.map((d) => {
                  const iso = toISODate(d)
                  return (
                    <SelectItem key={iso} value={iso}>
                      {formatDateLabel(d)}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Starts on {FULL_DAY_NAMES[weekStartDay]}s — runs 7 days.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-name">
              Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="plan-name"
              placeholder="e.g. High protein week"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <DialogFooter className="-mx-6 -mb-6">
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: MealPlanSummary }) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(`/plans/${plan.id}`)}
      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-heading text-base font-medium text-foreground truncate">
          {planDisplayName(plan)}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatDateRange(plan.start_date, plan.end_date)}
        </span>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Utensils className="size-3" />
            {plan.total_entries} {plan.total_entries === 1 ? 'entry' : 'entries'}
          </span>
          {plan.avg_daily_calories > 0 && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              avg {plan.avg_daily_calories.toLocaleString()} kcal/day
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

// ── Main client component ────────────────────────────────────────────────────

export default function PlansClient({
  plans,
  weekStartDay,
}: {
  plans: MealPlanSummary[]
  weekStartDay: number
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Plans
          </p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight text-foreground">
            Meal plans
          </h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus />
          New plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border bg-card px-8 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <CalendarDays className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-heading text-lg font-medium text-foreground">Plan your first week</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a 7-day meal plan and start tracking your macros.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Create a plan
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}

      <NewPlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        weekStartDay={weekStartDay}
      />
    </div>
  )
}
