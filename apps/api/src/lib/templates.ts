import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { createDb } from '../db/client'
import { templateExercises, workoutTemplates } from '../db/schema'

type Db = ReturnType<typeof createDb>

export const itemSchema = z
  .object({
    exerciseId: z.uuid(),
    targetSets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(100),
    repMax: z.number().int().min(1).max(100),
    restSeconds: z.number().int().min(0).max(600),
    notes: z.string().trim().max(200).nullable().default(null),
  })
  .refine((item) => item.repMin <= item.repMax, { message: 'repMin must be <= repMax' })

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  items: z.array(itemSchema).min(1).max(20),
})

export type TemplateInput = z.infer<typeof templateSchema>

/** Replaces all exercises of a template. */
export async function saveItems(db: Db, templateId: string, items: z.infer<typeof itemSchema>[]) {
  await db.delete(templateExercises).where(eq(templateExercises.templateId, templateId))
  await db.insert(templateExercises).values(items.map((item, position) => ({ ...item, templateId, position })))
}

/** Inserts a workout template with its exercises and returns the new id. Callers check exercise access first. */
export async function createTemplate(db: Db, userId: string, { items, ...body }: TemplateInput) {
  const [template] = await db.insert(workoutTemplates).values({ ...body, userId }).returning({ id: workoutTemplates.id })
  await saveItems(db, template.id, items)
  return template.id
}
