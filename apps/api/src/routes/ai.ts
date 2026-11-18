import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { aiInsights, aiKindEnum, aiProfiles } from '../db/schema'
import type { AppEnv } from '../env'
import { generateStructured } from '../lib/ai/client'
import { AiError } from '../lib/ai/errors'
import { PING_TASK, systemFor } from '../lib/ai/prompts'
import { answersSchema } from '../lib/ai/questionnaire'
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
    zValidator('query', z.object({ kind: z.enum(aiKindEnum.enumValues).optional() })),
    async (c) => {
      const { kind } = c.req.valid('query')
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const insights = await db
        .select()
        .from(aiInsights)
        .where(kind ? and(eq(aiInsights.userId, userId), eq(aiInsights.kind, kind)) : eq(aiInsights.userId, userId))
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
