import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'

const NOTION_VERSION = '2022-06-28'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const token = body?.token
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const res = await fetch('https://api.notion.com/v1/users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json(
      { error: data.message ?? 'Invalid token' },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    workspace_name: data.workspace_name ?? 'your Notion workspace',
  })
}
