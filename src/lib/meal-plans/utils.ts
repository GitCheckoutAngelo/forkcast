import type { Macros } from '@/types'

export const ZERO_MACROS: Macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

export function scaleMacros(m: Macros, x: number): Macros {
  return {
    calories: m.calories * x,
    protein_g: m.protein_g * x,
    carbs_g: m.carbs_g * x,
    fat_g: m.fat_g * x,
    ...(m.fiber_g != null ? { fiber_g: m.fiber_g * x } : {}),
    ...(m.sugar_g != null ? { sugar_g: m.sugar_g * x } : {}),
    ...(m.sodium_mg != null ? { sodium_mg: m.sodium_mg * x } : {}),
  }
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  }
}
