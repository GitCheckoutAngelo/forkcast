'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  Clock,
  Globe,
  Loader2,
  Search,
  UtensilsCrossed,
  Users,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import RecipeForm from './recipe-form'
import { createRecipe } from '@/lib/recipes/actions'
import type { RecipeCandidate, RecipePreview } from '@/types/recipes'
import type { RecipeFormValues } from '@/lib/recipes/schema'
import { cn } from '@/lib/utils'

// ---- Types ------------------------------------------------------------------

export type WalkthroughItem =
  | { type: 'ready'; label: string; candidate: RecipeCandidate }
  | { type: 'pending'; label: string; url: string }

type TabStatus = 'loading' | 'ready' | 'error' | 'saved'

interface TabState {
  id: string
  label: string
  url: string | null
  status: TabStatus
  candidate: RecipeCandidate | null
  error: string | null
}

// ---- Helpers ----------------------------------------------------------------

function candidateToFormValues(c: RecipeCandidate): RecipeFormValues {
  return {
    name: c.name,
    description: c.description ?? '',
    servings: c.servings ?? 1,
    prep_time_min: c.prep_time_min ?? null,
    cook_time_min: c.cook_time_min ?? null,
    cuisine: c.cuisine ?? '',
    image_url: c.image_url ?? '',
    meal_types: c.meal_types ?? [],
    tags: c.tags ?? [],
    instructions: (c.instructions ?? []).map((text) => ({ text })),
    ingredients: (c.ingredients ?? []).map((ing) => ({
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? '',
      name: ing.name,
      preparation: ing.preparation ?? '',
      raw_text: ing.raw_text,
    })),
    macros_per_serving: {
      calories: c.macros_per_serving?.calories ?? 0,
      protein_g: c.macros_per_serving?.protein_g ?? 0,
      carbs_g: c.macros_per_serving?.carbs_g ?? 0,
      fat_g: c.macros_per_serving?.fat_g ?? 0,
      fiber_g: c.macros_per_serving?.fiber_g,
      sugar_g: c.macros_per_serving?.sugar_g,
      sodium_mg: c.macros_per_serving?.sodium_mg,
    },
    macros_verified: c.macros_verified ?? false,
    source_url: c.source_url ?? '',
    source_site_name: c.source_site_name ?? '',
  }
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function DeferredMount({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <>{children}</> : null
}

// ---- URL Paste Dialog -------------------------------------------------------

interface UrlImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExtracted: (candidate: RecipeCandidate) => void
}

export function UrlImportDialog({ open, onOpenChange, onExtracted }: UrlImportDialogProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClose(next: boolean) {
    if (!next) {
      setUrl('')
      setError(null)
      setIsLoading(false)
    }
    onOpenChange(next)
  }

  async function handleImport() {
    if (!url.trim()) return
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
      onExtracted(data as RecipeCandidate)
      handleClose(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import from URL</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Input
            placeholder="https://www.seriouseats.com/..."
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleImport()}
            disabled={isLoading}
            autoFocus
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <X className="mt-0.5 size-3.5 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Fetching and extracting recipe…
            </div>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!url.trim() || isLoading}>
            {isLoading ? (
              <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Importing…</>
            ) : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Search Preview Card ----------------------------------------------------

function PreviewCard({
  preview,
  selected,
  onToggle,
  disabled,
}: {
  preview: RecipePreview
  selected: boolean
  onToggle: () => void
  disabled: boolean
}) {
  const domain = siteName(preview.source.url)
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : selected
            ? '-translate-y-0.5 border-primary shadow-md ring-2 ring-primary/20'
            : 'border-border hover:border-foreground/30 hover:shadow-sm',
      )}
    >
      <div
        className={cn(
          'absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full border-2 transition-all',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-white/60 bg-black/20',
        )}
      >
        {selected && <Check className="size-3" />}
      </div>
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-muted">
        {preview.image_url ? (
          <img
            src={preview.image_url}
            alt={preview.title}
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="size-8 text-muted-foreground/20" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="font-heading line-clamp-2 text-sm font-medium leading-snug">{preview.title}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Globe className="size-3 shrink-0" />
          {domain}
        </div>
        {preview.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {preview.description}
          </p>
        )}
        {(preview.estimated_time_min != null || preview.estimated_servings != null) && (
          <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            {preview.estimated_time_min != null && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />{preview.estimated_time_min} min
              </span>
            )}
            {preview.estimated_servings != null && (
              <span className="flex items-center gap-1">
                <Users className="size-3" />{preview.estimated_servings} servings
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

function PreviewCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

// ---- Search Dialog ----------------------------------------------------------

interface SearchImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onItems: (items: WalkthroughItem[]) => void
}

export function SearchImportDialog({ open, onOpenChange, onItems }: SearchImportDialogProps) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLocking, setIsLocking] = useState(false)
  const [previews, setPreviews] = useState<RecipePreview[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function handleClose(next: boolean) {
    if (!next) {
      setQuery('')
      setPreviews(null)
      setSelected(new Set())
      setSearchError(null)
      setIsSearching(false)
      setIsLocking(false)
    }
    onOpenChange(next)
  }

  async function handleSearch() {
    if (!query.trim() || isLocking) return
    setIsSearching(true)
    setPreviews(null)
    setSelected(new Set())
    setSearchError(null)
    try {
      const res = await fetch('/api/recipes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      setPreviews(data as RecipePreview[])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  function toggleSelect(url: string) {
    if (isLocking) return
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  function handleImportSelected() {
    if (isLocking || selected.size === 0) return
    const previewMap = new Map(previews?.map((p) => [p.source.url, p]) ?? [])
    const items: WalkthroughItem[] = [...selected].map((url) => ({
      type: 'pending',
      label: previewMap.get(url)?.title ?? siteName(url),
      url,
    }))
    setIsLocking(true)
    setTimeout(() => {
      handleClose(false)
      onItems(items)
    }, 120)
  }

  const selectedCount = selected.size
  const isDisabled = isSearching || isLocking

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Search for Recipes</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b px-6 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="e.g. chicken adobo, vegan pasta, 30-minute meals"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isDisabled && handleSearch()}
                className="pl-8"
                disabled={isDisabled}
                autoFocus
              />
            </div>
            <Button onClick={handleSearch} disabled={!query.trim() || isDisabled}>
              {isSearching ? <Loader2 className="size-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-4', isLocking && 'pointer-events-none')}>
          {isSearching && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {[...Array(3)].map((_, i) => <PreviewCardSkeleton key={i} />)}
            </div>
          )}
          {searchError && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-destructive">{searchError}</p>
              <Button variant="outline" size="sm" onClick={handleSearch}>Retry</Button>
            </div>
          )}
          {previews && previews.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <UtensilsCrossed className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No recipes found. Try a different query.</p>
            </div>
          )}
          {previews && previews.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {previews.map((p) => (
                <PreviewCard
                  key={p.source.url}
                  preview={p}
                  selected={selected.has(p.source.url)}
                  onToggle={() => toggleSelect(p.source.url)}
                  disabled={isLocking}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0">
          {selectedCount > 0 || isLocking ? (
            <div className="flex w-full items-center gap-3">
              {isLocking ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Opening {selectedCount} {selectedCount === 1 ? 'recipe' : 'recipes'}…
                </span>
              ) : (
                <>
                  <span className="text-sm font-medium">
                    {selectedCount} {selectedCount === 1 ? 'recipe' : 'recipes'} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              )}
              <Button
                size="sm"
                className="ml-auto"
                onClick={handleImportSelected}
                disabled={isLocking}
              >
                {isLocking
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Opening…</>
                  : `Import ${selectedCount} ${selectedCount === 1 ? 'recipe' : 'recipes'} →`
                }
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Walkthrough tab content ------------------------------------------------

function TabLoadingContent() {
  return (
    <div className="flex flex-col gap-6">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  )
}

function TabErrorContent({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <AlertCircle className="size-10 text-destructive/40" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Extraction failed</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function TabSavedContent({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
        <Check className="size-6" />
      </div>
      <p className="font-medium">{name} saved</p>
    </div>
  )
}

// ---- Import Walkthrough -----------------------------------------------------

interface ImportWalkthroughProps {
  items: WalkthroughItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (savedCount: number) => void
}

export function ImportWalkthrough({ items, open, onOpenChange, onComplete }: ImportWalkthroughProps) {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [isPending, startTransition] = useTransition()
  // Tracks which tab ids have had extraction fired to prevent double-firing
  const extractingRef = useRef<Set<string>>(new Set())

  // Initialize tabs and fire extractions when dialog opens
  useEffect(() => {
    if (!open || items.length === 0) return
    extractingRef.current = new Set()
    const newTabs: TabState[] = items.map((item, i) => ({
      id: `tab-${i}`,
      label: item.label || `Recipe ${i + 1}`,
      url: item.type === 'pending' ? item.url : null,
      status: item.type === 'ready' ? 'ready' : 'loading',
      candidate: item.type === 'ready' ? item.candidate : null,
      error: null,
    }))
    setTabs(newTabs)
    setActiveTabId(newTabs[0]?.id ?? '')
    setSavedCount(0)
    setShowConfirmClose(false)
    newTabs.forEach((tab) => {
      if (tab.status === 'loading' && tab.url) runExtract(tab.id, tab.url)
    })
  // Items identity changes when the dialog opens with new selections; open
  // is the stable trigger. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runExtract(tabId: string, url: string) {
    if (extractingRef.current.has(tabId)) return
    extractingRef.current.add(tabId)
    try {
      const res = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, status: 'ready', candidate: data as RecipeCandidate, error: null }
            : t,
        ),
      )
    } catch (err) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, status: 'error', error: err instanceof Error ? err.message : 'Extraction failed' }
            : t,
        ),
      )
    } finally {
      extractingRef.current.delete(tabId)
    }
  }

  function handleRetryTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab?.url) return
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: 'loading', error: null } : t)))
    runExtract(tabId, tab.url)
  }

  function handleSaveTab(tabId: string, data: RecipeFormValues) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result = await createRecipe(data)
        if (result.error) {
          toast.error(result.error)
        } else {
          setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: 'saved' } : t)))
          setSavedCount((n) => n + 1)
          // Auto-advance to the first unsaved tab
          const remaining = tabs.filter(
            (t) => t.id !== tabId && t.status !== 'saved',
          )
          if (remaining.length > 0) setActiveTabId(remaining[0].id)
        }
        resolve()
      })
    })
  }

  function handleRequestClose() {
    const unsaved = tabs.filter((t) => t.status !== 'saved').length
    if (unsaved > 0) {
      setShowConfirmClose(true)
    } else {
      doClose()
    }
  }

  function doClose() {
    const count = savedCount
    onOpenChange(false)
    onComplete(count)
  }

  const visibleTabs = tabs
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const unsavedCount = tabs.filter((t) => t.status !== 'saved').length
  const allDone = tabs.length > 0 && unsavedCount === 0

  if (!open || tabs.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleRequestClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {/* Header */}
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle>Review Recipes</DialogTitle>
            <span className="text-xs text-muted-foreground">
              {savedCount} of {tabs.length} saved
            </span>
          </div>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex shrink-0 overflow-x-auto border-b">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors',
                tab.id === activeTabId
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                tab.status === 'saved' && 'text-emerald-600',
                tab.status === 'error' && tab.id !== activeTabId && 'text-destructive/70',
              )}
            >
              {tab.status === 'loading' && <Loader2 className="size-3 animate-spin" />}
              {tab.status === 'saved' && <Check className="size-3 text-emerald-600" />}
              {tab.status === 'error' && <AlertCircle className="size-3 text-destructive" />}
              <span className="max-w-[140px] truncate">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content — all rendered simultaneously so form state is preserved on tab switch */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleTabs.map((tab) => (
            <div key={tab.id} className={cn('px-6 py-6', tab.id !== activeTabId && 'hidden')}>
              {tab.status === 'loading' && <TabLoadingContent />}
              {tab.status === 'error' && (
                <TabErrorContent
                  error={tab.error ?? 'Unknown error'}
                  onRetry={() => handleRetryTab(tab.id)}
                />
              )}
              {tab.status === 'saved' && (
                <TabSavedContent name={tab.candidate?.name ?? tab.label} />
              )}
              {tab.status === 'ready' && tab.candidate && (
                <DeferredMount>
                  <RecipeForm
                    formId={`recipe-form-${tab.id}`}
                    defaultValues={candidateToFormValues(tab.candidate)}
                    onSubmit={(data) => handleSaveTab(tab.id, data)}
                    isSubmitting={isPending}
                  />
                </DeferredMount>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <DialogFooter className="mx-0 mb-0 shrink-0">
          {showConfirmClose ? (
            <>
              <p className="flex-1 self-center text-sm text-muted-foreground">
                Discard {unsavedCount} unsaved {unsavedCount === 1 ? 'recipe' : 'recipes'}?
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowConfirmClose(false)}>
                Keep editing
              </Button>
              <Button variant="destructive" size="sm" onClick={doClose}>
                Discard
              </Button>
            </>
          ) : allDone ? (
            <Button onClick={doClose} className="ml-auto">Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleRequestClose} disabled={isPending} className="mr-auto">
                Close
              </Button>
              {activeTab?.status === 'ready' && (
                <Button type="submit" form={`recipe-form-${activeTabId}`} disabled={isPending}>
                  {isPending ? 'Saving…' : 'Save Recipe'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
