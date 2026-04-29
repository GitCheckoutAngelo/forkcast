import { z } from 'zod'

const optionalNumber = z.union([
  z.string().transform((v): number | undefined => (v === '' ? undefined : Number(v))),
  z.number(),
  z.null().transform((): undefined => undefined),
  z.undefined(),
]).pipe(z.number().min(0).optional())

export const SERVING_UNITS = ['serving', 'g', 'ml', 'piece', 'cup', 'tbsp', 'tsp', 'oz'] as const

export const foodItemFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  brand: z.string().optional(),
  serving_size: z.coerce.number().min(0.01, 'Must be greater than 0'),
  serving_unit: z.enum(SERVING_UNITS),
  notes: z.string().optional(),
  macros_per_serving: z.object({
    calories: z.coerce.number().min(0),
    protein_g: z.coerce.number().min(0),
    carbs_g: z.coerce.number().min(0),
    fat_g: z.coerce.number().min(0),
    fiber_g: optionalNumber,
    sugar_g: optionalNumber,
    sodium_mg: optionalNumber,
  }),
})

export type FoodItemFormValues = z.infer<typeof foodItemFormSchema>
