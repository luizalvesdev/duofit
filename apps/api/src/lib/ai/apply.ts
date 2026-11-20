import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { createDb } from '../../db/client'
import { aiInsights, foods, mealPlanItems, meals, workoutTemplates } from '../../db/schema'
import { searchable } from '../search'
import { activeMeals, MAX_MEALS } from '../../routes/diet'
import type { DietDraft } from './dietDraft'
import type { DietReview } from './diet'
import { allExercisesVisible } from '../access'
import { createTemplate, saveItems, type TemplateInput } from '../templates'
import type { WorkoutChat } from './workoutChat'
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

/**
 * Creates the workout templates the user approved. The client sends the (possibly edited) templates,
 * so they go through the same schema and exercise-access check as a normal template save.
 */
export async function applyWorkoutDraft(db: Db, userId: string, insight: Insight, templates: TemplateInput[]) {
  if (templates.length === 0) throw new HttpError(400, 'invalid_selection')
  if (!(await allExercisesVisible(db, userId, templates.flatMap((t) => t.items.map((i) => i.exerciseId))))) {
    throw new HttpError(400, 'unknown_exercise')
  }

  for (const template of templates) await createTemplate(db, userId, template)
  await markApplied(db, insight.id)
  return { applied: templates.length }
}

/**
 * Replaces the whole meal plan with the approved draft. Draft meals are matched to the user's meals by name;
 * a name with no match becomes a new meal. Everything runs in one batch so a failure leaves the old plan intact.
 */
export async function applyDietDraft(db: Db, userId: string, insight: Insight) {
  const draft = insight.output as DietDraft
  const foodIds = draft.meals.flatMap((m) => m.items.map((i) => i.foodId))
  const [visible, current] = await Promise.all([
    db.select({ id: foods.id }).from(foods).where(and(inArray(foods.id, foodIds), or(isNull(foods.ownerId), eq(foods.ownerId, userId)))),
    activeMeals(db, userId),
  ])
  if (visible.length !== new Set(foodIds).size) throw new HttpError(400, 'unknown_food')

  const byName = new Map(current.map((m) => [searchable(m.name), m.id]))
  const created: { id: string; userId: string; name: string; position: number }[] = []
  const rows: { userId: string; mealId: string; foodId: string; grams: number; position: number }[] = []

  for (const m of draft.meals) {
    const key = searchable(m.name)
    let mealId = byName.get(key)
    if (!mealId) {
      if (current.length + created.length >= MAX_MEALS) throw new HttpError(400, 'too_many_meals')
      mealId = crypto.randomUUID()
      created.push({ id: mealId, userId, name: m.name, position: current.length + created.length })
      byName.set(key, mealId)
    }
    for (const item of m.items) rows.push({ userId, mealId, foodId: item.foodId, grams: item.grams, position: rows.length })
  }

  const [first, ...rest] = [
    ...(created.length ? [db.insert(meals).values(created)] : []),
    db.delete(mealPlanItems).where(eq(mealPlanItems.userId, userId)),
    db.insert(mealPlanItems).values(rows),
    markApplied(db, insight.id),
  ]
  await db.batch([first, ...rest])
  return { applied: rows.length, createdMeals: created.length }
}

/**
 * Applies a change the AI proposed in the workout chat: updates the touched templates, creates the new ones and
 * archives the removed ones. Fails with `plan_changed` when a referenced template was deleted in the meantime.
 */
export async function applyWorkoutChat(db: Db, userId: string, insight: Insight) {
  const proposal = (insight.output as WorkoutChat).proposal
  if (!proposal) throw new HttpError(400, 'not_applicable')

  const ids = [...proposal.changes.flatMap((c) => (c.templateId ? [c.templateId] : [])), ...proposal.remove.map((r) => r.templateId)]
  if (ids.length) {
    const found = await db
      .select({ id: workoutTemplates.id })
      .from(workoutTemplates)
      .where(and(eq(workoutTemplates.userId, userId), isNull(workoutTemplates.archivedAt), inArray(workoutTemplates.id, ids)))
    if (found.length !== new Set(ids).size) throw new HttpError(409, 'plan_changed')
  }
  if (!(await allExercisesVisible(db, userId, proposal.changes.flatMap((c) => c.items.map((i) => i.exerciseId))))) {
    throw new HttpError(400, 'unknown_exercise')
  }

  for (const c of proposal.changes) {
    const items = c.items.map(({ exerciseId, targetSets, repMin, repMax, restSeconds, notes }) => ({ exerciseId, targetSets, repMin, repMax, restSeconds, notes }))
    if (!c.templateId) {
      await createTemplate(db, userId, { name: c.name, weekdays: c.weekdays, items })
      continue
    }
    await db
      .update(workoutTemplates)
      .set({ name: c.name, weekdays: c.weekdays, updatedAt: new Date() })
      .where(and(eq(workoutTemplates.id, c.templateId), eq(workoutTemplates.userId, userId)))
    await saveItems(db, c.templateId, items)
  }
  if (proposal.remove.length) {
    await db
      .update(workoutTemplates)
      .set({ archivedAt: new Date() })
      .where(and(eq(workoutTemplates.userId, userId), inArray(workoutTemplates.id, proposal.remove.map((r) => r.templateId))))
  }
  await markApplied(db, insight.id)
  return { applied: proposal.changes.length, removed: proposal.remove.length }
}
