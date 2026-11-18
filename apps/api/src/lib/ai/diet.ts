import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { createDb } from '../../db/client'
import { foods } from '../../db/schema'
import { activeMeals, loadPlan } from '../../routes/diet'
import { currentGoal } from '../stats'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>

const round1 = (n: number) => Math.round(n * 10) / 10
const MAX_CANDIDATE_FOODS = 30
const CANDIDATES_PER_ITEM = 5

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number }
type Per100 = { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

const macrosFor = (per100: Per100, grams: number): Macros => ({
  kcal: Math.round((per100.kcal * grams) / 100),
  proteinG: round1((per100.protein * grams) / 100),
  carbsG: round1((per100.carbs * grams) / 100),
  fatG: round1((per100.fat * grams) / 100),
})

const sumMacros = (list: Macros[]): Macros => ({
  kcal: list.reduce((s, m) => s + m.kcal, 0),
  proteinG: round1(list.reduce((s, m) => s + m.proteinG, 0)),
  carbsG: round1(list.reduce((s, m) => s + m.carbsG, 0)),
  fatG: round1(list.reduce((s, m) => s + m.fatG, 0)),
})

type Candidate = { id: string; name: string } & Per100

async function candidatesFor(db: Db, userId: string, food: { id: string; category: string | null } & Per100) {
  if (!food.category) return []
  return db
    .select({ id: foods.id, name: foods.name, kcal: foods.kcal, protein: foods.protein, carbs: foods.carbs, fat: foods.fat, fiber: foods.fiber })
    .from(foods)
    .where(
      and(
        or(isNull(foods.ownerId), eq(foods.ownerId, userId)),
        eq(foods.category, food.category),
        ne(foods.id, food.id),
      ),
    )
    .orderBy(
      sql`abs(${foods.kcal} - ${food.kcal}) / 10 + abs(${foods.protein} - ${food.protein}) + abs(${foods.carbs} - ${food.carbs}) + abs(${foods.fat} - ${food.fat})`,
    )
    .limit(CANDIDATES_PER_ITEM)
}

/**
 * Current plan with computed macros, plus up to 5 same-category swap candidates per item picked in code.
 * The model may only swap to a candidate listed here, so it can never invent a food.
 */
export async function dietPlanContext(db: Db, userId: string, answers: Answers) {
  const [plan, mealList, goal] = await Promise.all([loadPlan(db, userId), activeMeals(db, userId), currentGoal(db, userId)])
  const mealName = new Map(mealList.map((m) => [m.id, m.name]))

  const distinct = [...new Map(plan.map((p) => [p.food.id, p.food])).values()].slice(0, MAX_CANDIDATE_FOODS)
  const candidateLists = await Promise.all(distinct.map((f) => candidatesFor(db, userId, f)))
  const candidatesByFood = new Map<string, Candidate[]>(distinct.map((f, i) => [f.id, candidateLists[i]]))

  const items = plan.map((p) => {
    const macros = macrosFor(p.food, p.grams)
    return {
      id: p.id,
      meal: mealName.get(p.mealId) ?? 'Refeição',
      food: p.food.name,
      category: p.food.category,
      grams: p.grams,
      ...macros,
      fiberG: round1((p.food.fiber * p.grams) / 100),
      candidates: (candidatesByFood.get(p.food.id) ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        kcalPer100g: c.kcal,
        proteinPer100g: c.protein,
        carbsPer100g: c.carbs,
        fatPer100g: c.fat,
      })),
    }
  })

  const totals = sumMacros(items)
  const target: Macros | null = goal
    ? { kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG }
    : null

  const input = {
    target,
    totals: { ...totals, fiberG: round1(items.reduce((s, i) => s + i.fiberG, 0)) },
    distinctFoods: new Set(plan.map((p) => p.food.id)).size,
    preferences: {
      objective: goal?.objective ?? null,
      restrictions: answers.dietRestrictions ?? [],
      allergies: answers.allergies ?? '',
      dislikedFoods: answers.dislikedFoods ?? '',
    },
    items,
  }

  return { hasPlan: items.length > 0, input, totals, target }
}

export const dietReviewModelSchema = z.object({
  summary: z.string().max(600),
  issues: z.array(z.object({ issue: z.string().max(300), why: z.string().max(300) })).max(5),
  swaps: z
    .array(z.object({ planItemId: z.string(), reason: z.string().max(300), newFoodId: z.string(), grams: z.number() }))
    .max(6),
  tips: z.array(z.string().max(240)).max(4),
})

type ModelReview = z.infer<typeof dietReviewModelSchema>
type Line = { foodName: string; grams: number } & Macros

export type DietReview = {
  summary: string
  issues: ModelReview['issues']
  tips: string[]
  target: Macros | null
  totals: Macros
  swaps: { planItemId: string; meal: string; reason: string; from: Line; to: Line & { foodId: string } }[]
  /** Swaps the model proposed that were discarded because an id was not in the candidate list. */
  discarded: number
}

/** Keeps only swaps that point at a real plan item and one of its listed candidates, and recomputes their macros. */
export function buildDietReview(ctx: Awaited<ReturnType<typeof dietPlanContext>>, model: ModelReview): DietReview {
  const items = new Map(ctx.input.items.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const swaps: DietReview['swaps'] = []

  for (const s of model.swaps) {
    const item = items.get(s.planItemId)
    const candidate = item?.candidates.find((c) => c.id === s.newFoodId)
    const grams = Math.round(s.grams / 5) * 5
    if (!item || !candidate || seen.has(item.id) || !(grams >= 5 && grams <= 2000)) continue
    seen.add(item.id)

    const to = macrosFor(
      { kcal: candidate.kcalPer100g, protein: candidate.proteinPer100g, carbs: candidate.carbsPer100g, fat: candidate.fatPer100g, fiber: 0 },
      grams,
    )
    swaps.push({
      planItemId: item.id,
      meal: item.meal,
      reason: s.reason,
      from: { foodName: item.food, grams: item.grams, kcal: item.kcal, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG },
      to: { foodId: candidate.id, foodName: candidate.name, grams, ...to },
    })
  }

  return {
    summary: model.summary,
    issues: model.issues,
    tips: model.tips,
    target: ctx.target,
    totals: ctx.totals,
    swaps,
    discarded: model.swaps.length - swaps.length,
  }
}
