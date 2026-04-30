import { listRecipes } from '@/lib/recipes/queries'
import RecipesClient from './recipes-client'

export default async function RecipesPage() {
  const recipes = await listRecipes()
  return <RecipesClient recipes={recipes} />
}
