import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { aiInsights, aiKindEnum, aiProfiles, profiles } from '../db/schema'
import type { AppEnv } from '../env'
import { generateStructured } from '../lib/ai/client'
import { AiError } from '../lib/ai/errors'
import { weekContext } from '../lib/ai/context'
import { assertConsent, assertSafe, hashInput, rateLimit } from '../lib/ai/guard'
import { PING_TASK, PROMPT_VERSION, systemFor, WEEK_TASK } from '../lib/ai/prompts'
import { type Answers, answersSchema } from '../lib/ai/questionnaire'
import { weekReviewSchema } from '../lib/ai/schemas'
import { mondayOf, todayLocal } from '../lib/week'
import { requireAuth } from '../middleware/auth'

const profileBody = z.object({
  /** `true` records consent now (kept if already given), `false` revokes it. */
  consent: z.boolean().optional(),
  answers: answersSchema.optional(),
})

export const aiRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .onError((e, c) => {
    if (e instanceof AiError) return c.json({ error: e.code, message: e.message }, e.status)
    console.error(e)
    return c.json({ error: 'internal_error' }, 500)
  })
  .get('/profile', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [row] = await db.select().from(aiProfiles).where(eq(aiProfiles.userId, c.get('userId')))
    return c.json({ consentAt: row?.consentAt ?? null, answers: row?.answers ?? {} })
  })
  .put('/profile', zValidator('json', profileBody), async (c) => {
    const { consent, answers } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')

    const [current] = await db.select().from(aiProfiles).where(eq(aiProfiles.userId, userId))
    const consentAt = consent === undefined ? (current?.consentAt ?? null) : consent ? (current?.consentAt ?? new Date()) : null
    const nextAnswers = answers ?? current?.answers ?? {}

    await db
      .insert(aiProfiles)
      .values({ userId, answers: nextAnswers, consentAt })
      .onConflictDoUpdate({ target: aiProfiles.userId, set: { answers: nextAnswers, consentAt, updatedAt: new Date() } })

    return c.json({ consentAt, answers: nextAnswers })
  })
  .get(
    '/insights',
    zValidator('query', z.object({ kind: z.enum(aiKindEnum.enumValues).optional(), periodStart: z.iso.date().optional() })),
    async (c) => {
      const { kind, periodStart } = c.req.valid('query')
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const insights = await db
        .select()
        .from(aiInsights)
        .where(
          and(
            eq(aiInsights.userId, userId),
            kind ? eq(aiInsights.kind, kind) : undefined,
            periodStart ? eq(aiInsights.periodStart, periodStart) : undefined,
          ),
        )
        .orderBy(desc(aiInsights.createdAt))
        .limit(50)
      return c.json({ insights })
    },
  )
  .patch('/insights/:id', zValidator('json', z.object({ status: z.literal('dismissed') })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [row] = await db
      .update(aiInsights)
      .set({ status: 'dismissed' })
      .where(and(eq(aiInsights.id, c.req.param('id')), eq(aiInsights.userId, c.get('userId'))))
      .returning({ id: aiInsights.id })
    return row ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })
  .post('/week-review', zValidator('json', z.object({ weekStart: z.iso.date().optional() })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const today = todayLocal()
    const requested = c.req.valid('json').weekStart ?? today
    if (requested > today) return c.json({ error: 'future_week' }, 422)
    const weekStart = mondayOf(requested)

    const aiProfile = await assertConsent(db, userId)
    const [profile] = await db.select({ birthDate: profiles.birthDate }).from(profiles).where(eq(profiles.userId, userId))
    if (!profile) throw new AiError('ai_profile_required', 422, 'Complete your profile first')
    const answers = aiProfile.answers as Answers
    assertSafe(profile.birthDate, answers)

    const { context, hasEnoughData } = await weekContext(db, userId, weekStart, answers)
    if (!hasEnoughData) return c.json({ status: 'insufficient_data' as const })

    const inputHash = await hashInput({ v: PROMPT_VERSION, context })
    const findCached = async () => {
      const [row] = await db
        .select()
        .from(aiInsights)
        .where(and(eq(aiInsights.userId, userId), eq(aiInsights.kind, 'week_review'), eq(aiInsights.inputHash, inputHash)))
      return row
    }

    const cached = await findCached()
    if (cached) return c.json({ status: 'ok' as const, cached: true, insight: cached })

    await rateLimit(db, userId)
    const result = await generateStructured({
      env: c.env,
      system: systemFor(WEEK_TASK),
      input: context,
      schema: weekReviewSchema,
      maxTokens: 3000,
      effort: 'low',
    })
    console.log('ai week-review', JSON.stringify({ model: result.model, usage: result.usage }))

    await db
      .insert(aiInsights)
      .values({
        userId,
        kind: 'week_review',
        periodStart: weekStart,
        inputHash,
        output: result.data,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      })
      .onConflictDoNothing()
    const insight = await findCached()
    return c.json({ status: 'ok' as const, cached: false, insight })
  })
  // Dev-only connectivity check: confirms credentials, region, model id and that the SDK runs in the Worker.
  .post('/_ping', async (c) => {
    if (!c.env.APP_URL.startsWith('http://localhost')) return c.json({ error: 'not_found' }, 404)
    const result = await generateStructured({
      env: c.env,
      system: systemFor(PING_TASK),
      input: { ping: true },
      schema: z.object({ ok: z.boolean(), message: z.string() }),
      maxTokens: 300,
    })
    console.log('ai ping', JSON.stringify({ model: result.model, usage: result.usage }))
    return c.json(result)
  })
