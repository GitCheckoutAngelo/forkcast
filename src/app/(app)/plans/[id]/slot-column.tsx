'use client'

import { Fragment, memo, useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import EntryCard from './entry-card'
import { addSnackSlot, removeSnackSlot } from '@/lib/meal-plans/actions'
import type { MealSlotResolved, MealSlotType } from '@/types'
import { ZERO_MACROS } from '@/lib/meal-plans/utils'
import { cn } from '@/lib/utils'

const SLOT_LABELS: Record<MealSlotType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

// A single droppable slot cell — memoized so parent SlotColumn re-renders don't cascade here
const SlotCell = memo(function SlotCell({
  slot,
  onAddClick,
  isEditMode,
}: {
  slot: MealSlotResolved
  onAddClick: (slotId: string) => void
  isEditMode: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot.id}` })

  // Track optimistically-removed entry IDs so isEmpty reflects what's actually visible,
  // not the stale server state. Both entry rendering and the "+ Add" placeholder derive
  // from visibleEntries so they update in the same render cycle.
  const [removedEntryIds, setRemovedEntryIds] = useState<Set<string>>(new Set())

  const handleEntryRemove = useCallback((id: string) => {
    setRemovedEntryIds((prev) => new Set([...prev, id]))
  }, [])

  const handleEntryRestore = useCallback((id: string) => {
    setRemovedEntryIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const visibleEntries = slot.entries.filter((e) => !removedEntryIds.has(e.id))
  const isEmpty = visibleEntries.length === 0

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[5rem] flex-col gap-1 rounded-xl p-1.5 transition-colors',
        isEditMode && isOver && 'bg-primary/5 ring-2 ring-primary/30'
      )}
    >
      {visibleEntries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          isEditMode={isEditMode}
          slotType={slot.slot_type}
          onRemove={handleEntryRemove}
          onRestoreEntry={handleEntryRestore}
        />
      ))}

      {isEditMode ? (
        isEmpty ? (
          <button
            onClick={() => onAddClick(slot.id)}
            className="flex h-full min-h-[4rem] items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        ) : (
          <button
            onClick={() => onAddClick(slot.id)}
            className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="size-3" />
            Add
          </button>
        )
      ) : (
        isEmpty && (
          <div className="flex h-full min-h-[4rem] items-center justify-center text-xs text-muted-foreground/40 select-none">
            —
          </div>
        )
      )}
    </div>
  )
})

// ── SlotColumn: renders all slots of one type (including multiple snacks) ────

function SlotColumn({
  slots,
  slotType,
  planDayId,
  onAddClick,
  isEditMode,
}: {
  slots: MealSlotResolved[]
  slotType: MealSlotType
  planDayId: string
  onAddClick: (slotId: string) => void
  isEditMode: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const slotsOfType = slots.filter((s) => s.slot_type === slotType)

  // Optimistic add — shown immediately; cleared when slots prop refreshes.
  const [optimisticSlots, setOptimisticSlots] = useState<MealSlotResolved[]>([])
  // Optimistic remove — extra snack slots hidden immediately by ID.
  const [removedSlotIds, setRemovedSlotIds] = useState<Set<string>>(new Set())

  // Detect slots identity change during render (not in an effect) so React
  // re-renders before committing — prevents the one-frame flicker where both
  // the optimistic slot and the real server slot are visible simultaneously.
  const [prevSlots, setPrevSlots] = useState(slots)
  if (slots !== prevSlots) {
    setPrevSlots(slots)
    if (optimisticSlots.length > 0) setOptimisticSlots([])
    if (removedSlotIds.size > 0) setRemovedSlotIds(new Set())
  }

  // Confirmation dialog state for slots that still have entries.
  const [confirmSlot, setConfirmSlot] = useState<MealSlotResolved | null>(null)

  function handleAddSnack() {
    const tempSlot: MealSlotResolved = {
      id: `opt-${Math.random().toString(36).slice(2)}`,
      plan_day_id: planDayId,
      slot_type: 'snack',
      position: slotsOfType.length + optimisticSlots.length + 1,
      notes: null,
      entries: [],
      total_macros: ZERO_MACROS,
    }
    setOptimisticSlots((prev) => [...prev, tempSlot])
    startTransition(async () => {
      const result = await addSnackSlot(planDayId)
      if (result.error) {
        setOptimisticSlots((prev) => prev.filter((s) => s.id !== tempSlot.id))
        toast.error(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleRemoveSnack(slotId: string) {
    setRemovedSlotIds((prev) => new Set([...prev, slotId]))
    startTransition(async () => {
      const result = await removeSnackSlot(slotId)
      if (result.error) {
        setRemovedSlotIds((prev) => {
          const next = new Set(prev)
          next.delete(slotId)
          return next
        })
        toast.error(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleRemoveClick(slot: MealSlotResolved) {
    if (slot.entries.length > 0) {
      setConfirmSlot(slot)
    } else {
      handleRemoveSnack(slot.id)
    }
  }

  // Persisted slots minus any optimistically removed ones.
  const realSlots = slotsOfType.filter((s) => !removedSlotIds.has(s.id))

  // In view mode, hide empty snack slots — but always show the last remaining one
  // so the column doesn't go blank when positions have gaps from prior deletions.
  const displayRealSlots = isEditMode
    ? realSlots
    : realSlots.filter((s) => {
        if (slotType !== 'snack') return true
        if (s.entries.length > 0) return true
        return realSlots.length === 1  // sole slot: show even if empty
      })

  // Merge real + optimistic into one array so index-based divider placement works
  // across both persisted and pending slots.
  const allSlots = [
    ...displayRealSlots.map((slot) => ({ slot, isOptimistic: false })),
    ...optimisticSlots.map((slot) => ({ slot, isOptimistic: true })),
  ]

  return (
    <div className="flex flex-col gap-1">
      <p className="px-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {SLOT_LABELS[slotType]}
      </p>

      <div className="flex flex-col">
        {allSlots.map(({ slot, isOptimistic }, index) => {
          // Hairline between consecutive snack slots — not before the first.
          const showDivider = slotType === 'snack' && index > 0
          // Any snack slot is removable when 2+ exist; the last one has no remove button.
          const canRemoveSlot = isEditMode && slotType === 'snack' && allSlots.length > 1
          // Remove button: only for persisted slots (optimistic slots can't be deleted yet).
          const showRemove = canRemoveSlot && !isOptimistic
          // h-4 spacer row present for all removable slots so layout is stable whether
          // the slot is persisted or optimistic.
          const showSpacerRow = canRemoveSlot

          return (
            <Fragment key={slot.id}>
              {showDivider && (
                <div className="my-3 ml-3 border-t border-border/60" />
              )}
              <div className={cn('flex flex-col gap-0.5', showRemove && 'group/slot')}>
                {showSpacerRow && (
                  <div className="flex h-4 items-center justify-end px-1.5">
                    {showRemove && (
                      <button
                        onClick={() => handleRemoveClick(slot)}
                        disabled={isPending}
                        aria-label="Remove snack slot"
                        className="opacity-0 transition-opacity group-hover/slot:opacity-100 focus:opacity-100 focus:outline-none text-muted-foreground/40 hover:text-destructive disabled:pointer-events-none"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                )}
                <SlotCell slot={slot} onAddClick={onAddClick} isEditMode={isEditMode} />
              </div>
            </Fragment>
          )
        })}
      </div>

      {isEditMode && slotType === 'snack' && (
        <button
          onClick={handleAddSnack}
          disabled={isPending}
          className="mt-0.5 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-3" />
          Add snack slot
        </button>
      )}

      {/* Confirmation dialog — only shown for extra snack slots that have entries */}
      <Dialog
        open={!!confirmSlot}
        onOpenChange={(open) => { if (!open) setConfirmSlot(null) }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Remove snack slot?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will also remove its{' '}
            {confirmSlot?.entries.length}{' '}
            {confirmSlot?.entries.length === 1 ? 'entry' : 'entries'}.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmSlot(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmSlot) handleRemoveSnack(confirmSlot.id)
                setConfirmSlot(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default memo(SlotColumn)
