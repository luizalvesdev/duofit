import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { personalRecords, recordKindEnum, sessionSets, setTypeEnum, workoutSessions } from '../db/schema'
import type { AppEnv } from '../env'
import { allExercisesVisible } from '../lib/access'
import { requireAuth } from '../middleware/auth'

const setSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  exercisePosition: z.number().int().min(0).max(50),
  setPosition: z.number().int().min(0).max(50),
  setType: z.enum(setTypeEnum.enumValues),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(500),
  completedAt: z.iso.datetime(),
})

const recordSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  setId: z.uuid(),
  kind: z.enum(recordKindEnum.enumValues),
  value: z.number().min(0),
  achievedAt: z.iso.datetime(),
})

const sessionSchema = z.object({
  id: z.uuid(),
  templateId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(60),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 12).default(0),
  notes: z.string().trim().max(500).nullable().default(null),
  sets: z.array(setSchema).max(300),
  records: z.array(recordSchema).max(300).default([]),
})

const HISTORY_SESSIONS = 30

export const sessionRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .put('/:id', zValidator('json', sessionSchema), async (c) => {
    const { sets, records, ...session } = c.req.valid('json')
    if (session.id !== c.req.param('id')) return c.json({ error: 'id_mismatch' }, 400)

    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    if (!(await allExercisesVisible(db, userId, sets.map((s) => s.exerciseId)))) {
      return c.json({ error: 'unknown_exercise' }, 400)
    }

    const [existing] = await db
      .select({ userId: workoutSessions.userId })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, session.id))
    if (existing && existing.userId !== userId) return c.json({ error: 'not_found' }, 404)

    const values = {
      ...session,
      userId,
      startedAt: new Date(session.startedAt),
      finishedAt: new Date(session.finishedAt),
    }

    await db.insert(workoutSessions).values(values).onConflictDoUpdate({ target: workoutSessions.id, set: values })
    await db.delete(sessionSets).where(eq(sessionSets.sessionId, session.id))
    if (sets.length > 0) {
      await db.insert(sessionSets).values(
        sets.map((s) => ({ ...s, sessionId: session.id, completedAt: new Date(s.completedAt) })),
      )
    }

    const setIds = new Set(sets.map((s) => s.id))
    const validRecords = records.filter((r) => setIds.has(r.setId))
    if (validRecords.length > 0) {
      await db
        .insert(personalRecords)
        .values(validRecords.map((r) => ({ ...r, userId, achievedAt: new Date(r.achievedAt) })))
        .onConflictDoNothing()
    }

    return c.json({ ok: true })
  })
  .get('/history', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')

    const sessions = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(desc(workoutSessions.startedAt))
      .limit(HISTORY_SESSIONS)

    const ids = sessions.map((s) => s.id)
    const countsForRecords = and(
      eq(workoutSessions.userId, userId),
      inArray(sessionSets.setType, ['normal', 'failure']),
      gt(sessionSets.reps, 0),
    )

    const [sets, bests, repBests] = await Promise.all([
      ids.length ? db.select().from(sessionSets).where(inArray(sessionSets.sessionId, ids)) : [],
      db
        .select({
          exerciseId: sessionSets.exerciseId,
          weight: sql<number>`max(${sessionSets.weightKg})`.mapWith(Number),
          e1rm: sql<number>`max(${sessionSets.weightKg} * (1 + ${sessionSets.reps} / 30.0))`.mapWith(Number),
        })
        .from(sessionSets)
        .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
        .where(countsForRecords)
        .groupBy(sessionSets.exerciseId),
      db
        .select({
          exerciseId: sessionSets.exerciseId,
          weightKg: sessionSets.weightKg,
          reps: sql<number>`max(${sessionSets.reps})`.mapWith(Number),
        })
        .from(sessionSets)
        .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
        .where(countsForRecords)
        .groupBy(sessionSets.exerciseId, sessionSets.weightKg),
    ])

    const records = bests.map((b) => ({
      ...b,
      repsByWeight: Object.fromEntries(
        repBests.filter((r) => r.exerciseId === b.exerciseId).map((r) => [String(r.weightKg), r.reps]),
      ),
    }))

    return c.json({ sessions, sets, records })
  })
