// Accepts a Notion page URL, slug, or bare 32-char hex ID and returns a
// properly dashed UUID. Returns null if no 32-char hex sequence is found.
export function normalizeNotionPageId(input: string): string | null {
  const stripped = input.replace(/-/g, '')
  const matches = stripped.match(/[0-9a-f]{32}/gi)
  if (!matches) return null
  const h = matches[matches.length - 1]
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
