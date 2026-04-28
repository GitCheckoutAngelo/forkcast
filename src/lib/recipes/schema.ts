import { z } from 'zod'

// Accepts string (from HTML input) or number or null → number | null
// Empty string or null or undefined → null
const nullableNumber = z.union([
  z.string().transform((v): number | null => (v === '' ? null : Number(v))),
  z.number(),
  z.null(),
  z.undefined().transform((): null => null),
]).pipe(z.number().nullable())

const optionalNumber = z.union([
  z.string().transform((v): number | undefined => (v === '' ? undefined : Number(v))),
  z.number(),
  z.null().transform((): undefined => undefined),
  z.undefined(),
]).pipe(z.number().min(0).optional())

export const ingredientSchema = z.object({
  quantity: nullableNumber,
  unit: z.string().nullable().transform((v) => v || null),
  name: z.string().min(1, 'Ingredient name is required'),
  preparation: z.string().nullable().transform((v) => v || null),
  raw_text: z.string().default(''),
})

export const recipeFormSchema = z.object({
  name: z.string().min(1, 'Recipe name is required'),
  description: z.string().optional(),
  servings: z.coerce.number().min(0.1, 'Must be > 0'),
  prep_time_min: nullableNumber,
  cook_time_min: nullableNumber,
  cuisine: z.string().optional(),
  image_url: z.string().optional(),
  meal_types: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])),
  tags: z.array(z.string()),
  instructions: z.array(z.object({ text: z.string() })),
  ingredients: z.array(ingredientSchema),
  macros_per_serving: z.object({
    calories: z.coerce.number().min(0),
    protein_g: z.coerce.number().min(0),
    carbs_g: z.coerce.number().min(0),
    fat_g: z.coerce.number().min(0),
    fiber_g: optionalNumber,
    sugar_g: optionalNumber,
    sodium_mg: optionalNumber,
  }),
  macros_verified: z.boolean(),
  source_url: z.string().optional(),
  source_site_name: z.string().optional(),
})

export type RecipeFormValues = z.infer<typeof recipeFormSchema>
