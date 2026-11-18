import { and, eq } from 'drizzle-orm'
import type { createDb } from '../../db/client'
import { aiInsights, profiles } from '../../db/schema'
import type { Generated } from './client'
import { AiError } from './errors'
import { assertConsent, assertSafe, rateLimit } from './guard'
import type { Answers } from './questionnaire'

type Db = ReturnType<typeof createDb>
type Kind = (typeof aiInsights.$inferInsert)['kind']

/** Consent and safety gate shared by every AI route. Returns the user's questionnaire answers and body profile. */
export async function guardedUser(db: Db, userId: string) {
  const aiProfile = await assertConsent(db, userId)
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId))
  if (!profile) throw new AiError('ai_profile_required', 422, 'Complete your profile first')
  const answers = aiProfile.answers as Answers
  assertSafe(profile.birthDate, answers)
  return { answers, profile }
}

/**
 * Returns the stored insight for this exact input (a cache hit, no model call and no rate-limit cost)
 * or runs `generate`, stores the result and returns it.
 */
export async function cachedInsight<T>(
  db: Db,
  opts: { userId: string; kind: Kind; periodStart?: string; inputHash: string; generate: () => Promise<Generated<T>> },
) {
  const { userId, kind, inputHash } = opts
  const find = async () => {
    const [row] = await db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.userId, userId), eq(aiInsights.kind, kind), eq(aiInsights.inputHash, inputHash)))
    return row
  }

  const cached = await find()
  if (cached) return { insight: cached, cached: true as const }

  await rateLimit(db, userId)
  const result = await opts.generate()
  console.log(`ai ${kind}`, JSON.stringify({ model: result.model, usage: result.usage }))

  await db
    .insert(aiInsights)
    .values({
      userId,
      kind,
      periodStart: opts.periodStart ?? null,
      inputHash,
      output: result.data,
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })
    .onConflictDoNothing()
  return { insight: (await find())!, cached: false as const }
}
