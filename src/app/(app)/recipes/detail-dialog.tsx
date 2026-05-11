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
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'
import { cn } from '@/lib/utils'

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

type ViewSection = 'overview' | 'ingredients' | 'instructions'

const VIEW_SECTIONS: { id: ViewSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'instructions', label: 'Instructions' },
]

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
  const [section, setSection] = useState<ViewSection>('overview')
  const [visited, setVisited] = useState<Set<ViewSection>>(new Set(['overview']))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setSection('overview')
    setVisited(new Set(['overview']))
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  function handleSectionChange(s: ViewSection) {
    setSection(s)
    setVisited((prev) => (prev.has(s) ? prev : new Set([...prev, s])))
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }))
  }

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
        className="flex h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <span tabIndex={0} className="sr-only" aria-hidden="true" />

        {/* Image */}
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-muted">
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

        {/* Title + tabs */}
        <div className="shrink-0 border-b px-6 pb-0 pt-4">
          <DialogTitle className="mb-3 pr-6 text-xl">{recipe.name}</DialogTitle>
          <div className="relative flex rounded-lg bg-muted p-1">
            <div
              className="pointer-events-none absolute inset-y-1 rounded-md bg-background shadow-sm transition-[left] duration-200 ease-in-out"
              style={{
                width: 'calc((100% - 8px) / 3)',
                left: `calc(4px + ${VIEW_SECTIONS.findIndex((s) => s.id === section)} * ((100% - 8px) / 3))`,
              }}
            />
            {VIEW_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSectionChange(s.id)}
                className={cn(
                  'relative z-10 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  section === s.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto overscroll-contain p-6 will-change-transform">

          {/* Overview */}
          <div className={cn('flex flex-col gap-5', section !== 'overview' && 'hidden')}>
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {totalTime > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {totalTime} min
                  {recipe.prep_time_min != null && recipe.cook_time_min != null && (
                    <span className="text-xs">({recipe.prep_time_min} prep · {recipe.cook_time_min} cook)</span>
                  )}
                </span>
              )}
              {recipe.servings && (
                <span>{recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}</span>
              )}
              {recipe.cuisine && <span>{recipe.cuisine}</span>}
            </div>

            {(recipe.meal_types.length > 0 || recipe.tags.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {recipe.meal_types.map((mt) => (
                  <Badge key={mt} variant="secondary">{MEAL_TYPE_LABELS[mt] ?? mt}</Badge>
                ))}
                {recipe.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
            )}

            {recipe.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
            )}

            {/* Macros panel */}
            <div className="rounded-xl border border-border bg-muted/30">
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Per serving</p>
                {recipe.macros_verified ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <ShieldCheck className="size-3" />Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <ShieldAlert className="size-3" />Estimated
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center px-4 pb-3">
                <span className="font-heading text-2xl font-semibold tabular-nums sm:text-3xl">
                  {Math.round(macros.calories)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">kcal</span>
                </span>
                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Calories</span>
              </div>
              <div className="border-b border-border/40" />
              <div className="grid grid-cols-3">
                {[
                  { label: 'Protein', value: macros.protein_g, unit: 'g' },
                  { label: 'Carbs', value: macros.carbs_g, unit: 'g' },
                  { label: 'Fat', value: macros.fat_g, unit: 'g' },
                  { label: 'Fiber', value: macros.fiber_g, unit: 'g' },
                  { label: 'Sugar', value: macros.sugar_g, unit: 'g' },
                  { label: 'Sodium', value: macros.sodium_mg, unit: 'mg' },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="flex flex-col items-center px-2 py-3">
                    {value != null ? (
                      <span className="font-heading text-base font-semibold tabular-nums">
                        {Math.round(value)}<span className="text-xs font-normal text-muted-foreground">{unit}</span>
                      </span>
                    ) : (
                      <span className="font-heading text-base font-semibold text-muted-foreground">—</span>
                    )}
                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

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

          {/* Ingredients */}
          <div className={cn('flex flex-col gap-2', section !== 'ingredients' && 'hidden')}>
            {visited.has('ingredients') && (recipe.ingredients.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {recipe.ingredients.map((ing) => (
                  <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                    <span className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-muted-foreground/40" />
                    <span>{ing.name}</span>
                    {ing.quantity != null && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {parseFloat(ing.quantity.toFixed(2))}{ing.unit ? ` ${ing.unit}` : ''}
                      </span>
                    )}
                    {ing.preparation && (
                      <span className="text-muted-foreground">, {ing.preparation}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No ingredients listed.</p>
            ))}
          </div>

          {/* Instructions */}
          <div className={cn('flex flex-col gap-3', section !== 'instructions' && 'hidden')}>
            {visited.has('instructions') && (recipe.instructions && recipe.instructions.length > 0 ? (
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
            ) : (
              <p className="text-sm text-muted-foreground">No instructions listed.</p>
            ))}
          </div>

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
