import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic/client'
import type { RecipeCandidate } from '@/types/recipes'

// ---- Concurrency limiter (2 parallel extractions max) -----------------------

class Semaphore {
  private count: number
  private queue: Array<() => void> = []
  constructor(n: number) { this.count = n }
  acquire(): Promise<void> {
    if (this.count > 0) { this.count--; return Promise.resolve() }
    return new Promise((resolve) => this.queue.push(resolve))
  }
  release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.count++
  }
}

const sem = new Semaphore(2)

// ---- JSON-LD parsers --------------------------------------------------------

function parseDuration(iso: unknown): number | null {
  if (typeof iso !== 'string' || !iso) return null
  const h = /(\d+)H/.exec(iso)
  const m = /(\d+)M/.exec(iso)
  const total = (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0)
  return total || null
}

function parseServings(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const s = Array.isArray(raw) ? raw[0] : raw
  const match = /(\d+(?:\.\d+)?)/.exec(String(s ?? ''))
  return match ? parseFloat(match[1]) : 1
}

function parseImage(img: unknown): string | undefined {
  if (typeof img === 'string') return img || undefined
  if (Array.isArray(img) && img.length > 0) {
    const first = img[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'url' in first) return (first as { url: string }).url
  }
  if (img && typeof img === 'object' && 'url' in img) return (img as { url: string }).url
}

function parseFraction(s: string): number {
  const parts = s.trim().split(/\s+/)
  if (parts.length === 2 && parts[1].includes('/')) {
    const [num, den] = parts[1].split('/')
    return parseFloat(parts[0]) + parseInt(num) / parseInt(den)
  }
  if (s.includes('/')) {
    const [num, den] = s.split('/')
    return parseInt(num) / parseInt(den)
  }
  return parseFloat(s)
}

// Not flagged global — safe to reuse across calls
const UNIT_RE = /^(tablespoons?|tbsp\.?|teaspoons?|tsp\.?|fluid\s+oz\.?|fl\.?\s*oz\.?|cups?|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g\.?|kilograms?|kg\.?|milliliters?|ml\.?|liters?|l\.?|pinch(?:es)?|dash(?:es)?|cans?|jars?|cloves?|heads?|bunch(?:es)?|handfuls?|slices?|sprigs?|stalks?|pieces?|pints?|quarts?|gallons?)\b/i

function parseIngredient(raw: string): RecipeCandidate['ingredients'][number] {
  const trimmed = raw.trim()
  let rest = trimmed

  let quantity: number | null = null
  const numMatch = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)\s*/.exec(rest)
  if (numMatch) {
    quantity = parseFraction(numMatch[1])
    rest = rest.slice(numMatch[0].length)
  }

  let unit: string | null = null
  const unitMatch = UNIT_RE.exec(rest)
  if (unitMatch) {
    unit = unitMatch[0].trim()
    rest = rest.slice(unitMatch[0].length).trim()
  }

  const commaIdx = rest.indexOf(',')
  let name = rest
  let preparation: string | null = null
  if (commaIdx > 0) {
    name = rest.slice(0, commaIdx).trim()
    preparation = rest.slice(commaIdx + 1).trim() || null
  }

  return { quantity, unit, name: name.trim() || trimmed, preparation, raw_text: trimmed }
}

function parseInstructions(raw: unknown): string[] {
  const steps: string[] = []
  const process = (item: unknown) => {
    if (typeof item === 'string' && item.trim()) {
      steps.push(item.trim())
    } else if (Array.isArray(item)) {
      item.forEach(process)
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      if (obj['@type'] === 'HowToSection') {
        process(obj.itemListElement)
      } else if (typeof obj.text === 'string' && obj.text.trim()) {
        steps.push(obj.text.trim())
      } else if (obj['@type'] === 'HowToStep' && typeof obj.name === 'string' && obj.name.trim()) {
        steps.push(obj.name.trim())
      }
    }
  }
  process(raw)
  return steps
}

function parseNutrition(n: unknown): RecipeCandidate['macros_per_serving'] {
  const zero = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  if (!n || typeof n !== 'object') return zero
  const obj = n as Record<string, string>
  const num = (v: string | undefined) => { if (!v) return undefined; const m = /(\d+(?:\.\d+)?)/.exec(v); return m ? parseFloat(m[1]) : undefined }
  return {
    calories: num(obj.calories) ?? 0,
    protein_g: num(obj.proteinContent) ?? 0,
    carbs_g: num(obj.carbohydrateContent) ?? 0,
    fat_g: num(obj.fatContent) ?? 0,
    fiber_g: num(obj.fiberContent),
    sugar_g: num(obj.sugarContent),
    sodium_mg: num(obj.sodiumContent),
  }
}

function jsonLdToCandidate(
  ld: Record<string, unknown>,
  url: string,
): RecipeCandidate | null {
  const name = typeof ld.name === 'string' ? ld.name.trim() : ''
  const ingredients = Array.isArray(ld.recipeIngredient)
    ? (ld.recipeIngredient as string[]).map(parseIngredient)
    : []
  const instructions = parseInstructions(ld.recipeInstructions)
  // Require the three structural fields — if any are missing, fall back to Claude
  if (!name || ingredients.length === 0 || instructions.length === 0) return null

  const hostname = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })()

  return {
    name,
    description: typeof ld.description === 'string' ? ld.description.trim() || undefined : undefined,
    servings: parseServings(ld.recipeYield),
    prep_time_min: parseDuration(ld.prepTime),
    cook_time_min: parseDuration(ld.cookTime),
    cuisine: typeof ld.recipeCuisine === 'string' ? ld.recipeCuisine.trim() || undefined : undefined,
    image_url: parseImage(ld.image),
    meal_types: [],
    tags: [],
    instructions,
    ingredients,
    macros_per_serving: parseNutrition(ld.nutrition),
    macros_verified: false,
    source_url: url,
    source_site_name: hostname,
  }
}

// ---- JSON-LD extractor ------------------------------------------------------

function extractJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1])
      const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
      const recipe = items.find((item): item is Record<string, unknown> => {
        if (!item || typeof item !== 'object') return false
        const t = (item as Record<string, unknown>)['@type']
        return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
      })
      if (recipe) return recipe
    } catch { continue }
  }
  return null
}

// ---- Image extractor (fallback for Claude path where meta tags are stripped) -

function extractImageFromHtml(html: string): string | undefined {
  // JSON-LD Recipe.image (highest priority — same source as Path 1)
  const jsonLd = extractJsonLd(html)
  if (jsonLd) {
    const img = parseImage(jsonLd.image)
    if (img) return img
  }
  // og:image — both attribute orderings
  for (const re of [
    /meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ]) {
    const m = re.exec(html)
    if (m?.[1]) return m[1]
  }
  // twitter:image
  for (const re of [
    /meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]) {
    const m = re.exec(html)
    if (m?.[1]) return m[1]
  }
}

// ---- HTML stripper (no dependency — regex is sufficient for this use case) --

function stripHtmlForClaude(html: string, maxChars = 15_000): string {
  // Prefer the <main> or <article> element to skip nav/footer/sidebar
  let content = html
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html)
  if (main) content = main[1]
  else if (article) content = article[1]

  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars)
}

// ---- Compact system prompt (~200 tokens) ------------------------------------

const SYSTEM = `Extract a recipe. Respond with ONLY a raw JSON object:
{"name":"","description":"","servings":1,"prep_time_min":null,"cook_time_min":null,"cuisine":"","image_url":"","meal_types":[],"tags":[],"instructions":["step"],"ingredients":[{"quantity":null,"unit":null,"name":"","preparation":null,"raw_text":""}],"macros_per_serving":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0},"macros_verified":false,"source_url":"","source_site_name":""}
instructions: plain strings, no numbering. ingredients: parse qty/unit/name/prep; raw_text = original line. meal_types/tags = []. Never fabricate macros or quantities.`

// ---- Handler ----------------------------------------------------------------

export async function POST(req: Request) {
  await sem.acquire()
  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    let html: string
    try {
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Forkcast/1.0; recipe import)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      })
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`)
      html = await pageRes.text()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch URL'
      return NextResponse.json({ error: `Could not load page: ${message}` }, { status: 422 })
    }

    // Path 1: JSON-LD → parse directly, no Claude call
    const jsonLd = extractJsonLd(html)
    if (jsonLd) {
      const candidate = jsonLdToCandidate(jsonLd, url)
      if (candidate) {
        console.log(`[extract] json-ld path  url=${url}`)
        return NextResponse.json(candidate)
      }
      console.log(`[extract] json-ld found but incomplete (missing name/ingredients/instructions), falling back`)
    }

    // Path 2: Claude with aggressively stripped HTML
    const stripped = stripHtmlForClaude(html)
    const estTokens = Math.round(stripped.length / 4)
    console.log(`[extract] claude path  chars=${stripped.length} est_input_tokens≈${estTokens}  url=${url}`)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: 'user', content: `URL: ${url}\n\n${stripped}` }],
    })

    console.log(
      `[extract] claude usage  input=${response.usage.input_tokens}  output=${response.usage.output_tokens}  url=${url}`,
    )

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Extraction returned no content' }, { status: 502 })
    }

    let candidate: RecipeCandidate
    try {
      const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      candidate = JSON.parse(raw)
      if (!candidate.name) throw new Error('Missing name')
    } catch {
      return NextResponse.json({ error: 'Failed to parse extracted recipe' }, { status: 502 })
    }

    // Claude strips tags so image_url is rarely returned — pull it from the raw HTML
    if (!candidate.image_url) {
      candidate.image_url = extractImageFromHtml(html)
    }

    return NextResponse.json(candidate)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    sem.release()
  }
}
