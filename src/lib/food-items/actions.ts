'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { FoodItemFormValues } from './schema'

function buildMacros(data: FoodItemFormValues) {
  const macros: Record<string, number> = {
    calories: data.macros_per_serving.calories,
    protein_g: data.macros_per_serving.protein_g,
    carbs_g: data.macros_per_serving.carbs_g,
    fat_g: data.macros_per_serving.fat_g,
  }
  if (data.macros_per_serving.fiber_g != null) macros.fiber_g = data.macros_per_serving.fiber_g
  if (data.macros_per_serving.sugar_g != null) macros.sugar_g = data.macros_per_serving.sugar_g
  if (data.macros_per_serving.sodium_mg != null) macros.sodium_mg = data.macros_per_serving.sodium_mg
  return macros
}

export async function createFoodItem(
  data: FoodItemFormValues,
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('food_items')
    .insert({
      user_id: user.id,
      name: data.name,
      brand: data.brand || null,
      serving_size: data.serving_size,
      serving_unit: data.serving_unit,
      macros_per_serving: buildMacros(data),
      notes: data.notes || null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/food-items')
  return { id: (row as { id: string }).id }
}

export async function updateFoodItem(
  id: string,
  data: FoodItemFormValues,
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('food_items')
    .update({
      name: data.name,
      brand: data.brand || null,
      serving_size: data.serving_size,
      serving_unit: data.serving_unit,
      macros_per_serving: buildMacros(data),
      notes: data.notes || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/food-items')
  return {}
}

export async function deleteFoodItem(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('food_items').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/food-items')
  return {}
}
