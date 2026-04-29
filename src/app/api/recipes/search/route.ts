import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import type { RecipePreview } from '@/types/recipes'

// Matches both attribute orders: property then content, or content then property
const META_RE = (prop: string) => [
  new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
  new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
]
const META_NAME_RE = (name: string) => [
  new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
  new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
]

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m?.[1]) return m[1]
  }
}

function extractJsonLdImage(html: string): string | undefined {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1])
      const items: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : [parsed]
      const recipe = items.find(
        (item) => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && (item['@type'] as string[]).includes('Recipe')),
      )
      if (!recipe) continue
      const img = recipe.image
      if (typeof img === 'string') return img
      if (Array.isArray(img) && img.length > 0) {
        const first = img[0]
        if (typeof first === 'string') return first
        if (first && typeof first === 'object' && 'url' in first) return first.url as string
      }
      if (img && typeof img === 'object' && 'url' in img) return (img as { url: string }).url
    } catch { continue }
  }
}

async function fetchPreviewImage(url: string): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6_000)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Forkcast/1.0; recipe import)',
        Accept: 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return undefined
    const text = await res.text()
    const html = text.slice(0, 100_000)
    // Priority: JSON-LD Recipe.image > og:image > twitter:image
    return (
      extractJsonLdImage(html) ??
      firstMatch(html, META_RE('og:image')) ??
      firstMatch(html, META_NAME_RE('twitter:image'))
    )
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
    })

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

    // Enrich with images in parallel — failures silently leave image_url undefined
    const enriched = await Promise.all(
      previews.map(async (p) => {
        if (p.image_url) return p
        const image_url = await fetchPreviewImage(p.source.url)
        return image_url ? { ...p, image_url } : p
      }),
    )

    return NextResponse.json(enriched)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
