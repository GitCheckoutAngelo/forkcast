'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { GroceryItem, GroceryList } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

type FetchResult = { ok: true; list: GroceryList } | { ok: false; error: string }

async function fetchListAndVerifyOwnership(listId: string): Promise<FetchResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('id', listId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'List not found' }
  return { ok: true, list: data as GroceryList }
}

// ── Toggle checked state ─────────────────────────────────────────────────────

export async function toggleGroceryItem(
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<{ error?: string; list?: GroceryList }> {
  const result = await fetchListAndVerifyOwnership(listId)
  if (!result.ok) return { error: result.error }

  const updatedItems = result.list.items.map((item) =>
    item.id === itemId ? { ...item, checked } : item
  )

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grocery_lists')
    .update({ items: updatedItems })
    .eq('id', listId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]/grocery`, 'page')
  return { list: data as GroceryList }
}

// ── Update item fields (name, quantity_text, notes) ──────────────────────────

export async function updateGroceryItem(
  listId: string,
  itemId: string,
  fields: Partial<Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>>,
): Promise<{ error?: string; list?: GroceryList }> {
  const result = await fetchListAndVerifyOwnership(listId)
  if (!result.ok) return { error: result.error }

  const updatedItems = result.list.items.map((item) =>
    item.id === itemId ? { ...item, ...fields } : item
  )

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grocery_lists')
    .update({ items: updatedItems })
    .eq('id', listId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]/grocery`, 'page')
  return { list: data as GroceryList }
}

// ── Add a custom item not derived from the plan ───────────────────────────────

export async function addCustomGroceryItem(
  listId: string,
  item: Pick<GroceryItem, 'name' | 'quantity_text' | 'notes'>,
): Promise<{ error?: string; list?: GroceryList }> {
  const result = await fetchListAndVerifyOwnership(listId)
  if (!result.ok) return { error: result.error }

  const newItem: GroceryItem = {
    id: crypto.randomUUID(),
    name: item.name,
    quantity_text: item.quantity_text,
    category: null,
    checked: false,
    is_pantry_staple: false,
    sources: [],
    notes: item.notes,
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grocery_lists')
    .update({ items: [...result.list.items, newItem] })
    .eq('id', listId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]/grocery`, 'page')
  return { list: data as GroceryList }
}

// ── Trip management ──────────────────────────────────────────────────────────

export async function createEmptyTrip(
  mealPlanId: string,
  startDate: string,
  endDate: string,
  name?: string,
): Promise<{ error?: string; trip?: GroceryList }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Verify the plan belongs to this user via RLS
  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id')
    .eq('id', mealPlanId)
    .maybeSingle()
  if (!plan) return { error: 'Plan not found' }

  const { data, error } = await supabase
    .from('grocery_lists')
    .insert({
      meal_plan_id: mealPlanId,
      start_date: startDate,
      end_date: endDate,
      name: name ?? null,
      items: [],
      generated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]`, 'page')
  return { trip: data as GroceryList }
}

export async function updateTripMeta(
  tripId: string,
  meta: { name?: string | null; start_date?: string; end_date?: string },
): Promise<{ error?: string; trip?: GroceryList }> {
  const result = await fetchListAndVerifyOwnership(tripId)
  if (!result.ok) return { error: result.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('grocery_lists')
    .update(meta)
    .eq('id', tripId)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]`, 'page')
  return { trip: data as GroceryList }
}

// Splits an existing trip into two.
// firstPartEndDate and newTripStartDate are supplied by the caller (client),
// which already has the plan's date array — no server-side date math needed.
export async function splitTrip(
  tripId: string,
  firstPartEndDate: string,
  newTripStartDate: string,
): Promise<{ error?: string; updatedTrip?: GroceryList; newTrip?: GroceryList }> {
  const result = await fetchListAndVerifyOwnership(tripId)
  if (!result.ok) return { error: result.error }

  const trip = result.list
  const supabase = await createClient()

  // Determine which half has meal entries so we can preserve the existing
  // grocery list on the side that still needs it.
  const { data: planDays } = await supabase
    .from('plan_days')
    .select('date, meal_slots(meal_entries(id))')
    .eq('meal_plan_id', trip.meal_plan_id)

  const days = (planDays ?? []) as Array<{
    date: string
    meal_slots: Array<{ meal_entries: Array<{ id: string }> }>
  }>

  const hasEntriesInRange = (start: string, end: string) =>
    days.some(
      (d) =>
        d.date >= start &&
        d.date <= end &&
        d.meal_slots.some((s) => s.meal_entries.length > 0),
    )

  const firstHasEntries  = hasEntriesInRange(trip.start_date, firstPartEndDate)
  const secondHasEntries = hasEntriesInRange(newTripStartDate, trip.end_date)

  // Keep items on the side that exclusively has entries; clear both otherwise.
  let firstItems:  GroceryItem[] = []
  let secondItems: GroceryItem[] = []
  if (trip.items.length > 0) {
    if (firstHasEntries && !secondHasEntries)  firstItems  = trip.items
    else if (secondHasEntries && !firstHasEntries) secondItems = trip.items
  }

  const { error: updateError } = await supabase
    .from('grocery_lists')
    .update({ end_date: firstPartEndDate, items: firstItems })
    .eq('id', tripId)

  if (updateError) return { error: updateError.message }

  const { data: newTrip, error: insertError } = await supabase
    .from('grocery_lists')
    .insert({
      meal_plan_id: trip.meal_plan_id,
      start_date: newTripStartDate,
      end_date: trip.end_date,
      name: null,
      items: secondItems,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertError) return { error: insertError.message }

  revalidatePath(`/plans/[id]`, 'page')
  return {
    updatedTrip: { ...trip, end_date: firstPartEndDate, items: firstItems },
    newTrip: newTrip as GroceryList,
  }
}

// Merges two adjacent trips into one. The earlier trip survives; the later
// trip is deleted. The surviving trip's end_date expands to cover both ranges.
export async function mergeTrips(
  keepTripId: string,
  deleteTripId: string,
): Promise<{ error?: string; mergedTrip?: GroceryList }> {
  const keepResult   = await fetchListAndVerifyOwnership(keepTripId)
  const deleteResult = await fetchListAndVerifyOwnership(deleteTripId)
  if (!keepResult.ok)   return { error: keepResult.error }
  if (!deleteResult.ok) return { error: deleteResult.error }

  const keepTrip   = keepResult.list
  const deleteTrip = deleteResult.list

  const newStartDate = keepTrip.start_date < deleteTrip.start_date ? keepTrip.start_date : deleteTrip.start_date
  const newEndDate   = keepTrip.end_date   > deleteTrip.end_date   ? keepTrip.end_date   : deleteTrip.end_date

  // If exactly one side has items, carry them onto the surviving trip.
  // If both have items, clear — the combined range needs regeneration.
  const keepHasItems   = keepTrip.items.length > 0
  const deleteHasItems = deleteTrip.items.length > 0
  const mergedItems: GroceryItem[] =
    keepHasItems && !deleteHasItems   ? keepTrip.items   :
    deleteHasItems && !keepHasItems   ? deleteTrip.items :
    []

  const supabase = await createClient()

  const { data: updated, error: updateError } = await supabase
    .from('grocery_lists')
    .update({ start_date: newStartDate, end_date: newEndDate, items: mergedItems })
    .eq('id', keepTripId)
    .select()
    .single()

  if (updateError) return { error: updateError.message }

  const { error: deleteError } = await supabase
    .from('grocery_lists')
    .delete()
    .eq('id', deleteTripId)

  if (deleteError) return { error: deleteError.message }

  revalidatePath(`/plans/[id]`, 'page')
  return { mergedTrip: updated as GroceryList }
}

export async function deleteTrip(tripId: string): Promise<{ error?: string }> {
  const result = await fetchListAndVerifyOwnership(tripId)
  if (!result.ok) return { error: result.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('grocery_lists')
    .delete()
    .eq('id', tripId)

  if (error) return { error: error.message }
  revalidatePath(`/plans/[id]`, 'page')
  return {}
}
