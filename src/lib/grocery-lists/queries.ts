import { createClient } from '@/lib/supabase/server'
import type { GroceryList } from '@/types'

export async function getGroceryList(mealPlanId: string): Promise<GroceryList | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('meal_plan_id', mealPlanId)
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as GroceryList | null
}

export async function listGroceryTrips(mealPlanId: string): Promise<GroceryList[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('meal_plan_id', mealPlanId)
    .order('start_date', { ascending: true })

  if (error) throw new Error(error.message)
  const trips = (data ?? []) as GroceryList[]
  if (trips.length === 0) return trips

  // Compute is_stale: a generated trip is stale when any plan_day in its date
  // range has updated_at > generated_at. plan_days.updated_at is bumped by a
  // trigger on meal_entries (INSERT, UPDATE, DELETE), so deletes are covered too.
  const { data: planDays } = await supabase
    .from('plan_days')
    .select('date, updated_at')
    .eq('meal_plan_id', mealPlanId)

  const days = (planDays ?? []) as Array<{ date: string; updated_at: string }>

  return trips.map((trip) => {
    if (trip.items.length === 0) return { ...trip, is_stale: false }

    const is_stale = days.some(
      (day) =>
        day.date >= trip.start_date &&
        day.date <= trip.end_date &&
        day.updated_at > trip.generated_at
    )

    return { ...trip, is_stale }
  })
}
