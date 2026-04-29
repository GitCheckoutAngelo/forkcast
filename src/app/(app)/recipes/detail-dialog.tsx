'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Clock,
  ExternalLink,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

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

interface DetailDialogProps {
  recipe: RecipeWithIngredients | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export default function DetailDialog({
  recipe,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: DetailDialogProps) {
  const [imgError, setImgError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  if (!recipe) return null

  const totalTime = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)
  const macros = recipe.macros_per_serving

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {/* Focus absorber — Base UI's trap targets the first focusable element in DOM
            order. Without this, it lands on the source link at the bottom and scrolls there. */}
        <span tabIndex={0} className="sr-only" aria-hidden="true" />

        {/* Image */}
        <div className="relative h-52 w-full shrink-0 overflow-hidden bg-muted">
          {recipe.image_url && !imgError ? (
            <img
              src={recipe.image_url}
              alt={recipe.name}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UtensilsCrossed className="size-12 text-muted-foreground/20" />
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="pr-6 text-xl">{recipe.name}</DialogTitle>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {totalTime > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {totalTime} min
                  {recipe.prep_time_min != null && recipe.cook_time_min != null && (
                    <span className="text-xs">
                      ({recipe.prep_time_min} prep · {recipe.cook_time_min} cook)
                    </span>
                  )}
                </span>
              )}
              {recipe.servings && (
                <span>{recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}</span>
              )}
              {recipe.cuisine && <span>{recipe.cuisine}</span>}
            </div>

            {/* Meal types + tags */}
            {(recipe.meal_types.length > 0 || recipe.tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {recipe.meal_types.map((mt) => (
                  <Badge key={mt} variant="secondary">
                    {MEAL_TYPE_LABELS[mt] ?? mt}
                  </Badge>
                ))}
                {recipe.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </DialogHeader>

          {/* Description */}
          {recipe.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
          )}

          {/* Macros panel */}
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Per serving
              </p>
              {recipe.macros_verified ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <ShieldCheck className="size-3" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <ShieldAlert className="size-3" />
                  Estimated
                </span>
              )}
            </div>
            <div className="flex flex-wrap justify-around gap-4">
              <MacroRow label="Calories" value={macros.calories} unit="kcal" />
              <MacroRow label="Protein" value={macros.protein_g} unit="g" />
              <MacroRow label="Carbs" value={macros.carbs_g} unit="g" />
              <MacroRow label="Fat" value={macros.fat_g} unit="g" />
              {macros.fiber_g != null && <MacroRow label="Fiber" value={macros.fiber_g} unit="g" />}
              {macros.sugar_g != null && <MacroRow label="Sugar" value={macros.sugar_g} unit="g" />}
              {macros.sodium_mg != null && (
                <MacroRow label="Sodium" value={macros.sodium_mg} unit="mg" />
              )}
            </div>
          </div>

          {/* Ingredients */}
          {recipe.ingredients.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">Ingredients</h4>
              <ul className="flex flex-col gap-1.5">
                {recipe.ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                    <span className="w-1.5 shrink-0 rounded-full bg-muted-foreground/40 self-center h-1.5" />
                    <span>{ing.name}</span>
                    {ing.quantity != null && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {ing.quantity}
                        {ing.unit ? ` ${ing.unit}` : ''}
                      </span>
                    )}
                    {ing.preparation && (
                      <span className="text-muted-foreground">, {ing.preparation}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          {/* Instructions */}
          {recipe.instructions && recipe.instructions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">Instructions</h4>
              <ol className="flex flex-col gap-3">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <p className="leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Source */}
          {recipe.source?.url && (
            <a
              href={recipe.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {recipe.source.site_name ?? 'View source'}
            </a>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="mx-0 mb-0 shrink-0">
          {confirmDelete ? (
            <>
              <p className="flex-1 self-center text-sm text-destructive">
                Delete &ldquo;{recipe.name}&rdquo;? This cannot be undone.
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
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
              >
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
