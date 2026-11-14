import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { createDb } from '../db/client'
import { exercises } from '../db/schema'

type Db = ReturnType<typeof createDb>

export async function allExercisesVisible(db: Db, userId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return true
  const rows = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, unique), or(isNull(exercises.ownerId), eq(exercises.ownerId, userId))))
  return rows.length === unique.length
}
