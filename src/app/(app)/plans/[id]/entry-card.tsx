'use client'

import { memo, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { GripVertical, X } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteMealEntry, updateMealEntry } from '@/lib/meal-plans/actions'
import { cn } from '@/lib/utils'
import type { MealEntryResolved, MealSlotType } from '@/types'

const SLOT_ACCENT: Record<MealSlotType, string> = {
  breakfast: 'border-l-amber-400/70',
  lunch:     'border-l-emerald-500/70',
  dinner:    'border-l-sky-500/70',
  snack:     'border-l-violet-400/70',
}

// ── Read-only detail dialog ───────────────────────────────────────────────────

function EntryDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: MealEntryResolved
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const name =
    entry.consumable.kind === 'recipe'
      ? (entry.consumable.recipe.display_name ?? entry.consumable.recipe.name)
      : entry.consumable.food_item.name
  const m = entry.effective_macros
  const rows = [
    { label: 'Calories', value: m.calories, unit: 'kcal' },
    { label: 'Protein',  value: m.protein_g, unit: 'g' },
    { label: 'Carbs',    value: m.carbs_g,   unit: 'g' },
    { label: 'Fat',      value: m.fat_g,     unit: 'g' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            {entry.servings} {entry.servings === 1 ? 'serving' : 'servings'}
          </p>
          <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
            {rows.map(({ label, value, unit }) => (
              <div key={label} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">
                  {Math.round(value)}&thinsp;{unit}
                </span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  isEditMode,
  slotType,
  onRemove,
  onRestoreEntry,
  isDeparting = false,
  onDepartureComplete,
}: {
  entry: MealEntryResolved
  isEditMode: boolean
  slotType?: MealSlotType
  onRemove: (id: string) => void
  onRestoreEntry: (id: string) => void
  // isDeparting: entry was moved away from this slot; play exit animation then notify parent.
  isDeparting?: boolean
  onDepartureComplete?: (id: string) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [servingsInput, setServingsInput] = useState(String(entry.servings))
  const [isServingsEditing, setIsServingsEditing] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOptimistic = entry.id.startsWith('opt-')

  // Grow-in animation on mount.
  // Departing entries start expanded (isMounted=true) so they shrink rather than grow-then-shrink.
  const [isMounted, setIsMounted] = useState(isDeparting)
  useEffect(() => {
    if (isDeparting) return
    const raf = requestAnimationFrame(() => setIsMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [isDeparting])

  // Trigger exit animation for entries moved to another slot.
  useEffect(() => {
    if (!isDeparting) return
    // rAF ensures the card is painted expanded before the collapse transition starts.
    const raf = requestAnimationFrame(() => setIsRemoving(true))
    const t = setTimeout(() => onDepartureComplete?.(entry.id), 210)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeparting])

  // Cancel pending remove timer on unmount.
  useEffect(() => () => {
    if (removeTimer.current) clearTimeout(removeTimer.current)
  }, [])

  // Sync servingsInput when the server returns an updated entry.servings.
  // React-documented derived-state pattern: track previous prop in state,
  // call setState during render — React re-renders immediately without committing
  // the stale value, so there's no intermediate flash.
  const [prevServings, setPrevServings] = useState(entry.servings)
  if (entry.servings !== prevServings) {
    setPrevServings(entry.servings)
    setServingsInput(String(entry.servings))
  }

  const { isDragging, setNodeRef, listeners, attributes } = useDraggable({
    id: `entry-${entry.id}`,
    data: { entry },
    disabled: !isEditMode || isPending || isOptimistic || isDeparting,
  })

  const name =
    entry.consumable.kind === 'recipe'
      ? (entry.consumable.recipe.display_name ?? entry.consumable.recipe.name)
      : entry.consumable.food_item.name

  const kcalPerServing = entry.servings > 0 ? entry.effective_macros.calories / entry.servings : 0
  const kcal = Math.round(kcalPerServing * (parseFloat(servingsInput) || entry.servings))

  function commitServings() {
    const next = parseFloat(servingsInput)
    if (isNaN(next) || next <= 0) { setServingsInput(String(entry.servings)); return }
    if (next === entry.servings) return
    startTransition(async () => {
      const result = await updateMealEntry(entry.id, { servings: next })
      if (result.error) { toast.error(result.error); setServingsInput(String(entry.servings)) }
      else router.refresh()
    })
  }

  function handleRemove() {
    setIsRemoving(true)
    removeTimer.current = setTimeout(() => {
      removeTimer.current = null
      onRemove(entry.id)
    }, 190)
    startTransition(async () => {
      const result = await deleteMealEntry(entry.id)
      if (result.error) {
        if (removeTimer.current) { clearTimeout(removeTimer.current); removeTimer.current = null }
        setIsRemoving(false)
        onRestoreEntry(entry.id)
        toast.error("Couldn't remove entry. Try again.")
      } else {
        router.refresh()
      }
    })
  }

  const borderClass = SLOT_ACCENT[slotType ?? 'dinner']

  // Collapsed = removing OR not yet mounted. Expanded = mounted and not removing.
  const isCollapsed = isRemoving || !isMounted

  return (
    <>
      {isEditMode ? (
        <div
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-in-out',
            isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              ref={setNodeRef}
              {...attributes}
              className={cn(
                'group/entry min-h-[4rem] flex gap-1.5 border-l-[3px] py-2 pl-1.5 pr-2 transition-colors hover:bg-muted/30',
                borderClass,
                isPending && !isRemoving && 'opacity-60',
                isDragging && 'opacity-30',
              )}
              aria-busy={isPending}
            >
              <div
                {...listeners}
                className="shrink-0 cursor-grab self-center text-muted-foreground/40 opacity-0 transition-opacity group-hover/entry:opacity-100 focus:opacity-100 active:cursor-grabbing touch-none"
                aria-label="Drag to move"
              >
                <GripVertical className="size-3.5" />
              </div>

              <div className="flex flex-1 flex-col min-w-0">
                <button
                  onClick={() => !isDeparting && setDetailOpen(true)}
                  className="block w-full text-left text-sm font-medium text-foreground leading-snug hover:underline focus:outline-none focus:underline"
                >
                  {name}
                </button>

                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  {isServingsEditing ? (
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={servingsInput}
                      disabled={isPending}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setServingsInput(e.target.value)}
                      onBlur={() => { commitServings(); setIsServingsEditing(false) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                        if (e.key === 'Escape') { setServingsInput(String(entry.servings)); setIsServingsEditing(false) }
                      }}
                      className="w-10 rounded border border-input bg-background px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                      aria-label="Servings"
                    />
                  ) : (
                    <button
                      onClick={() => !isDeparting && setIsServingsEditing(true)}
                      disabled={isPending}
                      className="cursor-text rounded px-0.5 tabular-nums underline decoration-dotted underline-offset-2 hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none"
                      aria-label="Edit servings"
                    >
                      {entry.servings} {entry.servings === 1 ? 'serving' : 'servings'}
                    </button>
                  )}
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{kcal}&thinsp;kcal</span>
                </div>
              </div>

              <button
                onClick={handleRemove}
                disabled={isPending || isOptimistic || isDeparting}
                className="shrink-0 self-start text-muted-foreground/40 opacity-0 transition-opacity group-hover/entry:opacity-100 hover:text-destructive disabled:pointer-events-none focus:opacity-100 focus:outline-none"
                aria-label={`Remove ${name}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDetailOpen(true)}
          className={cn(
            'min-h-[4rem] flex w-full flex-col border-l-[3px] py-2 pl-3 pr-3 text-left transition-opacity hover:opacity-70',
            borderClass,
          )}
        >
          <span className="text-sm font-medium text-foreground leading-snug">{name}</span>
          <span className="mt-1 text-xs text-muted-foreground tabular-nums">
            {entry.servings} {entry.servings === 1 ? 'serving' : 'servings'} · {kcal}&thinsp;kcal
          </span>
        </button>
      )}

      <EntryDetailDialog entry={entry} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  )
}

export default memo(EntryCard)
