import { and, eq, gte, ne, sql } from 'drizzle-orm'
import type { createDb } from '../../db/client'
import { aiInsights, aiProfiles } from '../../db/schema'
import { ageFrom, type Sex } from '../targets'
import { AiError } from './errors'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>

export const DAILY_LIMIT = 10
/** Chat turns are short and frequent, so they get their own, larger budget. */
export const CHAT_DAILY_LIMIT = 30
const MIN_AGE = 18
const SAFETY_MESSAGE =
  'O DuoFit não consegue gerar essa análise para o seu caso. Procure um profissional de saúde (médico, nutricionista ou educador físico).'

/** Returns the stored profile row, or throws 403 when the user never gave consent. */
export async function assertConsent(db: Db, userId: string) {
  const [row] = await db.select().from(aiProfiles).where(eq(aiProfiles.userId, userId))
  if (!row?.consentAt) throw new AiError('ai_consent_required', 403, 'Consent is required to use the AI assistant')
  return row
}

/** Reason the AI must not run for this user, or `null` when it is fine. */
export function safetyBlock(birthDate: string, answers: Answers): string | null {
  if (ageFrom(birthDate) < MIN_AGE) return SAFETY_MESSAGE
  const s = answers.screening
  if (s && (s.pregnantOrNursing || s.eatingDisorderHistory || s.relevantMedicalCondition || s.relevantMedication)) {
    return SAFETY_MESSAGE
  }
  return null
}

export function assertSafe(birthDate: string, answers: Answers) {
  const reason = safetyBlock(birthDate, answers)
  if (reason) throw new AiError('ai_safety_block', 422, reason)
}

type Targets = { sex: Sex; weightKg: number; tdee: number; kcal: number; proteinG: number; fatG: number }

/** Enforces calorie floor, max deficit and protein range. Carbs take whatever is left. */
export function clampTargets({ sex, weightKg, tdee, kcal, proteinG, fatG }: Targets) {
  const floor = sex === 'female' ? 1200 : 1500
  const clampedKcal = Math.round(Math.max(kcal, floor, tdee * 0.75))
  const clampedProtein = Math.round(Math.min(Math.max(proteinG, weightKg * 1.6), weightKg * 2.2))
  const carbsG = Math.max(0, Math.round((clampedKcal - clampedProtein * 4 - fatG * 9) / 4))
  return { kcal: clampedKcal, proteinG: clampedProtein, fatG, carbsG }
}

/**
 * Counts generations in the last 24h. Chat turns and the other kinds have separate budgets.
 * Cache hits create no row, so they never count.
 */
export async function rateLimit(db: Db, userId: string, kind: string) {
  const chat = kind === 'workout_chat'
  const limit = chat ? CHAT_DAILY_LIMIT : DAILY_LIMIT
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.userId, userId),
        gte(aiInsights.createdAt, since),
        chat ? eq(aiInsights.kind, 'workout_chat') : ne(aiInsights.kind, 'workout_chat'),
      ),
    )
  if ((row?.n ?? 0) >= limit) throw new AiError('ai_rate_limited', 429, `Daily limit of ${limit} AI requests reached`)
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, val]) => [k, canonical(val)]),
        )
      : v

/** SHA-256 of the input with sorted keys, so equal inputs always share one cache entry. */
export async function hashInput(input: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(input)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
