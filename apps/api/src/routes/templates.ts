import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { templateExercises, workoutTemplates } from '../db/schema'
import type { AppEnv } from '../env'
import { allExercisesVisible } from '../lib/access'
import { requireAuth } from '../middleware/auth'

const itemSchema = z
  .object({
    exerciseId: z.uuid(),
    targetSets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(100),
    repMax: z.number().int().min(1).max(100),
    restSeconds: z.number().int().min(0).max(600),
    notes: z.string().trim().max(200).nullable().default(null),
  })
  .refine((item) => item.repMin <= item.repMax, { message: 'repMin must be <= repMax' })

const templateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  items: z.array(itemSchema).min(1).max(20),
})

type Db = ReturnType<typeof createDb>

async function loadTemplates(db: Db, userId: string, templateId?: string) {
  const templates = await db
    .select()
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.userId, userId),
        isNull(workoutTemplates.archivedAt),
        templateId ? eq(workoutTemplates.id, templateId) : undefined,
      ),
    )
    .orderBy(asc(workoutTemplates.position), asc(workoutTemplates.name))

  if (templates.length === 0) return []

  const items = await db
    .select()
    .from(templateExercises)
    .where(inArray(templateExercises.templateId, templates.map((t) => t.id)))
    .orderBy(asc(templateExercises.position))

  return templates.map((t) => ({ ...t, items: items.filter((i) => i.templateId === t.id) }))
}

async function saveItems(db: Db, templateId: string, items: z.infer<typeof itemSchema>[]) {
  await db.delete(templateExercises).where(eq(templateExercises.templateId, templateId))
  await db.insert(templateExercises).values(items.map((item, position) => ({ ...item, templateId, position })))
}

export const templateRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ templates: await loadTemplates(db, c.get('userId')) })
  })
  .post('/', zValidator('json', templateSchema), async (c) => {
    const { items, ...body } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    if (!(await allExercisesVisible(db, userId, items.map((i) => i.exerciseId)))) {
      return c.json({ error: 'unknown_exercise' }, 400)
    }

    const [template] = await db.insert(workoutTemplates).values({ ...body, userId }).returning({ id: workoutTemplates.id })
    await saveItems(db, template.id, items)
    const [created] = await loadTemplates(db, userId, template.id)
    return c.json({ template: created }, 201)
  })
  .put('/:id', zValidator('json', templateSchema), async (c) => {
    const { items, ...body } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const id = c.req.param('id')
    if (!(await allExercisesVisible(db, userId, items.map((i) => i.exerciseId)))) {
      return c.json({ error: 'unknown_exercise' }, 400)
    }

    const updated = await db
      .update(workoutTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId), isNull(workoutTemplates.archivedAt)))
      .returning({ id: workoutTemplates.id })
    if (updated.length === 0) return c.json({ error: 'not_found' }, 404)

    await saveItems(db, id, items)
    const [template] = await loadTemplates(db, userId, id)
    return c.json({ template })
  })
  .delete('/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const archived = await db
      .update(workoutTemplates)
      .set({ archivedAt: new Date() })
      .where(and(eq(workoutTemplates.id, c.req.param('id')), eq(workoutTemplates.userId, c.get('userId'))))
      .returning({ id: workoutTemplates.id })
    if (archived.length === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })
