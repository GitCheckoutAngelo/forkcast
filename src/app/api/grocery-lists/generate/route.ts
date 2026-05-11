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

const IMPERIAL_CONVERSIONS: Record<string, { factor: number; to: 'g' | 'ml' }> = {
  oz: { factor: 28, to: 'g' },
  ounce: { factor: 28, to: 'g' },
  ounces: { factor: 28, to: 'g' },
  lb: { factor: 454, to: 'g' },
  lbs: { factor: 454, to: 'g' },
  pound: { factor: 454, to: 'g' },
  pounds: { factor: 454, to: 'g' },
  'fl oz': { factor: 30, to: 'ml' },
  'fluid ounce': { factor: 30, to: 'ml' },
  'fluid ounces': { factor: 30, to: 'ml' },
  pint: { factor: 480, to: 'ml' },
  pints: { factor: 480, to: 'ml' },
  pt: { factor: 480, to: 'ml' },
}

// Grocery-friendly rounding for metric weight/volume values.
// Used on both contributions going into the AI and on the AI's output strings.
function applyMetricRounding(qty: number, unit: 'g' | 'kg' | 'ml' | 'L'): [number, 'g' | 'kg' | 'ml' | 'L'] {
  if (unit === 'g' && qty >= 500) return [Math.round(qty / 100) / 10, 'kg']
  if (unit === 'ml' && qty >= 1000) return [Math.round(qty / 100) / 10, 'L']
  if (unit === 'kg') return [Math.round(qty * 10) / 10, 'kg']
  if (unit === 'L') return [Math.round(qty * 10) / 10, 'L']
  if (unit === 'g') {
    if (qty < 10)  return [Math.round(qty * 10) / 10, 'g']
    if (qty < 100) return [Math.round(qty / 5) * 5, 'g']
    return [Math.round(qty / 25) * 25, 'g']
  }
  // ml
  if (qty < 25)  return [Math.round(qty * 10) / 10, 'ml']
  if (qty < 100) return [Math.round(qty / 5) * 5, 'ml']
  if (qty < 500) return [Math.round(qty / 25) * 25, 'ml']
  return [Math.round(qty / 50) * 50, 'ml']
}

function normalizeQty(qty: number, unit: string): [number, string] {
  const key = unit.trim().toLowerCase()
  const conv = IMPERIAL_CONVERSIONS[key]
  const q = conv ? qty * conv.factor : qty
  const u = conv ? conv.to : key

  if (u === 'g' || u === 'kg' || u === 'ml' || u === 'L') {
    return applyMetricRounding(q, u as 'g' | 'kg' | 'ml' | 'L')
  }
  return [Math.round(q * 100) / 100, conv ? u : unit]
}

// Re-rounds the AI's free-form quantity_text for simple g/kg/ml/L patterns.
function cleanQuantityText(text: string): string {
  const m = text.trim().match(/^([\d.]+)\s*(g|kg|ml|mL|L)$/i)
  if (!m) return text
  const qty = parseFloat(m[1])
  if (isNaN(qty) || qty <= 0) return text
  const rawUnit = m[2]
  const unit = (rawUnit.toLowerCase() === 'l' ? 'L' : rawUnit.toLowerCase()) as 'g' | 'kg' | 'ml' | 'L'
  const [rq, ru] = applyMetricRounding(qty, unit)
  const decimals = ru === 'kg' || ru === 'L' ? 1 : 0
  return `${rq.toFixed(decimals)} ${ru}`
}

function formatQty(quantity: number | null, unit: string | null, rawText: string): string {
  if (quantity !== null && quantity > 0) {
    const [q, u] = unit ? normalizeQty(quantity, unit) : [quantity, null]
    const display = parseFloat((Math.round(q * 100) / 100).toFixed(2))
    return u ? `${display} ${u}` : `${display}`
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
type RawDay = { date: string; slots: RawSlot[] }
type RawPlan = { id: string; name: string | null; start_date: string; end_date: string; days: RawDay[] }

// ── Build contributions ───────────────────────────────────────────────────────

function buildContributions(plan: RawPlan, startDate: string, endDate: string): Contribution[] {
  const contributions: Contribution[] = []

  for (const day of plan.days) {
    // Filter to only days within the requested trip date range
    if (day.date < startDate || day.date > endDate) continue

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
2. Sum quantities into a readable string. Convert imperial weight/volume to metric first (1 oz→28g, 1 lb→454g, 1 fl oz→30ml, 1 pint→480ml), then apply scale-up rounding: ≥500g express in kg rounded to 1 decimal (e.g. 908g→0.9kg, 1360g→1.4kg); ≥1000ml express in L rounded to 1 decimal. Keep cups, tbsp, tsp as-is — do not convert them to ml. For countable items use natural language ("3 medium onions").
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
    quantity_text: cleanQuantityText(item.quantity_text),
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

    const body = await req.json()
    const { meal_plan_id, start_date, end_date } = body as {
      meal_plan_id?: string
      start_date?: string
      end_date?: string
    }

    if (!meal_plan_id || typeof meal_plan_id !== 'string') {
      return NextResponse.json({ error: 'meal_plan_id is required' }, { status: 400 })
    }
    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: planData, error: planError } = await supabase
      .from('meal_plans')
      .select(`
        id, name, start_date, end_date,
        days:plan_days (
          date,
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
    const contributions = buildContributions(plan, start_date, end_date)

    if (contributions.length === 0) {
      const { data, error } = await supabase
        .from('grocery_lists')
        .upsert(
          {
            meal_plan_id,
            start_date,
            end_date,
            items: [],
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'meal_plan_id,start_date' }
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
        {
          meal_plan_id,
          start_date,
          end_date,
          items,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'meal_plan_id,start_date' }
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
