import { z } from 'zod'

const muscles = [
  'chest', 'back', 'lower_back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'abs',
] as const

const equipment = ['barbell', 'dumbbell', 'machine', 'smith', 'cable', 'ez_bar', 'bodyweight', 'other'] as const

/**
 * Questionnaire stored in `ai_profiles.answers`. Sex, birth date, height, activity and objective
 * already live in `profiles` / `goals`, so they are not asked again.
 */
export const answersSchema = z
  .object({
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
    daysPerWeek: z.number().int().min(2).max(6),
    minutesPerSession: z.number().int().min(20).max(180),
    equipment: z.array(z.enum(equipment)).max(equipment.length),
    injuryRegions: z.array(z.enum(muscles)).max(muscles.length),
    injuryNotes: z.string().max(500),
    focusMuscles: z.array(z.enum(muscles)).max(muscles.length),
    cardio: z.enum(['none', 'some', 'lots']),
    mealsPerDay: z.number().int().min(2).max(8),
    dietRestrictions: z.array(z.enum(['vegetarian', 'vegan', 'lactose_free', 'gluten_free'])).max(4),
    allergies: z.string().max(300),
    dislikedFoods: z.string().max(300),
    budget: z.enum(['low', 'medium', 'high']),
    screening: z.object({
      pregnantOrNursing: z.boolean(),
      eatingDisorderHistory: z.boolean(),
      relevantMedicalCondition: z.boolean(),
      relevantMedication: z.boolean(),
    }),
  })
  .partial()

export type Answers = z.infer<typeof answersSchema>
