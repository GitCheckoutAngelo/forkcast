'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Plus, Search, SearchIcon, ShoppingBasket, X } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import FoodItemCard from './food-item-card'
import FoodItemForm, { toFormValues } from './food-item-form'
import FoodItemDetailDialog from './detail-dialog'
import AILookupDialog from './ai-lookup-dialog'
import { createFoodItem, updateFoodItem, deleteFoodItem } from '@/lib/food-items/actions'
import { SERVING_UNITS } from '@/lib/food-items/schema'
import type { FoodItemFormValues } from '@/lib/food-items/schema'
import type { FoodItem, FoodItemCandidate } from '@/types'

function DeferredMount({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <>{children}</> : null
}

function candidateToFormValues(c: FoodItemCandidate): FoodItemFormValues {
  return {
    name: c.name,
    brand: c.brand ?? '',
    serving_size: c.serving_size,
    serving_unit: c.serving_unit,
    notes: '',
    macros_per_serving: {
      calories: c.macros_per_serving.calories,
      protein_g: c.macros_per_serving.protein_g,
      carbs_g: c.macros_per_serving.carbs_g,
      fat_g: c.macros_per_serving.fat_g,
      fiber_g: c.macros_per_serving.fiber_g,
      sugar_g: c.macros_per_serving.sugar_g,
      sodium_mg: c.macros_per_serving.sodium_mg,
    },
  }
}

interface FoodItemsClientProps {
  items: FoodItem[]
}

export default function FoodItemsClient({ items }: FoodItemsClientProps) {
  const router = useRouter()

  // Dialog state — local so open/close is synchronous (no navigation round-trip).
  const [dialog, setDialog] = useState<'create' | 'detail' | 'edit' | null>(null)
  // Keep activeItem alive through close animations (don't null it on close).
  const [activeItem, setActiveItem] = useState<FoodItem | null>(null)

  const [search, setSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState('all')
  const [lookupOpen, setLookupOpen] = useState(false)
  const [createDefaultValues, setCreateDefaultValues] = useState<FoodItemFormValues | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate(defaults?: FoodItemFormValues) {
    setCreateDefaultValues(defaults ?? null)
    setDialog('create')
  }
  function openDetail(item: FoodItem) { setActiveItem(item); setDialog('detail') }
  function openEdit(item: FoodItem) { setActiveItem(item); setDialog('edit') }
  function closeDialog() { setDialog(null) }

  function handleCreateDialogChange(open: boolean) {
    if (!open) {
      closeDialog()
      setCreateDefaultValues(null)
    }
  }

  const filtered = useMemo(() => {
    let result = items
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.brand?.toLowerCase().includes(q) ?? false),
      )
    }
    if (unitFilter !== 'all') {
      result = result.filter((i) => i.serving_unit === unitFilter)
    }
    return result
  }, [items, search, unitFilter])

  const hasFilters = search !== '' || unitFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setUnitFilter('all')
  }

  function handleCreate(data: FoodItemFormValues) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await createFoodItem(data)
        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success('Food item created')
          closeDialog()
          setCreateDefaultValues(null)
          router.refresh()
        }
        resolve()
      })
    })
  }

  function handleUpdate(data: FoodItemFormValues) {
    if (!activeItem) return Promise.resolve()
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await updateFoodItem(activeItem.id, data)
        if (result.error) {
          toast.error(result.error)
        } else {
          toast.success('Food item updated')
          closeDialog()
          router.refresh()
        }
        resolve()
      })
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteFoodItem(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Food item deleted')
        closeDialog()
        router.refresh()
      }
    })
  }

  function handleCandidatePick(candidate: FoodItemCandidate) {
    setLookupOpen(false)
    openCreate(candidateToFormValues(candidate))
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Food Items</h1>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" />}>
            <Plus className="mr-1.5 size-3.5" />
            Add Food Item
            <ChevronDown className="ml-1 size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openCreate()}>
              <Plus className="size-4" />
              Enter manually
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLookupOpen(true)}>
              <SearchIcon className="size-4" />
              Look up with AI
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or brand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={unitFilter} onValueChange={(val) => setUnitFilter(val ?? 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All units</SelectItem>
            {SERVING_UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 self-center text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            Clear
          </button>
        )}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <FoodItemCard
              key={item.id}
              item={item}
              onView={() => openDetail(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <ShoppingBasket className="size-12 text-muted-foreground/30" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No food items yet</p>
            <p className="text-sm text-muted-foreground">
              Track snacks and simple foods with their macros
            </p>
          </div>
          <Button onClick={() => openCreate()}>
            <Plus className="mr-1.5 size-4" />
            Add Food Item
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-medium">No food items match your filters</p>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialog === 'create'} onOpenChange={handleCreateDialogChange}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>New Food Item</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <DeferredMount>
              <FoodItemForm
                defaultValues={createDefaultValues ?? undefined}
                onSubmit={handleCreate}
                isSubmitting={isPending}
              />
            </DeferredMount>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button
              variant="outline"
              onClick={() => handleCreateDialogChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" form="food-item-form" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <FoodItemDetailDialog
        item={activeItem}
        open={dialog === 'detail'}
        onOpenChange={(open) => !open && closeDialog()}
        onEdit={() => activeItem && openEdit(activeItem)}
        onDelete={() => activeItem && handleDelete(activeItem.id)}
      />

      {/* Edit dialog */}
      <Dialog
        open={dialog === 'edit' && !!activeItem}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <DialogTitle>Edit Food Item</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activeItem && dialog === 'edit' && (
              <DeferredMount>
                <FoodItemForm
                  defaultValues={toFormValues(activeItem)}
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
            <Button type="submit" form="food-item-form" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Lookup dialog */}
      <AILookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onPick={handleCandidatePick}
      />
    </div>
  )
}
