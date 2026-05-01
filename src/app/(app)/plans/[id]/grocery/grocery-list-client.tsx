'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Beef, ChevronDown, Loader2, Leaf, Milk, Minus, Package, Pencil, Plus, RefreshCw, ShoppingCart, Snowflake, Sparkles, Tag, Wheat, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { toggleGroceryItem, updateGroceryItem, addCustomGroceryItem } from '@/lib/grocery-lists/actions'
import type { GroceryItem, GroceryList, MealPlan } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['produce', 'protein', 'dairy', 'bakery', 'pantry', 'frozen', 'other', null]
const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce', protein: 'Protein', dairy: 'Dairy',
  bakery: 'Bakery', pantry: 'Pantry', frozen: 'Frozen', other: 'Other',
}
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  produce: Leaf,
  protein: Beef,
  dairy:   Milk,
  bakery:  Wheat,
  pantry:  Package,
  frozen:  Snowflake,
  other:   Tag,
}


// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
  }
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

function formatTripSubtitle(start: string, end: string) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const days = start === end ? DAY_NAMES[s.getDay()] : `${DAY_NAMES[s.getDay()]}–${DAY_NAMES[e.getDay()]}`
  const dates = start === end
    ? `${MONTHS[s.getMonth()]} ${s.getDate()}`
    : s.getMonth() === e.getMonth()
    ? `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
    : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`
  return `${days} · ${dates}`
}

function defaultPlanName(start: string) {
  const d = new Date(start + 'T00:00:00')
  return `Week of ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// ── Grouping ─────────────────────────────────────────────────────────────────

function groupByCategory(items: GroceryItem[]) {
  const map = new Map<string | null, GroceryItem[]>()
  for (const item of items) {
    const key = item.category?.toLowerCase() ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }))
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  listId,
  muted = false,
  onToggle,
  onUpdate,
}: {
  item: GroceryItem
  listId: string
  muted?: boolean
  onToggle: (id: string, checked: boolean) => void
  onUpdate: (id: string, fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>>) => void
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: item.name, quantity_text: item.quantity_text, notes: item.notes ?? '' })
  const nameRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft({ name: item.name, quantity_text: item.quantity_text, notes: item.notes ?? '' })
    setEditing(true)
    setSourcesOpen(false)
    setTimeout(() => nameRef.current?.select(), 0)
  }

  function commitEdit() {
    setEditing(false)
    const fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>> = {
      name: draft.name.trim() || item.name,
      quantity_text: draft.quantity_text.trim(),
      notes: draft.notes.trim() || null,
    }
    const changed = fields.name !== item.name || fields.quantity_text !== item.quantity_text || fields.notes !== item.notes
    if (!changed) return
    onUpdate(item.id, fields)
    updateGroceryItem(listId, item.id, fields).then((r) => {
      if (r.error) toast.error(r.error)
    })
  }

  const hasNotes = Boolean(item.notes && !editing)

  return (
    <div className={cn(muted && 'opacity-60')}>
      <div className="flex items-center gap-1">
        {/* 44×44 checkbox touch target */}
        <div className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
          <Checkbox
            checked={item.checked}
            onCheckedChange={(v) => onToggle(item.id, v === true)}
            aria-label={`Mark ${item.name} ${item.checked ? 'unchecked' : 'checked'}`}
          />
        </div>

        {editing ? (
          <div className="flex flex-1 flex-col gap-1.5 py-1.5 pr-1">
            <input
              ref={nameRef}
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Item name"
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={draft.quantity_text}
              onChange={(e) => setDraft((p) => ({ ...p, quantity_text: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Quantity"
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              onBlur={commitEdit}
              placeholder="Notes (optional)"
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : (
          <button
            onClick={() => item.sources.length > 0 && setSourcesOpen((v) => !v)}
            className={cn(
              'flex flex-1 items-baseline gap-2 py-1.5 text-left min-w-0',
              item.sources.length > 0 ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            <span className={cn(
              'truncate text-sm',
              item.checked && 'text-muted-foreground line-through',
            )}>
              {item.name}
            </span>
            {item.quantity_text && (
              <span className={cn(
                'shrink-0 text-xs text-muted-foreground tabular-nums',
                item.checked && 'line-through',
              )}>
                {item.quantity_text}
              </span>
            )}
          </button>
        )}

        {!editing && (
          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            {item.sources.length > 0 && (
              <button
                onClick={() => setSourcesOpen((v) => !v)}
                className="flex size-7 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground"
                aria-label="Toggle sources"
              >
                <ChevronDown className={cn('size-3 transition-transform', sourcesOpen && 'rotate-180')} />
              </button>
            )}
            <button
              onClick={startEdit}
              className="flex size-7 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground group-has-[div:hover]/list:opacity-0 hover:!opacity-100 focus-visible:opacity-100"
              aria-label="Edit item"
            >
              <Pencil className="size-3" />
            </button>
          </div>
        )}
      </div>

      {sourcesOpen && !editing && item.sources.length > 0 && (
        <p className="pb-1 pl-[52px] pr-2 text-xs leading-relaxed text-muted-foreground">
          {item.sources.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-muted-foreground/40">·</span>}
              <span className="font-medium">{s.name}</span>
              {s.contribution && <span className="text-muted-foreground/70"> {s.contribution}</span>}
            </span>
          ))}
        </p>
      )}

      {hasNotes && (
        <p className="pb-1 pl-[52px] text-xs italic text-muted-foreground/70">{item.notes}</p>
      )}
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  category, items, listId, onToggle, onUpdate,
}: {
  category: string | null
  items: GroceryItem[]
  listId: string
  onToggle: (id: string, checked: boolean) => void
  onUpdate: (id: string, fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>>) => void
}) {
  const key = category?.toLowerCase() ?? 'other'
  const Icon = CATEGORY_ICONS[key] ?? Tag

  return (
    <div>
      <p className="flex items-center gap-1.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" />
        {category ? (CATEGORY_LABELS[category] ?? category) : 'Other'}
      </p>
      <div className="divide-y divide-border/50 group/list">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} listId={listId} onToggle={onToggle} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  )
}

// ── Pantry staples section ────────────────────────────────────────────────────

function PantryStaplesSection({
  items, listId, onToggle, onUpdate,
}: {
  items: GroceryItem[]
  listId: string
  onToggle: (id: string, checked: boolean) => void
  onUpdate: (id: string, fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>>) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-border/50 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3.5 text-muted-foreground/60 transition-transform', open && 'rotate-180')} />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          Pantry staples ({items.length})
        </span>
      </button>

      {open && (
        <div className="mt-2 group/list">
          <div className="divide-y divide-border/30">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} listId={listId} muted onToggle={onToggle} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add custom item ───────────────────────────────────────────────────────────

function AddCustomItemForm({ listId, onAdd, onCancel }: {
  listId: string
  onAdd: (item: GroceryItem) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const optimistic: GroceryItem = {
        id: crypto.randomUUID(),
        name: trimmed,
        quantity_text: qty.trim(),
        category: null,
        checked: false,
        is_pantry_staple: false,
        sources: [],
        notes: null,
      }
      onAdd(optimistic)
      const result = await addCustomGroceryItem(listId, { name: trimmed, quantity_text: qty.trim(), notes: null })
      if (result.error) toast.error(result.error)
    })
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex min-w-[44px] shrink-0" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Item name"
        autoFocus
        className="w-36 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Qty"
        className="w-24 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button size="sm" onClick={submit} disabled={!name.trim() || isPending}>
        {isPending ? <Loader2 className="size-3 animate-spin" /> : 'Add'}
      </Button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  )
}

// ── Regenerate dialog ─────────────────────────────────────────────────────────

function RegenerateDialog({ open, onOpenChange, onConfirm, isPending }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate grocery list?</DialogTitle>
          <DialogDescription>
            This will replace the current list and lose any custom items or notes you&apos;ve added.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Empty / loading states ────────────────────────────────────────────────────

function GeneratingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Generating grocery list…</p>
        <p className="text-xs text-muted-foreground">Usually takes 5–15 seconds</p>
      </div>
    </div>
  )
}

function EmptyState({ onGenerate, hasEntries, planId }: {
  onGenerate: () => void
  hasEntries: boolean
  planId: string
}) {
  if (!hasEntries) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="rounded-full bg-muted p-4">
          <ShoppingCart className="size-8 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-lg font-medium">No meals planned</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Add meals to your plan for this period before generating a grocery list.
          </p>
        </div>
        <Link
          href={`/plans/${planId}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Go to plan
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <ShoppingCart className="size-8 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-heading text-lg font-medium">No grocery list yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Claude will group and aggregate ingredients from this trip&apos;s meals automatically.
        </p>
      </div>
      <Button onClick={onGenerate}>Generate grocery list</Button>
    </div>
  )
}

// ── Trip tab selector ─────────────────────────────────────────────────────────

function TripTabs({
  trips,
  activeId,
  onSelect,
}: {
  trips: GroceryList[]
  activeId: string | null
  onSelect: (tripId: string) => void
}) {
  if (trips.length <= 1) return null

  return (
    <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
      {trips.map((trip, i) => {
        const isActive = trip.id === activeId
        const label = trip.name ?? `Trip ${i + 1}` // i kept for label numbering
        return (
          <button
            key={trip.id}
            onClick={() => onSelect(trip.id)}
            className={cn(
              'flex flex-1 flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors',
              isActive
                ? 'border-primary/30 bg-primary/10'
                : 'border-border hover:border-border/80 hover:bg-muted',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">{label}</span>
              {/* Fixed-size slot keeps tab width consistent across all states */}
              <span className="size-3 shrink-0 inline-flex items-center justify-center">
                {trip.items.length === 0 ? (
                  trip.has_entries === false
                    ? <Minus className="size-2.5 text-muted-foreground/40" />
                    : <Sparkles className="size-3 text-primary/50" />
                ) : trip.is_stale ? (
                  <RefreshCw className="size-2.5 text-foreground/40" />
                ) : null}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatTripSubtitle(trip.start_date, trip.end_date)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Trip list skeleton ────────────────────────────────────────────────────────

function TripListSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 pt-2">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-28 rounded bg-muted" />
          <div className="h-3 w-40 rounded bg-muted/60" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-lg bg-muted" />
          <div className="h-8 w-24 rounded-lg bg-muted" />
        </div>
      </div>
      {/* Category rows */}
      {[4, 3, 2].map((count, gi) => (
        <div key={gi} className="flex flex-col gap-0">
          <div className="mb-1 h-3 w-16 rounded bg-muted/50" />
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <div className="size-5 shrink-0 rounded bg-muted" />
              <div className="h-3.5 rounded bg-muted" style={{ width: `${45 + (i * 17) % 35}%` }} />
              <div className="ml-auto h-3 w-10 rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Per-trip list view ────────────────────────────────────────────────────────

function TripListView({
  plan,
  trip,
  autoGenerate = false,
}: {
  plan: Pick<MealPlan, 'id' | 'name' | 'start_date' | 'end_date'>
  trip: GroceryList
  autoGenerate?: boolean
}) {
  const router = useRouter()
  const [list, setList] = useState<GroceryList>(trip)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showRegenDialog, setShowRegenDialog] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [hideChecked, setHideChecked] = useState(false)

  const generate = useCallback(async () => {
    setIsGenerating(true)
    try {
      const res = await fetch('/api/grocery-lists/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal_plan_id: plan.id,
          start_date: trip.start_date,
          end_date: trip.end_date,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Generation failed'); return }
      setList(data as GroceryList)
      router.refresh()
    } catch {
      toast.error('Generation failed — please try again')
    } finally {
      setIsGenerating(false)
    }
  }, [plan.id, trip.start_date, trip.end_date, router])

  // Auto-generate when arriving from the plan page with an empty list
  useEffect(() => {
    if (autoGenerate && list.items.length === 0) generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = useCallback((itemId: string, checked: boolean) => {
    setList((prev) => ({
      ...prev,
      items: prev.items.map((i) => i.id === itemId ? { ...i, checked } : i),
    }))
    toggleGroceryItem(list.id, itemId, checked).then((r) => {
      if (r.error) toast.error(r.error)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.id])

  const handleUpdate = useCallback((itemId: string, fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>>) => {
    setList((prev) => ({
      ...prev,
      items: prev.items.map((i) => i.id === itemId ? { ...i, ...fields } : i),
    }))
  }, [])

  const handleAddCustom = useCallback((item: GroceryItem) => {
    setList((prev) => ({ ...prev, items: [...prev.items, item] }))
    setShowAddForm(false)
  }, [])

  const regularItems  = list.items.filter((i) => !(i.is_pantry_staple ?? false))
  const pantryItems   = list.items.filter((i) => i.is_pantry_staple ?? false)
  const visibleRegular = hideChecked ? regularItems.filter((i) => !i.checked) : regularItems
  const visiblePantry  = hideChecked ? pantryItems.filter((i) => !i.checked) : pantryItems
  const groups = groupByCategory(visibleRegular)
  const checkedCount = regularItems.filter((i) => i.checked).length
  const totalCount   = regularItems.length

  return (
    <div className="flex flex-col gap-3">
      {/* Sub-header: generated at + controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {formatTripSubtitle(trip.start_date, trip.end_date)}
          </p>
          {list.items.length > 0 && (
            <p className="text-xs text-muted-foreground/60">
              Generated {formatTimestamp(list.generated_at)}
              {totalCount > 0 && ` · ${checkedCount}/${totalCount} checked`}
            </p>
          )}
        </div>

        {list.items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant={hideChecked ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setHideChecked((v) => !v)}
            >
              {hideChecked ? `Show checked (${checkedCount})` : 'Hide checked'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRegenDialog(true)} disabled={isGenerating}>
              <RefreshCw className="size-3.5" />
              Regenerate
            </Button>
          </div>
        )}
      </div>

      {/* Stale banner — shown when the meal plan changed after generation */}
      {list.is_stale && !isGenerating && list.items.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2.5">
          <RefreshCw className="size-3.5 shrink-0 text-foreground/50" />
          <p className="flex-1 text-sm text-foreground/70">
            Your meal plan has changed since this list was generated.
          </p>
          <button
            onClick={() => setShowRegenDialog(true)}
            className="shrink-0 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Regenerate
          </button>
        </div>
      )}

      {/* Body */}
      {isGenerating ? (
        <GeneratingState />
      ) : list.items.length === 0 ? (
        <EmptyState onGenerate={generate} hasEntries={trip.has_entries ?? true} planId={plan.id} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ category, items }) => (
            <CategorySection
              key={category ?? '__other'}
              category={category}
              items={items}
              listId={list.id}
              onToggle={handleToggle}
              onUpdate={handleUpdate}
            />
          ))}

          <div className="pt-1">
            {showAddForm ? (
              <AddCustomItemForm
                listId={list.id}
                onAdd={handleAddCustom}
                onCancel={() => setShowAddForm(false)}
              />
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 pl-[44px] text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-3.5" />
                Add custom item
              </button>
            )}
          </div>

          {visiblePantry.length > 0 && (
            <PantryStaplesSection
              items={visiblePantry}
              listId={list.id}
              onToggle={handleToggle}
              onUpdate={handleUpdate}
            />
          )}
        </div>
      )}

      <RegenerateDialog
        open={showRegenDialog}
        onOpenChange={setShowRegenDialog}
        onConfirm={() => { setShowRegenDialog(false); generate() }}
        isPending={isGenerating}
      />
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export default function GroceryListClient({
  plan,
  trips,
  selectedTrip,
  autoGenerate = false,
}: {
  plan: Pick<MealPlan, 'id' | 'name' | 'start_date' | 'end_date'>
  trips: GroceryList[]
  selectedTrip: GroceryList | null
  autoGenerate?: boolean
}) {
  const router = useRouter()
  const planName = plan.name ?? defaultPlanName(plan.start_date)

  // ── Responsive tab switching ──────────────────────────────────────────────
  // Tabs update synchronously on click; content area shows a skeleton if the
  // server round-trip takes >150 ms (same pattern as the view/edit toggle).

  const [isTripPending, startTripTransition] = useTransition()
  const [optimisticTripId, setOptimisticTripId] = useState<string | null>(
    selectedTrip?.id ?? null
  )
  const [showSkeleton, setShowSkeleton] = useState(false)

  useEffect(() => {
    if (!isTripPending) { setShowSkeleton(false); return }
    const id = setTimeout(() => setShowSkeleton(true), 150)
    return () => clearTimeout(id)
  }, [isTripPending])

  // During a transition use the optimistic value so the clicked tab highlights
  // immediately. After landing, revert to the server-resolved truth so browser
  // back/forward works without extra syncing.
  const activeTripId = isTripPending ? optimisticTripId : (selectedTrip?.id ?? null)

  function handleSelectTrip(tripId: string) {
    setOptimisticTripId(tripId)
    startTripTransition(() => {
      router.push(`/plans/${plan.id}/grocery?trip=${tripId}`, { scroll: false })
    })
  }

  // ── Generate all ──────────────────────────────────────────────────────────

  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const emptyTrips = trips.filter((t) => t.items.length === 0)

  async function generateAll() {
    setIsGeneratingAll(true)
    try {
      await Promise.all(
        emptyTrips.map((trip) =>
          fetch('/api/grocery-lists/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meal_plan_id: plan.id,
              start_date: trip.start_date,
              end_date: trip.end_date,
            }),
          })
        )
      )
      // Navigate to refresh server data; land on the currently active trip
      router.push(`/plans/${plan.id}/grocery?trip=${activeTripId ?? selectedTrip?.id ?? ''}`)
    } catch {
      toast.error('Generation failed — please try again')
    } finally {
      setIsGeneratingAll(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[660px] flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2 px-1">
        <Link
          href={`/plans/${plan.id}`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {planName}
        </Link>

        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-2xl font-medium tracking-tight">Grocery list</h1>
          <p className="text-sm text-muted-foreground">{formatDateRange(plan.start_date, plan.end_date)}</p>
        </div>
      </div>

      {/* Trip selector tabs + generate-all — only shown when there are 2+ trips */}
      {trips.length > 1 && (
        <div className="flex items-center gap-3 px-1">
          <TripTabs trips={trips} activeId={activeTripId} onSelect={handleSelectTrip} />
          {emptyTrips.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateAll}
              disabled={isGeneratingAll}
              className="shrink-0"
            >
              {isGeneratingAll
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Sparkles className="size-3.5" />
              }
              Generate all
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="px-1">
        {!selectedTrip ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="rounded-full bg-muted p-4">
              <ShoppingCart className="size-8 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-heading text-lg font-medium">No grocery list yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Use the trip strip on the plan editor to generate a list.
              </p>
            </div>
            <Link
              href={`/plans/${plan.id}`}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Back to plan
            </Link>
          </div>
        ) : showSkeleton ? (
          <TripListSkeleton />
        ) : (
          <TripListView key={selectedTrip.id} plan={plan} trip={selectedTrip} autoGenerate={autoGenerate} />
        )}
      </div>
    </div>
  )
}
