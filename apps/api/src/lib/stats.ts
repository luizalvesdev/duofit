import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import type { createDb } from '../db/client'
import { bodyLogs, exercises, goals, personalRecords, sessionSets, workoutSessions } from '../db/schema'

type Db = ReturnType<typeof createDb>

const workingVolume = sql<number>`coalesce(sum(case when ${sessionSets.setType} <> 'warmup' then ${sessionSets.weightKg} * ${sessionSets.reps} else 0 end), 0)`.mapWith(Number)

export async function listSessions(
  db: Db,
  userId: string,
  { before, from, to, limit = 20 }: { before?: string; from?: string; to?: string; limit?: number } = {},
) {
  const sessions = await db
    .select({
      id: workoutSessions.id,
      name: workoutSessions.name,
      startedAt: workoutSessions.startedAt,
      finishedAt: workoutSessions.finishedAt,
      durationSeconds: workoutSessions.durationSeconds,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        before ? lt(workoutSessions.startedAt, new Date(before)) : undefined,
        from ? gte(workoutSessions.startedAt, new Date(from)) : undefined,
        to ? lt(workoutSessions.startedAt, new Date(to)) : undefined,
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit)

  if (sessions.length === 0) return []
  const ids = sessions.map((s) => s.id)

  const [totals, records] = await Promise.all([
    db
      .select({
        sessionId: sessionSets.sessionId,
        sets: sql<number>`count(*) filter (where ${sessionSets.setType} <> 'warmup')`.mapWith(Number),
        exercises: sql<number>`count(distinct ${sessionSets.exerciseId})`.mapWith(Number),
        volume: workingVolume,
      })
      .from(sessionSets)
      .where(inArray(sessionSets.sessionId, ids))
      .groupBy(sessionSets.sessionId),
    db
      .select({ sessionId: sessionSets.sessionId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(personalRecords)
      .innerJoin(sessionSets, eq(sessionSets.id, personalRecords.setId))
      .where(inArray(sessionSets.sessionId, ids))
      .groupBy(sessionSets.sessionId),
  ])

  return sessions.map((s) => {
    const t = totals.find((x) => x.sessionId === s.id)
    return {
      ...s,
      sets: t?.sets ?? 0,
      exercises: t?.exercises ?? 0,
      volume: Math.round(t?.volume ?? 0),
      records: records.find((r) => r.sessionId === s.id)?.count ?? 0,
    }
  })
}

export async function sessionDetail(db: Db, userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
  if (!session) return null

  const [sets, records] = await Promise.all([
    db
      .select({
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        exerciseName: exercises.name,
        exercisePosition: sessionSets.exercisePosition,
        setPosition: sessionSets.setPosition,
        setType: sessionSets.setType,
        weightKg: sessionSets.weightKg,
        reps: sessionSets.reps,
      })
      .from(sessionSets)
      .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
      .where(eq(sessionSets.sessionId, sessionId))
      .orderBy(asc(sessionSets.exercisePosition), asc(sessionSets.setPosition)),
    db
      .select({ setId: personalRecords.setId, kind: personalRecords.kind })
      .from(personalRecords)
      .innerJoin(sessionSets, eq(sessionSets.id, personalRecords.setId))
      .where(eq(sessionSets.sessionId, sessionId)),
  ])

  return { session, sets, records }
}

// Best working set per session for one exercise: drives the progress chart.
export async function exerciseProgress(db: Db, userId: string, exerciseId: string) {
  return db
    .select({
      sessionId: workoutSessions.id,
      date: workoutSessions.startedAt,
      maxWeight: sql<number>`max(${sessionSets.weightKg})`.mapWith(Number),
      bestE1rm: sql<number>`round(max(${sessionSets.weightKg} * (1 + ${sessionSets.reps} / 30.0)), 1)`.mapWith(Number),
      volume: workingVolume,
      sets: sql<number>`count(*)`.mapWith(Number),
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sessionSets.exerciseId, exerciseId),
        inArray(sessionSets.setType, ['normal', 'failure']),
      ),
    )
    .groupBy(workoutSessions.id, workoutSessions.startedAt)
    .orderBy(asc(workoutSessions.startedAt))
}

// Current bests per exercise (all-time), plus when the last PR happened.
export async function exerciseBests(db: Db, userId: string) {
  const [bests, lastRecords] = await Promise.all([
    db
      .select({
        exerciseId: sessionSets.exerciseId,
        name: exercises.name,
        primaryMuscle: exercises.primaryMuscle,
        maxWeight: sql<number>`max(${sessionSets.weightKg})`.mapWith(Number),
        bestE1rm: sql<number>`round(max(${sessionSets.weightKg} * (1 + ${sessionSets.reps} / 30.0)), 1)`.mapWith(Number),
        sessions: sql<number>`count(distinct ${sessionSets.sessionId})`.mapWith(Number),
        lastDone: sql<string>`max(${workoutSessions.startedAt})`,
      })
      .from(sessionSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
      .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
      .where(and(eq(workoutSessions.userId, userId), ne(sessionSets.setType, 'warmup'), ne(sessionSets.setType, 'drop')))
      .groupBy(sessionSets.exerciseId, exercises.name, exercises.primaryMuscle),
    db
      .select({ exerciseId: personalRecords.exerciseId, at: sql<string>`max(${personalRecords.achievedAt})` })
      .from(personalRecords)
      .where(eq(personalRecords.userId, userId))
      .groupBy(personalRecords.exerciseId),
  ])

  return bests
    .map((b) => ({ ...b, lastRecordAt: lastRecords.find((r) => r.exerciseId === b.exerciseId)?.at ?? null }))
    .sort((a, b) => b.lastDone.localeCompare(a.lastDone))
}

export async function recentRecords(db: Db, userIds: string[], limit = 20, range?: { from: Date; to: Date }) {
  if (userIds.length === 0) return []
  return db
    .select({
      id: personalRecords.id,
      userId: personalRecords.userId,
      exerciseId: personalRecords.exerciseId,
      exerciseName: exercises.name,
      kind: personalRecords.kind,
      value: personalRecords.value,
      weightKg: sessionSets.weightKg,
      reps: sessionSets.reps,
      achievedAt: personalRecords.achievedAt,
    })
    .from(personalRecords)
    .innerJoin(exercises, eq(exercises.id, personalRecords.exerciseId))
    .innerJoin(sessionSets, eq(sessionSets.id, personalRecords.setId))
    .where(
      and(
        inArray(personalRecords.userId, userIds),
        range ? gte(personalRecords.achievedAt, range.from) : undefined,
        range ? lt(personalRecords.achievedAt, range.to) : undefined,
      ),
    )
    .orderBy(desc(personalRecords.achievedAt))
    .limit(limit)
}

export async function listBodyLogs(db: Db, userId: string, sinceIso?: string) {
  return db
    .select()
    .from(bodyLogs)
    .where(and(eq(bodyLogs.userId, userId), sinceIso ? gte(bodyLogs.loggedOn, sinceIso) : undefined))
    .orderBy(asc(bodyLogs.loggedOn))
}

export async function currentGoal(db: Db, userId: string) {
  const [goal] = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.startedAt)).limit(1)
  return goal ?? null
}
