'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Link, Plus, Search, SearchIcon, UtensilsCrossed, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import RecipeCard from './recipe-card'
import RecipeForm, { toFormValues } from './recipe-form'
import DetailDialog from './detail-dialog'
import { UrlImportDialog, SearchImportDialog, ImportWalkthrough } from './import-dialogs'
import type { WalkthroughItem } from './import-dialogs'
import { createRecipe, updateRecipe, deleteRecipe } from '@/lib/recipes/actions'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'
import type { RecipeFormValues } from '@/lib/recipes/schema'
import { cn } from '@/lib/utils'

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function DeferredMount({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <>{children}</> : null
}

interface RecipesClientProps {
  recipes: RecipeWithIngredients[]
}

export default function RecipesClient({ recipes }: RecipesClientProps) {
  const router = useRouter()

  // Dialog state — local so open/close is synchronous (no navigation round-trip).
  const [dialog, setDialog] = useState<'create' | 'detail' | 'edit' | null>(null)
  // Keep activeRecipe alive through close animations (don't null it on close).
  const [activeRecipe, setActiveRecipe] = useState<RecipeWithIngredients | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [cuisineFilter, setCuisineFilter] = useState('')
  const [mealTypeFilter, setMealTypeFilter] = useState<string[]>([])
  const [tagFilter, setTagFilter] = useState('')

  // Import dialog state
  const [importMode, setImportMode] = useState<'url' | 'search' | null>(null)
  const [walkthroughItems, setWalkthroughItems] = useState<WalkthroughItem[] | null>(null)

  const [isPending, startTransition] = useTransition()

  // Dialog helpers
  function openCreate() { setDialog('create') }
  function openDetail(recipe: RecipeWithIngredients) { setActiveRecipe(recipe); setDialog('detail') }
  function openEdit(recipe: RecipeWithIngredients) { setActiveRecipe(recipe); setDialog('edit') }
  function closeDialog() { setDialog(null) }

  // Filtered recipes
  const filtered = useMemo(() => {
    let result = recipes
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false),
      )
    }
    if (cuisineFilter) {
      const q = cuisineFilter.toLowerCase()
      result = result.filter((r) => r.cuisine?.toLowerCase().includes(q) ?? false)
    }
    if (mealTypeFilter.length > 0) {
      result = result.filter((r) =>
        mealTypeFilter.every((mt) => (r.meal_types as string[]).includes(mt)),
      )
    }
    if (tagFilter) {
      const q = tagFilter.toLowerCase()
      result = result.filter((r) => r.tags.some((t) => t.toLowerCase().includes(q)))
    }
    return result
  }, [recipes, search, cuisineFilter, mealTypeFilter, tagFilter])

  const hasFilters = !!(search || cuisineFilter || mealTypeFilter.length > 0 || tagFilter)

  function clearFilters() {
    setSearch('')
    setCuisineFilter('')
    setMealTypeFilter([])
    setTagFilter('')
  }

  function toggleMealTypeFilter(mt: string) {
    setMealTypeFilter((prev) =>
      prev.includes(mt) ? prev.filter((x) => x !== mt) : [...prev, mt],
    )
  }

  // Server action handlers — close dialog immediately, then refresh data in background.
  function handleCreate(data: RecipeFormValues) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await createRecipe(data)
        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success('Recipe created')
          closeDialog()
          router.refresh()
        }
        resolve()
      })
    })
  }

  function handleUpdate(data: RecipeFormValues) {
    if (!activeRecipe) return Promise.resolve()
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await updateRecipe(activeRecipe.id, data)
        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success('Recipe updated')
          closeDialog()
          router.refresh()
        }
        resolve()
      })
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteRecipe(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Recipe deleted')
        closeDialog()
        router.refresh()
      }
    })
  }


  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Recipes</h1>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 size-3.5" />
            Add Recipe
            <ChevronDown className="ml-1 size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openCreate}>
              <Plus className="size-4" />
              Enter manually
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setImportMode('url')}>
              <Link className="size-4" />
              Paste a URL
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportMode('search')}>
              <SearchIcon className="size-4" />
              Search with AI
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search recipes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Input
            placeholder="Cuisine…"
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            className="w-32"
          />
          <Input
            placeholder="Tag…"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="w-28"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mt) => (
            <button
              key={mt}
              type="button"
              onClick={() => toggleMealTypeFilter(mt)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                mealTypeFilter.includes(mt)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:border-foreground hover:text-foreground',
              )}
            >
              {MEAL_TYPE_LABELS[mt]}
            </button>
          ))}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Recipe grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onView={() => openDetail(recipe)}
              onEdit={() => openEdit(recipe)}
              onDelete={() => handleDelete(recipe.id)}
            />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <UtensilsCrossed className="size-12 text-muted-foreground/30" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No recipes yet</p>
            <p className="text-sm text-muted-foreground">Add your first recipe to get started</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 size-4" />
            Add Recipe
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium">No recipes match your filters</p>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialog === 'create'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>New Recipe</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <DeferredMount>
              <RecipeForm onSubmit={handleCreate} isSubmitting={isPending} />
            </DeferredMount>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" form="recipe-form" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Recipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <DetailDialog
        recipe={activeRecipe}
        open={dialog === 'detail'}
        onOpenChange={(open) => !open && closeDialog()}
        onEdit={() => activeRecipe && openEdit(activeRecipe)}
        onDelete={() => activeRecipe && handleDelete(activeRecipe.id)}
      />

      {/* Edit dialog */}
      <Dialog
        open={dialog === 'edit' && !!activeRecipe}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Edit Recipe</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activeRecipe && dialog === 'edit' && (
              <DeferredMount>
                <RecipeForm
                  defaultValues={toFormValues(activeRecipe)}
                  onSubmit={handleUpdate}
                  isSubmitting={isPending}
                />
              </DeferredMount>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" form="recipe-form" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import: URL paste */}
      <UrlImportDialog
        open={importMode === 'url'}
        onOpenChange={(open) => !open && setImportMode(null)}
        onExtracted={(candidate) => {
          setImportMode(null)
          setWalkthroughItems([{ type: 'ready', label: candidate.name, candidate }])
        }}
      />

      {/* Import: web search */}
      <SearchImportDialog
        open={importMode === 'search'}
        onOpenChange={(open) => !open && setImportMode(null)}
        onItems={(items) => {
          setImportMode(null)
          setWalkthroughItems(items)
        }}
      />

      {/* Import walkthrough */}
      {walkthroughItems && (
        <ImportWalkthrough
          items={walkthroughItems}
          open={!!walkthroughItems}
          onOpenChange={(open) => { if (!open) setWalkthroughItems(null) }}
          onComplete={(count) => {
            setWalkthroughItems(null)
            if (count > 0) toast.success(`${count} ${count === 1 ? 'recipe' : 'recipes'} saved`)
          }}
        />
      )}
    </div>
  )
}
