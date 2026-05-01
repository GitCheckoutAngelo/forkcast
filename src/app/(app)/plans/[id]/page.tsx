import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getMealPlan, getUserProfile } from '@/lib/meal-plans/queries'
import { listRecipes } from '@/lib/recipes/queries'
import { listFoodItems } from '@/lib/food-items/queries'
import { listGroceryTrips } from '@/lib/grocery-lists/queries'
import PlanEditor from './plan-editor'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PlanEditorPage({ params }: Props) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return null

  const profile = await getUserProfile(user.id)

  const [plan, recipes, foodItems, trips] = await Promise.all([
    getMealPlan(id, profile.macro_target),
    listRecipes(),
    listFoodItems(),
    listGroceryTrips(id),
  ])

  if (!plan) notFound()

  return (
    <PlanEditor
      plan={plan}
      profile={profile}
      recipes={recipes}
      foodItems={foodItems}
      initialTrips={trips}
    />
  )
}
