export interface RecipePreview {
  source: { url: string; site_name: string }
  title: string
  image_url?: string
  description?: string
  estimated_time_min?: number
  estimated_servings?: number
}

export interface RecipeCandidate {
  name: string
  description?: string
  servings: number
  prep_time_min?: number | null
  cook_time_min?: number | null
  cuisine?: string
  image_url?: string
  meal_types: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>
  tags: string[]
  instructions: string[]
  ingredients: Array<{
    quantity?: number | null
    unit?: string | null
    name: string
    preparation?: string | null
    raw_text: string
  }>
  macros_per_serving: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g?: number
    sugar_g?: number
    sodium_mg?: number
  }
  macros_verified: boolean
  source_url?: string
  source_site_name?: string
}

export interface RecipeScrapeRequest {
  url: string
}
