'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, RefreshCw, ShoppingCart, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import {
  createEmptyTrip,
  splitTrip,
  mergeTrips,
} from '@/lib/grocery-lists/actions'
import type { GroceryList, MealPlanResolved } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Grid template: 7 flex day cols interleaved with 6 fixed 20px breakpoint cols
const GRID_TEMPLATE = '1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr 20px 1fr'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripGroup {
  startIdx: number  // index 0–6 into planDates
  endIdx: number
  trip: GroceryList | null  // null = no DB row yet
  tintIdx: number
}

type ConfirmAction =
  | { type: 'split'; tripId: string; firstPartEndDate: string; newStartDate: string; tripHasItems: boolean }
  | { type: 'split-from-scratch'; planStartDate: string; breakDate: string; newStartDate: string; planEndDate: string }
  | { type: 'merge'; keepId: string; deleteId: string; eitherHasItems: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDayRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (start === end) return DAY_NAMES[s.getDay()]
  return `${DAY_NAMES[s.getDay()]}–${DAY_NAMES[e.getDay()]}`
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (s.getMonth() === e.getMonth()) {
    return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
  }
  return `${MONTH_ABBR[s.getMonth()]} ${s.getDate()} – ${MONTH_ABBR[e.getMonth()]} ${e.getDate()}`
}

function formatSubtitle(start: string, end: string) {
  return `${formatDayRange(start, end)} · ${formatDateRange(start, end)}`
}

function computeGroups(planDates: string[], trips: GroceryList[]): TripGroup[] {
  if (trips.length === 0) {
    return [{ startIdx: 0, endIdx: 6, trip: null, tintIdx: 0 }]
  }
  return trips.map((trip, i) => ({
    startIdx: planDates.indexOf(trip.start_date),
    endIdx: planDates.indexOf(trip.end_date),
    trip,
    tintIdx: i,
  }))
}

function computeActiveBreakpoints(planDates: string[], trips: GroceryList[]): Set<number> {
  const active = new Set<number>()
  for (const trip of trips) {
    const startIdx = planDates.indexOf(trip.start_date)
    if (startIdx > 0) active.add(startIdx - 1)
  }
  return active
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DayCell({ date }: { date: string }) {
  const d = new Date(date + 'T00:00:00')
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 py-2 text-center">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
        {DAY_NAMES[d.getDay()]}
      </span>
      <span className="font-heading text-sm font-semibold tabular-nums text-foreground">
        {d.getDate()}
      </span>
    </div>
  )
}

function BreakpointZone({
  active,
  disabled,
  onClick,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const label = active ? 'Merge' : 'Split'

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? 'Maximum 3 trips per week' : undefined}
      className={cn(
        'group relative flex items-center justify-center self-stretch',
        disabled ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      {/* Vertical separator line */}
      <div className={cn(
        'h-full w-px transition-colors duration-150',
        active
          ? 'bg-primary group-hover:bg-primary/35'
          : disabled
          ? 'bg-border/20'
          : 'bg-border/40 group-hover:bg-primary/35',
      )} />

      {/* Circle icon */}
      <div className={cn(
        'absolute flex items-center justify-center rounded-full transition-all duration-150 size-4',
        active
          ? 'bg-muted text-primary opacity-100 group-hover:bg-destructive/15 group-hover:text-destructive'
          : disabled
          ? 'text-muted-foreground opacity-10'
          : 'text-muted-foreground opacity-30 group-hover:opacity-100 group-hover:text-primary group-hover:bg-primary/15',
      )}>
        {active ? <X className="size-2.5" /> : <Plus className="size-2.5" />}
      </div>

      {/* Floating label */}
      {!disabled && (
        <span className={cn(
          'pointer-events-none absolute z-10 left-1/2 -translate-x-1/2',
          'top-1/2 -translate-y-[calc(100%+10px)]',
          'whitespace-nowrap rounded-sm border border-border/50 bg-popover px-1.5 py-px',
          'text-[9px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
        )}>
          {label}
        </span>
      )}
    </button>
  )
}


function GroceryPopover({
  groups,
  plan,
  isPending,
  navigatingTripId,
  resolveAutoName,
  onTripAction,
}: {
  groups: TripGroup[]
  plan: MealPlanResolved
  isPending: boolean
  navigatingTripId: string | null
  resolveAutoName: (group: TripGroup) => string
  onTripAction: (group: TripGroup) => void
}) {
  const [open, setOpen] = useState(false)
  const realTripCount = groups.filter((g) => g.trip !== null).length
  const generatedCount = groups.filter((g) => (g.trip?.items.length ?? 0) > 0 && !g.trip?.is_stale).length

  function handleAction(group: TripGroup) {
    setOpen(false)
    onTripAction(group)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-background hover:text-foreground">
        <ShoppingCart className="size-3.5" />
        <span>Grocery</span>
        {realTripCount > 1 && (
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
            {generatedCount}/{realTripCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-60 gap-0 p-1.5">
        <p className="mb-1 px-2 pt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Shopping trips
        </p>
        <div className="flex flex-col gap-0.5">
          {groups.map((group, gi) => {
            const tripId = group.trip?.id ?? null
            const isLoading =
              navigatingTripId === tripId ||
              (group.trip === null && navigatingTripId === '__new')
            const hasItems = (group.trip?.items.length ?? 0) > 0
            const isStale  = hasItems && (group.trip?.is_stale ?? false)
            const startDate = group.trip?.start_date ?? plan.start_date
            const endDate   = group.trip?.end_date   ?? plan.end_date

            return (
              <div key={gi} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <div className="flex min-w-0 flex-1 flex-col gap-0">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {resolveAutoName(group)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                    {formatSubtitle(startDate, endDate)}
                  </span>
                </div>
                <button
                  onClick={() => handleAction(group)}
                  disabled={isLoading}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                    'transition-colors hover:bg-background',
                    isStale
                      ? 'text-foreground/60 hover:text-foreground'
                      : hasItems
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'text-primary hover:text-primary/80',
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isStale ? (
                    <RefreshCw className="size-3" />
                  ) : (
                    <ShoppingCart className="size-3" />
                  )}
                  {isStale ? 'Regenerate' : hasItems ? 'View' : 'Generate'}
                </button>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  action,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction | null
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!action) return null

  const isMerge = action.type === 'merge'
  const title = isMerge ? 'Merge trips?' : 'Split trip?'
  const description = isMerge
    ? "Merging these trips will clear the existing list(s). You'll need to regenerate the combined list. Continue?"
    : "Splitting this trip will clear the existing grocery list. You'll need to regenerate lists for both new trips. Continue?"

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main strip ────────────────────────────────────────────────────────────────

export default function TripStrip({
  plan,
  planId,
  initialTrips,
}: {
  plan: MealPlanResolved
  planId: string
  initialTrips: GroceryList[]
}) {
  const router = useRouter()
  const [trips, setTrips] = useState<GroceryList[]>(initialTrips)
  const [isPending, startTransition] = useTransition()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [navigatingTripId, setNavigatingTripId] = useState<string | null>(null)

  // Sync trips state when the server refreshes (e.g. after a meal entry mutation
  // calls router.refresh()). We merge in-place so structural optimistic updates
  // (split/merge with fake IDs) survive; trips that have real IDs get fresh data.
  useEffect(() => {
    setTrips((prev) => {
      if (prev.length === 0) return initialTrips
      const merged = prev.map((t) => {
        const fresh = initialTrips.find((it) => it.id === t.id)
        return fresh ? { ...t, ...fresh } : t
      })
      const added = initialTrips.filter((it) => !prev.some((t) => t.id === it.id))
      return [...merged, ...added].sort((a, b) => a.start_date.localeCompare(b.start_date))
    })
  }, [initialTrips])

  const planDates = plan.days.map((d) => d.date)
  const groups = computeGroups(planDates, trips)
  const activeBreakpoints = computeActiveBreakpoints(planDates, trips)

  function autoName(group: TripGroup, allGroups: TripGroup[]): string {
    if (allGroups.length === 1) return 'Full week'
    return `Trip ${group.tintIdx + 1}`
  }

  // ── Breakpoint click ───────────────────────────────────────────────────────

  function handleBreakpointClick(position: number) {
    if (activeBreakpoints.has(position)) {
      handleMergeAt(position)
    } else {
      if (activeBreakpoints.size >= 2) return
      handleSplitAt(position)
    }
  }

  function handleSplitAt(position: number) {
    const breakDate    = planDates[position]
    const newStartDate = planDates[position + 1]

    if (trips.length === 0) {
      doSplitFromScratch(plan.start_date, breakDate, newStartDate, plan.end_date)
      return
    }

    const tripToSplit = trips.find(
      (t) => t.start_date <= breakDate && t.end_date >= newStartDate
    )
    if (!tripToSplit) return

    if (tripToSplit.items.length > 0) {
      setConfirmAction({
        type: 'split',
        tripId: tripToSplit.id,
        firstPartEndDate: breakDate,
        newStartDate,
        tripHasItems: true,
      })
    } else {
      doSplit(tripToSplit.id, breakDate, newStartDate)
    }
  }

  function handleMergeAt(position: number) {
    const dayBefore = planDates[position]
    const dayAfter  = planDates[position + 1]
    const earlier = trips.find((t) => t.start_date <= dayBefore && t.end_date >= dayBefore)
    const later   = trips.find((t) => t.start_date <= dayAfter  && t.end_date >= dayAfter)
    if (!earlier || !later || earlier.id === later.id) return

    const eitherHasItems = earlier.items.length > 0 || later.items.length > 0
    if (eitherHasItems) {
      setConfirmAction({ type: 'merge', keepId: earlier.id, deleteId: later.id, eitherHasItems: true })
    } else {
      doMerge(earlier.id, later.id)
    }
  }

  // ── Optimistic mutations ───────────────────────────────────────────────────

  function doSplitFromScratch(
    planStart: string,
    breakDate: string,
    newStart: string,
    planEnd: string,
  ) {
    const fakeFirst: GroceryList = {
      id: `opt-${Math.random().toString(36).slice(2)}`,
      meal_plan_id: planId,
      start_date: planStart,
      end_date: breakDate,
      name: null,
      items: [],
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const fakeSecond: GroceryList = {
      ...fakeFirst,
      id: `opt-${Math.random().toString(36).slice(2)}`,
      start_date: newStart,
      end_date: planEnd,
    }
    setTrips([fakeFirst, fakeSecond])

    startTransition(async () => {
      const [r1, r2] = await Promise.all([
        createEmptyTrip(planId, planStart, breakDate),
        createEmptyTrip(planId, newStart, planEnd),
      ])
      if (r1.error || r2.error) {
        toast.error(r1.error ?? r2.error)
        setTrips([])
        return
      }
      setTrips([r1.trip!, r2.trip!])
    })
  }

  function doSplit(tripId: string, firstPartEndDate: string, newStartDate: string) {
    setConfirmAction(null)
    startTransition(async () => {
      const result = await splitTrip(tripId, firstPartEndDate, newStartDate)
      if (result.error) { toast.error(result.error); return }
      setTrips((prev) => {
        const kept = prev.filter((t) => t.id !== tripId)
        return [...kept, result.updatedTrip!, result.newTrip!]
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
      })
    })
  }

  function doMerge(keepId: string, deleteId: string) {
    setConfirmAction(null)
    const keepTrip = trips.find((t) => t.id === keepId)!
    const delTrip  = trips.find((t) => t.id === deleteId)!
    const mergedEnd = keepTrip.end_date > delTrip.end_date ? keepTrip.end_date : delTrip.end_date

    setTrips((prev) =>
      prev
        .filter((t) => t.id !== deleteId)
        .map((t) => t.id === keepId ? { ...t, end_date: mergedEnd, items: [] } : t)
    )

    startTransition(async () => {
      const result = await mergeTrips(keepId, deleteId)
      if (result.error) {
        toast.error(result.error)
        router.refresh()
      }
    })
  }

  function handleConfirm() {
    if (!confirmAction) return
    if (confirmAction.type === 'split') {
      doSplit(confirmAction.tripId, confirmAction.firstPartEndDate, confirmAction.newStartDate)
    } else if (confirmAction.type === 'split-from-scratch') {
      doSplitFromScratch(
        confirmAction.planStartDate,
        confirmAction.breakDate,
        confirmAction.newStartDate,
        confirmAction.planEndDate,
      )
    } else if (confirmAction.type === 'merge') {
      doMerge(confirmAction.keepId, confirmAction.deleteId)
    }
  }

  // ── Navigate to grocery page ───────────────────────────────────────────────

  async function handleTripAction(group: TripGroup) {
    if (!group.trip) {
      setNavigatingTripId('__new')
      const result = await createEmptyTrip(planId, plan.start_date, plan.end_date)
      if (result.error) { toast.error(result.error); setNavigatingTripId(null); return }
      setTrips([result.trip!])
      router.push(`/plans/${planId}/grocery?trip=${result.trip!.id}&generate=1`)
    } else {
      setNavigatingTripId(group.trip.id)
      const hasItems = group.trip.items.length > 0
      const suffix = hasItems ? '' : '&generate=1'
      router.push(`/plans/${planId}/grocery?trip=${group.trip.id}${suffix}`)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Sticky zone: day row + grocery popover button */}
      <div className="sticky z-10 bg-background py-3" style={{ top: 'var(--nav-height)' }}>
        <div className="rounded-xl p-4" style={{ background: 'oklch(0.95 0.02 75)' }}>
          <div className="flex items-center gap-3">
            {/* Day row */}
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="min-w-[340px]">
                <div
                  className="grid gap-0"
                  style={{ gridTemplateColumns: GRID_TEMPLATE }}
                >
                  {planDates.map((date, i) => (
                    <Fragment key={date}>
                      <DayCell date={date} />
                      {i < 6 && (
                        <BreakpointZone
                          active={activeBreakpoints.has(i)}
                          disabled={!activeBreakpoints.has(i) && activeBreakpoints.size >= 2}
                          onClick={() => handleBreakpointClick(i)}
                        />
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Grocery popover — always accessible regardless of scroll position */}
            <GroceryPopover
              groups={groups}
              plan={plan}
              isPending={isPending}
              navigatingTripId={navigatingTripId}
              resolveAutoName={(group) => autoName(group, groups)}
              onTripAction={handleTripAction}
            />
          </div>
        </div>
      </div>

<ConfirmDialog
        action={confirmAction}
        isPending={isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  )
}
