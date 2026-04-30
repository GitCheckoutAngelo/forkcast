import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth/current-user'
import { listMealPlans, getUserProfile } from '@/lib/meal-plans/queries'
import PlansClient from './plans-client'

export default async function PlansPage() {
  const user = await getCurrentUser()
  if (!user) return null

  const [plans, profile] = await Promise.all([
    listMealPlans(),
    getUserProfile(user.id),
  ])

  return (
    <Suspense>
      <PlansClient plans={plans} weekStartDay={profile.week_start_day} />
    </Suspense>
  )
}
