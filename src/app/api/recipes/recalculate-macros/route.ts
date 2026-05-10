import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import type { Macros } from '@/types'

interface RecalculateRequest {
  ingredients: Array<{
    name: string
    quantity: number | null
    unit: string | null
    preparation: string | null
    raw_text: string
  }>
  instructions: string[] | null
  servings: number
  name?: string
  cuisine?: string
}

export async function POST(req: Request) {
  try {
    const body: RecalculateRequest = await req.json()
    const { ingredients, instructions, servings, name, cuisine } = body

    if (!Array.isArray(ingredients) || ingredients.length < 2) {
      return NextResponse.json({ error: 'At least 2 ingredients are required' }, { status: 400 })
    }
    if (!servings || servings <= 0) {
      return NextResponse.json({ error: 'servings must be > 0' }, { status: 400 })
    }

    const ingredientLines = ingredients
      .map((ing) => {
        const parts: string[] = []
        if (ing.quantity != null) parts.push(String(ing.quantity))
        if (ing.unit) parts.push(ing.unit)
        parts.push(ing.preparation ? `${ing.name}, ${ing.preparation}` : ing.name)
        return `- ${parts.join(' ')}`
      })
      .join('\n')

    // Trim instructions to cooking-method hints only — full text isn't needed
    const cookingHints =
      instructions && instructions.length > 0
        ? instructions.slice(0, 6).join(' ').slice(0, 400)
        : null

    const contextLine = [
      `Servings: ${servings}`,
      name && `Recipe: ${name}`,
      cuisine && `Cuisine: ${cuisine}`,
    ]
      .filter(Boolean)
      .join(' | ')

    const userMessage = [
      contextLine,
      `\nIngredients:\n${ingredientLines}`,
      cookingHints && `\nCooking method: ${cookingHints}`,
    ]
      .filter(Boolean)
      .join('\n')

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `Estimate nutrition per serving using USDA values. Calculate total macros for the whole recipe then divide by servings.
Cooking method matters: frying absorbs fat; roasting concentrates macros (water evaporates); drained liquids don't contribute macros.
Pinch/taste amounts → negligible calories/macros except sodium_mg.
Return ONLY raw JSON, no markdown, no explanation:
{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0}
Include "fiber_g","sugar_g","sodium_mg" only when estimable.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 })
    }

    let macros: Macros
    try {
      const raw = textBlock.text
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '')
        .trim()
      macros = JSON.parse(raw)
      if (typeof macros.calories !== 'number' || typeof macros.protein_g !== 'number') {
        throw new Error('Unexpected response shape')
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse macros from AI response' },
        { status: 502 },
      )
    }

    return NextResponse.json(macros)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recalculation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
