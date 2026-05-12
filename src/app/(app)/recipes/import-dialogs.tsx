'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  BookOpen,
  Check,
  Clock,
  Globe,
  Loader2,
  Minus,
  Search,
  Sparkles,
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
  | { type: 'ready'; label: string; candidate: RecipeCandidate; fromFastPath?: boolean }
  | { type: 'pending'; label: string; url: string; image_url?: string }

type TabStatus = 'loading' | 'ready' | 'error' | 'saved' | 'skipped'

interface TabState {
  id: string
  label: string
  url: string | null
  searchImageUrl?: string
  status: TabStatus
  loadingPhase?: 'reading' | 'ai'
  candidate: RecipeCandidate | null
  error: string | null
  retryable?: boolean
  autoReparseIngredients?: boolean
}

// ---- Helpers ----------------------------------------------------------------

const UNSUPPORTED_DOMAINS = [
  'youtube.com', 'youtu.be',
  'reddit.com',
  'facebook.com', 'fb.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com', 'x.com',
  'pinterest.com', 'pinterest.co.uk',
]

function isUnsupportedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return UNSUPPORTED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json()
  } catch {
    return { error: "Couldn't read the server response — the site may be blocking access. Try again or use a different URL.", retryable: true }
  }
}

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
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  return mounted ? <>{children}</> : null
}

// ---- URL Paste Dialog -------------------------------------------------------

interface UrlImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onExtracted: (candidate: RecipeCandidate, fromFastPath: boolean) => void
}

export function UrlImportDialog({ open, onOpenChange, onExtracted }: UrlImportDialogProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState<'reading' | 'ai'>('reading')
  const [error, setError] = useState<string | null>(null)

  function handleClose(next: boolean) {
    if (!next) {
      setUrl('')
      setError(null)
      setIsLoading(false)
      setLoadingPhase('reading')
    }
    onOpenChange(next)
  }

  async function handleImport() {
    if (!url.trim()) return
    setError(null)
    const trimmed = url.trim()
    if (isUnsupportedDomain(trimmed)) {
      setError('Recipe import isn\'t supported for YouTube, Reddit, or Facebook.')
      return
    }
    setLoadingPhase('reading')
    setIsLoading(true)
    try {
      // Step 1: fast path — JSON-LD only, no Claude
      const res1 = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, fastOnly: true }),
      })
      const data1 = await safeJson(res1)
      if (!res1.ok) throw new Error((data1.error as string | undefined) ?? 'Extraction failed')

      if (!data1.fallback) {
        onExtracted(data1 as unknown as RecipeCandidate, true)
        handleClose(false)
        return
      }

      // Step 2: AI path — JSON-LD wasn't enough, call Claude
      setLoadingPhase('ai')
      const res2 = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data2 = await safeJson(res2)
      if (!res2.ok) throw new Error((data2.error as string | undefined) ?? 'Extraction failed')
      onExtracted(data2 as unknown as RecipeCandidate, false)
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
              {loadingPhase === 'ai'
                ? <Sparkles className="size-3.5 shrink-0 text-primary" />
                : <Loader2 className="size-3.5 shrink-0 animate-spin" />}
              {loadingPhase === 'ai'
                ? 'Analyzing with AI… this may take a moment'
                : 'Reading page…'}
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
  const [searchPhase, setSearchPhase] = useState<'searching' | 'ai'>('searching')
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
      setSearchPhase('searching')
      setIsLocking(false)
    }
    onOpenChange(next)
  }

  async function handleSearch() {
    if (!query.trim() || isLocking) return
    setSearchPhase('searching')
    setIsSearching(true)
    setPreviews(null)
    setSelected(new Set())
    setSearchError(null)
    try {
      const q = query.trim()
      // Step 1: fast providers only (non-AI)
      let res = await fetch('/api/recipes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, fastOnly: true }),
      })

      if (!res.ok) {
        // Fast providers failed or unavailable — switch to AI and retry full chain
        setSearchPhase('ai')
        res = await fetch('/api/recipes/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Search failed')
      const filtered = (data as RecipePreview[]).filter((p) => !isUnsupportedDomain(p.source.url))
      setPreviews(filtered)
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
      image_url: previewMap.get(url)?.image_url,
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
      <DialogContent className="flex h-screen w-screen flex-col gap-0 overflow-hidden rounded-none p-0 top-0 left-0 translate-x-0 translate-y-0 max-w-none sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-auto sm:min-h-[480px] sm:max-h-[90vh] sm:w-full sm:max-w-2xl sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Search for Recipes</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b px-6 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground sm:block" />
              <Input
                placeholder="e.g. chicken adobo, vegan pasta, 30-minute meals"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isDisabled && handleSearch()}
                className="sm:pl-8"
                disabled={isDisabled}
                autoFocus
              />
            </div>
            <Button onClick={handleSearch} disabled={!query.trim() || isDisabled}>
              {isSearching
                ? <Loader2 className="size-4 animate-spin" />
                : <><Search className="size-4 sm:hidden" /><span className="hidden sm:inline">Search</span></>}
            </Button>
          </div>
        </div>

        <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4', isLocking && 'pointer-events-none')}>
          {isSearching && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[...Array(3)].map((_, i) => <PreviewCardSkeleton key={i} />)}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                {searchPhase === 'ai'
                  ? <><Sparkles className="size-3 text-primary" />Searching with AI… this may take a moment</>
                  : <><Loader2 className="size-3 animate-spin" />Searching…</>}
              </div>
            </div>
          )}
          {!isSearching && !searchError && previews === null && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <BookOpen className="size-10 text-muted-foreground/20" />
              <p className="max-w-[160px] text-sm text-muted-foreground">Your searched recipes appear here</p>
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

function TabErrorContent({ error, retryable, onRetry }: { error: string; retryable: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <AlertCircle className={cn('size-10', retryable ? 'text-destructive/40' : 'text-amber-500/60')} />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{retryable ? 'Extraction failed' : 'Site not accessible'}</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
      {retryable && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

function TabSkippedContent({ onInclude }: { onInclude: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Minus className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">Recipe skipped</p>
      <Button variant="outline" size="sm" onClick={onInclude}>Include</Button>
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
  const [tabs, setTabs] = useState<TabState[]>(() => items.map((item, i) => ({
    id: `tab-${i}`,
    label: item.label || `Recipe ${i + 1}`,
    url: item.type === 'pending' ? item.url : null,
    searchImageUrl: item.type === 'pending' ? item.image_url : undefined,
    status: item.type === 'ready' ? 'ready' : 'loading',
    candidate: item.type === 'ready' ? item.candidate : null,
    error: null,
    autoReparseIngredients: item.type === 'ready' ? (item.fromFastPath ?? false) : false,
  })))
  const [activeTabId, setActiveTabId] = useState(() => items.length > 0 ? 'tab-0' : '')
  const [showConfirmClose, setShowConfirmClose] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [isPending, startTransition] = useTransition()
  const tabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    const el = tabButtonRefs.current.get(activeTabId)
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeTabId, tabs])

  // Tracks which tab ids have had extraction fired to prevent double-firing
  const extractingRef = useRef<Set<string>>(new Set())

  // Fire extractions on mount — component remounts fresh for each new walkthrough session
  useEffect(() => {
    tabs.forEach((tab) => {
      if (tab.status === 'loading' && tab.url) runExtract(tab.id, tab.url)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setTabError(tabId: string, error: string, retryable: boolean) {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, status: 'error', error, retryable } : t)),
    )
  }

  async function runExtract(tabId: string, url: string) {
    if (extractingRef.current.has(tabId)) return
    extractingRef.current.add(tabId)
    try {
      // Step 1: fast path — JSON-LD only
      let res = await fetch('/api/recipes/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, fastOnly: true }),
      })
      let data = await safeJson(res)
      if (!res.ok) {
        setTabError(tabId, (data.error as string | undefined) ?? 'Extraction failed', data.retryable !== false)
        return
      }

      let fromFastPath = true
if (data.fallback) {
        fromFastPath = false
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, loadingPhase: 'ai' } : t))
        // Step 2: AI path
        res = await fetch('/api/recipes/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        data = await safeJson(res)
        if (!res.ok) {
          setTabError(tabId, (data.error as string | undefined) ?? 'Extraction failed', data.retryable !== false)
          return
        }
      }
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId) return t
          const candidate = data as unknown as RecipeCandidate
          if (t.searchImageUrl && !candidate.image_candidates?.includes(t.searchImageUrl)) {
            const base = candidate.image_candidates ?? (candidate.image_url ? [candidate.image_url] : [])
            candidate.image_candidates = [t.searchImageUrl, ...base.filter((u) => u !== t.searchImageUrl)]
          }
          if (candidate.image_candidates && candidate.image_candidates.length > 0) {
            candidate.image_url = candidate.image_candidates[0]
          }
          return { ...t, status: 'ready', candidate, error: null, autoReparseIngredients: fromFastPath }
        }),
      )
    } catch (err) {
      setTabError(tabId, err instanceof Error ? err.message : 'Extraction failed', true)
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

  function handleSkipTab(tabId: string) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: 'skipped' } : t)))
    const remaining = tabs.filter((t) => t.id !== tabId && t.status !== 'saved' && t.status !== 'skipped')
    if (remaining.length > 0) setActiveTabId(remaining[0].id)
  }

  function handleIncludeTab(tabId: string) {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, status: 'ready' } : t)))
    setActiveTabId(tabId)
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
          const remaining = tabs.filter(
            (t) => t.id !== tabId && t.status !== 'saved' && t.status !== 'skipped',
          )
          if (remaining.length > 0) setActiveTabId(remaining[0].id)
        }
        resolve()
      })
    })
  }

  function handleRequestClose() {
    const unsaved = tabs.filter((t) => t.status === 'ready').length
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
  const unsavedCount = tabs.filter((t) => t.status === 'ready').length
  const allDone = tabs.length > 0 && unsavedCount === 0

  if (!open || tabs.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleRequestClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-screen w-screen flex-col gap-0 overflow-hidden rounded-none p-0 top-0 left-0 translate-x-0 translate-y-0 max-w-none sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:h-[90vh] sm:w-full sm:max-w-2xl sm:rounded-xl"
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
        <div className="relative flex shrink-0 overflow-x-auto border-b">
          {indicator && (
            <div
              className="absolute bottom-0 h-0.5 bg-primary transition-[left,width] duration-200 ease-in-out"
              style={{ left: indicator.left, width: indicator.width }}
            />
          )}
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => { if (el) tabButtonRefs.current.set(tab.id, el); else tabButtonRefs.current.delete(tab.id) }}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm transition-colors',
                tab.id === activeTabId ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                tab.status === 'saved' && 'text-emerald-600',
                tab.status === 'skipped' && tab.id !== activeTabId && 'opacity-40',
                tab.status === 'error' && tab.id !== activeTabId && 'text-destructive/70',
              )}
            >
              {tab.status === 'loading' && (
                    tab.loadingPhase === 'ai'
                      ? <Sparkles className="size-3 animate-pulse text-primary" />
                      : <Loader2 className="size-3 animate-spin" />
                  )}
              {tab.status === 'saved' && <Check className="size-3 text-emerald-600" />}
              {tab.status === 'skipped' && <Minus className="size-3 text-muted-foreground" />}
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
                  retryable={tab.retryable !== false}
                  onRetry={() => handleRetryTab(tab.id)}
                />
              )}
              {tab.status === 'skipped' && (
                <TabSkippedContent onInclude={() => handleIncludeTab(tab.id)} />
              )}
              {tab.status === 'saved' && (
                <TabSavedContent name={tab.candidate?.name ?? tab.label} />
              )}
              {tab.status === 'ready' && tab.candidate && (
                <DeferredMount>
                  <RecipeForm
                    formId={`recipe-form-${tab.id}`}
                    defaultValues={candidateToFormValues(tab.candidate)}
                    imageCandidates={tab.candidate.image_candidates}
                    onSubmit={(data) => handleSaveTab(tab.id, data)}
                    isSubmitting={isPending}
                    autoReparseIngredients={tab.autoReparseIngredients}
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
              <Button key="keep-editing" variant="outline" size="sm" onClick={() => setShowConfirmClose(false)}>
                Keep editing
              </Button>
              <Button key="discard" variant="destructive" size="sm" onClick={doClose}>
                Discard
              </Button>
            </>
          ) : allDone ? (
            <Button key="done" onClick={doClose} className="ml-auto">Done</Button>
          ) : (
            <>
              <Button key="close" variant="outline" onClick={handleRequestClose} disabled={isPending} className="mr-auto">
                Close
              </Button>
              {activeTab?.status === 'ready' && (
                <>
                  <Button key="skip" variant="ghost" onClick={() => handleSkipTab(activeTabId)} disabled={isPending}>
                    Skip
                  </Button>
                  <Button key="save" type="submit" form={`recipe-form-${activeTabId}`} disabled={isPending}>
                    {isPending ? 'Saving…' : 'Save Recipe'}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
