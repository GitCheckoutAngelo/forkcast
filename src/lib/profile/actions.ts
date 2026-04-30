'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import type { WeekStartDay } from '@/types'

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  display_name: z.string().max(100).nullable(),
})

const macroTargetSchema = z.object({
  calories: z.number().positive('Calories must be greater than 0'),
  protein_g: z.number().nonnegative('Protein must be 0 or greater'),
  carbs_g: z.number().nonnegative('Carbs must be 0 or greater'),
  fat_g: z.number().nonnegative('Fat must be 0 or greater'),
  tolerance_pct: z.number().min(0, 'Must be 0–20').max(20, 'Must be 0–20').default(5),
})

const preferencesSchema = z.object({
  week_start_day: z.number().int().min(0).max(6),
  timezone: z.string().min(1, 'Timezone is required'),
})

const groceryIgnoreListSchema = z.array(
  z.string().trim().min(1).max(100).toLowerCase()
).max(100, 'List cannot exceed 100 items')

// ── Actions ───────────────────────────────────────────────────────────────────

export async function updateProfile(
  data: { display_name: string | null }
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = profileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return {}
}

export async function updateMacroTarget(
  data: z.infer<typeof macroTargetSchema> | null
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  let validated: z.infer<typeof macroTargetSchema> | null = null
  if (data !== null) {
    const parsed = macroTargetSchema.safeParse(data)
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    validated = parsed.data
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ macro_target: validated })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  // Revalidate plan pages so target-status dots reflect the new target immediately.
  revalidatePath('/plans', 'layout')
  return {}
}

export async function updatePreferences(
  data: { week_start_day: number; timezone: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = preferencesSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Block week_start_day change when the user has existing meal plans, because
  // all plan start_dates must align to week_start_day and there's no migration path.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('week_start_day')
    .eq('id', user.id)
    .single()

  if (profile && profile.week_start_day !== parsed.data.week_start_day) {
    const { count } = await supabase
      .from('meal_plans')
      .select('id', { count: 'exact', head: true })

    if (count && count > 0) {
      return {
        error: `You have ${count} meal ${count === 1 ? 'plan' : 'plans'}. Delete them before changing your week start day.`,
      }
    }
  }

  const { error } = await supabase
    .from('user_profiles')
    .update({
      week_start_day: parsed.data.week_start_day as WeekStartDay,
      timezone: parsed.data.timezone,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  revalidatePath('/plans')
  return {}
}

export async function updateGroceryIgnoreList(
  items: string[]
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const parsed = groceryIgnoreListSchema.safeParse(items)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Deduplicate after normalisation
  const deduped = [...new Set(parsed.data)]

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ grocery_ignore_list: deduped })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return {}
}
