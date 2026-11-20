import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { createDb } from '../../db/client'
import { exercises, templateExercises, workoutTemplates } from '../../db/schema'
import { fillMissingDays, mapItems, workoutDraftContext, workoutDraftModelSchema, type WorkoutDraft } from './workout'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(1500),
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

/**
 * Everything the model needs to discuss the person's current workout: the draft context (profile, catalog,
 * bests) plus the active templates, numbered `t`, with their exercises in the same `n` numbering.
 * Exercises already in a template stay in the catalog even if the questionnaire filters would drop them.
 */
export async function workoutChatContext(db: Db, userId: string, answers: Answers, conversation: ChatMessage[]) {
  const base = await workoutDraftContext(db, userId, answers)
  const byN = new Map(base.byN)

  const templates = await db
    .select()
    .from(workoutTemplates)
    .where(and(eq(workoutTemplates.userId, userId), isNull(workoutTemplates.archivedAt)))
    .orderBy(asc(workoutTemplates.position), asc(workoutTemplates.name))
  const items = templates.length
    ? await db
        .select()
        .from(templateExercises)
        .where(inArray(templateExercises.templateId, templates.map((t) => t.id)))
        .orderBy(asc(templateExercises.position))
    : []

  const nOf = new Map([...byN].map(([n, e]) => [e.id, n]))
  const missing = [...new Set(items.map((i) => i.exerciseId))].filter((id) => !nOf.has(id))
  if (missing.length) {
    const extra = await db
      .select({ id: exercises.id, name: exercises.name, muscle: exercises.primaryMuscle, equipment: exercises.equipment })
      .from(exercises)
      .where(inArray(exercises.id, missing))
    for (const e of extra) {
      const n = byN.size + 1
      byN.set(n, e)
      nOf.set(e.id, n)
    }
  }

  const current = templates.map((t, i) => ({
    t: i + 1,
    id: t.id,
    name: t.name,
    weekdays: t.weekdays,
    exercises: items
      .filter((it) => it.templateId === t.id)
      .map((it) => ({
        n: nOf.get(it.exerciseId)!,
        sets: it.targetSets,
        repMin: it.repMin,
        repMax: it.repMax,
        restSeconds: it.restSeconds,
        notes: it.notes,
      })),
  }))

  const input = {
    ...base.input,
    catalog: [...byN].map(([n, e]) => ({ n, name: e.name, muscle: e.muscle, equipment: e.equipment })),
    workout: current.map(({ id: _id, ...t }) => t),
    conversation,
  }
  return { input, byN, current, daysPerWeek: answers.daysPerWeek ?? 7 }
}

const templateModel = workoutDraftModelSchema.shape.templates.element

export const workoutChatModelSchema = z.object({
  reply: z.string().max(2000),
  proposal: z
    .object({
      summary: z.string().max(400),
      templates: z.array(templateModel.extend({ t: z.number().int().nullable() })).max(6),
      removeTemplates: z.array(z.number().int()).max(10),
    })
    .nullable(),
})

type ModelChat = z.infer<typeof workoutChatModelSchema>
type Ctx = Awaited<ReturnType<typeof workoutChatContext>>

export type WorkoutChange = { templateId: string | null; name: string; weekdays: number[]; items: WorkoutDraft['templates'][number]['items'] }

export type WorkoutChat = {
  reply: string
  proposal: { summary: string; changes: WorkoutChange[]; remove: { templateId: string; name: string }[] } | null
}

/**
 * Resolves the model's `t` and `n` numbers to real templates and exercises. Templates the proposal does not
 * touch keep their days, and every changed or new template ends with at least one fixed day.
 */
export function buildWorkoutChat(ctx: Ctx, model: ModelChat): WorkoutChat {
  const p = model.proposal
  if (!p) return { reply: model.reply, proposal: null }

  const byT = new Map(ctx.current.map((t) => [t.t, t]))
  const remove = [...new Set(p.removeTemplates)].flatMap((t) => {
    const found = byT.get(t)
    return found ? [{ templateId: found.id, name: found.name }] : []
  })
  const removed = new Set(remove.map((r) => r.templateId))

  const touched = new Set<string>()
  const changes: WorkoutChange[] = []
  for (const t of p.templates) {
    const existing = t.t === null ? undefined : byT.get(t.t)
    if (existing && (touched.has(existing.id) || removed.has(existing.id))) continue
    const items = mapItems(ctx.byN, t.exercises)
    if (items.length === 0) continue
    if (existing) touched.add(existing.id)
    changes.push({
      templateId: existing?.id ?? null,
      name: t.name.trim() || existing?.name || `Treino ${changes.length + 1}`,
      weekdays: [...new Set(t.weekdays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b),
      items,
    })
  }

  // Days held by templates the change leaves alone win; the changed ones give way.
  const locked = ctx.current.filter((t) => !touched.has(t.id) && !removed.has(t.id))
  const taken = new Set(locked.flatMap((t) => t.weekdays))
  for (const c of changes) {
    c.weekdays = c.weekdays.filter((d) => !taken.has(d))
    c.weekdays.forEach((d) => taken.add(d))
  }
  fillMissingDays([...locked.map((t) => ({ weekdays: [...t.weekdays], locked: true })), ...changes], ctx.daysPerWeek)

  if (changes.length === 0 && remove.length === 0) return { reply: model.reply, proposal: null }
  return { reply: model.reply, proposal: { summary: p.summary, changes, remove } }
}
