'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { FoodItem } from '@/types'

interface MacroRowProps {
  label: string
  value: number | undefined
  unit: string
}

function MacroRow({ label, value, unit }: MacroRowProps) {
  if (value == null) return null
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base font-semibold tabular-nums">
        {Math.round(value)}
        <span className="text-xs font-normal text-muted-foreground">{unit}</span>
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

interface FoodItemDetailDialogProps {
  item: FoodItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export default function FoodItemDetailDialog({
  item,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: FoodItemDetailDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete()
  }

  function handleOpenChange(next: boolean) {
    if (!next) setConfirmDelete(false)
    onOpenChange(next)
  }

  if (!item) return null

  const macros = item.macros_per_serving

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <span tabIndex={0} className="sr-only" aria-hidden="true" />

        <div ref={scrollRef} className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">{item.name}</DialogTitle>
            {item.brand && (
              <p className="text-sm text-muted-foreground">{item.brand}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {item.serving_size} {item.serving_unit} per serving
            </p>
          </DialogHeader>

          {/* Macros panel */}
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Per serving
            </p>
            <div className="flex flex-wrap justify-around gap-4">
              <MacroRow label="Calories" value={macros.calories} unit="kcal" />
              <MacroRow label="Protein" value={macros.protein_g} unit="g" />
              <MacroRow label="Carbs" value={macros.carbs_g} unit="g" />
              <MacroRow label="Fat" value={macros.fat_g} unit="g" />
              {macros.fiber_g != null && (
                <MacroRow label="Fiber" value={macros.fiber_g} unit="g" />
              )}
              {macros.sugar_g != null && (
                <MacroRow label="Sugar" value={macros.sugar_g} unit="g" />
              )}
              {macros.sodium_mg != null && (
                <MacroRow label="Sodium" value={macros.sodium_mg} unit="mg" />
              )}
            </div>
          </div>

          {item.notes && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <h4 className="text-sm font-medium">Notes</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.notes}</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0">
          {confirmDelete ? (
            <>
              <p className="flex-1 self-center text-sm text-destructive">
                Delete &ldquo;{item.name}&rdquo;? This cannot be undone.
              </p>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Confirm Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-1.5 size-3.5" />
                Delete
              </Button>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="mr-1.5 size-3.5" />
                Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
