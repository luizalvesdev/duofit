import { zValidator } from '@hono/zod-validator'
import { asc, eq, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { equipmentEnum, exercises, muscleEnum } from '../db/schema'
import type { AppEnv } from '../env'
import { requireAuth } from '../middleware/auth'

const customSchema = z.object({
  name: z.string().trim().min(2).max(80),
  primaryMuscle: z.enum(muscleEnum.enumValues),
  secondaryMuscles: z.array(z.enum(muscleEnum.enumValues)).max(5).default([]),
  equipment: z.enum(equipmentEnum.enumValues),
})

const columns = {
  id: exercises.id,
  name: exercises.name,
  primaryMuscle: exercises.primaryMuscle,
  secondaryMuscles: exercises.secondaryMuscles,
  equipment: exercises.equipment,
  imagePath: exercises.imagePath,
  ownerId: exercises.ownerId,
}

export const exerciseRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const rows = await db
      .select(columns)
      .from(exercises)
      .where(or(isNull(exercises.ownerId), eq(exercises.ownerId, c.get('userId'))))
      .orderBy(asc(exercises.name))
    return c.json({ exercises: rows })
  })
  .post('/', zValidator('json', customSchema), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [exercise] = await db
      .insert(exercises)
      .values({ ...c.req.valid('json'), ownerId: c.get('userId') })
      .returning(columns)
    return c.json({ exercise }, 201)
  })
