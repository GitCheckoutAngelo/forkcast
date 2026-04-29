'use client'

import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { foodItemFormSchema, SERVING_UNITS, type FoodItemFormValues } from '@/lib/food-items/schema'
import type { FoodItem } from '@/types'

export function toFormValues(item: FoodItem): FoodItemFormValues {
  return {
    name: item.name,
    brand: item.brand ?? '',
    serving_size: item.serving_size,
    serving_unit: item.serving_unit,
    notes: item.notes ?? '',
    macros_per_serving: {
      calories: item.macros_per_serving.calories,
      protein_g: item.macros_per_serving.protein_g,
      carbs_g: item.macros_per_serving.carbs_g,
      fat_g: item.macros_per_serving.fat_g,
      fiber_g: item.macros_per_serving.fiber_g,
      sugar_g: item.macros_per_serving.sugar_g,
      sodium_mg: item.macros_per_serving.sodium_mg,
    },
  }
}

const DEFAULT_VALUES: FoodItemFormValues = {
  name: '',
  brand: '',
  serving_size: 100,
  serving_unit: 'g',
  notes: '',
  macros_per_serving: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
}

interface FoodItemFormProps {
  defaultValues?: FoodItemFormValues
  onSubmit: (data: FoodItemFormValues) => Promise<void>
  isSubmitting?: boolean
  formId?: string
}

export default function FoodItemForm({
  defaultValues,
  onSubmit,
  formId = 'food-item-form',
}: FoodItemFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FoodItemFormValues>({
    resolver: zodResolver(foodItemFormSchema) as Resolver<FoodItemFormValues>,
    defaultValues: defaultValues ?? DEFAULT_VALUES,
  })

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fi-name">Name *</Label>
        <Input id="fi-name" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Brand */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fi-brand">Brand</Label>
        <Input id="fi-brand" placeholder="e.g. Chobani" {...register('brand')} />
      </div>

      {/* Serving size + unit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fi-serving-size">Serving size *</Label>
          <Input
            id="fi-serving-size"
            type="number"
            min="0.01"
            step="any"
            aria-invalid={!!errors.serving_size}
            {...register('serving_size')}
          />
          {errors.serving_size && (
            <p className="text-xs text-destructive">{errors.serving_size.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Serving unit *</Label>
          <Controller
            name="serving_unit"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {SERVING_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.serving_unit && (
            <p className="text-xs text-destructive">{errors.serving_unit.message}</p>
          )}
        </div>
      </div>

      {/* Required macros */}
      <div className="flex flex-col gap-3">
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
              <Label htmlFor={`fi-${key}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`fi-${key}`}
                type="number"
                min="0"
                step="0.1"
                aria-invalid={!!errors.macros_per_serving?.[key]}
                {...register(`macros_per_serving.${key}`)}
              />
            </div>
          ))}
        </div>

        {/* Optional macros */}
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['fiber_g', 'Fiber (g)'],
              ['sugar_g', 'Sugar (g)'],
              ['sodium_mg', 'Sodium (mg)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`fi-${key}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`fi-${key}`}
                type="number"
                min="0"
                step="0.1"
                placeholder="—"
                {...register(`macros_per_serving.${key}`)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fi-notes">Notes</Label>
        <Textarea
          id="fi-notes"
          className="resize-none"
          placeholder="Optional notes…"
          {...register('notes')}
        />
      </div>
    </form>
  )
}
