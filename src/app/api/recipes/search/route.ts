import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import { withRetry } from '@/lib/anthropic/retry'
import type { RecipePreview } from '@/types/recipes'

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const response = await withRetry(() =>
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a recipe search assistant. When the user searches for recipes,
use the web_search tool to find relevant recipes, then respond with ONLY a JSON array
of up to 5 recipe previews. No markdown, no explanation — just the raw JSON array.

Each item must match this shape exactly:
{
  "source": { "url": "https://...", "site_name": "Site Name" },
  "title": "Recipe Title",
  "image_url": "https://...",        // omit if not found
  "description": "Brief description", // omit if not found
  "estimated_time_min": 30,           // total time in minutes, omit if unknown
  "estimated_servings": 4             // omit if unknown
}

Only include real recipe pages (not recipe index/category pages).
Prefer well-known cooking sites. Do not fabricate data.`,
        messages: [{ role: 'user', content: `Search for: ${query} recipe` }],
      }),
    )

    // Extract the text content from Claude's final response
    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No results returned' }, { status: 502 })
    }

    let previews: RecipePreview[]
    try {
      // Strip potential markdown code fences
      const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      previews = JSON.parse(raw)
      if (!Array.isArray(previews)) throw new Error('Expected array')
    } catch {
      return NextResponse.json({ error: 'Failed to parse search results' }, { status: 502 })
    }

    // TODO: image_url is populated by Claude when the web search result includes it.
    // When absent, preview cards show a placeholder icon. Server-side enrichment was
    // removed because fetching each recipe page post-Claude-call blocked the response
    // for up to 6s. If richer image coverage is needed, implement as a non-blocking
    // client-side fetch after results render.
    return NextResponse.json(previews)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
