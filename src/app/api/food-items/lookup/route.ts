import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import type { FoodItemCandidate } from '@/types'

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a nutrition database. Return ONLY a JSON array of up to 3 food item candidates. No markdown fences, no explanation.

Each item must match exactly:
{"name":"...","brand":null,"serving_size":100,"serving_unit":"g","macros_per_serving":{"calories":100,"protein_g":10,"carbs_g":15,"fat_g":3},"macros_source":"estimate","macros_source_note":"..."}

serving_unit: one of serving|g|ml|piece|cup|tbsp|tsp|oz
macros_source: brand_label (brand's own label data), usda (USDA database), estimate (AI estimate), other
macros_source_note: brief attribution e.g. "from Chobani.com" or "USDA FDC" or "estimated from typical values"
Include fiber_g, sugar_g, sodium_mg in macros_per_serving only when known.
Use web_search only for specific branded products to get accurate label data.`,
      messages: [{ role: 'user', content: `Look up nutrition info for: ${query}` }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No results returned' }, { status: 502 })
    }

    let candidates: FoodItemCandidate[]
    try {
      const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      candidates = JSON.parse(raw)
      if (!Array.isArray(candidates)) throw new Error('Expected array')
    } catch {
      return NextResponse.json({ error: 'Failed to parse results' }, { status: 502 })
    }

    return NextResponse.json(candidates.slice(0, 3))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
