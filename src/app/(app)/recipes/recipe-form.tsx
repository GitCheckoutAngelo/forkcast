'use client'

import { memo, useCallback, useEffect, useState, type KeyboardEvent } from 'react'
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
import { GripVertical, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { recipeFormSchema, type RecipeFormValues } from '@/lib/recipes/schema'
import type { RecipeWithIngredients } from '@/lib/recipes/queries'
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
        <div className="h-32 overflow-hidden rounded-lg border border-border">
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
        <p className="text-xs text-muted-foreground">Could not load image from this URL</p>
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
  register: UseFormRegister<RecipeFormValues>
  onRemove: (index: number) => void
}

const SortableIngredientRow = memo(function SortableIngredientRow({
  id,
  index,
  register,
  onRemove,
}: IngredientRowProps) {
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

      <div className="flex flex-1 flex-wrap gap-2">
        <Input
          placeholder="Name *"
          className="min-w-[120px] flex-1"
          {...register(`ingredients.${index}.name`)}
        />
        <Input
          type="number"
          placeholder="Qty"
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

// ---- Main component ---------------------------------------------------------

interface RecipeFormProps {
  defaultValues?: RecipeWithIngredients
  onSubmit: (data: RecipeFormValues) => Promise<void>
  isSubmitting?: boolean
}

export default function RecipeForm({ defaultValues, onSubmit }: RecipeFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema) as Resolver<RecipeFormValues>,
    defaultValues: defaultValues ? toFormValues(defaultValues) : DEFAULT_VALUES,
  })

  const {
    fields: ingredientFields,
    append: appendIngredient,
    remove: removeIngredient,
    move: moveIngredient,
  } = useFieldArray({ control, name: 'ingredients' })

  const {
    fields: instructionFields,
    append: appendInstruction,
    remove: removeInstruction,
    move: moveInstruction,
  } = useFieldArray({ control, name: 'instructions' })

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
    <form id="recipe-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Basic Info */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-name">Name *</Label>
          <Input id="rf-name" aria-invalid={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-description">Description</Label>
          <Textarea id="rf-description" className="resize-none" {...register('description')} />
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
          <Input
            id="rf-cuisine"
            placeholder="e.g. Filipino, Italian"
            {...register('cuisine')}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-image">Image URL</Label>
          <Input id="rf-image" type="url" placeholder="https://…" {...register('image_url')} />
          {/* Isolated: only re-renders when image_url changes, debounced 500ms */}
          <ImagePreview control={control} />
        </div>
      </div>

      {/* Isolated: only re-renders when meal_types changes */}
      <MealTypeSelector control={control} onToggle={toggleMealType} />

      {/* Isolated: only re-renders when tags changes */}
      <TagsInput control={control} onAdd={addTag} onRemove={removeTag} />

      {/* Ingredients */}
      <div className="flex flex-col gap-3">
        <Label>Ingredients</Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleIngredientDragEnd}
        >
          <SortableContext
            items={ingredientFields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {ingredientFields.map((field, index) => (
                <SortableIngredientRow
                  key={field.id}
                  id={field.id}
                  index={index}
                  register={register}
                  onRemove={removeIngredient}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            appendIngredient({ quantity: null, unit: '', name: '', preparation: '', raw_text: '' })
          }
        >
          <Plus className="mr-1 size-3.5" />
          Add Ingredient
        </Button>
      </div>

      {/* Instructions */}
      <div className="flex flex-col gap-3">
        <Label>Instructions</Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleInstructionDragEnd}
        >
          <SortableContext
            items={instructionFields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {instructionFields.map((field, index) => (
                <SortableInstructionRow
                  key={field.id}
                  id={field.id}
                  index={index}
                  register={register}
                  onRemove={removeInstruction}
                />
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
      </div>

      {/* Macros */}
      <div className="flex flex-col gap-4">
        <Label>Macros per serving</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['calories', 'Calories (kcal)'],
              ['protein_g', 'Protein (g)'],
              ['carbs_g', 'Carbs (g)'],
              ['fat_g', 'Fat (g)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`rf-${key}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`rf-${key}`}
                type="number"
                min="0"
                step="0.1"
                aria-invalid={!!errors.macros_per_serving?.[key]}
                {...register(`macros_per_serving.${key}`)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['fiber_g', 'Fiber (g)'],
              ['sugar_g', 'Sugar (g)'],
              ['sodium_mg', 'Sodium (mg)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`rf-${key}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`rf-${key}`}
                type="number"
                min="0"
                step="0.1"
                placeholder="—"
                {...register(`macros_per_serving.${key}`)}
              />
            </div>
          ))}
        </div>

        <Controller
          name="macros_verified"
          control={control}
          render={({ field }) => (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <span className="text-sm">Macros verified from source</span>
            </label>
          )}
        />
      </div>

      {/* Source */}
      <div className="flex flex-col gap-3">
        <Label>Source (optional)</Label>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-source-url" className="text-xs">URL</Label>
            <Input
              id="rf-source-url"
              type="url"
              placeholder="https://…"
              {...register('source_url')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rf-site-name" className="text-xs">Site Name</Label>
            <Input
              id="rf-site-name"
              placeholder="e.g. Serious Eats"
              {...register('source_site_name')}
            />
          </div>
        </div>
      </div>
    </form>
  )
}
