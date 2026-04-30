import { createClient } from '@/lib/supabase/server'
import type {
  MealPlan,
  MealPlanResolved,
  PlanDayResolved,
  MealSlotResolved,
  MealEntryResolved,
  Macros,
  MacroTarget,
  MealSlotType,
  Recipe,
  FoodItem,
} from '@/types'

// ── Shared helpers ──────────────────────────────────────────────────────────

import { ZERO_MACROS, scaleMacros, addMacros } from './utils'

function computeStatus(actual: number, target: number, tol: number): 'under' | 'on' | 'over' {
  if (target === 0) return 'on'
  if (actual < target * (1 - tol)) return 'under'
  if (actual > target * (1 + tol)) return 'over'
  return 'on'
}

function computeTargetStatus(actual: Macros, target: MacroTarget): PlanDayResolved['target_status'] {
  const tol = (target.tolerance_pct ?? 5) / 100
  return {
    calories: computeStatus(actual.calories, target.calories, tol),
    protein_g: computeStatus(actual.protein_g, target.protein_g, tol),
    carbs_g: computeStatus(actual.carbs_g, target.carbs_g, tol),
    fat_g: computeStatus(actual.fat_g, target.fat_g, tol),
  }
}

// Slot display order
const SLOT_ORDER: Record<MealSlotType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
}

// ── Raw Supabase shapes ──────────────────────────────────────────────────────
// These match what the nested .select() query returns before we resolve them.

type RawRecipePartial = {
  id: string
  name: string
  description: string | null
  macros_per_serving: Macros
  servings: number
  image_url: string | null
  cuisine: string | null
  meal_types: string[]
  tags: string[]
}

type RawFoodItemPartial = {
  id: string
  name: string
  brand: string | null
  macros_per_serving: Macros
  serving_size: number
  serving_unit: string
  notes: string | null
}

type RawEntry = {
  id: string
  meal_slot_id: string
  position: number
  recipe_id: string | null
  food_item_id: string | null
  servings: number
  macros_override: Macros | null
  notes: string | null
  recipe: RawRecipePartial | null
  food_item: RawFoodItemPartial | null
}

type RawSlot = {
  id: string
  plan_day_id: string
  slot_type: string
  position: number
  notes: string | null
  entries: RawEntry[]
}

type RawDay = {
  id: string
  meal_plan_id: string
  date: string
  macro_target_override: MacroTarget | null
  notes: string | null
  slots: RawSlot[]
}

type RawPlan = MealPlan & { days: RawDay[] }

// ── Resolution helpers ───────────────────────────────────────────────────────

function resolveEntry(e: RawEntry): MealEntryResolved {
  const consumable: MealEntryResolved['consumable'] = e.recipe
    ? { kind: 'recipe', recipe: e.recipe as unknown as Recipe }
    : { kind: 'food_item', food_item: e.food_item as unknown as FoodItem }

  const baseMacros = e.recipe?.macros_per_serving ?? e.food_item!.macros_per_serving
  const effective_macros = e.macros_override ?? scaleMacros(baseMacros, e.servings)

  return {
    id: e.id,
    meal_slot_id: e.meal_slot_id,
    position: e.position,
    recipe_id: e.recipe_id,
    food_item_id: e.food_item_id,
    servings: e.servings,
    macros_override: e.macros_override,
    notes: e.notes,
    consumable,
    effective_macros,
  }
}

function resolveSlot(s: RawSlot): MealSlotResolved {
  const entries = [...s.entries]
    .sort((a, b) => a.position - b.position)
    .map(resolveEntry)

  const total_macros = entries.reduce(
    (acc, e) => addMacros(acc, e.effective_macros),
    ZERO_MACROS
  )

  return {
    id: s.id,
    plan_day_id: s.plan_day_id,
    slot_type: s.slot_type as MealSlotType,
    position: s.position,
    notes: s.notes,
    entries,
    total_macros,
  }
}

function resolveDay(d: RawDay, userTarget: MacroTarget | null): PlanDayResolved {
  const slots = [...d.slots]
    .sort((a, b) => {
      const typeOrder = SLOT_ORDER[a.slot_type as MealSlotType] - SLOT_ORDER[b.slot_type as MealSlotType]
      return typeOrder !== 0 ? typeOrder : a.position - b.position
    })
    .map(resolveSlot)

  const total_macros = slots.reduce(
    (acc, s) => addMacros(acc, s.total_macros),
    ZERO_MACROS
  )

  const target = d.macro_target_override ?? userTarget ?? null
  const target_status = target ? computeTargetStatus(total_macros, target) : null

  return {
    id: d.id,
    meal_plan_id: d.meal_plan_id,
    date: d.date,
    macro_target_override: d.macro_target_override,
    notes: d.notes,
    slots,
    total_macros,
    target,
    target_status,
  }
}

// ── Public queries ───────────────────────────────────────────────────────────

export type MealPlanSummary = MealPlan & {
  total_entries: number
  avg_daily_calories: number
}

export async function listMealPlans(): Promise<MealPlanSummary[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      *,
      days:plan_days (
        slots:meal_slots (
          entries:meal_entries (
            servings,
            macros_override,
            recipe:recipes (macros_per_serving),
            food_item:food_items (macros_per_serving)
          )
        )
      )
    `)
    .order('start_date', { ascending: false })

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as unknown as any[]) ?? []).map((plan) => {
    let totalEntries = 0
    let totalCalories = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const day of (plan.days ?? []) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const slot of (day.slots ?? []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const entry of (slot.entries ?? []) as any[]) {
          totalEntries++
          const baseCals =
            (entry.recipe?.macros_per_serving?.calories ?? 0) ||
            (entry.food_item?.macros_per_serving?.calories ?? 0)
          const cals = entry.macros_override?.calories ?? baseCals * entry.servings
          totalCalories += cals
        }
      }
    }

    const { days: _days, ...planBase } = plan
    return {
      ...(planBase as MealPlan),
      total_entries: totalEntries,
      avg_daily_calories: Math.round(totalCalories / 7),
    }
  })
}

export async function getMealPlan(
  id: string,
  userTarget: MacroTarget | null
): Promise<MealPlanResolved | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meal_plans')
    .select(`
      *,
      days:plan_days (
        *,
        slots:meal_slots (
          *,
          entries:meal_entries (
            *,
            recipe:recipes (id, name, description, macros_per_serving, servings, image_url, cuisine, meal_types, tags),
            food_item:food_items (id, name, brand, macros_per_serving, serving_size, serving_unit, notes)
          )
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }

  const raw = data as unknown as RawPlan
  const days = [...raw.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => resolveDay(d, userTarget))

  return { ...raw, days }
}

export async function getUserProfile(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, macro_target, week_start_day, timezone, grocery_ignore_list')
    .eq('id', userId)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as {
    id: string
    display_name: string | null
    macro_target: MacroTarget | null
    week_start_day: number
    timezone: string
    grocery_ignore_list: string[]
  }
}
