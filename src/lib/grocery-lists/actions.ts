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
