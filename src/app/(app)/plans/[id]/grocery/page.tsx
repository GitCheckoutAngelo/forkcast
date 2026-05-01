import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { createClient } from '@/lib/supabase/server'
import { listGroceryTrips } from '@/lib/grocery-lists/queries'
import GroceryListClient from './grocery-list-client'
import type { MealPlan } from '@/types'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ trip?: string; generate?: string }>
}

export default async function GroceryListPage({ params, searchParams }: Props) {
  const { id } = await params
  const { trip: tripParam, generate } = await searchParams

  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const [{ data: planData, error }, { data: profileData }] = await Promise.all([
    supabase.from('meal_plans').select('id, name, start_date, end_date').eq('id', id).single(),
    supabase.from('user_profiles').select('notion_token').eq('id', user.id).single(),
  ])

  if (error || !planData) notFound()

  const plan = planData as unknown as Pick<MealPlan, 'id' | 'name' | 'start_date' | 'end_date'>
  const trips = await listGroceryTrips(id)

  // Resolve selected trip: prefer the URL param, fallback to first trip
  const selectedTrip =
    trips.find((t) => t.id === tripParam) ?? trips[0] ?? null

  return (
    <GroceryListClient
      plan={plan}
      trips={trips}
      selectedTrip={selectedTrip}
      hasNotionToken={Boolean(profileData?.notion_token)}
      autoGenerate={generate === '1'}
    />
  )
}
