import type { Goal } from './types'

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'supper'

export type Food = {
  id: string
  name: string
  category: string | null
  source: 'taco' | 'reference' | 'custom'
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  servingName: string | null
  servingGrams: number | null
  lastGrams?: number
}

export type FoodLog = {
  id: string
  loggedOn: string
  meal: Meal
  foodId: string
  foodName: string
  grams: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  planItemId: string | null
}

export type PlanItem = { id: string; meal: Meal; grams: number; position: number; food: Food }

export type DayResponse = { logs: FoodLog[]; plan: PlanItem[]; goal: Goal | null }

export const meals: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Café da manhã' },
  { key: 'lunch', label: 'Almoço' },
  { key: 'snack', label: 'Lanche' },
  { key: 'dinner', label: 'Jantar' },
  { key: 'supper', label: 'Ceia' },
]

export type Macros = { kcal: number; protein: number; carbs: number; fat: number }

export const zero: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export const forGrams = (food: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'>, grams: number): Macros => ({
  kcal: (food.kcal * grams) / 100,
  protein: (food.protein * grams) / 100,
  carbs: (food.carbs * grams) / 100,
  fat: (food.fat * grams) / 100,
})

export const sum = (items: Macros[]): Macros =>
  items.reduce((acc, m) => ({ kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }), zero)

export const round = (value: number) => Math.round(value)

export const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
