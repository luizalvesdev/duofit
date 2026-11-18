import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { createDb } from '../../db/client'
import { aiInsights, foods, mealPlanItems } from '../../db/schema'
import type { DietReview } from './diet'
import { HttpError } from './errors'

type Db = ReturnType<typeof createDb>
export type Insight = typeof aiInsights.$inferSelect

const markApplied = (db: Db, id: string) => db.update(aiInsights).set({ status: 'applied' }).where(eq(aiInsights.id, id))

/** Applies the chosen swaps of a diet review to the real plan. Nothing is written without this explicit call. */
export async function applyDietReview(db: Db, userId: string, insight: Insight, swapIndexes: number[]) {
  const review = insight.output as DietReview
  const chosen = [...new Set(swapIndexes)].map((i) => review.swaps[i])
  if (chosen.length === 0 || chosen.some((s) => !s)) throw new HttpError(400, 'invalid_selection')

  const itemIds = chosen.map((s) => s.planItemId)
  const foodIds = chosen.map((s) => s.to.foodId)
  const [items, visible] = await Promise.all([
    db.select({ id: mealPlanItems.id }).from(mealPlanItems).where(and(eq(mealPlanItems.userId, userId), inArray(mealPlanItems.id, itemIds))),
    db.select({ id: foods.id }).from(foods).where(and(inArray(foods.id, foodIds), or(isNull(foods.ownerId), eq(foods.ownerId, userId)))),
  ])
  // The plan was edited after the review was generated.
  if (items.length !== new Set(itemIds).size) throw new HttpError(409, 'plan_changed')
  if (visible.length !== new Set(foodIds).size) throw new HttpError(400, 'unknown_food')

  const [first, ...rest] = [
    ...chosen.map((s) =>
      db
        .update(mealPlanItems)
        .set({ foodId: s.to.foodId, grams: s.to.grams })
        .where(and(eq(mealPlanItems.id, s.planItemId), eq(mealPlanItems.userId, userId))),
    ),
    markApplied(db, insight.id),
  ]
  await db.batch([first, ...rest])
  return { applied: chosen.length }
}
