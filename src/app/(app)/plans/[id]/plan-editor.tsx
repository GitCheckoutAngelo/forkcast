'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, GripVertical, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DropAnimation,
  pointerWithin,
  PointerSensor,
  useDndMonitor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import DayRow from './day-row'
import AddEntryDialog from './add-entry-dialog'
import RecipeSidebar from './recipe-sidebar'
import { updateMealPlan, addMealEntry } from '@/lib/meal-plans/actions'
import { addMacros, ZERO_MACROS } from '@/lib/meal-plans/utils'
import type { MealPlanResolved, MealEntryResolved, MacroTarget, Recipe, FoodItem, GroceryList } from '@/types'
import Link from 'next/link'
import TripStrip from './trip-strip'

// ── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
  }
  return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

// ── Inline name edit ─────────────────────────────────────────────────────────

function InlineName({
  planId,
  name,
  startDate,
  isEditMode,
}: {
  planId: string
  name: string | null
  startDate: string
  isEditMode: boolean
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const displayName = name ?? defaultPlanName(startDate)
  const [draft, setDraft] = useState(displayName)
  const inputRef = useRef<HTMLInputElement>(null)

  function defaultPlanName(sd: string) {
    const d = new Date(sd + 'T00:00:00')
    return `Week of ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
  }

  function startEdit() {
    setDraft(displayName)
    setIsEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  function commit() {
    const trimmed = draft.trim()
    setIsEditing(false)
    if (trimmed === displayName) return
    startTransition(async () => {
      const result = await updateMealPlan(planId, { name: trimmed || null })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  if (!isEditMode) {
    return (
      <h1 className="font-heading text-2xl font-medium tracking-tight text-foreground">
        {displayName}
      </h1>
    )
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setIsEditing(false); setDraft(displayName) }
          }}
          className="w-full rounded-lg border border-input bg-background px-2 py-1 font-heading text-2xl font-medium tracking-tight text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <Button size="icon-sm" variant="ghost" onClick={commit} disabled={isPending}>
          <Check className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5 text-left"
      title="Click to rename"
    >
      <h1 className="font-heading text-2xl font-medium tracking-tight text-foreground">
        {displayName}
      </h1>
      <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

// ── Week summary ─────────────────────────────────────────────────────────────

function WeekSummary({
  plan,
  target,
  isRefreshing,
}: {
  plan: MealPlanResolved
  target: MacroTarget | null
  isRefreshing: boolean
}) {
  const weekTotal = plan.days.reduce(
    (acc, d) => addMacros(acc, d.total_macros),
    ZERO_MACROS
  )
  const avgCals = Math.round(weekTotal.calories / 7)
  const avgProtein = Math.round(weekTotal.protein_g / 7)

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground transition-opacity',
      isRefreshing && 'opacity-50',
    )}>
      {isRefreshing && <Loader2 className="size-3 shrink-0 animate-spin" />}
      <span>
        <span className="font-medium text-foreground tabular-nums">
          {weekTotal.calories > 0 ? Math.round(weekTotal.calories).toLocaleString() : '—'}
        </span>{' '}
        kcal total
      </span>
      {avgCals > 0 && (
        <span>
          <span className="font-medium text-foreground tabular-nums">
            {avgCals.toLocaleString()}
          </span>{' '}
          kcal avg/day
        </span>
      )}
      {avgProtein > 0 && (
        <span>
          <span className="font-medium text-foreground tabular-nums">{avgProtein}g</span> protein
          avg/day
        </span>
      )}
      {target && (
        <span className="text-muted-foreground/70">
          Target: {target.calories.toLocaleString()} kcal/day
        </span>
      )}
    </div>
  )
}

// ── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({
  isEditMode,
  onToggle,
}: {
  isEditMode: boolean
  onToggle: (mode: 'view' | 'edit') => void
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-border bg-muted p-0.5 text-sm">
      {/* Inner wrapper is the pill's reference frame — its width = both buttons */}
      <div className="relative flex">
        <div
          className={cn(
            'absolute inset-0 w-1/2 rounded-md bg-background shadow-sm transition-transform duration-200 ease-in-out',
            isEditMode ? 'translate-x-full' : 'translate-x-0',
          )}
        />
        <button
          onClick={() => onToggle('view')}
          className={cn(
            'relative z-10 px-3 py-1 font-medium transition-colors duration-200',
            !isEditMode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          View
        </button>
        <button
          onClick={() => onToggle('edit')}
          className={cn(
            'relative z-10 px-3 py-1 font-medium transition-colors duration-200',
            isEditMode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Edit
        </button>
      </div>
    </div>
  )
}

// ── Drag overlay ─────────────────────────────────────────────────────────────

type ActiveDragItem =
  | { kind: 'recipe'; item: Recipe }
  | { kind: 'food_item'; item: FoodItem }

const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'ease-out',
  keyframes() { return [{ opacity: 1 }, { opacity: 0 }] },
}

const DragOverlayCard = memo(function DragOverlayCard({ item }: { item: ActiveDragItem }) {
  const name = item.item.name
  const kcal = Math.round(item.item.macros_per_serving.calories)
  const sub =
    item.kind === 'recipe'
      ? `${kcal} kcal · ${item.item.servings} serving${item.item.servings !== 1 ? 's' : ''}`
      : `${item.kind === 'food_item' && item.item.brand ? item.item.brand + ' · ' : ''}${kcal} kcal`

  return (
    <div className="flex w-56 cursor-grabbing items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-lg rotate-[-2deg] scale-[1.02]">
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground leading-snug">{name}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
})

// Isolated component: owns activeItem state so PlanEditor doesn't re-render during drag.
// useDndMonitor subscribes to dnd events without pulling the parent into the render cycle.
function PlanDragOverlay({ recipes, foodItems }: { recipes: Recipe[]; foodItems: FoodItem[] }) {
  const [activeItem, setActiveItem] = useState<ActiveDragItem | null>(null)

  useDndMonitor({
    onDragStart({ active }) {
      const id = String(active.id)
      if (id.startsWith('recipe-')) {
        const item = recipes.find((r) => r.id === id.slice('recipe-'.length))
        if (item) setActiveItem({ kind: 'recipe', item })
      } else if (id.startsWith('food_item-')) {
        const item = foodItems.find((f) => f.id === id.slice('food_item-'.length))
        if (item) setActiveItem({ kind: 'food_item', item })
      }
    },
    onDragEnd()    { setActiveItem(null) },
    onDragCancel() { setActiveItem(null) },
  })

  return (
    <DragOverlay dropAnimation={dropAnimation}>
      {activeItem ? <DragOverlayCard item={activeItem} /> : null}
    </DragOverlay>
  )
}

// ── Mode-switch skeleton ─────────────────────────────────────────────────────

function DayRowSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 px-4 py-6 lg:flex-row lg:gap-4">
      <div className="flex items-start justify-between gap-3 lg:w-36 lg:shrink-0 lg:flex-col lg:justify-start">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-8 rounded bg-muted" />
          <div className="h-3 w-12 rounded bg-muted/70" />
        </div>
        <div className="flex flex-col gap-1.5 lg:mt-2">
          <div className="h-3 w-24 rounded bg-muted/50" />
          <div className="h-2.5 w-16 rounded bg-muted/40" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-2 w-14 rounded bg-muted/60" />
            <div className="h-7 w-full rounded-lg bg-muted/30" />
            {i % 2 === 0 && <div className="h-7 w-4/5 rounded-lg bg-muted/25" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Optimistic helpers ───────────────────────────────────────────────────────

function buildOptimisticEntry(
  consumable: MealEntryResolved['consumable'],
  slotId: string,
  position: number,
): MealEntryResolved {
  const macros =
    consumable.kind === 'recipe'
      ? consumable.recipe.macros_per_serving
      : consumable.food_item.macros_per_serving
  return {
    id: `opt-${Math.random().toString(36).slice(2)}`,
    meal_slot_id: slotId,
    position,
    recipe_id: consumable.kind === 'recipe' ? consumable.recipe.id : null,
    food_item_id: consumable.kind === 'food_item' ? consumable.food_item.id : null,
    servings: 1,
    macros_override: null,
    notes: null,
    consumable,
    effective_macros: macros,
  }
}

// ── Main editor ──────────────────────────────────────────────────────────────

export default function PlanEditor({
  plan,
  profile,
  recipes,
  foodItems,
  initialTrips,
}: {
  plan: MealPlanResolved
  profile: {
    id: string
    display_name: string | null
    macro_target: MacroTarget | null
    week_start_day: number
    timezone: string
  }
  recipes: Recipe[]
  foodItems: FoodItem[]
  initialTrips: GroceryList[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isEditMode = searchParams.get('mode') === 'edit'

  // Optimistic toggle state — updated synchronously on click so the segmented
  // control reflects the selection immediately, without waiting for the URL update.
  const [modeIsPending, startModeTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [optimisticEditMode, setOptimisticEditMode] = useState(isEditMode)
  // During a transition show the optimistic value; after landing revert to URL truth
  // (this also makes browser back/forward correct without extra syncing).
  const toggleEditMode = modeIsPending ? optimisticEditMode : isEditMode

  // Show a skeleton over the day grid only if the transition takes > 150 ms,
  // so instant navigations don't cause a distracting flash.
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!modeIsPending) { setShowSkeleton(false); return }
    const id = setTimeout(() => setShowSkeleton(true), 150)
    return () => clearTimeout(id)
  }, [modeIsPending])

  function setMode(mode: 'view' | 'edit') {
    setOptimisticEditMode(mode === 'edit')   // synchronous — toggle updates now
    startModeTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (mode === 'view') params.delete('mode')
      else params.set('mode', mode)
      const qs = params.toString()
      router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    })
  }

  const [addEntryOpen, setAddEntryOpen] = useState(false)

  // Stable refs so callbacks below don't need to redeclare on every render.
  const planRef = useRef(plan)
  planRef.current = plan
  const addEntrySlotIdRef = useRef<string | null>(null)

  // Optimistic pending entries: shown immediately; cleared when plan prop refreshes.
  type PendingEntry = { slotId: string; entry: MealEntryResolved }
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([])

  // Detect plan identity changes during render (not in an effect).
  // Calling setState here triggers an immediate re-render before React commits to the DOM,
  // so the intermediate state where both the optimistic entry AND the real server entry
  // are visible (duplicate) is never painted.
  const prevPlanRef = useRef(plan)
  if (plan !== prevPlanRef.current) {
    prevPlanRef.current = plan
    if (pendingEntries.length > 0) setPendingEntries([])
  }

  // Merge pending entries into the plan data so DayRow children see them without
  // needing any extra prop threading. Preserves object identity for unaffected days/slots
  // so memo'd children don't re-render unnecessarily.
  // Optimistic entries whose consumable is already present in the real slot are excluded
  // as a belt-and-suspenders guard against duplicates.
  const augmentedDays = useMemo(() => {
    if (pendingEntries.length === 0) return plan.days
    return plan.days.map((day) => {
      const affected = day.slots.some((s) => pendingEntries.some((p) => p.slotId === s.id))
      if (!affected) return day
      return {
        ...day,
        slots: day.slots.map((slot) => {
          const pending = pendingEntries.filter((p) => p.slotId === slot.id)
          if (pending.length === 0) return slot
          // Drop any optimistic entry whose consumable is already confirmed in the real data.
          const unconfirmed = pending.filter(
            (p) =>
              !slot.entries.some(
                (e) =>
                  (p.entry.recipe_id !== null && e.recipe_id === p.entry.recipe_id) ||
                  (p.entry.food_item_id !== null && e.food_item_id === p.entry.food_item_id),
              ),
          )
          if (unconfirmed.length === 0) return slot
          return { ...slot, entries: [...slot.entries, ...unconfirmed.map((p) => p.entry)] }
        }),
      }
    })
  }, [plan.days, pendingEntries])

  // Stable reference so memoized DayRow/SlotColumn/SlotCell don't re-render when
  // PlanEditor re-renders for unrelated reasons (mode toggle state, skeleton, etc.)
  const openAddEntry = useCallback((slotId: string) => {
    addEntrySlotIdRef.current = slotId
    setAddEntryOpen(true)
  }, [])

  // DnD sensors – require 8px movement to start drag (avoids false triggers on click)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Shared logic: show entry immediately then persist in the background.
  async function addEntryOptimistically(
    consumable: MealEntryResolved['consumable'],
    slotId: string,
  ) {
    const current = planRef.current
    const slot = current.days.flatMap((d) => d.slots).find((s) => s.id === slotId)
    const position = slot ? slot.entries.length : 0
    const entry = buildOptimisticEntry(consumable, slotId, position)

    setPendingEntries((prev) => [...prev, { slotId, entry }])

    const consumableArg =
      consumable.kind === 'recipe'
        ? { kind: 'recipe' as const, recipeId: consumable.recipe.id }
        : { kind: 'food_item' as const, foodItemId: consumable.food_item.id }

    const result = await addMealEntry(slotId, consumableArg)
    if (result.error) {
      setPendingEntries((prev) => prev.filter((p) => p.entry.id !== entry.id))
      toast.error(result.error)
    } else {
      startRefreshTransition(() => router.refresh())
    }
  }

  // Called by AddEntryDialog when the user picks a recipe/food item.
  // Stable reference: reads plan via ref, no dependency array needed.
  const handleAddEntry = useCallback(
    (consumable: MealEntryResolved['consumable']) => {
      const slotId = addEntrySlotIdRef.current
      if (!slotId) return
      setAddEntryOpen(false) // close dialog immediately
      addEntryOptimistically(consumable, slotId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const overId = String(over.id)
    if (!overId.startsWith('slot-')) return
    const slotId = overId.slice('slot-'.length)

    const activeId = String(active.id)
    if (activeId.startsWith('recipe-')) {
      const recipeId = activeId.slice('recipe-'.length)
      const recipe = recipes.find((r) => r.id === recipeId)
      if (!recipe) return
      addEntryOptimistically({ kind: 'recipe', recipe }, slotId)
    } else if (activeId.startsWith('food_item-')) {
      const foodItemId = activeId.slice('food_item-'.length)
      const item = foodItems.find((f) => f.id === foodItemId)
      if (!item) return
      addEntryOptimistically({ kind: 'food_item', food_item: item }, slotId)
    }
  }

  return (
    <DndContext
      id="plan-editor"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-2 px-1">
          <Link
            href="/plans"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          >
            <ArrowLeft className="size-3.5" />
            All plans
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <InlineName
                planId={plan.id}
                name={plan.name}
                startDate={plan.start_date}
                isEditMode={isEditMode}
              />
              <p className="text-sm text-muted-foreground">
                {formatDateRange(plan.start_date, plan.end_date)}
              </p>
              <WeekSummary plan={plan} target={profile.macro_target} isRefreshing={isRefreshing} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ModeToggle isEditMode={toggleEditMode} onToggle={setMode} />
            </div>
          </div>
        </div>

        {/* Trip shopping strip — sticky, sits between the header and the day grid */}
        <TripStrip plan={plan} planId={plan.id} initialTrips={initialTrips} />

        {/* Grid + sidebar */}
        <div className="flex items-start gap-4">
          {/* 7-day grid */}
          <div className="flex-1">
            <div className="flex flex-col divide-y divide-border">
              {showSkeleton
                ? plan.days.map((_, i) => <DayRowSkeleton key={i} />)
                : augmentedDays.map((day) => (
                    <DayRow key={day.id} day={day} onAddClick={openAddEntry} isEditMode={isEditMode} />
                  ))
              }
            </div>
          </div>

          {/* Sidebar — desktop only, edit mode only.
              self-stretch makes the wrapper as tall as the day grid so the sticky
              sidebar inside it has a scroll range to work within. Without it the
              wrapper is only as tall as the sidebar itself (align-self: flex-start
              from items-start on the parent) and sticky has nowhere to travel.
              Kept in DOM during edit→view transition so it can fade out. */}
          {isEditMode && (
            <div
              className={cn(
                'shrink-0 self-stretch transition-opacity duration-150',
                modeIsPending ? 'pointer-events-none opacity-0' : 'opacity-100',
              )}
            >
              <RecipeSidebar recipes={recipes} foodItems={foodItems} />
            </div>
          )}
        </div>
      </div>

      {/* Add entry dialog */}
      <AddEntryDialog
        open={addEntryOpen}
        onOpenChange={setAddEntryOpen}
        onAdd={handleAddEntry}
        recipes={recipes}
        foodItems={foodItems}
      />

      {/* Drag overlay — isolated component; owns activeItem so PlanEditor stays static during drag */}
      <PlanDragOverlay recipes={recipes} foodItems={foodItems} />
    </DndContext>
  )
}
