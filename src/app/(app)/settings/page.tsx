import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getUserProfile } from '@/lib/meal-plans/queries'
import { createClient } from '@/lib/supabase/server'
import type { WeekStartDay } from '@/types'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const [profile, { count: planCount }] = await Promise.all([
    getUserProfile(user.id),
    supabase.from('meal_plans').select('id', { count: 'exact', head: true }),
  ])

  return (
    <SettingsClient
      profile={{
        ...profile,
        email: user.email ?? '',
        week_start_day: profile.week_start_day as WeekStartDay,
        grocery_ignore_list: profile.grocery_ignore_list ?? [],
        notion_token: profile.notion_token ?? null,
        notion_parent_page_id: profile.notion_parent_page_id ?? null,
      }}
      planCount={planCount ?? 0}
    />
  )
}
