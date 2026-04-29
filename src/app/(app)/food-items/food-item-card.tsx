'use client'

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { FoodItem } from '@/types'

interface FoodItemCardProps {
  item: FoodItem
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

export default function FoodItemCard({ item, onView, onEdit, onDelete }: FoodItemCardProps) {
  const macros = item.macros_per_serving

  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Three-dot menu */}
      <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              />
            }
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Options</span>
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

      {/* Name + brand */}
      <h3 className="line-clamp-1 pr-8 font-heading text-base font-semibold leading-snug text-foreground">
        {item.name}
      </h3>
      {item.brand && (
        <p className="mt-0.5 text-xs text-muted-foreground">{item.brand}</p>
      )}

      {/* Serving */}
      <p className="mt-2 text-xs text-muted-foreground">
        {item.serving_size} {item.serving_unit} per serving
      </p>

      {/* Macros */}
      <div className="mt-3 flex items-end gap-3">
        <div className="leading-none">
          <span className="text-xl font-semibold tabular-nums">
            {Math.round(macros.calories)}
          </span>
          <span className="ml-0.5 text-xs text-muted-foreground">kcal</span>
        </div>
        <div className="flex gap-2 pb-0.5 text-xs text-muted-foreground">
          <span>{Math.round(macros.protein_g)}g P</span>
          <span>{Math.round(macros.carbs_g)}g C</span>
          <span>{Math.round(macros.fat_g)}g F</span>
        </div>
      </div>
    </div>
  )
}
