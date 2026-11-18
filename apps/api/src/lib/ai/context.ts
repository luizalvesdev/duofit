import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import type { createDb } from '../../db/client'
import { exercises, foodLogs, mealPlanItems, sessionSets, workoutSessions, workoutTemplates } from '../../db/schema'
import { currentGoal, listBodyLogs, listSessions, recentRecords } from '../stats'
import { addDays, localDate, startOfLocalDay, weekdayLabels, weekdayOf } from '../week'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>

const round = (n: number, digits = 0) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Sets per primary muscle (warm-ups excluded) for sessions that started in [from, to). */
async function setsByMuscle(db: Db, userId: string, from: Date, to: Date) {
  const rows = await db
    .select({ muscle: exercises.primaryMuscle, sets: sql<number>`count(*)`.mapWith(Number) })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.startedAt, from),
        lt(workoutSessions.startedAt, to),
        ne(sessionSets.setType, 'warmup'),
      ),
    )
    .groupBy(exercises.primaryMuscle)
  return Object.fromEntries(rows.map((r) => [r.muscle, r.sets]))
}

/**
 * Exercises trained this week whose best estimated 1RM has not beaten an earlier session
 * for at least 3 sessions in a row (looking back 8 weeks).
 */
async function stalledExercises(db: Db, userId: string, weekFrom: Date, weekTo: Date) {
  const lookback = new Date(weekFrom.getTime() - 8 * 7 * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      exerciseId: sessionSets.exerciseId,
      name: exercises.name,
      at: workoutSessions.startedAt,
      e1rm: sql<number>`max(${sessionSets.weightKg} * (1 + ${sessionSets.reps} / 30.0))`.mapWith(Number),
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.startedAt, lookback),
        lt(workoutSessions.startedAt, weekTo),
        inArray(sessionSets.setType, ['normal', 'failure']),
      ),
    )
    .groupBy(sessionSets.exerciseId, exercises.name, workoutSessions.id, workoutSessions.startedAt)
    .orderBy(asc(workoutSessions.startedAt))

  const byExercise = new Map<string, { name: string; series: { at: Date; e1rm: number }[] }>()
  for (const r of rows) {
    const entry = byExercise.get(r.exerciseId) ?? { name: r.name, series: [] }
    entry.series.push({ at: r.at, e1rm: r.e1rm })
    byExercise.set(r.exerciseId, entry)
  }

  const stalled = []
  for (const { name, series } of byExercise.values()) {
    if (series.length < 4 || series.at(-1)!.at < weekFrom) continue
    const best = Math.max(...series.map((s) => s.e1rm))
    const sessionsSinceBest = series.length - 1 - series.findIndex((s) => s.e1rm >= best)
    if (sessionsSinceBest >= 3) stalled.push({ exercise: name, sessionsSinceBest, bestE1rmKg: round(best, 1) })
  }
  return stalled.sort((a, b) => b.sessionsSinceBest - a.sessionsSinceBest).slice(0, 5)
}

type LogRow = { loggedOn: string; kcal: number; protein: number; carbs: number; fat: number; planItemId: string | null }

function dietSummary(logs: LogRow[]) {
  const days = new Map<string, { kcal: number; proteinG: number; carbsG: number; fatG: number }>()
  for (const l of logs) {
    const d = days.get(l.loggedOn) ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    d.kcal += l.kcal
    d.proteinG += l.protein
    d.carbsG += l.carbs
    d.fatG += l.fat
    days.set(l.loggedOn, d)
  }
  const list = [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
  const n = list.length
  const avg = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => (n ? round(list.reduce((s, [, d]) => s + d[key], 0) / n) : null)
  return {
    daysLogged: n,
    avgKcal: avg('kcal'),
    avgProteinG: avg('proteinG'),
    avgCarbsG: avg('carbsG'),
    avgFatG: avg('fatG'),
    days: list.map(([date, d]) => ({
      day: weekdayLabels[weekdayOf(date)],
      kcal: round(d.kcal),
      proteinG: round(d.proteinG),
    })),
    fromPlanPct: logs.length ? round((logs.filter((l) => l.planItemId).length / logs.length) * 100) : null,
  }
}

/** One entry per exercise and set: a single set often breaks several record kinds at once. */
function groupRecords(records: { exerciseName: string; kind: string; weightKg: number; reps: number }[]) {
  const grouped = new Map<string, { exercise: string; weightKg: number; reps: number; kinds: string[] }>()
  for (const r of records) {
    const key = `${r.exerciseName}|${r.weightKg}|${r.reps}`
    const entry = grouped.get(key) ?? { exercise: r.exerciseName, weightKg: r.weightKg, reps: r.reps, kinds: [] }
    entry.kinds.push(r.kind)
    grouped.set(key, entry)
  }
  return [...grouped.values()]
}

/** Least-squares weight slope in kg per week, or null when there is not enough spread. */
function weightTrend(points: { date: string; kg: number }[]) {
  if (points.length < 2) return null
  const t0 = new Date(`${points[0].date}T00:00:00Z`).getTime()
  const xs = points.map((p) => (new Date(`${p.date}T00:00:00Z`).getTime() - t0) / (24 * 60 * 60 * 1000))
  if (xs.at(-1)! < 7) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length
  const meanY = points.reduce((a, p) => a + p.kg, 0) / points.length
  const num = xs.reduce((a, x, i) => a + (x - meanX) * (points[i].kg - meanY), 0)
  const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0)
  return den === 0 ? null : round((num / den) * 7, 2)
}

/**
 * Compact, anonymous summary of one week (Mon-Sun) plus the previous one for comparison.
 * Contains only metrics: no name, e-mail or ids.
 */
export async function weekContext(db: Db, userId: string, weekStart: string, answers: Answers) {
  const weekEnd = addDays(weekStart, 7)
  const prevStart = addDays(weekStart, -7)
  const from = startOfLocalDay(weekStart)
  const to = startOfLocalDay(weekEnd)
  const prevFrom = startOfLocalDay(prevStart)

  const [sessions, prevSessions, muscles, prevMuscles, stalled, records, templates, planItems, goal, logs, prevLogs, bodyLogs] =
    await Promise.all([
      listSessions(db, userId, { from: from.toISOString(), to: to.toISOString(), limit: 50 }),
      listSessions(db, userId, { from: prevFrom.toISOString(), to: from.toISOString(), limit: 50 }),
      setsByMuscle(db, userId, from, to),
      setsByMuscle(db, userId, prevFrom, from),
      stalledExercises(db, userId, from, to),
      recentRecords(db, [userId], 50, { from, to }),
      db
        .select({ weekdays: workoutTemplates.weekdays })
        .from(workoutTemplates)
        .where(and(eq(workoutTemplates.userId, userId), isNull(workoutTemplates.archivedAt))),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(mealPlanItems).where(eq(mealPlanItems.userId, userId)),
      currentGoal(db, userId),
      db
        .select({ loggedOn: foodLogs.loggedOn, kcal: foodLogs.kcal, protein: foodLogs.protein, carbs: foodLogs.carbs, fat: foodLogs.fat, planItemId: foodLogs.planItemId })
        .from(foodLogs)
        .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedOn, weekStart), lt(foodLogs.loggedOn, weekEnd))),
      db
        .select({ loggedOn: foodLogs.loggedOn, kcal: foodLogs.kcal, protein: foodLogs.protein, carbs: foodLogs.carbs, fat: foodLogs.fat, planItemId: foodLogs.planItemId })
        .from(foodLogs)
        .where(and(eq(foodLogs.userId, userId), gte(foodLogs.loggedOn, prevStart), lt(foodLogs.loggedOn, weekStart))),
      listBodyLogs(db, userId, addDays(weekStart, -28)),
    ])

  const summarize = (list: typeof sessions) => ({
    sessions: list.length,
    sets: list.reduce((s, x) => s + x.sets, 0),
    volumeKg: list.reduce((s, x) => s + x.volume, 0),
    avgMinutes: list.length ? round(list.reduce((s, x) => s + x.durationSeconds, 0) / list.length / 60) : null,
  })

  const weights = bodyLogs
    .filter((b) => b.weightKg !== null && b.loggedOn < weekEnd)
    .map((b) => ({ date: b.loggedOn, kg: b.weightKg as number }))

  const training = {
    planned: templates.reduce((s, t) => s + t.weekdays.length, 0),
    sessions: [...sessions].reverse().map((s) => ({
      day: weekdayLabels[weekdayOf(localDate(s.startedAt))],
      name: s.name,
      minutes: round(s.durationSeconds / 60),
      sets: s.sets,
      volumeKg: s.volume,
      records: s.records,
    })),
    totals: summarize(sessions),
    previousWeek: summarize(prevSessions),
    setsByMuscle: muscles,
    previousSetsByMuscle: prevMuscles,
    stalled,
    records: groupRecords(records),
  }

  const diet = {
    target: goal ? { kcal: goal.kcal, proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG } : null,
    planItems: planItems[0]?.n ?? 0,
    ...dietSummary(logs),
    previousWeek: (({ daysLogged, avgKcal, avgProteinG }) => ({ daysLogged, avgKcal, avgProteinG }))(dietSummary(prevLogs)),
  }

  const body = {
    latestKg: weights.at(-1)?.kg ?? null,
    targetKg: goal?.targetWeightKg ?? null,
    trendKgPerWeek: weightTrend(weights),
    weights: weights.slice(-8),
  }

  const profile = {
    objective: goal?.objective ?? null,
    experience: answers.experience ?? null,
    availableDaysPerWeek: answers.daysPerWeek ?? null,
  }

  return {
    hasEnoughData: training.totals.sessions > 0 || diet.daysLogged >= 2,
    context: { week: { start: weekStart, end: addDays(weekStart, 6) }, profile, training, diet, body },
  }
}
