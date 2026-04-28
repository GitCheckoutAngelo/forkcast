'use client'

import { useState } from 'react'
import { Clock, MoreHorizontal, Pencil, Trash2, UtensilsCrossed } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'
import { cn } from '@/lib/utils'

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

interface RecipeCardProps {
  recipe: RecipeWithIngredients
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function RecipeCard({ recipe, onView, onEdit, onDelete }: RecipeCardProps) {
  const [imgError, setImgError] = useState(false)
  const totalTime =
    (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)

  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Image */}
      <div className="relative h-44 w-full shrink-0 overflow-hidden bg-muted">
        {recipe.image_url && !imgError ? (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="size-10 text-muted-foreground/30" />
          </div>
        )}

        {/* Three-dot menu */}
        <div
          className="absolute top-2 right-2"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="bg-background/80 backdrop-blur-sm hover:bg-background"
                />
              }
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Recipe options</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 size-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-heading text-base font-semibold leading-snug text-foreground">
          {recipe.name}
        </h3>

        {recipe.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {recipe.description}
          </p>
        )}

        {/* Badges: meal_types */}
        {recipe.meal_types.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.meal_types.map((mt) => (
              <Badge key={mt} variant="secondary" className="h-4 text-[10px]">
                {MEAL_TYPE_LABELS[mt] ?? mt}
              </Badge>
            ))}
          </div>
        )}

        {/* Tags (top 3) */}
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="h-4 text-[10px]">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{recipe.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Time */}
        {totalTime > 0 && (
          <div className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{totalTime} min</span>
            {recipe.prep_time_min != null && recipe.cook_time_min != null && (
              <span className="text-muted-foreground/60">
                ({recipe.prep_time_min} prep · {recipe.cook_time_min} cook)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
