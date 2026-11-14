import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { bodyLogs, goals, profiles } from '../db/schema'
import type { AppEnv } from '../env'
import { requireAuth } from '../middleware/auth'

const isoDate = z.iso.date()

const profileSchema = z.object({
  sex: z.enum(['male', 'female']),
  birthDate: isoDate,
  heightCm: z.number().int().min(100).max(250),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  weightKg: z.number().min(30).max(300),
  today: isoDate,
})

const goalSchema = z.object({
  objective: z.enum(['lose', 'maintain', 'gain']),
  targetWeightKg: z.number().min(30).max(300).nullable(),
  targetDate: isoDate.nullable(),
  kcal: z.number().int().min(800).max(6000),
  proteinG: z.number().int().min(0).max(500),
  carbsG: z.number().int().min(0).max(1000),
  fatG: z.number().int().min(0).max(400),
})

export const profile = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')

    const [[data], [goal], [lastWeight]] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userId, userId)),
      db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.startedAt)).limit(1),
      db
        .select({ weightKg: bodyLogs.weightKg, loggedOn: bodyLogs.loggedOn })
        .from(bodyLogs)
        .where(eq(bodyLogs.userId, userId))
        .orderBy(desc(bodyLogs.loggedOn))
        .limit(1),
    ])

    return c.json({ profile: data ?? null, goal: goal ?? null, lastWeight: lastWeight ?? null })
  })
  .put('/', zValidator('json', profileSchema), async (c) => {
    const { weightKg, today, ...body } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')

    await db
      .insert(profiles)
      .values({ userId, ...body })
      .onConflictDoUpdate({ target: profiles.userId, set: { ...body, updatedAt: new Date() } })

    await db
      .insert(bodyLogs)
      .values({ userId, loggedOn: today, weightKg })
      .onConflictDoUpdate({ target: [bodyLogs.userId, bodyLogs.loggedOn], set: { weightKg } })

    return c.json({ ok: true })
  })
  .post('/goals', zValidator('json', goalSchema), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [goal] = await db.insert(goals).values({ userId: c.get('userId'), ...c.req.valid('json') }).returning()
    return c.json({ goal }, 201)
  })

