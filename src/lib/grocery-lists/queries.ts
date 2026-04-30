import { createClient } from '@/lib/supabase/server'
import type { GroceryList } from '@/types'

export async function getGroceryList(mealPlanId: string): Promise<GroceryList | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('meal_plan_id', mealPlanId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as GroceryList | null
}
