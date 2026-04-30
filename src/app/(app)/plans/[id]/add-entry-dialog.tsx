'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import type { MealEntryResolved, Recipe, FoodItem } from '@/types'

// ── Shared item list ──────────────────────────────────────────────────────────

function ItemRow({
  name,
  sub,
  kcal,
  onClick,
}: {
  name: string
  sub?: string
  kcal: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{name}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{Math.round(kcal)} kcal</span>
    </button>
  )
}

// ── Picker content ───────────────────────────────────────────────────────────

function PickerContent({
  recipes,
  foodItems,
  onAdd,
}: {
  recipes: Recipe[]
  foodItems: FoodItem[]
  onAdd: (consumable: MealEntryResolved['consumable']) => void
}) {
  const [query, setQuery] = useState('')

  const q = query.toLowerCase()
  const filteredRecipes = recipes.filter((r) => r.name.toLowerCase().includes(q))
  const filteredFoodItems = foodItems.filter((f) => f.name.toLowerCase().includes(q))

  return (
    <Tabs defaultValue="recipes" className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="relative px-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <TabsList className="mx-1 w-auto self-start">
        <TabsTrigger value="recipes">Recipes</TabsTrigger>
        <TabsTrigger value="food-items">Food items</TabsTrigger>
      </TabsList>

      <TabsContent value="recipes" className="mt-0 flex-1 overflow-y-auto">
        {filteredRecipes.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query ? 'No recipes match.' : 'No recipes yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5 px-1 pb-2">
            {filteredRecipes.map((r) => (
              <ItemRow
                key={r.id}
                name={r.name}
                sub={[r.cuisine, r.meal_types.join(', ')].filter(Boolean).join(' · ')}
                kcal={r.macros_per_serving.calories}
                onClick={() => onAdd({ kind: 'recipe', recipe: r })}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="food-items" className="mt-0 flex-1 overflow-y-auto">
        {filteredFoodItems.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query ? 'No food items match.' : 'No food items yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5 px-1 pb-2">
            {filteredFoodItems.map((f) => (
              <ItemRow
                key={f.id}
                name={f.name}
                sub={f.brand ?? undefined}
                kcal={f.macros_per_serving.calories}
                onClick={() => onAdd({ kind: 'food_item', food_item: f })}
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function AddEntryDialog({
  open,
  onOpenChange,
  onAdd,
  recipes,
  foodItems,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdd: (consumable: MealEntryResolved['consumable']) => void
  recipes: Recipe[]
  foodItems: FoodItem[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-3 h-[80vh] sm:h-[32rem] sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add to slot</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          <PickerContent
            recipes={recipes}
            foodItems={foodItems}
            onAdd={onAdd}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
