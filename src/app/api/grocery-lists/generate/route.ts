import { NextResponse } from 'next/server'
import { z } from 'zod'
import { anthropic } from '@/lib/anthropic/client'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { GroceryItem, GroceryItemSource } from '@/types'

// ── Output schema ─────────────────────────────────────────────────────────────
// Claude outputs source INDICES into the contributions array, not full source
// objects. This cuts output tokens by ~5× for a well-populated week:
//   Full sources: 70 items × 3 sources × ~90 chars ≈ 19,000 chars ≈ 5,000 tokens
//   Indices:      70 items × 3 indices  ×  ~3 chars ≈    630 chars ≈   160 tokens

const claudeItemSchema = z.object({
  name: z.string().min(1),
  quantity_text: z.string().default(''),
  category: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  src: z.array(z.number().int().nonnegative()).default([]),
  ps: z.boolean().default(false),  // is_pantry_staple
})

const claudeOutputSchema = z.array(claudeItemSchema)

// ── Input types ───────────────────────────────────────────────────────────────

interface IngredientContribution {
  kind: 'recipe'
  recipe_id: string
  recipe_name: string
  name: string
  qty: string
}

interface FoodItemContribution {
  kind: 'food_item'
  food_item_id: string
  food_item_name: string
  brand: string | null
  qty: string
}

type Contribution = IngredientContribution | FoodItemContribution

// ── Quantity formatting ───────────────────────────────────────────────────────

function formatQty(quantity: number | null, unit: string | null, rawText: string): string {
  if (quantity !== null && quantity > 0) {
    const rounded = Math.round(quantity * 100) / 100
    return unit ? `${rounded} ${unit}` : `${rounded}`
  }
  return unit ?? rawText
}

function formatFoodItemQty(servings: number, servingSize: number, servingUnit: string): string {
  const totalSize = Math.round(servings * servingSize * 10) / 10
  const servingsRounded = Math.round(servings * 10) / 10
  return `${servingsRounded} serving${servingsRounded !== 1 ? 's' : ''} (${totalSize}${servingUnit})`
}

// ── Supabase raw shapes ───────────────────────────────────────────────────────

type RawIngredient = { quantity: number | null; unit: string | null; name: string; raw_text: string }
type RawRecipe = { id: string; name: string; servings: number; ingredients: RawIngredient[] }
type RawFoodItem = { id: string; name: string; brand: string | null; serving_size: number; serving_unit: string }
type RawEntry = { servings: number; recipe_id: string | null; food_item_id: string | null; recipe: RawRecipe | null; food_item: RawFoodItem | null }
type RawSlot = { entries: RawEntry[] }
type RawDay = { slots: RawSlot[] }
type RawPlan = { id: string; name: string | null; start_date: string; end_date: string; days: RawDay[] }

// ── Build contributions ───────────────────────────────────────────────────────

function buildContributions(plan: RawPlan): Contribution[] {
  const contributions: Contribution[] = []

  for (const day of plan.days) {
    for (const slot of day.slots) {
      for (const entry of slot.entries) {
        if (entry.recipe && entry.recipe.ingredients.length > 0) {
          const scaleFactor = entry.recipe.servings > 0
            ? entry.servings / entry.recipe.servings
            : 1

          for (const ing of entry.recipe.ingredients) {
            const scaledQty = ing.quantity !== null ? ing.quantity * scaleFactor : null
            contributions.push({
              kind: 'recipe',
              recipe_id: entry.recipe.id,
              recipe_name: entry.recipe.name,
              name: ing.name,
              qty: formatQty(scaledQty, ing.unit, ing.raw_text),
            })
          }
        } else if (entry.food_item) {
          contributions.push({
            kind: 'food_item',
            food_item_id: entry.food_item.id,
            food_item_name: entry.food_item.name,
            brand: entry.food_item.brand,
            qty: formatFoodItemQty(entry.servings, entry.food_item.serving_size, entry.food_item.serving_unit),
          })
        }
      }
    }
  }

  return contributions
}

// ── Reconstruct sources from indices ─────────────────────────────────────────

function reconstructSources(indices: number[], contributions: Contribution[]): GroceryItemSource[] {
  return indices
    .filter((i) => i >= 0 && i < contributions.length)
    .map((i) => {
      const c = contributions[i]
      if (c.kind === 'recipe') {
        return { kind: 'recipe' as const, id: c.recipe_id, name: c.recipe_name, contribution: c.qty }
      }
      return { kind: 'food_item' as const, id: c.food_item_id, name: c.food_item_name, contribution: c.qty }
    })
}

// ── AI aggregation ────────────────────────────────────────────────────────────

async function aggregateWithClaude(
  contributions: Contribution[],
  ignoreList: string[],
): Promise<GroceryItem[]> {
  const indexedInput = contributions.map((c, i) => ({ i, ...c }))

  const stapleClause = ignoreList.length > 0
    ? `\n6. Set "ps": true if the item's name fuzzy-matches (case-insensitive, partial word) any entry in this pantry staples list: ${JSON.stringify(ignoreList)}. Otherwise set "ps": false.`
    : '\n6. Set "ps": false for all items.'

  const systemPrompt = `You are a grocery list aggregator. Given a JSON array of ingredient contributions (each with an index "i"), produce a compact shopping list.

Rules:
1. Group identical or equivalent ingredients into one item ("yellow onion", "onion", "medium onion" → "onion").
2. Sum quantities into a readable string ("3 medium", "approx 500g", "2 cups").
3. Assign one category: produce, dairy, protein, pantry, frozen, bakery, or other.
4. food_item entries stay as their own line — do not break into sub-ingredients.
5. In "src", list the "i" values of every contribution that belongs to this item.${stapleClause}
7. Return ONLY a JSON array. No markdown fences, no explanation.

Output schema: [{"name":"...","quantity_text":"...","category":"produce","notes":null,"src":[0,2,5],"ps":false}]`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify(indexedInput) }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated — please try regenerating.')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No response from AI')
  }

  const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let jsonParsed: unknown
  try {
    jsonParsed = JSON.parse(raw)
  } catch {
    throw new Error('AI returned invalid JSON')
  }

  const result = claudeOutputSchema.safeParse(jsonParsed)
  if (!result.success) {
    throw new Error(`AI response failed validation: ${result.error.issues.map((i) => i.message).join(', ')}`)
  }

  return result.data.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    quantity_text: item.quantity_text,
    category: item.category,
    checked: false,
    is_pantry_staple: item.ps,
    notes: item.notes,
    sources: reconstructSources(item.src, contributions),
  }))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { meal_plan_id } = await req.json()
    if (!meal_plan_id || typeof meal_plan_id !== 'string') {
      return NextResponse.json({ error: 'meal_plan_id is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: planData, error: planError } = await supabase
      .from('meal_plans')
      .select(`
        id, name, start_date, end_date,
        days:plan_days (
          slots:meal_slots (
            entries:meal_entries (
              servings, recipe_id, food_item_id,
              recipe:recipes (
                id, name, servings,
                ingredients:recipe_ingredients (
                  quantity, unit, name, raw_text
                )
              ),
              food_item:food_items (
                id, name, brand, serving_size, serving_unit
              )
            )
          )
        )
      `)
      .eq('id', meal_plan_id)
      .single()

    if (planError) {
      if (planError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      }
      return NextResponse.json({ error: planError.message }, { status: 500 })
    }

    // Fetch user's pantry staples ignore list
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('grocery_ignore_list')
      .eq('id', user.id)
      .single()
    const ignoreList: string[] = profileData?.grocery_ignore_list ?? []

    const plan = planData as unknown as RawPlan
    const contributions = buildContributions(plan)

    if (contributions.length === 0) {
      const { data, error } = await supabase
        .from('grocery_lists')
        .upsert(
          { meal_plan_id, items: [], generated_at: new Date().toISOString() },
          { onConflict: 'meal_plan_id' }
        )
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    const items = await aggregateWithClaude(contributions, ignoreList)

    const { data, error } = await supabase
      .from('grocery_lists')
      .upsert(
        { meal_plan_id, items, generated_at: new Date().toISOString() },
        { onConflict: 'meal_plan_id' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
