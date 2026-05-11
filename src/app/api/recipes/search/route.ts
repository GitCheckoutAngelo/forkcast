import { NextResponse } from 'next/server'
import { searchWithClaude, searchWithTavily } from '@/lib/recipes/search-providers'
import type { RecipePreview } from '@/types/recipes'

const RESULTS_TO_SHOW = 6

// Add new providers here — no other code needs to change.
const PROVIDERS: Record<string, (query: string) => Promise<RecipePreview[]>> = {
  tavily: searchWithTavily,
  claude: searchWithClaude,
}

// Providers that use an LLM — used to split the fast vs AI call.
const AI_PROVIDERS = new Set(['claude'])

async function isPaywalled(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Forkcast/1.0; recipe import)' },
      signal: AbortSignal.timeout(3_000),
    })
    return res.status === 402
  } catch {
    return false
  }
}

async function filterPaywalled(previews: RecipePreview[]): Promise<RecipePreview[]> {
  const paywalled = await Promise.all(previews.map((p) => isPaywalled(p.source.url)))
  return previews.filter((_, i) => !paywalled[i]).slice(0, RESULTS_TO_SHOW)
}

export async function POST(req: Request) {
  try {
    const { query, fastOnly } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    // RECIPE_SEARCH_PROVIDERS is a comma-separated priority list, e.g. "tavily,claude".
    // Each provider is tried in order; the first to succeed wins.
    // fastOnly=true skips AI providers so the client can show a phase change before retrying.
    const fullChain = (process.env.RECIPE_SEARCH_PROVIDERS ?? 'claude')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s in PROVIDERS)

    const chain = fastOnly ? fullChain.filter((n) => !AI_PROVIDERS.has(n)) : fullChain

    if (chain.length === 0) {
      return NextResponse.json({ error: 'no_fast_providers' }, { status: 503 })
    }

    let candidates: RecipePreview[] | undefined
    for (const name of chain) {
      try {
        candidates = await PROVIDERS[name](query)
        break
      } catch (err) {
        const hasNext = chain.indexOf(name) < chain.length - 1
        console.warn(`[search] ${name} failed (${err instanceof Error ? err.message : err})${hasNext ? ', trying next' : ''}`)
      }
    }

    if (!candidates) {
      return NextResponse.json({ error: 'All search providers failed' }, { status: 502 })
    }

    const previews = await filterPaywalled(candidates)
    return NextResponse.json(previews)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
