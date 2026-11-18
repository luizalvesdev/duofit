import { and, eq, isNull, notInArray, or, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { createDb } from '../../db/client'
import { exercises } from '../../db/schema'
import { currentGoal, exerciseBests } from '../stats'
import { AiError } from './errors'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>

/** Fields the workout draft cannot be generated without. */
export function missingWorkoutAnswers(a: Answers) {
  const missing: string[] = []
  if (!a.experience) missing.push('experience')
  if (!a.daysPerWeek) missing.push('daysPerWeek')
  if (!a.minutesPerSession) missing.push('minutesPerSession')
  if (!a.equipment?.length) missing.push('equipment')
  return missing
}

/**
 * Exercises the user can use (system + own), filtered by their equipment and without injured regions.
 * The model sees short numeric ids (`n`) instead of UUIDs: fewer tokens, nothing to mistype, and every
 * answer is mapped back through this list, so it can only pick exercises that really exist.
 */
export async function workoutDraftContext(db: Db, userId: string, answers: Answers) {
  const injured = answers.injuryRegions ?? []
  const catalog = await db
    .select({ id: exercises.id, name: exercises.name, muscle: exercises.primaryMuscle, equipment: exercises.equipment })
    .from(exercises)
    .where(
      and(
        or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)),
        inArray(exercises.equipment, answers.equipment ?? []),
        injured.length ? notInArray(exercises.primaryMuscle, injured) : undefined,
      ),
    )
    .orderBy(exercises.primaryMuscle, exercises.name)

  const byN = new Map(catalog.map((e, i) => [i + 1, e]))
  const nOf = new Map(catalog.map((e, i) => [e.id, i + 1]))

  const [bests, goal] = await Promise.all([exerciseBests(db, userId), currentGoal(db, userId)])
  const knownBests = bests
    .filter((b) => nOf.has(b.exerciseId))
    .slice(0, 30)
    .map((b) => ({ n: nOf.get(b.exerciseId)!, maxKg: b.maxWeight, e1rmKg: b.bestE1rm }))

  const input = {
    level: answers.experience,
    daysPerWeek: answers.daysPerWeek,
    minutesPerSession: answers.minutesPerSession,
    cardio: answers.cardio ?? null,
    objective: goal?.objective ?? null,
    focusMuscles: answers.focusMuscles ?? [],
    injuredRegions: injured,
    injuryNotes: answers.injuryNotes ?? '',
    equipment: answers.equipment,
    catalog: catalog.map((e, i) => ({ n: i + 1, name: e.name, muscle: e.muscle, equipment: e.equipment })),
    currentBests: knownBests,
  }

  return { input, byN, enough: catalog.length >= 8 }
}

export const workoutDraftModelSchema = z.object({
  rationale: z.string().max(600),
  split: z.string().max(80),
  templates: z
    .array(
      z.object({
        name: z.string().max(60),
        weekdays: z.array(z.number().int()).max(7),
        exercises: z
          .array(
            z.object({
              n: z.number().int(),
              sets: z.number().int(),
              repMin: z.number().int(),
              repMax: z.number().int(),
              restSeconds: z.number().int(),
              notes: z.string().max(200).nullable(),
            }),
          )
          .max(14),
      }),
    )
    .max(6),
})

type ModelDraft = z.infer<typeof workoutDraftModelSchema>

export type WorkoutDraft = {
  rationale: string
  split: string
  templates: {
    name: string
    weekdays: number[]
    items: {
      exerciseId: string
      exerciseName: string
      muscle: string
      targetSets: number
      repMin: number
      repMax: number
      restSeconds: number
      notes: string | null
    }[]
  }[]
  discarded: number
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(Math.round(n), min), max)

/**
 * Maps the model's numeric ids back to real exercises and enforces the same limits as the template editor.
 * Weekdays are unique across templates and capped at the days the person said they can train.
 */
export function buildWorkoutDraft(
  ctx: Awaited<ReturnType<typeof workoutDraftContext>>,
  model: ModelDraft,
  daysPerWeek: number,
): WorkoutDraft {
  const usedDays = new Set<number>()
  let proposed = 0
  const templates: WorkoutDraft['templates'] = []

  for (const t of model.templates) {
    proposed += t.exercises.length
    const seen = new Set<number>()
    const items: WorkoutDraft['templates'][number]['items'] = []
    for (const e of t.exercises) {
      const ex = ctx.byN.get(e.n)
      if (!ex || seen.has(e.n)) continue
      seen.add(e.n)
      const repMin = clamp(e.repMin, 1, 100)
      items.push({
        exerciseId: ex.id,
        exerciseName: ex.name,
        muscle: ex.muscle,
        targetSets: clamp(e.sets, 1, 10),
        repMin,
        repMax: Math.max(repMin, clamp(e.repMax, 1, 100)),
        restSeconds: clamp(e.restSeconds, 0, 600),
        notes: e.notes?.trim() || null,
      })
    }
    if (items.length === 0) continue

    const weekdays = [...new Set(t.weekdays)]
      .filter((d) => d >= 0 && d <= 6 && !usedDays.has(d))
      .sort((a, b) => a - b)
      .slice(0, Math.max(0, daysPerWeek - usedDays.size))
    weekdays.forEach((d) => usedDays.add(d))
    templates.push({ name: t.name.trim() || `Treino ${templates.length + 1}`, weekdays, items })
  }

  if (templates.length === 0) throw new AiError('ai_invalid_output', 502, 'The draft had no usable exercises')
  const kept = templates.reduce((s, t) => s + t.items.length, 0)
  return { rationale: model.rationale, split: model.split, templates, discarded: proposed - kept }
}
