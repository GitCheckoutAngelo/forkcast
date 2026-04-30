'use client'

import { useMemo, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Recipe, FoodItem } from '@/types'

// ── Draggable card ───────────────────────────────────────────────────────────

function DraggableRecipeCard({ recipe }: { recipe: Recipe }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `recipe-${recipe.id}`,
    data: { kind: 'recipe', id: recipe.id },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex cursor-grab items-start gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-sm transition-[background-color,box-shadow] duration-150 hover:bg-muted/70 hover:shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground leading-snug">{recipe.name}</p>
        <p className="text-xs text-muted-foreground">
          {Math.round(recipe.macros_per_serving.calories)} kcal · {recipe.servings} serving
          {recipe.servings !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}

function DraggableFoodCard({ item }: { item: FoodItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `food_item-${item.id}`,
    data: { kind: 'food_item', id: item.id },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex cursor-grab items-start gap-2 rounded-xl bg-muted/30 px-3 py-2.5 text-sm transition-[background-color,box-shadow] duration-150 hover:bg-muted/70 hover:shadow-sm active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground leading-snug">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {item.brand ? `${item.brand} · ` : ''}
          {Math.round(item.macros_per_serving.calories)} kcal
        </p>
      </div>
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function RecipeSidebar({
  recipes,
  foodItems,
}: {
  recipes: Recipe[]
  foodItems: FoodItem[]
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [query, setQuery] = useState('')

  const q = query.toLowerCase()
  const filteredRecipes = useMemo(
    () => recipes.filter((r) => r.name.toLowerCase().includes(q)),
    [recipes, q]
  )
  const filteredFoodItems = useMemo(
    () => foodItems.filter((f) => f.name.toLowerCase().includes(q)),
    [foodItems, q]
  )

  return (
    <div
      className={cn(
        'hidden lg:flex shrink-0 flex-col sticky top-4 overflow-hidden border-l border-border transition-all duration-200',
        'max-h-[calc(100vh-2rem)]',
        isOpen ? 'w-64' : 'w-10'
      )}
    >
      {/* Toggle button — fills height when collapsed so icon stays vertically centred */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
          isOpen ? 'h-10 shrink-0 border-b border-border' : 'flex-1'
        )}
        title={isOpen ? 'Collapse panel' : 'Expand panel'}
      >
        {isOpen ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>

      {isOpen && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Drag to add
          </p>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Tabs defaultValue="recipes" className="flex flex-1 flex-col gap-2 overflow-hidden">
            <TabsList className="w-full self-start">
              <TabsTrigger value="recipes" className="flex-1">Recipes</TabsTrigger>
              <TabsTrigger value="food-items" className="flex-1">Food</TabsTrigger>
            </TabsList>

            <TabsContent value="recipes" className="mt-0 flex-1 overflow-y-auto">
              {filteredRecipes.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {query ? 'No matches.' : 'No recipes yet.'}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredRecipes.map((r) => (
                    <DraggableRecipeCard key={r.id} recipe={r} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="food-items" className="mt-0 flex-1 overflow-y-auto">
              {filteredFoodItems.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {query ? 'No matches.' : 'No food items yet.'}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredFoodItems.map((f) => (
                    <DraggableFoodCard key={f.id} item={f} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
