import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { normalizeNotionPageId } from '@/lib/profile/utils'
import type { GroceryItem } from '@/types'

const NOTION_VERSION = '2022-06-28'
const NOTION_API = 'https://api.notion.com/v1'

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function tripTitle(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  const days  = start === end ? DAY_NAMES[s.getDay()] : `${DAY_NAMES[s.getDay()]}–${DAY_NAMES[e.getDay()]}`
  const dates = start === end
    ? `${MONTHS[s.getMonth()]} ${s.getDate()}`
    : s.getMonth() === e.getMonth()
    ? `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
    : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`
  return `${days} · ${dates}`
}

// ── Notion block builders ─────────────────────────────────────────────────────

function heading2(text: string) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  }
}

function todo(text: string) {
  return {
    object: 'block',
    type: 'to_do',
    to_do: {
      rich_text: [{ type: 'text', text: { content: text } }],
      checked: false,
    },
  }
}

function buildBlocks(items: GroceryItem[], groupByCategory: boolean): object[] {
  const CATEGORY_LABELS: Record<string, string> = {
    produce: 'Produce', protein: 'Protein', dairy: 'Dairy',
    bakery: 'Bakery', pantry: 'Pantry', frozen: 'Frozen', other: 'Other',
  }
  const CATEGORY_ORDER = ['produce', 'protein', 'dairy', 'bakery', 'pantry', 'frozen', 'other', null]

  const itemLine = (item: GroceryItem) =>
    item.quantity_text ? `${item.name} — ${item.quantity_text}` : item.name

  if (!groupByCategory) {
    return items.map((item) => todo(itemLine(item)))
  }

  const map = new Map<string | null, GroceryItem[]>()
  for (const item of items) {
    const key = item.category?.toLowerCase() ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }

  const blocks: object[] = []
  for (const cat of CATEGORY_ORDER) {
    const group = map.get(cat)
    if (!group?.length) continue
    const label = cat ? (CATEGORY_LABELS[cat] ?? cat) : 'Other'
    blocks.push(heading2(label))
    for (const item of group) {
      blocks.push(todo(itemLine(item)))
    }
  }
  return blocks
}

// ── Notion API helpers ────────────────────────────────────────────────────────

async function notionPost(path: string, token: string, body: object) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? `Notion error ${res.status}`)
  return data
}

async function notionPatch(path: string, token: string, body: object) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? `Notion error ${res.status}`)
  return data
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { trip_id, include_pantry_staples = false, group_by_category = true } = body as {
      trip_id?: string
      include_pantry_staples?: boolean
      group_by_category?: boolean
    }

    if (!trip_id || typeof trip_id !== 'string') {
      return NextResponse.json({ error: 'trip_id is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch user profile for Notion credentials
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('notion_token, notion_parent_page_id')
      .eq('id', user.id)
      .single()

    const token: string | null = profileData?.notion_token ?? null
    if (!token) {
      return NextResponse.json(
        { error: 'Notion not connected. Add your integration token in Settings.' },
        { status: 400 },
      )
    }

    const rawParentPageId: string | null = profileData?.notion_parent_page_id ?? null
    const parentPageId = rawParentPageId ? (normalizeNotionPageId(rawParentPageId) ?? rawParentPageId) : null

    if (!parentPageId) {
      return NextResponse.json(
        { error: 'Set a parent page ID in Settings → Notion so Forkcast knows where to create pages.' },
        { status: 400 },
      )
    }

    // Fetch the grocery list
    const { data: tripData, error: tripError } = await supabase
      .from('grocery_lists')
      .select('*')
      .eq('id', trip_id)
      .single()

    if (tripError || !tripData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    const allItems = (tripData.items ?? []) as GroceryItem[]
    const items = include_pantry_staples
      ? allItems
      : allItems.filter((i) => !i.is_pantry_staple)

    // Build the page title and content blocks
    const title  = tripTitle(tripData.start_date, tripData.end_date)
    const blocks = buildBlocks(items, group_by_category)

    // Notion API limits children to 100 blocks per request; split if needed
    const MAX_BLOCKS = 100
    const firstBatch  = blocks.slice(0, MAX_BLOCKS)
    const extraBatches = []
    for (let i = MAX_BLOCKS; i < blocks.length; i += MAX_BLOCKS) {
      extraBatches.push(blocks.slice(i, i + MAX_BLOCKS))
    }

    const page = await notionPost('/pages', token, {
      parent: { page_id: parentPageId },
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
      children: firstBatch,
    })

    // Append any overflow blocks
    for (const batch of extraBatches) {
      await notionPatch(`/blocks/${page.id as string}/children`, token, { children: batch })
    }

    return NextResponse.json({ ok: true, notion_page_url: page.url as string })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Push failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
