import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getUserProfile } from '@/lib/meal-plans/queries'
import { createClient } from '@/lib/supabase/server'
import { getGroceryList } from '@/lib/grocery-lists/queries'
import GroceryListClient from './grocery-list-client'
import type { MealPlan } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GroceryListPage({ params }: Props) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: planData, error } = await supabase
    .from('meal_plans')
    .select('id, name, start_date, end_date')
    .eq('id', id)
    .single()

  if (error || !planData) notFound()

  const plan = planData as unknown as Pick<MealPlan, 'id' | 'name' | 'start_date' | 'end_date'>
  const groceryList = await getGroceryList(id)

  return (
    <GroceryListClient
      plan={plan}
      initialList={groceryList}
    />
  )
}
