import { createClient } from '@/lib/supabase/server'
import type { FoodItem } from '@/types'

export async function listFoodItems(): Promise<FoodItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('food_items')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as unknown as FoodItem[]) ?? []
}
