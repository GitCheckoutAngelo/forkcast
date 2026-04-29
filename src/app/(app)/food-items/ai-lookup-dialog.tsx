'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FoodItemCandidate } from '@/types'
import { cn } from '@/lib/utils'

const SOURCE_LABELS: Record<FoodItemCandidate['macros_source'], string> = {
  brand_label: 'Brand label',
  usda: 'USDA',
  estimate: 'Estimated',
  other: 'Other',
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: FoodItemCandidate
  selected: boolean
  onSelect: () => void
}) {
  const m = candidate.macros_per_serving
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border bg-card hover:border-foreground/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-heading text-sm font-semibold">{candidate.name}</p>
          {candidate.brand && (
            <p className="text-xs text-muted-foreground">{candidate.brand}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {candidate.serving_size} {candidate.serving_unit}
          </p>
        </div>
        {selected && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />}
      </div>

      {/* Macros */}
      <div className="mt-2 flex items-end gap-3">
        <div className="leading-none">
          <span className="text-lg font-semibold tabular-nums">{Math.round(m.calories)}</span>
          <span className="ml-0.5 text-xs text-muted-foreground">kcal</span>
        </div>
        <div className="flex gap-2 pb-0.5 text-xs text-muted-foreground">
          <span>{Math.round(m.protein_g)}g P</span>
          <span>{Math.round(m.carbs_g)}g C</span>
          <span>{Math.round(m.fat_g)}g F</span>
        </div>
      </div>

      {/* Source attribution — shown prominently so users know data quality */}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground/70">
          {SOURCE_LABELS[candidate.macros_source]}
        </span>
        {candidate.macros_source_note && (
          <span className="truncate">{candidate.macros_source_note}</span>
        )}
      </div>
    </button>
  )
}

interface AILookupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (candidate: FoodItemCandidate) => void
}

export default function AILookupDialog({ open, onOpenChange, onPick }: AILookupDialogProps) {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [candidates, setCandidates] = useState<FoodItemCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  function reset() {
    setQuery('')
    setCandidates(null)
    setError(null)
    setSelectedIndex(null)
    setIsLoading(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleLookup() {
    const q = query.trim()
    if (!q) return
    setIsLoading(true)
    setError(null)
    setCandidates(null)
    setSelectedIndex(null)

    try {
      const res = await fetch('/api/food-items/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Lookup failed')
      } else {
        setCandidates(data)
        if (data.length === 1) setSelectedIndex(0)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setIsLoading(false)
    }
  }

  function handleUse() {
    if (selectedIndex == null || !candidates) return
    onPick(candidates[selectedIndex])
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Look up with AI</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {/* Search input */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Chobani Greek yogurt 0%, medium banana, Quest bar"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleLookup()
                }
              }}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleLookup}
              disabled={isLoading || !query.trim()}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Candidates */}
          {candidates && candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Select a result to pre-fill the form
              </p>
              {candidates.map((candidate, i) => (
                <CandidateCard
                  key={i}
                  candidate={candidate}
                  selected={selectedIndex === i}
                  onSelect={() => setSelectedIndex(i)}
                />
              ))}
            </div>
          )}

          {/* Empty results */}
          {candidates && candidates.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No results found. Try a different query.
            </p>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUse} disabled={selectedIndex == null}>
            Use this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
