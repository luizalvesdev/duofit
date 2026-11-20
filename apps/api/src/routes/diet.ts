import { zValidator } from '@hono/zod-validator'
import { and, asc, count, desc, eq, gte, inArray, isNull, like, max, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { DEFAULT_MEALS, foodLogs, foods, mealPlanItems, meals } from '../db/schema'
import type { AppEnv } from '../env'
import { searchable } from '../lib/search'
import { currentGoal } from '../lib/stats'
import { requireAuth } from '../middleware/auth'

type Db = ReturnType<typeof createDb>

const isoDate = z.iso.date()
const grams = z.number().min(1).max(5000)
const macro = z.number().min(0).max(1000)

const foodColumns = {
  id: foods.id,
  name: foods.name,
  category: foods.category,
  source: foods.source,
  kcal: foods.kcal,
  protein: foods.protein,
  carbs: foods.carbs,
  fat: foods.fat,
  fiber: foods.fiber,
  servingName: foods.servingName,
  servingGrams: foods.servingGrams,
}

const visibleTo = (userId: string) => or(isNull(foods.ownerId), eq(foods.ownerId, userId))

const customFoodSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kcal: z.number().min(0).max(900),
  protein: macro,
  carbs: macro,
  fat: macro,
  fiber: macro.default(0),
  servingName: z.string().trim().max(40).nullable().default(null),
  servingGrams: grams.nullable().default(null),
})

const logSchema = z.object({
  loggedOn: isoDate,
  mealId: z.uuid(),
  foodId: z.uuid(),
  grams,
  planItemId: z.uuid().nullable().default(null),
})

const planSchema = z.object({
  items: z.array(z.object({ mealId: z.uuid(), foodId: z.uuid(), grams })).max(80),
})

export const MAX_MEALS = 12
const mealName = z.object({ name: z.string().trim().min(1).max(40) })

const mealColumns = {
  id: meals.id,
  name: meals.name,
  position: meals.position,
  archived: sql<boolean>`${meals.archivedAt} is not null`,
}

const scale = (per100: number, g: number) => Math.round(((per100 * g) / 100) * 10) / 10

async function visibleFoods(db: Db, userId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await db.select(foodColumns).from(foods).where(and(inArray(foods.id, unique), visibleTo(userId)))
  return new Map(rows.map((f) => [f.id, f]))
}

export async function createDefaultMeals(db: Db, userId: string) {
  await db.insert(meals).values(DEFAULT_MEALS.map((name, position) => ({ userId, name, position })))
}

export async function activeMeals(db: Db, userId: string) {
  return db
    .select(mealColumns)
    .from(meals)
    .where(and(eq(meals.userId, userId), isNull(meals.archivedAt)))
    .orderBy(asc(meals.position))
}

/** Active meals plus archived ones that still hold entries on `date`, so old diary days keep their sections. */
export async function mealsForDay(db: Db, userId: string, date: string) {
  const loggedThatDay = db
    .select({ id: foodLogs.mealId })
    .from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.loggedOn, date)))
  return db
    .select(mealColumns)
    .from(meals)
    .where(and(eq(meals.userId, userId), or(isNull(meals.archivedAt), inArray(meals.id, loggedThatDay))))
    .orderBy(asc(meals.position))
}

async function ownsActiveMeals(db: Db, userId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return true
  const rows = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, userId), isNull(meals.archivedAt), inArray(meals.id, unique)))
  return rows.length === unique.length
}

export async function loadPlan(db: Db, userId: string) {
  return db
    .select({ id: mealPlanItems.id, mealId: mealPlanItems.mealId, grams: mealPlanItems.grams, position: mealPlanItems.position, food: foodColumns })
    .from(mealPlanItems)
    .innerJoin(foods, eq(foods.id, mealPlanItems.foodId))
    .where(eq(mealPlanItems.userId, userId))
    .orderBy(asc(mealPlanItems.position))
}

export async function loadDiary(db: Db, userId: string, date: string) {
  return db
    .select()
    .from(foodLogs)
    .where(and(eq(foodLogs.userId, userId), eq(foodLogs.loggedOn, date)))
    .orderBy(asc(foodLogs.createdAt))
}

export const dietRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/foods', zValidator('query', z.object({ q: z.string().max(80).default('') })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const terms = searchable(c.req.valid('query').q).split(' ').filter((t) => t.length > 1)
    if (terms.length === 0) return c.json({ foods: [] })
    const rows = await db
      .select(foodColumns)
      .from(foods)
      .where(and(visibleTo(c.get('userId')), ...terms.map((t) => like(foods.searchName, `%${t}%`))))
      .orderBy(sql`${foods.ownerId} is null`, sql`length(${foods.name})`)
      .limit(40)
    return c.json({ foods: rows })
  })
  .get('/foods/recent', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)
    const rows = await db
      .select({ ...foodColumns, uses: sql<number>`count(*)`.mapWith(Number), lastGrams: sql<number>`(array_agg(${foodLogs.grams} order by ${foodLogs.createdAt} desc))[1]`.mapWith(Number) })
      .from(foodLogs)
      .innerJoin(foods, eq(foods.id, foodLogs.foodId))
      .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedOn, since)))
      .groupBy(foods.id)
      .orderBy(desc(sql`count(*)`))
      .limit(20)
    return c.json({ foods: rows })
  })
  .post('/foods', zValidator('json', customFoodSchema), async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const [food] = await db
      .insert(foods)
      .values({ ...body, source: 'custom', searchName: searchable(body.name), ownerId: c.get('userId') })
      .returning(foodColumns)
    return c.json({ food }, 201)
  })
  // Looks a barcode up on Open Food Facts (public DB) and returns per-100g macros to prefill a custom food.
  // Only the barcode and a generic client name leave the server; no user data is sent.
  .get('/foods/barcode/:code', async (c) => {
    const code = c.req.param('code').replace(/\D/g, '')
    if (code.length < 6 || code.length > 14) return c.json({ error: 'invalid_code' }, 400)
    let data: { status?: number; product?: { product_name?: string; product_name_pt?: string; brands?: string; serving_quantity?: number | string; nutriments?: Record<string, number | undefined> } }
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_pt,brands,nutriments,serving_quantity`, {
        headers: { 'User-Agent': 'DuoFit/1.0 (diet tracker)' },
      })
      if (!res.ok) return c.json({ error: 'not_found' }, 404)
      data = (await res.json()) as typeof data
    } catch {
      return c.json({ error: 'lookup_failed' }, 502)
    }
    if (!data || data.status === 0 || !data.product) return c.json({ error: 'not_found' }, 404)
    const n = data.product.nutriments ?? {}
    const kcal = n['energy-kcal_100g'] ?? n['energy-kcal_value']
    if (kcal == null) return c.json({ error: 'no_nutrition' }, 404)
    const r1 = (v: number | undefined) => Math.min(100, Math.max(0, Math.round((Number(v) || 0) * 10) / 10))
    const name = String(data.product.product_name_pt || data.product.product_name || data.product.brands || `Produto ${code}`).slice(0, 100)
    const serving = Number(data.product.serving_quantity)
    return c.json({
      name,
      kcal: Math.min(900, Math.max(0, Math.round(Number(kcal) || 0))),
      protein: r1(n.proteins_100g),
      carbs: r1(n.carbohydrates_100g),
      fat: r1(n.fat_100g),
      servingGrams: Number.isFinite(serving) && serving > 0 ? Math.round(serving) : null,
    })
  })
  .get('/day/:date', async (c) => {
    const date = isoDate.safeParse(c.req.param('date'))
    if (!date.success) return c.json({ error: 'invalid_date' }, 400)
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [logs, plan, goal, dayMeals] = await Promise.all([
      loadDiary(db, userId, date.data),
      loadPlan(db, userId),
      currentGoal(db, userId),
      mealsForDay(db, userId, date.data),
    ])
    return c.json({ logs, plan, goal, meals: dayMeals })
  })
  .post('/logs', zValidator('json', logSchema), async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const food = (await visibleFoods(db, userId, [body.foodId])).get(body.foodId)
    if (!food) return c.json({ error: 'unknown_food' }, 400)
    if (!(await ownsActiveMeals(db, userId, [body.mealId]))) return c.json({ error: 'unknown_meal' }, 400)

    const [log] = await db
      .insert(foodLogs)
      .values({
        ...body,
        userId,
        foodName: food.name,
        kcal: scale(food.kcal, body.grams),
        protein: scale(food.protein, body.grams),
        carbs: scale(food.carbs, body.grams),
        fat: scale(food.fat, body.grams),
      })
      .returning()
    return c.json({ log }, 201)
  })
  .patch('/logs/:id', zValidator('json', z.object({ grams })), async (c) => {
    const { grams: g } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [existing] = await db
      .select({ log: foodLogs, food: foodColumns })
      .from(foodLogs)
      .innerJoin(foods, eq(foods.id, foodLogs.foodId))
      .where(and(eq(foodLogs.id, c.req.param('id')), eq(foodLogs.userId, userId)))
    if (!existing) return c.json({ error: 'not_found' }, 404)

    const { food } = existing
    const [log] = await db
      .update(foodLogs)
      .set({ grams: g, kcal: scale(food.kcal, g), protein: scale(food.protein, g), carbs: scale(food.carbs, g), fat: scale(food.fat, g) })
      .where(eq(foodLogs.id, existing.log.id))
      .returning()
    return c.json({ log })
  })
  .delete('/logs/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const deleted = await db
      .delete(foodLogs)
      .where(and(eq(foodLogs.id, c.req.param('id')), eq(foodLogs.userId, c.get('userId'))))
      .returning({ id: foodLogs.id })
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })
  .get('/plan', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [plan, mealList] = await Promise.all([loadPlan(db, userId), activeMeals(db, userId)])
    return c.json({ plan, meals: mealList })
  })
  .put('/plan', zValidator('json', planSchema), async (c) => {
    const { items } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const visible = await visibleFoods(db, userId, items.map((i) => i.foodId))
    if (items.some((i) => !visible.has(i.foodId))) return c.json({ error: 'unknown_food' }, 400)
    if (!(await ownsActiveMeals(db, userId, items.map((i) => i.mealId)))) return c.json({ error: 'unknown_meal' }, 400)

    await db.delete(mealPlanItems).where(eq(mealPlanItems.userId, userId))
    if (items.length) await db.insert(mealPlanItems).values(items.map((item, position) => ({ ...item, userId, position })))
    return c.json({ plan: await loadPlan(db, userId) })
  })
  .get('/meals', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ meals: await activeMeals(db, c.get('userId')) })
  })
  .post('/meals', zValidator('json', mealName), async (c) => {
    const { name } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [{ active, last }] = await db
      .select({ active: count(), last: max(meals.position) })
      .from(meals)
      .where(and(eq(meals.userId, userId), isNull(meals.archivedAt)))
    if (active >= MAX_MEALS) return c.json({ error: 'too_many_meals' }, 400)
    const [meal] = await db
      .insert(meals)
      .values({ userId, name, position: (last ?? -1) + 1 })
      .returning(mealColumns)
    return c.json({ meal }, 201)
  })
  .patch('/meals/:id', zValidator('json', mealName), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [meal] = await db
      .update(meals)
      .set({ name: c.req.valid('json').name })
      .where(and(eq(meals.id, c.req.param('id')), eq(meals.userId, c.get('userId')), isNull(meals.archivedAt)))
      .returning(mealColumns)
    return meal ? c.json({ meal }) : c.json({ error: 'not_found' }, 404)
  })
  .put('/meals/order', zValidator('json', z.object({ ids: z.array(z.uuid()).min(1).max(MAX_MEALS) })), async (c) => {
    const { ids } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const current = await activeMeals(db, userId)
    const same = current.length === ids.length && new Set(ids).size === ids.length && current.every((m) => ids.includes(m.id))
    if (!same) return c.json({ error: 'invalid_order' }, 400)

    const [first, ...rest] = ids.map((id, position) =>
      db.update(meals).set({ position }).where(and(eq(meals.id, id), eq(meals.userId, userId))),
    )
    await db.batch([first, ...rest])
    return c.json({ meals: await activeMeals(db, userId) })
  })
  .delete('/meals/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const id = c.req.param('id')
    const [meal] = await db.select({ id: meals.id }).from(meals).where(and(eq(meals.id, id), eq(meals.userId, userId), isNull(meals.archivedAt)))
    if (!meal) return c.json({ error: 'not_found' }, 404)

    const [{ logs }] = await db.select({ logs: count() }).from(foodLogs).where(eq(foodLogs.mealId, id))
    if (logs === 0) {
      await db.delete(meals).where(eq(meals.id, id))
    } else {
      // Keep the meal (archived) so past diary days still show it; drop it from the plan.
      await db.batch([
        db.update(meals).set({ archivedAt: new Date() }).where(eq(meals.id, id)),
        db.delete(mealPlanItems).where(eq(mealPlanItems.mealId, id)),
      ])
    }
    return c.json({ ok: true })
  })
