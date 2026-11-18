import { ApiError } from './api'
import type { Equipment, Muscle } from './workout'

export type WeekReview = {
  summary: string
  highlights: string[]
  improvements: { area: 'treino' | 'dieta' | 'recuperacao' | 'consistencia'; issue: string; why: string; action: string }[]
  nextWeek: string[]
  score?: { consistency: number; training: number; diet: number }
}

export type Insight<T> = {
  id: string
  kind: string
  periodStart: string | null
  output: T
  status: 'ready' | 'applied' | 'dismissed'
  createdAt: string
}

export type Answers = Partial<{
  experience: 'beginner' | 'intermediate' | 'advanced'
  daysPerWeek: number
  minutesPerSession: number
  equipment: Equipment[]
  injuryRegions: Muscle[]
  injuryNotes: string
  focusMuscles: Muscle[]
  cardio: 'none' | 'some' | 'lots'
  mealsPerDay: number
  dietRestrictions: ('vegetarian' | 'vegan' | 'lactose_free' | 'gluten_free')[]
  allergies: string
  dislikedFoods: string
  budget: 'low' | 'medium' | 'high'
  screening: { pregnantOrNursing: boolean; eatingDisorderHistory: boolean; relevantMedicalCondition: boolean; relevantMedication: boolean }
}>

export type AiProfile = { consentAt: string | null; answers: Answers }

export const hasWorkoutAnswers = (a: Answers) =>
  !!a.experience && !!a.daysPerWeek && !!a.minutesPerSession && !!a.equipment?.length

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

export const AI_WORKOUT_DISCLAIMER =
  'Rascunho gerado por IA a partir das suas respostas. Não substitui um personal trainer. Ajuste a carga com cuidado e pare se sentir dor.'

export const areaLabels: Record<WeekReview['improvements'][number]['area'], string> = {
  treino: 'Treino',
  dieta: 'Dieta',
  recuperacao: 'Recuperação',
  consistencia: 'Consistência',
}

export const AI_DISCLAIMER =
  'Análise gerada por IA com base nos seus registros. É apoio educacional, não substitui personal trainer, nutricionista ou médico.'

const messages: Record<string, string> = {
  ai_consent_required: 'Aceite o uso da IA para continuar.',
  ai_safety_block: 'O DuoFit não consegue gerar essa análise para o seu caso. Procure um profissional de saúde.',
  ai_profile_required: 'Complete seu perfil antes de usar a IA.',
  ai_rate_limited: 'Você atingiu o limite de análises de hoje. Tente de novo amanhã.',
  ai_refused: 'A IA não pôde analisar essa semana.',
  ai_truncated: 'A resposta da IA veio incompleta. Tente de novo.',
  ai_invalid_output: 'A IA respondeu em um formato inesperado. Tente de novo.',
  ai_unavailable: 'A IA está indisponível no momento. Tente de novo em instantes.',
  ai_not_configured: 'A IA ainda não está configurada neste servidor.',
  ai_questionnaire_incomplete: 'Responda o questionário antes de gerar o treino.',
  future_week: 'Essa semana ainda não aconteceu.',
}

export function aiErrorMessage(e: unknown) {
  if (e instanceof ApiError) return messages[e.code] ?? 'Não foi possível gerar a análise.'
  return 'Sem conexão. Tente de novo com internet.'
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Monday (YYYY-MM-DD) of the week that contains `iso`, in the device's local calendar. */
export function mondayOf(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toIso(d)
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

export function weekLabel(weekStart: string) {
  const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}`
}

type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number }
type DietLine = { foodName: string; grams: number } & Macros

export type DietReview = {
  summary: string
  issues: { issue: string; why: string }[]
  tips: string[]
  target: Macros | null
  totals: Macros
  swaps: { planItemId: string; meal: string; reason: string; from: DietLine; to: DietLine & { foodId: string } }[]
  discarded: number
}

export const AI_DIET_DISCLAIMER =
  'Sugestões geradas por IA a partir do seu plano e das suas metas. Não substituem acompanhamento com nutricionista.'
