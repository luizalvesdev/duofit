import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { aiInsights, aiKindEnum, aiProfiles } from '../db/schema'
import type { AppEnv } from '../env'
import { generateStructured } from '../lib/ai/client'
import { applyDietDraft, applyDietReview, applyWorkoutDraft } from '../lib/ai/apply'
import { AiError, HttpError } from '../lib/ai/errors'
import { weekContext } from '../lib/ai/context'
import { buildDietReview, dietPlanContext, dietReviewModelSchema } from '../lib/ai/diet'
import { buildDietDraft, dietDraftContext, dietDraftModelSchema } from '../lib/ai/dietDraft'
import { hashInput } from '../lib/ai/guard'
import { DIET_DRAFT_TASK, DIET_TASK, PING_TASK, PROMPT_VERSION, systemFor, WEEK_TASK, WORKOUT_TASK } from '../lib/ai/prompts'
import { answersSchema } from '../lib/ai/questionnaire'
import { cachedInsight, guardedUser } from '../lib/ai/run'
import { weekReviewSchema } from '../lib/ai/schemas'
import { buildWorkoutDraft, missingWorkoutAnswers, workoutDraftContext, workoutDraftModelSchema } from '../lib/ai/workout'
import { mondayOf, todayLocal } from '../lib/week'
import { templateSchema } from '../lib/templates'
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
    if (e instanceof HttpError) return c.json({ error: e.code }, e.status)
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

    const { answers } = await guardedUser(db, userId)

    const { context, hasEnoughData } = await weekContext(db, userId, weekStart, answers)
    if (!hasEnoughData) return c.json({ status: 'insufficient_data' as const })

    const { insight, cached } = await cachedInsight(db, {
      userId,
      kind: 'week_review',
      periodStart: weekStart,
      inputHash: await hashInput({ v: PROMPT_VERSION, context }),
      generate: () =>
        generateStructured({
          env: c.env,
          system: systemFor(WEEK_TASK),
          input: context,
          schema: weekReviewSchema,
          maxTokens: 3000,
          effort: 'low',
        }),
    })
    return c.json({ status: 'ok' as const, cached, insight })
  })
  .post(
    '/insights/:id/apply',
    zValidator(
      'json',
      z.object({
        swapIndexes: z.array(z.number().int().min(0)).max(20).optional(),
        templates: z.array(templateSchema).max(6).optional(),
        replacePlan: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const [insight] = await db
        .select()
        .from(aiInsights)
        .where(and(eq(aiInsights.id, c.req.param('id')), eq(aiInsights.userId, userId)))
      if (!insight) return c.json({ error: 'not_found' }, 404)
      if (insight.status !== 'ready') return c.json({ error: 'already_handled' }, 409)

      const body = c.req.valid('json')
      if (insight.kind === 'diet_review') return c.json(await applyDietReview(db, userId, insight, body.swapIndexes ?? []))
      if (insight.kind === 'workout_draft') return c.json(await applyWorkoutDraft(db, userId, insight, body.templates ?? []))
      if (insight.kind === 'diet_draft') {
        // Replacing the plan is destructive, so the client must say it knows.
        if (body.replacePlan !== true) return c.json({ error: 'confirmation_required' }, 400)
        return c.json(await applyDietDraft(db, userId, insight))
      }
      return c.json({ error: 'not_applicable' }, 400)
    },
  )
  .post('/diet-review', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const { answers } = await guardedUser(db, userId)

    const ctx = await dietPlanContext(db, userId, answers)
    if (!ctx.hasPlan) return c.json({ status: 'insufficient_data' as const })

    const { insight, cached } = await cachedInsight(db, {
      userId,
      kind: 'diet_review',
      inputHash: await hashInput({ v: PROMPT_VERSION, input: ctx.input }),
      generate: async () => {
        const result = await generateStructured({
          env: c.env,
          system: systemFor(DIET_TASK),
          input: ctx.input,
          schema: dietReviewModelSchema,
          maxTokens: 3000,
          effort: 'low',
        })
        return { ...result, data: buildDietReview(ctx, result.data) }
      },
    })
    return c.json({ status: 'ok' as const, cached, insight })
  })
  .post('/drafts/workout', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const { answers } = await guardedUser(db, userId)
    if (missingWorkoutAnswers(answers).length) {
      throw new AiError('ai_questionnaire_incomplete', 422, 'Answer the questionnaire before generating a workout')
    }

    const ctx = await workoutDraftContext(db, userId, answers)
    if (!ctx.enough) return c.json({ status: 'insufficient_data' as const })

    const { insight, cached } = await cachedInsight(db, {
      userId,
      kind: 'workout_draft',
      inputHash: await hashInput({ v: PROMPT_VERSION, input: ctx.input }),
      generate: async () => {
        const result = await generateStructured({
          env: c.env,
          system: systemFor(WORKOUT_TASK),
          input: ctx.input,
          schema: workoutDraftModelSchema,
          maxTokens: 5000,
          effort: 'medium',
        })
        return { ...result, data: buildWorkoutDraft(ctx, result.data, answers.daysPerWeek!) }
      },
    })
    return c.json({ status: 'ok' as const, cached, insight })
  })
  .post('/drafts/diet', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const { answers, profile } = await guardedUser(db, userId)

    const ctx = await dietDraftContext(db, userId, answers, profile)
    if (!ctx.enough) return c.json({ status: 'insufficient_data' as const })

    const { insight, cached } = await cachedInsight(db, {
      userId,
      kind: 'diet_draft',
      inputHash: await hashInput({ v: PROMPT_VERSION, input: ctx.input }),
      generate: async () => {
        const result = await generateStructured({
          env: c.env,
          system: systemFor(DIET_DRAFT_TASK),
          input: ctx.input,
          schema: dietDraftModelSchema,
          maxTokens: 5000,
          effort: 'medium',
        })
        return { ...result, data: buildDietDraft(ctx, result.data) }
      },
    })
    return c.json({ status: 'ok' as const, cached, insight })
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
