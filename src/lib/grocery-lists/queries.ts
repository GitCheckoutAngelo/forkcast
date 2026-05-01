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

  // Fetch plan_days with enough info to compute is_stale and has_entries.
  // meal_slots->meal_entries lets us detect whether any entries exist per day.
  const { data: planDays } = await supabase
    .from('plan_days')
    .select('date, updated_at, meal_slots(meal_entries(id))')
    .eq('meal_plan_id', mealPlanId)

  const days = (planDays ?? []) as Array<{
    date: string
    updated_at: string
    meal_slots: Array<{ meal_entries: Array<{ id: string }> }>
  }>

  const datesWithEntries = new Set(
    days
      .filter((d) => d.meal_slots.some((s) => s.meal_entries.length > 0))
      .map((d) => d.date)
  )

  return trips.map((trip) => {
    const has_entries = days.some(
      (d) => d.date >= trip.start_date && d.date <= trip.end_date && datesWithEntries.has(d.date)
    )

    if (trip.items.length === 0) return { ...trip, is_stale: false, has_entries }

    const is_stale = days.some(
      (day) =>
        day.date >= trip.start_date &&
        day.date <= trip.end_date &&
        day.updated_at > trip.generated_at
    )

    return { ...trip, is_stale, has_entries }
  })
}
