const IMPERIAL_CONVERSIONS: Record<string, { factor: number; to: 'g' | 'ml' }> = {
  oz:              { factor: 28,  to: 'g'  },
  ounce:           { factor: 28,  to: 'g'  },
  ounces:          { factor: 28,  to: 'g'  },
  lb:              { factor: 454, to: 'g'  },
  lbs:             { factor: 454, to: 'g'  },
  pound:           { factor: 454, to: 'g'  },
  pounds:          { factor: 454, to: 'g'  },
  'fl oz':         { factor: 30,  to: 'ml' },
  'fluid ounce':   { factor: 30,  to: 'ml' },
  'fluid ounces':  { factor: 30,  to: 'ml' },
  pint:            { factor: 480,  to: 'ml' },
  pints:           { factor: 480,  to: 'ml' },
  pt:              { factor: 480,  to: 'ml' },
  quart:           { factor: 946,  to: 'ml' },
  quarts:          { factor: 946,  to: 'ml' },
  qt:              { factor: 946,  to: 'ml' },
}

export function applyMetricRounding(qty: number, unit: 'g' | 'kg' | 'ml' | 'L'): [number, 'g' | 'kg' | 'ml' | 'L'] {
  if (unit === 'g' && qty >= 500) return [Math.round(qty / 100) / 10, 'kg']
  if (unit === 'ml' && qty >= 1000) return [Math.round(qty / 100) / 10, 'L']
  if (unit === 'kg') return [Math.round(qty * 10) / 10, 'kg']
  if (unit === 'L') return [Math.round(qty * 10) / 10, 'L']
  if (unit === 'g') {
    if (qty < 10)  return [Math.round(qty * 10) / 10, 'g']
    if (qty < 100) return [Math.round(qty / 5) * 5, 'g']
    return [Math.round(qty / 25) * 25, 'g']
  }
  // ml
  if (qty < 25)  return [Math.round(qty * 10) / 10, 'ml']
  if (qty < 100) return [Math.round(qty / 5) * 5, 'ml']
  if (qty < 500) return [Math.round(qty / 25) * 25, 'ml']
  return [Math.round(qty / 50) * 50, 'ml']
}

export function normalizeQty(qty: number, unit: string): [number, string] {
  const key = unit.trim().toLowerCase()
  const conv = IMPERIAL_CONVERSIONS[key]
  const q = conv ? qty * conv.factor : qty
  const u = conv ? conv.to : key

  if (u === 'g' || u === 'kg' || u === 'ml' || u === 'L') {
    return applyMetricRounding(q, u as 'g' | 'kg' | 'ml' | 'L')
  }
  return [Math.round(q * 100) / 100, conv ? u : unit]
}

// Re-rounds free-form quantity_text strings for simple g/kg/ml/L patterns.
export function cleanQuantityText(text: string): string {
  const m = text.trim().match(/^([\d.]+)\s*(g|kg|ml|mL|L)$/i)
  if (!m) return text
  const qty = parseFloat(m[1])
  if (isNaN(qty) || qty <= 0) return text
  const rawUnit = m[2]
  const unit = (rawUnit.toLowerCase() === 'l' ? 'L' : rawUnit.toLowerCase()) as 'g' | 'kg' | 'ml' | 'L'
  const [rq, ru] = applyMetricRounding(qty, unit)
  const decimals = ru === 'kg' || ru === 'L' ? 1 : 0
  return `${rq.toFixed(decimals)} ${ru}`
}
