import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, isNotNull, isNull, like, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { aiInsights, aiKindEnum, aiProfiles, bodyLogs, campaignMembers, foods, profiles, users } from '../db/schema'
import { searchable } from '../lib/search'
import { currentGoal } from '../lib/stats'
import type { AppEnv } from '../env'
import { generateStructured, generateStructuredFromImage } from '../lib/ai/client'
import { applyDietDraft, applyDietReview, applyWorkoutChat, applyWorkoutDraft } from '../lib/ai/apply'
import { AiError, HttpError } from '../lib/ai/errors'
import { weekContext } from '../lib/ai/context'
import { buildDietReview, dietPlanContext, dietReviewModelSchema } from '../lib/ai/diet'
import { buildDietDraft, dietDraftContext, dietDraftModelSchema, improveMealSchema, macroWarnings, mealItemsFromModel, sumItems, type DietDraft, type DuoDietDraft, type DuoMember } from '../lib/ai/dietDraft'
import { hashInput } from '../lib/ai/guard'
import { DIET_DRAFT_TASK, DIET_LABEL_TASK, DIET_MEAL_TASK, DIET_TASK, PING_TASK, PROMPT_VERSION, systemFor, WEEK_TASK, WORKOUT_CHAT_TASK, WORKOUT_TASK } from '../lib/ai/prompts'
import { buildWorkoutChat, chatMessageSchema, workoutChatContext, workoutChatModelSchema } from '../lib/ai/workoutChat'
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

type DietGap = 'consent' | 'profile' | 'goal' | 'weight'

/** What a member still needs before the diet AI can run for them, so the UI can name who is missing what. */
async function dietReadiness(db: ReturnType<typeof createDb>, userId: string): Promise<DietGap[]> {
  const [[aiP], [prof], goal, [weight]] = await Promise.all([
    db.select({ consentAt: aiProfiles.consentAt }).from(aiProfiles).where(eq(aiProfiles.userId, userId)),
    db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.userId, userId)),
    currentGoal(db, userId),
    db.select({ kg: bodyLogs.weightKg }).from(bodyLogs).where(and(eq(bodyLogs.userId, userId), isNotNull(bodyLogs.weightKg))).limit(1),
  ])
  const gaps: DietGap[] = []
  if (!aiP?.consentAt) gaps.push('consent')
  if (!prof) gaps.push('profile')
  if (!goal) gaps.push('goal')
  if (!weight) gaps.push('weight')
  return gaps
}

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
      if (insight.kind === 'workout_chat') return c.json(await applyWorkoutChat(db, userId, insight))
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
  .post(
    '/workout-chat',
    zValidator(
      'json',
      z.object({
        messages: z
          .array(chatMessageSchema)
          .min(1)
          .max(20)
          .refine((m) => m.at(-1)?.role === 'user', { message: 'last message must be from the user' }),
      }),
    ),
    async (c) => {
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const { answers } = await guardedUser(db, userId)
      if (missingWorkoutAnswers(answers).length) {
        throw new AiError('ai_questionnaire_incomplete', 422, 'Answer the questionnaire before chatting about the workout')
      }

      const ctx = await workoutChatContext(db, userId, answers, c.req.valid('json').messages)
      const { insight, cached } = await cachedInsight(db, {
        userId,
        kind: 'workout_chat',
        inputHash: await hashInput({ v: PROMPT_VERSION, input: ctx.input }),
        generate: async () => {
          const result = await generateStructured({
            env: c.env,
            system: systemFor(WORKOUT_CHAT_TASK),
            input: ctx.input,
            schema: workoutChatModelSchema,
            maxTokens: 5000,
            effort: 'low',
          })
          return { ...result, data: buildWorkoutChat(ctx, result.data) }
        },
      })
      return c.json({ cached, insight })
    },
  )
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
          maxTokens: 8000,
          effort: 'low',
        })
        return { ...result, data: buildDietDraft(ctx, result.data) }
      },
    })
    return c.json({ status: 'ok' as const, cached, insight })
  })
  .post('/drafts/diet-duo', zValidator('json', z.object({ campaignId: z.uuid() })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const userId = c.get('userId')
    const rows = await db
      .select({ userId: campaignMembers.userId, name: users.name })
      .from(campaignMembers)
      .innerJoin(users, eq(users.id, campaignMembers.userId))
      .where(eq(campaignMembers.campaignId, c.req.valid('json').campaignId))
      .orderBy(asc(campaignMembers.joinedAt))
    if (!rows.some((r) => r.userId === userId)) return c.json({ error: 'not_found' }, 404)
    if (rows.length < 2) return c.json({ error: 'needs_partner' }, 409)

    // Tell the user exactly who is missing what, instead of a generic "complete your profile".
    const readiness = await Promise.all(rows.map(async (r) => ({ name: r.name, missing: await dietReadiness(db, r.userId) })))
    const incomplete = readiness.filter((r) => r.missing.length > 0)
    if (incomplete.length) return c.json({ status: 'incomplete' as const, members: incomplete })

    // Consent + profile + answers for every member (guardedUser throws if a member has not consented).
    const members: DuoMember[] = await Promise.all(
      rows.map(async (r) => {
        const { answers, profile } = await guardedUser(db, r.userId)
        return { userId: r.userId, name: r.name, answers, profile }
      }),
    )

    // One complete, balanced plan per member (each hits their own macros), shown side by side.
    const contexts = await Promise.all(members.map((m) => dietDraftContext(db, m.userId, m.answers, m.profile)))
    if (contexts.some((ctx) => !ctx.enough)) return c.json({ status: 'insufficient_data' as const })

    const { insight, cached } = await cachedInsight(db, {
      userId,
      kind: 'diet_draft_duo',
      inputHash: await hashInput({ v: PROMPT_VERSION, input: contexts.map((ctx) => ctx.input) }),
      generate: async () => {
        const drafts = await Promise.all(
          contexts.map(async (ctx) => {
            const result = await generateStructured({
              env: c.env,
              system: systemFor(DIET_DRAFT_TASK),
              input: ctx.input,
              schema: dietDraftModelSchema,
              maxTokens: 8000,
              effort: 'low',
              strong: true,
            })
            return { data: buildDietDraft(ctx, result.data), usage: result.usage, model: result.model }
          }),
        )
        const data: DuoDietDraft = { members: members.map((m, i) => ({ userId: m.userId, name: m.name, ...drafts[i].data })) }
        const usage = {
          inputTokens: drafts.reduce((s, d) => s + d.usage.inputTokens, 0),
          outputTokens: drafts.reduce((s, d) => s + d.usage.outputTokens, 0),
        }
        return { data, usage, model: drafts[0].model }
      },
    })
    return c.json({ status: 'ok' as const, cached, insight })
  })
  // Rewrites a single meal of a saved diet draft from a free-text instruction, then re-saves the draft.
  .post(
    '/insights/:id/improve-meal',
    zValidator(
      'json',
      z.object({
        memberUserId: z.uuid().optional(),
        mealName: z.string().trim().min(1).max(60),
        instruction: z.string().trim().min(1).max(300),
        // Optional specific product (per-100g macros) from a barcode, label photo or manual entry.
        product: z
          .object({
            name: z.string().trim().min(2).max(100),
            kcal: z.number().min(0).max(900),
            protein: z.number().min(0).max(100),
            carbs: z.number().min(0).max(100),
            fat: z.number().min(0).max(100),
            servingGrams: z.number().min(1).max(2000).nullable().optional(),
          })
          .optional(),
      }),
    ),
    async (c) => {
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const body = c.req.valid('json')
      const [insight] = await db
        .select()
        .from(aiInsights)
        .where(and(eq(aiInsights.id, c.req.param('id')), eq(aiInsights.userId, userId)))
      if (!insight || (insight.kind !== 'diet_draft' && insight.kind !== 'diet_draft_duo')) return c.json({ error: 'not_found' }, 404)
      if (insight.status !== 'ready') return c.json({ error: 'already_handled' }, 409)

      // The plan being edited belongs to the caller (single) or to the named member (duo).
      const output = insight.output as DietDraft | DuoDietDraft
      const isDuo = insight.kind === 'diet_draft_duo'
      const members = isDuo ? (output as DuoDietDraft).members : null
      const targetUserId = isDuo ? body.memberUserId : userId
      if (isDuo && (!targetUserId || !members!.some((m) => m.userId === targetUserId))) return c.json({ error: 'not_found' }, 404)
      const plan: DietDraft = isDuo ? members!.find((m) => m.userId === targetUserId)! : (output as DietDraft)
      const meal = plan.meals.find((m) => m.name === body.mealName)
      if (!meal) return c.json({ error: 'not_found' }, 404)

      const { answers, profile } = await guardedUser(db, targetUserId!)
      const ctx = await dietDraftContext(db, targetUserId!, answers, profile)

      // Explicit override: foods the user names in the instruction are added to the candidates even when their
      // restrictions would normally exclude them — they asked for this specific food in this specific meal.
      const STOP = new Set(['troque', 'troca', 'por', 'com', 'sem', 'para', 'pra', 'mais', 'menos', 'adicione', 'adiciona', 'coloque', 'coloca', 'lata', 'fatia', 'fatias', 'colher', 'colheres', 'uma', 'duas', 'dois', 'gramas', 'que', 'uns', 'umas'])
      const terms = searchable(body.instruction).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))
      if (terms.length) {
        const existing = new Set([...ctx.byN.values()].map((f) => f.id))
        const extra = await db
          .select({ id: foods.id, name: foods.name, category: foods.category, kcal: foods.kcal, protein: foods.protein, carbs: foods.carbs, fat: foods.fat })
          .from(foods)
          .where(and(or(isNull(foods.ownerId), eq(foods.ownerId, targetUserId!)), or(...terms.map((t) => like(foods.searchName, `%${t}%`)))))
          .orderBy(sql`length(${foods.name})`)
          .limit(12)
        let n = ctx.input.candidates.length
        for (const f of extra) {
          if (existing.has(f.id)) continue
          existing.add(f.id)
          n += 1
          ctx.byN.set(n, { ...f, searchName: searchable(f.name), ownerId: null })
          ctx.input.candidates.push({ n, name: f.name, category: f.category, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat })
        }
      }

      // A specific product the user supplied is saved as their custom food, then offered as a candidate.
      if (body.product) {
        const p = body.product
        const [row] = await db
          .insert(foods)
          .values({
            name: p.name,
            searchName: searchable(p.name),
            source: 'custom',
            ownerId: targetUserId!,
            kcal: p.kcal,
            protein: p.protein,
            carbs: p.carbs,
            fat: p.fat,
            fiber: 0,
            servingGrams: p.servingGrams ?? null,
            servingName: p.servingGrams ? `1 porção (${p.servingGrams}g)` : null,
          })
          .returning({ id: foods.id })
        const n = ctx.input.candidates.length + 1
        ctx.byN.set(n, { id: row.id, name: p.name, searchName: searchable(p.name), category: null, ownerId: targetUserId!, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat })
        ctx.input.candidates.push({ n, name: p.name, category: null, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat })
      }

      const result = await generateStructured({
        env: c.env,
        system: systemFor(DIET_MEAL_TASK),
        input: {
          meal: body.mealName,
          current: meal.items.map((i) => ({ name: i.foodName, grams: i.grams })),
          instruction: body.instruction,
          dayTarget: ctx.target,
          candidates: ctx.input.candidates,
        },
        schema: improveMealSchema,
        maxTokens: 4000,
        effort: 'low',
      })
      const items = mealItemsFromModel(ctx, result.data.items)
      if (items.length === 0) return c.json({ error: 'ai_invalid_output' }, 502)

      // Replace the meal, then recompute the plan's totals and macro warnings.
      plan.meals = plan.meals.map((m) => (m.name === body.mealName ? { ...m, items } : m))
      plan.totals = sumItems(plan.meals.flatMap((m) => m.items))
      plan.warnings = macroWarnings(plan.totals, plan.target)

      const [updated] = await db.update(aiInsights).set({ output }).where(eq(aiInsights.id, insight.id)).returning()
      return c.json({ insight: updated })
    },
  )
  // Reads a product's nutrition table from a photo and returns per-100g macros to prefill a product.
  .post(
    '/nutrition-from-label',
    zValidator('json', z.object({ image: z.string().min(100).max(10_000_000), mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']) })),
    async (c) => {
      const body = c.req.valid('json')
      const schema = z.object({
        name: z.string().max(100).nullable().optional(),
        kcal: z.number().min(0).max(900),
        protein: z.number().min(0).max(100),
        carbs: z.number().min(0).max(100),
        fat: z.number().min(0).max(100),
        servingGrams: z.number().min(0).max(2000).nullable().optional(),
      })
      const result = await generateStructuredFromImage({
        env: c.env,
        system: systemFor(DIET_LABEL_TASK),
        instruction: 'Extraia a tabela nutricional desta imagem.',
        image: body.image,
        mediaType: body.mediaType,
        schema,
      })
      return c.json(result.data)
    },
  )
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
