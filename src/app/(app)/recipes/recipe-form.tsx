'use client'

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  useForm,
  useFieldArray,
  Controller,
  useWatch,
  type Control,
  type UseFormRegister,
  type Resolver,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, ImageOff, Info, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { recipeFormSchema, type RecipeFormValues } from '@/lib/recipes/schema'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'
import type { Macros } from '@/types'
import { cn } from '@/lib/utils'

// ---- Module-level constants -------------------------------------------------

// Stable reference prevents useSensor from recreating the sensor every render.
const KEYBOARD_SENSOR_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates }

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

// ---- Helpers ----------------------------------------------------------------

function toFormValues(recipe: RecipeWithIngredients): RecipeFormValues {
  return {
    name: recipe.name,
    display_name: recipe.display_name ?? '',
    description: recipe.description ?? '',
    servings: recipe.servings,
    prep_time_min: recipe.prep_time_min,
    cook_time_min: recipe.cook_time_min,
    cuisine: recipe.cuisine ?? '',
    image_url: recipe.image_url ?? '',
    meal_types: recipe.meal_types,
    tags: recipe.tags,
    instructions: (recipe.instructions ?? []).map((text) => ({ text })),
    ingredients: recipe.ingredients.map((ing) => ({
      quantity: ing.quantity,
      unit: ing.unit ?? '',
      name: ing.name,
      preparation: ing.preparation ?? '',
      raw_text: ing.raw_text,
    })),
    macros_per_serving: {
      calories: recipe.macros_per_serving.calories,
      protein_g: recipe.macros_per_serving.protein_g,
      carbs_g: recipe.macros_per_serving.carbs_g,
      fat_g: recipe.macros_per_serving.fat_g,
      fiber_g: recipe.macros_per_serving.fiber_g,
      sugar_g: recipe.macros_per_serving.sugar_g,
      sodium_mg: recipe.macros_per_serving.sodium_mg,
    },
    macros_verified: recipe.macros_verified,
    source_url: recipe.source?.url ?? '',
    source_site_name: recipe.source?.site_name ?? '',
  }
}

const DEFAULT_VALUES: RecipeFormValues = {
  name: '',
  description: '',
  servings: 1,
  prep_time_min: null,
  cook_time_min: null,
  cuisine: '',
  image_url: '',
  meal_types: [],
  tags: [],
  instructions: [],
  ingredients: [],
  macros_per_serving: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  macros_verified: true,
  source_url: '',
  source_site_name: '',
}

// ---- Isolated sub-components ------------------------------------------------
// Each uses useWatch internally so only IT re-renders when its field changes.

function ImageCandidatePicker({
  control,
  candidates,
  onSelect,
}: {
  control: Control<RecipeFormValues>
  candidates: string[]
  onSelect: (url: string) => void
}) {
  const current = useWatch({ control, name: 'image_url' }) ?? ''
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {candidates.map((url, i) => {
        const selected = current === url
        const failed = failedUrls.has(url)
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              'relative h-16 w-16 overflow-hidden rounded-lg border-2 transition-all',
              selected ? 'border-primary' : 'border-border hover:border-foreground/40',
            )}
          >
            {failed ? (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <ImageOff className="size-5 text-muted-foreground/50" />
              </div>
            ) : (
              <img
                src={url}
                alt={`Image option ${i + 1}`}
                className="h-full w-full object-cover"
                onError={() => setFailedUrls((prev) => new Set([...prev, url]))}
              />
            )}
            {selected && (
              <div className="absolute inset-0 flex items-end justify-end bg-primary/20 p-1">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ImagePreview({ control }: { control: Control<RecipeFormValues> }) {
  const url = useWatch({ control, name: 'image_url' }) ?? ''
  const [debouncedUrl, setDebouncedUrl] = useState(url)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
    const t = setTimeout(() => setDebouncedUrl(url), 500)
    return () => clearTimeout(t)
  }, [url])

  if (!debouncedUrl) return null
  return (
    <div className="mt-1">
      {!imgError ? (
        <div className="h-52 overflow-hidden rounded-lg border border-border">
          {/* key forces img remount when URL changes, clearing stale onError */}
          <img
            key={debouncedUrl}
            src={debouncedUrl}
            alt="Preview"
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div className="h-52 overflow-hidden rounded-lg border border-border bg-muted">
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="size-8 text-muted-foreground/40" />
          </div>
        </div>
      )}
    </div>
  )
}

function MealTypeSelector({
  control,
  onToggle,
}: {
  control: Control<RecipeFormValues>
  onToggle: (mt: 'breakfast' | 'lunch' | 'dinner' | 'snack') => void
}) {
  const mealTypes = useWatch({ control, name: 'meal_types' })

  return (
    <div className="flex flex-col gap-2">
      <Label>Meal Types</Label>
      <div className="flex flex-wrap gap-2">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mt) => (
          <button
            key={mt}
            type="button"
            onClick={() => onToggle(mt)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              mealTypes.includes(mt)
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            {MEAL_TYPE_LABELS[mt]}
          </button>
        ))}
      </div>
    </div>
  )
}

function TagsInput({
  control,
  onAdd,
  onRemove,
}: {
  control: Control<RecipeFormValues>
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}) {
  const tags = useWatch({ control, name: 'tags' })
  const [tagInput, setTagInput] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const tag = tagInput.trim()
      if (tag) { onAdd(tag); setTagInput('') }
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      onRemove(tags[tags.length - 1])
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Tags</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const tag = tagInput.trim()
            if (tag) { onAdd(tag); setTagInput('') }
          }}
          placeholder={tags.length === 0 ? 'high-protein, one-pot…' : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">Press Enter or comma to add</p>
    </div>
  )
}

// ---- Memoized sortable rows -------------------------------------------------
// React.memo + stable onRemove prop means these only re-render on drag ops.

type IngredientRowProps = {
  id: string
  index: number
  rawText?: string
  register: UseFormRegister<RecipeFormValues>
  onRemove: (index: number) => void
}

const SortableIngredientRow = memo(function SortableIngredientRow({
  id,
  index,
  rawText,
  register,
  onRemove,
}: IngredientRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const [tipOpen, setTipOpen] = useState(false)
  const leaveRef = useRef<number | null>(null)

  function openTip() {
    if (leaveRef.current !== null) { cancelAnimationFrame(leaveRef.current); leaveRef.current = null }
    setTipOpen(true)
  }
  function closeTip() {
    leaveRef.current = requestAnimationFrame(() => { setTipOpen(false); leaveRef.current = null })
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        className="mt-2.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex flex-1 flex-wrap gap-2">
        <Input
          placeholder="Name *"
          className="min-w-[120px] flex-1"
          {...register(`ingredients.${index}.name`)}
        />
        <Input
          type="number"
          placeholder="Qty"
          step="any"
          min="0"
          className="w-16"
          {...register(`ingredients.${index}.quantity`)}
        />
        <Input placeholder="Unit" className="w-20" {...register(`ingredients.${index}.unit`)} />
        <Input
          placeholder="Prep (optional)"
          className="min-w-[100px] flex-1"
          {...register(`ingredients.${index}.preparation`)}
        />
        <input type="hidden" {...register(`ingredients.${index}.raw_text`)} />
      </div>

      {rawText ? (
        <div className="relative mt-2.5 shrink-0">
          <button
            type="button"
            onMouseEnter={openTip}
            onMouseLeave={closeTip}
            onFocus={openTip}
            onBlur={closeTip}
            className="flex text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            aria-label="Show original text"
          >
            <Info className="size-4" />
          </button>
          <div
            onMouseEnter={openTip}
            onMouseLeave={closeTip}
            className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md ring-1 ring-border"
            style={{
              opacity: tipOpen ? 1 : 0,
              transform: tipOpen ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 140ms ease, transform 140ms ease',
              pointerEvents: tipOpen ? 'auto' : 'none',
            }}
          >
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Original</p>
            <p className="break-words leading-relaxed">{rawText}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 size-4 shrink-0" />
      )}

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-2.5 text-muted-foreground transition-colors hover:text-destructive"
        aria-label="Remove ingredient"
      >
        <X className="size-4" />
      </button>
    </div>
  )
})

type InstructionRowProps = {
  id: string
  index: number
  register: UseFormRegister<RecipeFormValues>
  onRemove: (index: number) => void
}

const SortableInstructionRow = memo(function SortableInstructionRow({
  id,
  index,
  register,
  onRemove,
}: InstructionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        className="mt-2.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      <span className="mt-2.5 w-5 shrink-0 text-right text-xs text-muted-foreground">
        {index + 1}.
      </span>

      <Textarea
        placeholder={`Step ${index + 1}`}
        className="flex-1 resize-none"
        {...register(`instructions.${index}.text`)}
      />

      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-2.5 text-muted-foreground transition-colors hover:text-destructive"
        aria-label="Remove step"
      >
        <X className="size-4" />
      </button>
    </div>
  )
})

// ---- Macro comparison dialog ------------------------------------------------

const MACRO_DISPLAY: Array<{ label: string; unit: string; key: keyof Macros }> = [
  { label: 'Calories', unit: 'kcal', key: 'calories' },
  { label: 'Protein', unit: 'g', key: 'protein_g' },
  { label: 'Carbs', unit: 'g', key: 'carbs_g' },
  { label: 'Fat', unit: 'g', key: 'fat_g' },
  { label: 'Fiber', unit: 'g', key: 'fiber_g' },
  { label: 'Sugar', unit: 'g', key: 'sugar_g' },
  { label: 'Sodium', unit: 'mg', key: 'sodium_mg' },
]

function isSignificantChange(a: number | undefined, b: number | undefined): boolean {
  if (a == null || b == null) return false
  const max = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / max > 0.1
}

function MacroComparisonDialog({
  open,
  onOpenChange,
  current,
  calculated,
  onAccept,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  current: Macros
  calculated: Macros
  onAccept: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Recalculated Macros</DialogTitle>
        </DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">
          Calculated from ingredients and cooking method
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Macro</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Current</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Calculated
                </th>
              </tr>
            </thead>
            <tbody>
              {MACRO_DISPLAY.map(({ label, unit, key }) => {
                const curVal = current[key] as number | undefined
                const calcVal = calculated[key] as number | undefined
                if (curVal == null && calcVal == null) return null
                const changed = isSignificantChange(curVal, calcVal)
                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-b last:border-0',
                      changed && 'bg-amber-50/60 dark:bg-amber-950/20',
                    )}
                  >
                    <td className="px-3 py-2 text-muted-foreground">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {curVal != null ? `${Math.round(curVal * 10) / 10}${unit}` : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums font-medium',
                        changed && 'text-amber-700 dark:text-amber-400',
                      )}
                    >
                      {calcVal != null ? `${Math.round(calcVal * 10) / 10}${unit}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep current</DialogClose>
          <Button onClick={onAccept}>Use calculated values</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Main component ---------------------------------------------------------

interface RecipeFormProps {
  defaultValues?: RecipeFormValues
  onSubmit: (data: RecipeFormValues) => Promise<void>
  isSubmitting?: boolean
  formId?: string
  imageCandidates?: string[]
  autoReparseIngredients?: boolean
}

export { toFormValues }

type FormSection = 'overview' | 'ingredients' | 'instructions' | 'nutrition'

const SECTIONS: { id: FormSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'nutrition', label: 'Nutrition' },
]

export default function RecipeForm({ defaultValues, onSubmit, formId = 'recipe-form', imageCandidates, autoReparseIngredients }: RecipeFormProps) {
  const [section, setSection] = useState<FormSection>('overview')
  const [visited, setVisited] = useState<Set<FormSection>>(new Set(['overview']))

  function handleSectionChange(s: FormSection) {
    setSection(s)
    setVisited((prev) => (prev.has(s) ? prev : new Set([...prev, s])))
  }

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema) as Resolver<RecipeFormValues>,
    defaultValues: defaultValues ?? DEFAULT_VALUES,
  })

  const {
    fields: ingredientFields,
    append: appendIngredient,
    remove: removeIngredient,
    move: moveIngredient,
    replace: replaceIngredients,
  } = useFieldArray({ control, name: 'ingredients' })

  const {
    fields: instructionFields,
    append: appendInstruction,
    remove: removeInstruction,
    move: moveInstruction,
  } = useFieldArray({ control, name: 'instructions' })

  // Re-parse ingredients state
  const [isReparsing, setIsReparsing] = useState(false)
  const [reparseError, setReparseError] = useState<string | null>(null)
  const autoReparseFiredRef = useRef(false)

  async function handleReparseIngredients() {
    setIsReparsing(true)
    setReparseError(null)
    try {
      const current = getValues('ingredients')
      const rawStrings = current.map((ing) =>
        ing.raw_text || [ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(' '),
      )
      const res = await fetch('/api/recipes/parse-ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: rawStrings }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Re-parse failed — try again')
      }
      const parsed: Array<{
        quantity: number | null
        unit: string | null
        name: string
        preparation: string | null
        raw_text: string
      }> = await res.json()
      replaceIngredients(
        parsed.map((p) => ({
          quantity: p.quantity,
          unit: p.unit ?? '',
          name: p.name,
          preparation: p.preparation ?? '',
          raw_text: p.raw_text,
        })),
      )
    } catch (err) {
      setReparseError(
        err instanceof Error ? err.message : 'Re-parse failed — try again',
      )
    } finally {
      setIsReparsing(false)
    }
  }

  // Auto-trigger re-parse on first mount when the candidate came from the non-AI (JSON-LD) path.
  useEffect(() => {
    if (!autoReparseIngredients || autoReparseFiredRef.current) return
    autoReparseFiredRef.current = true
    handleReparseIngredients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recalculate macros state
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcState, setCalcState] = useState<{ current: Macros; calculated: Macros } | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [showComparison, setShowComparison] = useState(false)

  const watchedIngredients = useWatch({ control, name: 'ingredients' })
  const canRecalculate = watchedIngredients.length >= 2

  async function handleRecalculate() {
    setIsCalculating(true)
    setCalcError(null)
    try {
      const values = getValues()
      const current = values.macros_per_serving as Macros
      const body = {
        ingredients: values.ingredients,
        instructions: values.instructions.map((i) => i.text).filter(Boolean),
        servings: values.servings,
        name: values.name || undefined,
        cuisine: values.cuisine || undefined,
      }
      const res = await fetch('/api/recipes/recalculate-macros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as { error?: string }).error ?? "Couldn't calculate macros — try again or enter manually",
        )
      }
      const calculated: Macros = await res.json()
      setCalcState({ current, calculated })
      setShowComparison(true)
    } catch (err) {
      setCalcError(
        err instanceof Error
          ? err.message
          : "Couldn't calculate macros — try again or enter manually",
      )
    } finally {
      setIsCalculating(false)
    }
  }

  function handleAcceptCalculated() {
    if (!calcState) return
    const m = calcState.calculated
    setValue('macros_per_serving.calories', m.calories, { shouldValidate: true })
    setValue('macros_per_serving.protein_g', m.protein_g, { shouldValidate: true })
    setValue('macros_per_serving.carbs_g', m.carbs_g, { shouldValidate: true })
    setValue('macros_per_serving.fat_g', m.fat_g, { shouldValidate: true })
    setValue('macros_per_serving.fiber_g', m.fiber_g, { shouldValidate: true })
    setValue('macros_per_serving.sugar_g', m.sugar_g, { shouldValidate: true })
    setValue('macros_per_serving.sodium_mg', m.sodium_mg, { shouldValidate: true })
    setValue('macros_verified', false, { shouldValidate: true })
    setShowComparison(false)
  }

  // Stable sensor setup — KEYBOARD_SENSOR_OPTIONS is module-level so useSensor
  // memo never invalidates across renders.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS),
  )

  // Stable callbacks for isolated sub-components. useCallback deps are stable
  // refs from useForm, so these never recreate after mount.
  const toggleMealType = useCallback(
    (mt: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
      const current = getValues('meal_types')
      setValue(
        'meal_types',
        current.includes(mt) ? current.filter((x) => x !== mt) : [...current, mt],
        { shouldValidate: true },
      )
    },
    [getValues, setValue],
  )

  const addTag = useCallback(
    (tag: string) => {
      if (!tag) return
      const current = getValues('tags')
      if (!current.includes(tag)) setValue('tags', [...current, tag], { shouldValidate: true })
    },
    [getValues, setValue],
  )

  const removeTag = useCallback(
    (tag: string) => {
      setValue('tags', getValues('tags').filter((t) => t !== tag), { shouldValidate: true })
    },
    [getValues, setValue],
  )

  function handleIngredientDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    moveIngredient(
      ingredientFields.findIndex((f) => f.id === active.id),
      ingredientFields.findIndex((f) => f.id === over.id),
    )
  }

  function handleInstructionDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    moveInstruction(
      instructionFields.findIndex((f) => f.id === active.id),
      instructionFields.findIndex((f) => f.id === over.id),
    )
  }

  return (
    <>
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-0">
      {/* Section tabs */}
      <div className="relative mb-6 flex rounded-lg bg-muted p-1">
        <div
          className="pointer-events-none absolute inset-y-1 rounded-md bg-background shadow-sm transition-[left] duration-200 ease-in-out"
          style={{
            width: 'calc((100% - 8px) / 4)',
            left: `calc(4px + ${SECTIONS.findIndex((s) => s.id === section)} * ((100% - 8px) / 4))`,
          }}
        />
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleSectionChange(s.id)}
            className={cn(
              'relative z-10 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              section === s.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      <div className={cn('flex flex-col gap-4', section !== 'overview' && 'hidden')}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-name">Name *</Label>
          <Input id="rf-name" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-display-name">
            Display name
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(shown in meal planner)</span>
          </Label>
          <Input id="rf-display-name" placeholder="e.g. Chicken Adobo" {...register('display_name')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-description">Description</Label>
          <Textarea id="rf-description" className="resize-none" {...register('description')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-image">Image URL</Label>
          <Input id="rf-image" type="url" placeholder="https://…" {...register('image_url')} />
          {imageCandidates && imageCandidates.length > 1 && (
            <ImageCandidatePicker
              control={control}
              candidates={imageCandidates}
              onSelect={(url) => setValue('image_url', url, { shouldValidate: true })}
            />
          )}
          <ImagePreview control={control} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-servings">Servings *</Label>
            <Input
              id="rf-servings"
              type="number"
              step="any"
              min="0.1"
              aria-invalid={!!errors.servings}
              {...register('servings')}
            />
            {errors.servings && (
              <p className="text-xs text-destructive">{errors.servings.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-prep">Prep (min)</Label>
            <Input id="rf-prep" type="number" min="0" {...register('prep_time_min')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-cook">Cook (min)</Label>
            <Input id="rf-cook" type="number" min="0" {...register('cook_time_min')} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-cuisine">Cuisine</Label>
          <Input id="rf-cuisine" placeholder="e.g. Filipino, Italian" {...register('cuisine')} />
        </div>

        <MealTypeSelector control={control} onToggle={toggleMealType} />
        <TagsInput control={control} onAdd={addTag} onRemove={removeTag} />

        <div className="flex flex-col gap-3">
          <Label>Source (optional)</Label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-source-url" className="text-xs">URL</Label>
            <Input id="rf-source-url" type="url" placeholder="https://…" {...register('source_url')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-site-name" className="text-xs">Site Name</Label>
            <Input id="rf-site-name" placeholder="e.g. Serious Eats" {...register('source_site_name')} />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className={cn('flex flex-col gap-3', section !== 'ingredients' && 'hidden')}>
        {visited.has('ingredients') && <>
          <div className="flex items-center justify-between gap-2">
            <Label>Ingredients</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ingredientFields.length === 0 || isReparsing}
              onClick={handleReparseIngredients}
            >
              {isReparsing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}
              {isReparsing ? 'Parsing…' : 'Re-parse with AI'}
            </Button>
          </div>
          {reparseError && <p className="text-xs text-destructive">{reparseError}</p>}
          <div className="relative">
            <div className={cn('transition-opacity duration-150', isReparsing && 'pointer-events-none opacity-40')}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
                <SortableContext items={ingredientFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {ingredientFields.map((field, index) => (
                      <SortableIngredientRow key={field.id} id={field.id} index={index} rawText={field.raw_text || undefined} register={register} onRemove={removeIngredient} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            {isReparsing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  Parsing ingredients…
                </div>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => appendIngredient({ quantity: null, unit: '', name: '', preparation: '', raw_text: '' })}
          >
            <Plus className="mr-1 size-3.5" />
            Add Ingredient
          </Button>
        </>}
      </div>

      {/* Instructions */}
      <div className={cn('flex flex-col gap-3', section !== 'instructions' && 'hidden')}>
        {visited.has('instructions') && <>
          <Label>Instructions</Label>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleInstructionDragEnd}>
            <SortableContext items={instructionFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {instructionFields.map((field, index) => (
                  <SortableInstructionRow key={field.id} id={field.id} index={index} register={register} onRemove={removeInstruction} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => appendInstruction({ text: '' })}
          >
            <Plus className="mr-1 size-3.5" />
            Add Step
          </Button>
        </>}
      </div>

      {/* Nutrition */}
      <div className={cn('flex flex-col gap-3', section !== 'nutrition' && 'hidden')}>
        {visited.has('nutrition') && <>
        <div className="flex items-center justify-between gap-2">
          <Label>Macros per serving</Label>
          <span
            title={!canRecalculate ? 'Add at least 2 ingredients to recalculate' : undefined}
            className={!canRecalculate ? 'cursor-not-allowed' : undefined}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canRecalculate || isCalculating}
              onClick={handleRecalculate}
            >
              {isCalculating ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Sparkles className="mr-1.5 size-3.5" />}
              {isCalculating ? 'Calculating…' : 'Recalculate from ingredients'}
            </Button>
          </span>
        </div>
        {calcError && <p className="text-xs text-destructive">{calcError}</p>}

        <div className="relative rounded-xl border border-border bg-muted/30">
          {isCalculating && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60">
              <div className="flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="size-3.5 animate-spin" />
                Calculating…
              </div>
            </div>
          )}
          <div className={cn('transition-opacity duration-150', isCalculating && 'opacity-40')}>
          <div className="flex flex-col items-center px-4 pb-3 pt-4">
            <div className="flex items-baseline gap-1.5">
              <Input
                id="rf-calories"
                type="number"
                min="0"
                step="0.1"
                aria-invalid={!!errors.macros_per_serving?.calories}
                className="h-10 w-28 text-center text-xl font-heading font-semibold sm:text-2xl"
                {...register('macros_per_serving.calories')}
              />
              <span className="text-base text-muted-foreground">kcal</span>
            </div>
            <Label htmlFor="rf-calories" className="mt-1 cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
              Calories
            </Label>
          </div>

          <div className="border-b border-border/40" />

          <div className="grid grid-cols-3">
            {(['protein_g', 'carbs_g', 'fat_g'] as const).map((key) => {
              const label = key === 'protein_g' ? 'Protein' : key === 'carbs_g' ? 'Carbs' : 'Fat'
              return (
                <div key={key} className="flex flex-col items-center px-2 py-3">
                  <div className="flex items-baseline gap-0.5">
                    <Input
                      id={`rf-${key}`}
                      type="number"
                      min="0"
                      step="0.1"
                      aria-invalid={!!errors.macros_per_serving?.[key]}
                      className="h-7 w-full min-w-0 flex-1 px-1 text-center font-heading font-semibold"
                      {...register(`macros_per_serving.${key}`)}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">g</span>
                  </div>
                  <Label htmlFor={`rf-${key}`} className="mt-1 cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </Label>
                </div>
              )
            })}
            {([['fiber_g', 'Fiber', 'g'], ['sugar_g', 'Sugar', 'g'], ['sodium_mg', 'Sodium', 'mg']] as const).map(([key, label, unit]) => (
              <div key={key} className="flex flex-col items-center px-2 py-3">
                <div className="flex items-baseline gap-0.5">
                  <Input
                    id={`rf-${key}`}
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="—"
                    className="h-7 w-full min-w-0 flex-1 px-1 text-center font-heading font-semibold"
                    {...register(`macros_per_serving.${key}`)}
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
                </div>
                <Label htmlFor={`rf-${key}`} className="mt-1 cursor-pointer text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label}
                </Label>
              </div>
            ))}
          </div>
          </div>{/* end opacity wrapper */}
        </div>

        <Controller
          name="macros_verified"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked)} />
              <span className="text-sm">Macros verified from source</span>
            </label>
          )}
        />
        </>}
      </div>
    </form>
    {calcState && (
      <MacroComparisonDialog
        open={showComparison}
        onOpenChange={(v) => { if (!v) setShowComparison(false) }}
        current={calcState.current}
        calculated={calcState.calculated}
        onAccept={handleAcceptCalculated}
      />
    )}
    </>
  )
}
