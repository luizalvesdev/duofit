import { z } from 'zod'

const score = z.number().int().min(0).max(10)

export const weekReviewSchema = z.object({
  summary: z.string().max(600),
  highlights: z.array(z.string().max(240)).min(1).max(4),
  improvements: z
    .array(
      z.object({
        area: z.enum(['treino', 'dieta', 'recuperacao', 'consistencia']),
        issue: z.string().max(300),
        why: z.string().max(300),
        action: z.string().max(300),
      }),
    )
    .min(1)
    .max(4),
  nextWeek: z.array(z.string().max(240)).min(2).max(5),
  score: z.object({ consistency: score, training: score, diet: score }).optional(),
})

export type WeekReview = z.infer<typeof weekReviewSchema>
