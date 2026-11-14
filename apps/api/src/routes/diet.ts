import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gte, inArray, isNull, like, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { foodLogs, foods, mealEnum, mealPlanItems } from '../db/schema'
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
  meal: z.enum(mealEnum.enumValues),
  foodId: z.uuid(),
  grams,
  planItemId: z.uuid().nullable().default(null),
})

const planSchema = z.object({
  items: z.array(z.object({ meal: z.enum(mealEnum.enumValues), foodId: z.uuid(), grams })).max(80),
})

const scale = (per100: number, g: number) => Math.round(((per100 * g) / 100) * 10) / 10

async function visibleFoods(db: Db, userId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await db.select(foodColumns).from(foods).where(and(inArray(foods.id, unique), visibleTo(userId)))
  return new Map(rows.map((f) => [f.id, f]))
}

export async function loadPlan(db: Db, userId: string) {
  return db
    .select({ id: mealPlanItems.id, meal: mealPlanItems.meal, grams: mealPlanItems.grams, position: mealPlanItems.position, food: foodColumns })
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
  .get('/day/:date', async (c) => {
    const date = isoDate.safeParse(c.req.param('date'))
    if (!date.success) return c.json({ error: 'invalid_date' }, 400)
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [logs, plan, goal] = await Promise.all([loadDiary(db, userId, date.data), loadPlan(db, userId), currentGoal(db, userId)])
    return c.json({ logs, plan, goal })
  })
  .post('/logs', zValidator('json', logSchema), async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const food = (await visibleFoods(db, userId, [body.foodId])).get(body.foodId)
    if (!food) return c.json({ error: 'unknown_food' }, 400)

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
    return c.json({ plan: await loadPlan(db, c.get('userId')) })
  })
  .put('/plan', zValidator('json', planSchema), async (c) => {
    const { items } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const visible = await visibleFoods(db, userId, items.map((i) => i.foodId))
    if (items.some((i) => !visible.has(i.foodId))) return c.json({ error: 'unknown_food' }, 400)

    await db.delete(mealPlanItems).where(eq(mealPlanItems.userId, userId))
    if (items.length) await db.insert(mealPlanItems).values(items.map((item, position) => ({ ...item, userId, position })))
    return c.json({ plan: await loadPlan(db, userId) })
  })
