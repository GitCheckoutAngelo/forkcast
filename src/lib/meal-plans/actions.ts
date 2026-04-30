'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { Macros } from '@/types'

export async function createMealPlan(
  startDate: string,
  name?: string
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_meal_plan', {
    p_start_date: startDate,
    p_name: name ?? null,
  })

  if (error) return { error: error.message }
  revalidatePath('/plans')
  return { id: data as string }
}

export async function updateMealPlan(
  id: string,
  updates: { name?: string | null; notes?: string | null }
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meal_plans')
    .update(updates)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/plans/${id}`)
  revalidatePath('/plans')
  return {}
}

export async function deleteMealPlan(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('meal_plans').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/plans')
  return {}
}

export async function deleteAllMealPlans(): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('meal_plans').delete().eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/plans')
  revalidatePath('/settings')
  return {}
}

export async function addMealEntry(
  slotId: string,
  consumable:
    | { kind: 'recipe'; recipeId: string }
    | { kind: 'food_item'; foodItemId: string },
  servings = 1
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('meal_entries')
    .select('position')
    .eq('meal_slot_id', slotId)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition =
    existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0

  const payload: Record<string, unknown> = {
    meal_slot_id: slotId,
    position: nextPosition,
    servings,
    recipe_id: null,
    food_item_id: null,
  }

  if (consumable.kind === 'recipe') {
    payload.recipe_id = consumable.recipeId
  } else {
    payload.food_item_id = consumable.foodItemId
  }

  const { data, error } = await supabase
    .from('meal_entries')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as { id: string }).id }
}

export async function updateMealEntry(
  id: string,
  updates: {
    servings?: number
    macros_override?: Macros | null
    notes?: string | null
  }
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meal_entries')
    .update(updates)
    .eq('id', id)

  if (error) return { error: error.message }
  return {}
}

export async function deleteMealEntry(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('meal_entries').delete().eq('id', id)

  if (error) return { error: error.message }
  return {}
}

export async function removeSnackSlot(slotId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  // Only snack slots are removable; DB cascade deletes child meal_entries.
  const { error } = await supabase
    .from('meal_slots')
    .delete()
    .eq('id', slotId)
    .eq('slot_type', 'snack')

  if (error) return { error: error.message }
  return {}
}

export async function addSnackSlot(
  planDayId: string
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('meal_slots')
    .select('position')
    .eq('plan_day_id', planDayId)
    .eq('slot_type', 'snack')
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition =
    existing && existing.length > 0 ? (existing[0].position as number) + 1 : 1

  const { data, error } = await supabase
    .from('meal_slots')
    .insert({ plan_day_id: planDayId, slot_type: 'snack', position: nextPosition })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as { id: string }).id }
}
