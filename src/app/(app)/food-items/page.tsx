import { Suspense } from 'react'
import { listFoodItems } from '@/lib/food-items/queries'
import FoodItemsClient from './food-items-client'

export default async function FoodItemsPage() {
  const items = await listFoodItems()

  return (
    <Suspense>
      <FoodItemsClient items={items} />
    </Suspense>
  )
}
