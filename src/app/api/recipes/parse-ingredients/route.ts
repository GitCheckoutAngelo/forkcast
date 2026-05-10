import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import { withRetry } from '@/lib/anthropic/retry'

const SYSTEM = `Parse each numbered ingredient line into structured JSON. Return ONLY a raw JSON array, no markdown, no explanation:
[{"quantity":null,"unit":null,"name":"","preparation":null,"raw_text":""}]
quantity: the primary (first/largest) measurement as a decimal number or null. unit: the unit for that primary measurement or null. name: clean ingredient name only — no quantities, units, or footnotes. preparation: any secondary measurements ("plus 1 tablespoon", "+ 2 tbsp") and how-to-prep notes ("chopped", "at room temperature") as a single string, or null — exclude parenthetical metric equivalents like "(218g)" or "(80g)" as those describe the whole ingredient not the secondary measure. For "or" alternatives keep only the first option. raw_text: original string exactly as given, unchanged.`

export async function POST(req: Request) {
  try {
    const { ingredients } = await req.json()
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: 'ingredients array is required' }, { status: 400 })
    }
    if (ingredients.length > 60) {
      return NextResponse.json({ error: 'Too many ingredients (max 60)' }, { status: 400 })
    }

    const list = (ingredients as unknown[])
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n')

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: 'user', content: list }],
      }),
    )

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 })
    }

    let parsed: unknown
    try {
      const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('Expected array')
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse ingredients'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
