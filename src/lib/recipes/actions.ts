'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { RecipeFormValues } from './schema'

function buildPayload(data: RecipeFormValues, id?: string) {
  const source =
    data.source_url
      ? {
          url: data.source_url,
          site_name: data.source_site_name || null,
          scraped_at: new Date().toISOString(),
        }
      : null

  const instructions = data.instructions.map((i) => i.text).filter(Boolean)

  const macros: Record<string, number> = {
    calories: data.macros_per_serving.calories,
    protein_g: data.macros_per_serving.protein_g,
    carbs_g: data.macros_per_serving.carbs_g,
    fat_g: data.macros_per_serving.fat_g,
  }
  if (data.macros_per_serving.fiber_g != null) macros.fiber_g = data.macros_per_serving.fiber_g
  if (data.macros_per_serving.sugar_g != null) macros.sugar_g = data.macros_per_serving.sugar_g
  if (data.macros_per_serving.sodium_mg != null) macros.sodium_mg = data.macros_per_serving.sodium_mg

  return {
    recipe: {
      ...(id ? { id } : {}),
      name: data.name,
      description: data.description || null,
      source,
      servings: data.servings,
      prep_time_min: data.prep_time_min ?? null,
      cook_time_min: data.cook_time_min ?? null,
      instructions: instructions.length ? instructions : null,
      macros_per_serving: macros,
      macros_verified: data.macros_verified,
      cuisine: data.cuisine || null,
      meal_types: data.meal_types,
      tags: data.tags,
      image_url: data.image_url || null,
    },
    ingredients: data.ingredients.map((ing) => ({
      quantity: ing.quantity,
      unit: ing.unit || null,
      name: ing.name,
      preparation: ing.preparation || null,
      raw_text: ing.raw_text || ing.name,
    })),
  }
}

export async function createRecipe(
  data: RecipeFormValues
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { recipe, ingredients } = buildPayload(data)

  const { data: recipeId, error } = await supabase.rpc('upsert_recipe', {
    p_recipe: recipe,
    p_ingredients: ingredients,
  })

  if (error) return { error: error.message }
  revalidatePath('/recipes')
  return { id: recipeId as string }
}

export async function updateRecipe(
  id: string,
  data: RecipeFormValues
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { recipe, ingredients } = buildPayload(data, id)

  const { error } = await supabase.rpc('upsert_recipe', {
    p_recipe: recipe,
    p_ingredients: ingredients,
  })

  if (error) return { error: error.message }
  revalidatePath('/recipes')
  return {}
}

export async function deleteRecipe(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('recipes').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/recipes')
  return {}
}
