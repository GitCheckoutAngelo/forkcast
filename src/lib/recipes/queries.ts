import { createClient } from '@/lib/supabase/server'
import type { Recipe, RecipeIngredient } from '@/types'

export type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] }

export async function listRecipes(): Promise<RecipeWithIngredients[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recipes')
    .select('*, ingredients:recipe_ingredients(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as unknown as RecipeWithIngredients[]) ?? []
}
