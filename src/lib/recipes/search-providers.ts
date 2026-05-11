import { anthropic } from '@/lib/anthropic/client'
import { withRetry } from '@/lib/anthropic/retry'
import type { RecipePreview } from '@/types/recipes'

// ---- Shared helper ----------------------------------------------------------

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// ---- Claude -----------------------------------------------------------------

export async function searchWithClaude(query: string): Promise<RecipePreview[]> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a recipe search assistant. When the user searches for recipes,
use the web_search tool to find relevant recipes, then respond with ONLY a JSON array
of up to 10 recipe previews. No markdown, no explanation — just the raw JSON array.

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

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No results returned')

  const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const previews = JSON.parse(raw)
  if (!Array.isArray(previews)) throw new Error('Expected array')
  return previews as RecipePreview[]
}

// ---- Tavily -----------------------------------------------------------------

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
  images?: string[]
}

interface TavilyResponse {
  results: TavilyResult[]
}

export async function searchWithTavily(query: string): Promise<RecipePreview[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY is not configured')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${query} recipe`,
      search_depth: 'basic',
      max_results: 10,
      include_images: true,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)

  const data: TavilyResponse = await res.json()

  return data.results.map((r) => ({
    source: { url: r.url, site_name: hostname(r.url) },
    title: r.title,
    image_url: r.images?.[0] || undefined,
    description: r.content || undefined,
  }))
}
