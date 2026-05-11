import Link from 'next/link'
import Image from 'next/image'
import { Check, Clock, UtensilsCrossed } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/current-user'
import { createClient } from '@/lib/supabase/server'
import type { MacroTarget, Macros } from '@/types'

// ---- Types ------------------------------------------------------------------

type TodayMealCard = {
  slotType: 'breakfast' | 'lunch' | 'dinner'
  name: string | null
  calories: number | null
  isLogged: boolean
}

type SuggestedRecipe = {
  id: string
  name: string
  calories: number
  cookTimeMin: number | null
  tags: string[]
  imageUrl: string | null
}

// ---- Helpers ----------------------------------------------------------------

function mealIsLogged(slotType: string, tz: string): boolean {
  const hourStr = new Date().toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
  const hour = parseInt(hourStr, 10)
  if (slotType === 'breakfast') return hour >= 10
  if (slotType === 'lunch') return hour >= 14
  return hour >= 20
}

function getTimeOfDay(tz: string): { greeting: string; dateLabel: string } {
  const now = new Date()
  const hourStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
  const hour = parseInt(hourStr, 10)
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateLabel = now.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return { greeting, dateLabel }
}

function formatTag(tag: string): string {
  return tag
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

// ---- Data fetching ----------------------------------------------------------

const EMPTY_MEAL_CARDS: TodayMealCard[] = (['breakfast', 'lunch', 'dinner'] as const).map(
  (slotType) => ({ slotType, name: null, calories: null, isLogged: false }),
)

async function getDashboardData(userId: string) {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name, macro_target, timezone')
    .eq('id', userId)
    .single()

  const tz = (profile?.timezone as string | null) ?? 'UTC'
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: tz }) // YYYY-MM-DD

  const [planResult, suggestedResult] = await Promise.all([
    supabase
      .from('meal_plans')
      .select('id')
      .eq('user_id', userId)
      .lte('start_date', today)
      .gte('end_date', today)
      .maybeSingle(),
    supabase
      .from('recipes')
      .select('id, name, macros_per_serving, cook_time_min, tags, image_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const plan = planResult.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggestedRecipes: SuggestedRecipe[] = (suggestedResult.data ?? []).map((r: any) => ({
    id: r.id as string,
    name: r.name as string,
    calories: Math.round(((r.macros_per_serving as Macros | null)?.calories ?? 0)),
    cookTimeMin: (r.cook_time_min as number | null) ?? null,
    tags: (r.tags as string[]) ?? [],
    imageUrl: (r.image_url as string | null) ?? null,
  }))

  const base = {
    displayName: (profile?.display_name as string | null) ?? null,
    macroTarget: (profile?.macro_target as MacroTarget | null) ?? null,
    caloriesPlanned: 0,
    mealCount: 0,
    daysPlannedThisWeek: 0,
    planId: null as string | null,
    tz,
    today,
    todayMeals: EMPTY_MEAL_CARDS,
    suggestedRecipes,
  }

  if (!plan) return base

  // Today's entries — names + macros + slot types in one query
  const { data: planDay } = await supabase
    .from('plan_days')
    .select(`
      meal_slots(
        slot_type,
        position,
        meal_entries(
          servings,
          macros_override,
          recipe:recipes!recipe_id(name, macros_per_serving),
          food_item:food_items!food_item_id(name, macros_per_serving)
        )
      )
    `)
    .eq('meal_plan_id', plan.id)
    .eq('date', today)
    .maybeSingle()

  let caloriesPlanned = 0
  let mealCount = 0
  const mealSlotMap = new Map<string, { name: string | null; calories: number }>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const slot of (planDay?.meal_slots ?? []) as any[]) {
    const slotType = slot.slot_type as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = (slot.meal_entries ?? []) as any[]

    let slotCals = 0
    let firstName: string | null = null

    for (const entry of entries) {
      mealCount++
      const macros: Macros | null =
        entry.macros_override ??
        entry.recipe?.macros_per_serving ??
        entry.food_item?.macros_per_serving ??
        null
      const entryCals = macros ? (macros.calories ?? 0) * (entry.servings ?? 1) : 0
      slotCals += entryCals
      caloriesPlanned += entryCals
      if (!firstName) {
        firstName = (entry.recipe?.name ?? entry.food_item?.name ?? null) as string | null
      }
    }

    if (entries.length > 0 && ['breakfast', 'lunch', 'dinner'].includes(slotType)) {
      const displayName =
        entries.length > 1 && firstName ? `${firstName} +${entries.length - 1}` : firstName
      mealSlotMap.set(slotType, { name: displayName, calories: Math.round(slotCals) })
    }
  }

  const todayMeals: TodayMealCard[] = (['breakfast', 'lunch', 'dinner'] as const).map(
    (slotType) => {
      const slot = mealSlotMap.get(slotType)
      return {
        slotType,
        name: slot?.name ?? null,
        calories: slot?.calories ?? null,
        isLogged: slot !== undefined && mealIsLogged(slotType, tz),
      }
    },
  )

  // Days in the current week with at least one entry
  const { data: weekDays } = await supabase
    .from('plan_days')
    .select('meal_slots(meal_entries(id))')
    .eq('meal_plan_id', plan.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const daysPlannedThisWeek = (weekDays ?? []).filter((d: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d.meal_slots ?? []).some((s: any) => (s.meal_entries ?? []).length > 0),
  ).length

  return {
    ...base,
    caloriesPlanned: Math.round(caloriesPlanned),
    mealCount,
    daysPlannedThisWeek,
    planId: plan.id,
    todayMeals,
  }
}

// ---- Illustration -----------------------------------------------------------

function HeroIllustration() {
  return (
    <svg viewBox="0 0 500 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-lg">
      {/* Decorative blobs */}
      <circle cx="400" cy="90"  r="108" fill="#C4A882" fillOpacity="0.13" />
      <circle cx="158" cy="345" r="84"  fill="#C4A882" fillOpacity="0.10" />

      {/* Main dashboard card */}
      <rect x="148" y="40" width="334" height="262" rx="20" fill="#F0E8D4" stroke="#EBD9B8" strokeWidth="1" />

      {/* Window header bars */}
      <rect x="168" y="60"  width="108" height="13" rx="6" fill="#2C1A0E" fillOpacity="0.60" />
      <rect x="168" y="79"  width="70"  height="9"  rx="4" fill="#C4A882" fillOpacity="0.55" />

      {/* Inner chart card */}
      <rect x="182" y="100" width="278" height="177" rx="13" fill="white" stroke="#EBD9B8" strokeWidth="1" />

      {/* Chart header bars */}
      <rect x="198" y="116" width="74" height="9" rx="4" fill="#C4A882" fillOpacity="0.70" />
      <rect x="198" y="130" width="47" height="9" rx="4" fill="#C85A1A" fillOpacity="0.35" />

      {/* Grid lines */}
      <line x1="198" y1="162" x2="443" y2="162" stroke="#EBD9B8" strokeWidth="0.75" />
      <line x1="198" y1="184" x2="443" y2="184" stroke="#EBD9B8" strokeWidth="0.75" />
      <line x1="198" y1="206" x2="443" y2="206" stroke="#EBD9B8" strokeWidth="0.75" />

      {/* Chart area fill */}
      <path d="M205 242 L250 229 L294 215 L340 195 L388 173 L436 153 L436 254 L205 254 Z" fill="#C85A1A" fillOpacity="0.08" />

      {/* Chart line */}
      <polyline points="205,242 250,229 294,215 340,195 388,173 436,153" stroke="#C85A1A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Chart dots — open except last */}
      <circle cx="205" cy="242" r="3.5" fill="white" stroke="#C85A1A" strokeWidth="2" />
      <circle cx="250" cy="229" r="3.5" fill="white" stroke="#C85A1A" strokeWidth="2" />
      <circle cx="294" cy="215" r="3.5" fill="white" stroke="#C85A1A" strokeWidth="2" />
      <circle cx="340" cy="195" r="3.5" fill="white" stroke="#C85A1A" strokeWidth="2" />
      <circle cx="388" cy="173" r="3.5" fill="white" stroke="#C85A1A" strokeWidth="2" />
      <circle cx="436" cy="153" r="5"   fill="#C85A1A" />

      {/* X-axis label bars */}
      {[198, 231, 264, 297, 330, 363, 396].map((x) => (
        <rect key={x} x={x} y="258" width="22" height="5" rx="2.5" fill="#C4A882" fillOpacity="0.38" />
      ))}

      {/* Bottom meal cards */}
      {([
        { x: 148, titleW: 58 },
        { x: 263, titleW: 50 },
        { x: 378, titleW: 65 },
      ] as const).map(({ x, titleW }) => (
        <g key={x}>
          <rect x={x}      y="318" width="104" height="64" rx="13" fill="white" stroke="#EBD9B8" strokeWidth="1" />
          <rect x={x + 15} y="335" width={titleW} height="8" rx="4" fill="#C4A882" fillOpacity="0.65" />
          <rect x={x + 15} y="348" width="72"      height="7" rx="3" fill="#EBD9B8" />
          <rect x={x + 15} y="360" width="40"      height="8" rx="4" fill="#C85A1A" fillOpacity="0.30" />
        </g>
      ))}

      {/* Fork — tines pointing up, overlapping left edge of card */}
      <rect x="128" y="102" width="6" height="82" rx="3" fill="#2C1A0E" />
      <rect x="137" y="102" width="6" height="82" rx="3" fill="#2C1A0E" />
      <rect x="146" y="102" width="6" height="82" rx="3" fill="#2C1A0E" />
      <rect x="155" y="102" width="6" height="82" rx="3" fill="#2C1A0E" />
      <rect x="128" y="178" width="33" height="20" rx="1" fill="#2C1A0E" />
      <rect x="137" y="195" width="15" height="163" rx="7" fill="#2C1A0E" />
    </svg>
  )
}

// ---- Stat card --------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl border bg-white px-5 py-4"
      style={{ borderColor: '#EBD9B8' }}
    >
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8B6B55' }}>
        {label}
      </span>
      <span className="font-heading text-2xl font-semibold" style={{ color: '#2C1A0E' }}>
        {value}
      </span>
      {sub && <span className="text-xs" style={{ color: '#C4A882' }}>{sub}</span>}
    </div>
  )
}

// ---- Today's meal card ------------------------------------------------------

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

function TodayMealCardUI({ slotType, name, calories, isLogged }: TodayMealCard) {
  const isEmpty = name === null
  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-4"
      style={{
        borderWidth: '0.5px',
        borderStyle: isEmpty ? 'dashed' : 'solid',
        borderColor: '#EBD9B8',
        backgroundColor: isEmpty ? 'transparent' : '#FFFFFF',
      }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className="text-[11px] font-medium uppercase"
          style={{ color: '#A07850', letterSpacing: '0.5px' }}
        >
          {SLOT_LABELS[slotType]}
        </span>
        <span
          className="truncate text-[15px] font-semibold"
          style={{ color: isEmpty ? '#C4A882' : '#2C1A0E' }}
        >
          {name ?? 'Nothing planned'}
        </span>
        {calories != null && calories > 0 && (
          <span className="text-xs" style={{ color: '#A07850' }}>
            {calories.toLocaleString()} kcal
          </span>
        )}
      </div>
      <div
        className="ml-3 flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: isLogged ? '#F5E6CC' : '#EBD9B8' }}
      >
        {isLogged ? (
          <Check className="size-4" strokeWidth={2.5} style={{ color: '#C85A1A' }} />
        ) : (
          <Clock className="size-4" style={{ color: '#A07850' }} />
        )}
      </div>
    </div>
  )
}

// ---- Recipe suggestion card -------------------------------------------------

function RecipeSuggestionCard({ name, calories, cookTimeMin, tags, imageUrl }: Omit<SuggestedRecipe, 'id'>) {
  const tag = tags.length > 0 ? formatTag(tags[0]) : null
  const meta = [
    calories > 0 && `${calories.toLocaleString()} kcal`,
    cookTimeMin && `${cookTimeMin} min`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="overflow-hidden rounded-xl border bg-white transition-opacity group-hover:opacity-80"
      style={{ borderColor: '#EBD9B8', borderWidth: '0.5px' }}
    >
      <div
        className="relative h-32 w-full overflow-hidden"
        style={{ backgroundColor: '#F5E6CC' }}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={name} fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <UtensilsCrossed className="size-10" style={{ color: '#C4A882' }} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <span className="text-[14px] font-semibold leading-snug" style={{ color: '#2C1A0E' }}>
          {name}
        </span>
        {meta && (
          <span className="text-xs" style={{ color: '#A07850' }}>
            {meta}
          </span>
        )}
        {tag && (
          <span
            className="inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: '#F5E6CC', color: '#8B4A1A' }}
          >
            {tag}
          </span>
        )}
      </div>
    </div>
  )
}

// ---- Page -------------------------------------------------------------------

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) return null

  const data = await getDashboardData(user.id)
  const { greeting, dateLabel } = getTimeOfDay(data.tz)

  const firstName = data.displayName?.split(' ')[0] ?? 'there'
  const targetCal = data.macroTarget?.calories ?? null

  return (
    <div className="mx-auto max-w-6xl px-6">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="py-14 lg:py-20">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">

          {/* Left — dashboard copy */}
          <div className="flex flex-col gap-8">

            {/* Date */}
            <p className="text-sm font-medium" style={{ color: '#C4A882' }}>{dateLabel}</p>

            {/* Greeting */}
            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight lg:text-5xl" style={{ color: '#2C1A0E' }}>
                {greeting},<br />
                <span style={{ color: '#C85A1A' }}>{firstName}.</span>
              </h1>
              <p className="text-base" style={{ color: '#6B5040' }}>
                {data.mealCount === 0
                  ? 'No meals planned yet today.'
                  : `You have ${data.mealCount} ${data.mealCount === 1 ? 'meal' : 'meals'} planned today.`}
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <Link
                href={data.planId ? `/plans/${data.planId}` : '/plans'}
                className="inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#C85A1A' }}
              >
                View today&apos;s plan
              </Link>
              <Link
                href="/recipes"
                className="inline-flex items-center rounded-full border px-6 py-2.5 text-sm font-semibold transition-colors"
                style={{ borderColor: '#C4A882', color: '#2C1A0E' }}
              >
                Browse recipes
              </Link>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Calories"
                value={data.caloriesPlanned > 0 ? `${data.caloriesPlanned.toLocaleString()}` : '—'}
                sub={targetCal ? `of ${targetCal.toLocaleString()} kcal` : 'kcal today'}
              />
              <StatCard
                label="Meals today"
                value={data.mealCount > 0 ? String(data.mealCount) : '—'}
                sub={data.mealCount === 0 ? 'none yet' : data.mealCount === 1 ? '1 planned' : 'planned'}
              />
              <StatCard
                label="Days planned"
                value={data.daysPlannedThisWeek > 0 ? `${data.daysPlannedThisWeek} / 7` : '—'}
                sub="this week"
              />
            </div>
          </div>

          {/* Right — illustration */}
          <div className="flex justify-center lg:justify-end">
            <HeroIllustration />
          </div>

        </div>
      </div>

      {/* ── Section 1: Today's meals ─────────────────────────────────────── */}
      <div style={{ borderTop: '0.5px solid #EBD9B8' }} className="flex flex-col gap-5 py-10">
        <div className="flex items-center justify-between">
          <span
            className="text-[13px] font-medium uppercase"
            style={{ color: '#A07850', letterSpacing: '0.5px' }}
          >
            Today&apos;s meals
          </span>
          <Link
            href={data.planId ? `/plans/${data.planId}?highlight=${data.today}` : '/plans'}
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: '#C85A1A' }}
          >
            Edit plan →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.todayMeals.map((meal) => (
            <TodayMealCardUI key={meal.slotType} {...meal} />
          ))}
        </div>
      </div>

      {/* ── Section 2: Suggested for you ─────────────────────────────────── */}
      {data.suggestedRecipes.length > 0 && (
        <div style={{ borderTop: '0.5px solid #EBD9B8' }} className="flex flex-col gap-5 py-10 pb-16 lg:pb-24">
          <div className="flex items-center justify-between">
            <span
              className="text-[13px] font-medium uppercase"
              style={{ color: '#A07850', letterSpacing: '0.5px' }}
            >
              Suggested for you
            </span>
            <Link
              href="/recipes"
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: '#C85A1A' }}
            >
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.suggestedRecipes.map((recipe) => (
              <Link key={recipe.id} href={`/recipes?id=${recipe.id}`} className="group">
                <RecipeSuggestionCard {...recipe} />
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
