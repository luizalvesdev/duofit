import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { bodyLogs } from '../db/schema'
import type { AppEnv } from '../env'
import { exerciseBests, exerciseProgress, listBodyLogs, listSessions, recentRecords, sessionDetail } from '../lib/stats'
import { requireAuth } from '../middleware/auth'

const isoDate = z.iso.date()
const optionalCm = z.number().min(10).max(300).nullable().optional()

const bodyLogSchema = z.object({
  loggedOn: isoDate,
  weightKg: z.number().min(30).max(300).nullable().optional(),
  waistCm: optionalCm,
  hipCm: optionalCm,
  armCm: optionalCm,
  thighCm: optionalCm,
})

export const progressRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/sessions', zValidator('query', z.object({ before: z.iso.datetime().optional() })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ sessions: await listSessions(db, c.get('userId'), c.req.valid('query')) })
  })
  .get('/sessions/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const detail = await sessionDetail(db, c.get('userId'), c.req.param('id'))
    return detail ? c.json(detail) : c.json({ error: 'not_found' }, 404)
  })
  .get('/exercises', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [bests, records] = await Promise.all([exerciseBests(db, userId), recentRecords(db, [userId], 10)])
    return c.json({ bests, records })
  })
  .get('/exercises/:id', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ points: await exerciseProgress(db, c.get('userId'), c.req.param('id')) })
  })
  .get('/body', zValidator('query', z.object({ since: isoDate.optional() })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ logs: await listBodyLogs(db, c.get('userId'), c.req.valid('query').since) })
  })
  .put('/body', zValidator('json', bodyLogSchema), async (c) => {
    const { loggedOn, ...values } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const [log] = await db
      .insert(bodyLogs)
      .values({ userId, loggedOn, ...values })
      .onConflictDoUpdate({ target: [bodyLogs.userId, bodyLogs.loggedOn], set: values })
      .returning()
    return c.json({ log })
  })
  .delete('/body/:date', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const date = isoDate.safeParse(c.req.param('date'))
    if (!date.success) return c.json({ error: 'invalid_date' }, 400)
    await db.delete(bodyLogs).where(and(eq(bodyLogs.userId, c.get('userId')), eq(bodyLogs.loggedOn, date.data)))
    return c.json({ ok: true })
  })
